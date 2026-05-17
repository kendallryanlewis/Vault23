import { Injectable, inject } from '@angular/core';
import {
    Firestore,
    collection,
    collectionData,
    docData,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    arrayUnion,
    arrayRemove,
    increment,
    query,
    orderBy,
    serverTimestamp,
} from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Post, PostComment } from '../models/post.model';
import { TimelineService } from './timeline.service';

@Injectable({ providedIn: 'root' })
export class PostService {
    private fs = inject(Firestore);
    private storage = inject(Storage);
    private timelineService = inject(TimelineService);

    async uploadPostImage(uid: string, blob: Blob): Promise<string> {
        const storageRef = ref(this.storage, `posts/${uid}/${Date.now()}.jpg`);
        await uploadBytes(storageRef, blob);
        return getDownloadURL(storageRef);
    }

    getUserPosts(uid: string): Observable<Post[]> {
        return collectionData(
            query(
                collection(this.fs, `users/${uid}/posts`),
                orderBy('createdAt', 'desc')
            ),
            { idField: 'id' }
        ) as Observable<Post[]>;
    }

    async createPost(
        authorUid: string,
        authorUsername: string,
        authorPhotoURL: string,
        imageUrl: string,
        caption: string
    ): Promise<string> {
        const ref = await addDoc(collection(this.fs, `users/${authorUid}/posts`), {
            userId: authorUid,
            imageUrl,
            caption,
            likeCount: 0,
            commentCount: 0,
            likedBy: [],
            createdAt: serverTimestamp(),
        });

        await this.timelineService.fanOutPost(authorUid, ref.id, {
            authorUid,
            authorUsername,
            authorPhotoURL,
            imageUrl,
            caption,
            likeCount: 0,
            commentCount: 0,
            likedBy: [],
            createdAt: new Date(),
        });

        return ref.id;
    }

    async likePost(authorUid: string, postId: string, currentUid: string, liked: boolean): Promise<void> {
        const ref = doc(this.fs, `users/${authorUid}/posts/${postId}`);
        if (liked) {
            await updateDoc(ref, {
                likeCount: increment(-1),
                likedBy: arrayRemove(currentUid),
            });
        } else {
            await updateDoc(ref, {
                likeCount: increment(1),
                likedBy: arrayUnion(currentUid),
            });
        }
    }

    getPostLive(authorUid: string, postId: string): Observable<Post> {
        return docData(doc(this.fs, `users/${authorUid}/posts/${postId}`), { idField: 'id' }).pipe(
            map(d => d as Post)
        );
    }

    getComments(authorUid: string, postId: string): Observable<PostComment[]> {
        return collectionData(
            query(
                collection(this.fs, `users/${authorUid}/posts/${postId}/comments`),
                orderBy('createdAt', 'asc')
            ),
            { idField: 'id' }
        ) as Observable<PostComment[]>;
    }

    async addComment(authorUid: string, postId: string, comment: Omit<PostComment, 'id'>): Promise<void> {
        await addDoc(
            collection(this.fs, `users/${authorUid}/posts/${postId}/comments`),
            comment
        );
        await updateDoc(doc(this.fs, `users/${authorUid}/posts/${postId}`), {
            commentCount: increment(1),
        });
    }

    async reportPost(reporterUid: string, authorUid: string, postId: string): Promise<void> {
        await addDoc(collection(this.fs, 'reports'), {
            postId,
            authorUid,
            reporterUid,
            createdAt: serverTimestamp(),
        });
    }

    async deletePost(authorUid: string, postId: string): Promise<void> {
        await deleteDoc(doc(this.fs, `users/${authorUid}/posts/${postId}`));
        await this.timelineService.removeFanOut(authorUid, postId);
    }
}
