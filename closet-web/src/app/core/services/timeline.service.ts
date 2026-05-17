import { Injectable, inject } from '@angular/core';
import {
    Firestore,
    collection,
    collectionData,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    getDocs,
    query,
    where,
    orderBy,
    limit,
    arrayUnion,
    arrayRemove,
    increment,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { FeedPost } from '../models/post.model';

@Injectable({ providedIn: 'root' })
export class TimelineService {
    private fs = inject(Firestore);

    /** Real-time feed for a user. Returns up to 200 most recent posts. */
    getFeed(uid: string): Observable<FeedPost[]> {
        return collectionData(
            query(
                collection(this.fs, `timeline/${uid}/feed`),
                orderBy('createdAt', 'desc'),
                limit(200)
            ),
            { idField: 'postId' }
        ) as Observable<FeedPost[]>;
    }

    /**
     * Fan-out a new post to all followers' timelines.
     * Called after a post is written to users/{authorUid}/posts.
     */
    async fanOutPost(authorUid: string, postId: string, entry: Omit<FeedPost, 'postId'>): Promise<void> {
        const followersSnap = await getDocs(
            collection(this.fs, `users/${authorUid}/followers`)
        );

        const writes = followersSnap.docs.map(followerDoc =>
            setDoc(
                doc(this.fs, `timeline/${followerDoc.id}/feed/${postId}`),
                { ...entry, postId }
            )
        );

        // Also write to the author's own timeline so they see their own posts
        writes.push(
            setDoc(
                doc(this.fs, `timeline/${authorUid}/feed/${postId}`),
                { ...entry, postId }
            )
        );

        await Promise.all(writes);
    }

    /**
     * Update the viewer's own timeline feed entry when they like/unlike a post.
     * The canonical post is updated separately by PostService.likePost.
     */
    async updateFeedLike(viewerUid: string, postId: string, liked: boolean, likerUid: string): Promise<void> {
        const ref = doc(this.fs, `timeline/${viewerUid}/feed/${postId}`);
        await updateDoc(ref, {
            likeCount: liked ? increment(-1) : increment(1),
            likedBy: liked ? arrayRemove(likerUid) : arrayUnion(likerUid),
        });
    }

    /** Remove a post from all followers' timelines when deleted. */
    async removeFanOut(authorUid: string, postId: string): Promise<void> {
        const followersSnap = await getDocs(
            collection(this.fs, `users/${authorUid}/followers`)
        );

        const deletes = followersSnap.docs.map(followerDoc =>
            deleteDoc(doc(this.fs, `timeline/${followerDoc.id}/feed/${postId}`))
        );
        deletes.push(deleteDoc(doc(this.fs, `timeline/${authorUid}/feed/${postId}`)));

        await Promise.all(deletes);
    }

    /**
     * Backfill an author's existing posts into a new follower's timeline.
     * Called immediately after a follow action so historical posts are visible.
     */
    async backfillFollowerTimeline(followerUid: string, authorUid: string): Promise<void> {
        const [authorSnap, postsSnap] = await Promise.all([
            getDoc(doc(this.fs, `users/${authorUid}`)),
            getDocs(
                query(
                    collection(this.fs, `users/${authorUid}/posts`),
                    orderBy('createdAt', 'desc'),
                    limit(100)
                )
            ),
        ]);

        if (postsSnap.empty) return;

        const authorData = authorSnap.data() ?? {};
        const authorUsername: string = authorData['username'] ?? '';
        const authorPhotoURL: string = authorData['photoURL'] ?? '';

        await Promise.all(
            postsSnap.docs.map(postDoc => {
                const d = postDoc.data();
                return setDoc(
                    doc(this.fs, `timeline/${followerUid}/feed/${postDoc.id}`),
                    {
                        postId: postDoc.id,
                        authorUid,
                        authorUsername,
                        authorPhotoURL,
                        imageUrl: d['imageUrl'] ?? '',
                        caption: d['caption'] ?? '',
                        likeCount: d['likeCount'] ?? 0,
                        commentCount: d['commentCount'] ?? 0,
                        likedBy: d['likedBy'] ?? [],
                        createdAt: d['createdAt'] ?? new Date(),
                    }
                );
            })
        );
    }

    /**
     * Remove all posts by a given author from a user's timeline feed.
     * Called after an unfollow so the unfollowed author's posts disappear.
     */
    async removeAuthorFromFeed(followerUid: string, authorUid: string): Promise<void> {
        const snap = await getDocs(
            query(
                collection(this.fs, `timeline/${followerUid}/feed`),
                where('authorUid', '==', authorUid)
            )
        );
        await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
    }

    /**
     * One-time migration: backfill historical posts for all users the current
     * user is already following. A meta doc at timeline/{uid}/meta is used as a
     * flag so the rebuild only ever runs once per account.
     */
    async rebuildTimelineIfNeeded(uid: string): Promise<void> {
        const metaRef = doc(this.fs, `timeline/${uid}/meta/rebuilt`);
        const metaSnap = await getDoc(metaRef);
        if (metaSnap.exists() && metaSnap.data()?.['done'] === true) return;

        const followingSnap = await getDocs(collection(this.fs, `users/${uid}/following`));
        if (!followingSnap.empty) {
            await Promise.all(
                followingSnap.docs.map(d => this.backfillFollowerTimeline(uid, d.id))
            );
        }

        // Also ensure the user's own posts are in their timeline
        await this.backfillFollowerTimeline(uid, uid);

        await setDoc(metaRef, { done: true, rebuiltAt: new Date() });
    }
}
