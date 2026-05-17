import { Injectable, inject } from '@angular/core';
import {
    Firestore,
    collection,
    query,
    where,
    getDocs,
    setDoc,
    getDoc,
    doc,
    deleteDoc,
    addDoc,
    updateDoc,
    limit,
    collectionData,
    docData,
    orderBy,
} from '@angular/fire/firestore';
import { Observable, of, map } from 'rxjs';
import { UserPublicProfile, HomeDisplayItem } from '../models/user.model';
import { Listing } from '../models/listing.model';
import { Sneaker } from '../models/sneaker.model';
import { TimelineService } from './timeline.service';

@Injectable({ providedIn: 'root' })
export class UserService {
    private fs = inject(Firestore);
    private timelineService = inject(TimelineService);
    private readonly _profileCache = new Map<string, UserPublicProfile>();

    async upsertPublicProfile(uid: string, profile: Partial<UserPublicProfile>): Promise<void> {
        const payload: Partial<UserPublicProfile> = { ...profile };
        if (profile.username !== undefined) {
            payload.usernameLower = profile.username.toLowerCase();
        }
        await setDoc(doc(this.fs, `users/${uid}`), payload, { merge: true });
    }

    async markUserHidden(myUid: string, authorUid: string, username: string, photoURL: string): Promise<void> {
        await setDoc(
            doc(this.fs, `userPreferences/${myUid}/hiddenUsers/${authorUid}`),
            { username, photoURL, hiddenAt: new Date().toISOString() }
        );
    }

    getHiddenUsers$(uid: string): Observable<{ uid: string; username: string; photoURL: string; hiddenAt: string }[]> {
        return collectionData(
            collection(this.fs, `userPreferences/${uid}/hiddenUsers`),
            { idField: 'uid' }
        ) as Observable<{ uid: string; username: string; photoURL: string; hiddenAt: string }[]>;
    }

    async unhideUser(myUid: string, authorUid: string): Promise<void> {
        await deleteDoc(doc(this.fs, `userPreferences/${myUid}/hiddenUsers/${authorUid}`));
    }

    async getPublicProfile(uid: string): Promise<UserPublicProfile | null> {
        if (this._profileCache.has(uid)) return this._profileCache.get(uid)!;
        const snap = await getDoc(doc(this.fs, `users/${uid}`));
        if (!snap.exists()) return null;
        const profile = { uid: snap.id, ...snap.data() } as UserPublicProfile;
        this._profileCache.set(uid, profile);
        return profile;
    }

    getPublicProfile$(uid: string): Observable<UserPublicProfile | null> {
        return docData(doc(this.fs, `users/${uid}`)).pipe(
            map(data => {
                if (!data) return null;
                const profile = { uid, ...data } as UserPublicProfile;
                this._profileCache.set(uid, profile);
                return profile;
            })
        );
    }

    async searchUsers(q: string): Promise<UserPublicProfile[]> {
        if (q.trim().length < 2) return [];
        const normalized = q.trim().toLowerCase();
        const ref = collection(this.fs, 'users');
        const snap = await getDocs(
            query(
                ref,
                where('usernameLower', '>=', normalized),
                where('usernameLower', '<=', normalized + '\uf8ff'),
                limit(20)
            )
        );
        return snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserPublicProfile));
    }

    async getUserByUsername(username: string): Promise<UserPublicProfile | null> {
        const normalized = username.toLowerCase();
        const snap = await getDocs(
            query(
                collection(this.fs, 'users'),
                where('usernameLower', '==', normalized),
                limit(1)
            )
        );
        if (snap.empty) return null;
        return { uid: snap.docs[0].id, ...snap.docs[0].data() } as UserPublicProfile;
    }

    getFollowingUids(uid: string): Observable<string[]> {
        return collectionData(
            collection(this.fs, `users/${uid}/following`)
        ).pipe(
            map((docs: any[]) => docs.map(d => d.id as string))
        ) as Observable<string[]>;
    }

    getUserCloset(uid: string): Observable<Sneaker[]> {
        return collectionData(
            query(
                collection(this.fs, `users/${uid}/sneakers`),
                orderBy('addedAt', 'desc')
            ),
            { idField: 'id' }
        ) as Observable<Sneaker[]>;
    }

    async isFollowing(currentUid: string, targetUid: string): Promise<boolean> {
        const snap = await getDoc(doc(this.fs, `users/${currentUid}/following/${targetUid}`));
        return snap.exists();
    }

    async follow(currentUid: string, targetUid: string): Promise<void> {
        await setDoc(doc(this.fs, `users/${currentUid}/following/${targetUid}`), { since: new Date() });
        await setDoc(doc(this.fs, `users/${targetUid}/followers/${currentUid}`), { since: new Date() });
        // Backfill is fire-and-forget — must not block or fail the follow action
        this.timelineService.backfillFollowerTimeline(currentUid, targetUid).catch(() => { });
    }

    async unfollow(currentUid: string, targetUid: string): Promise<void> {
        await deleteDoc(doc(this.fs, `users/${currentUid}/following/${targetUid}`));
        await deleteDoc(doc(this.fs, `users/${targetUid}/followers/${currentUid}`));
        // Remove the unfollowed author's posts from the timeline
        await this.timelineService.removeAuthorFromFeed(currentUid, targetUid);
    }

    getFollowerCount$(uid: string): Observable<number> {
        return collectionData(collection(this.fs, `users/${uid}/followers`)).pipe(
            map((docs: any[]) => docs.length)
        );
    }

    getFollowingCount$(uid: string): Observable<number> {
        return collectionData(collection(this.fs, `users/${uid}/following`)).pipe(
            map((docs: any[]) => docs.length)
        );
    }

    async getFollowers(uid: string): Promise<UserPublicProfile[]> {
        const snap = await getDocs(collection(this.fs, `users/${uid}/followers`));
        const profiles = await Promise.all(snap.docs.map(d => this.getPublicProfile(d.id)));
        return profiles.filter((p): p is UserPublicProfile => p !== null);
    }

    async getFollowing(uid: string): Promise<UserPublicProfile[]> {
        const snap = await getDocs(collection(this.fs, `users/${uid}/following`));
        const profiles = await Promise.all(snap.docs.map(d => this.getPublicProfile(d.id)));
        return profiles.filter((p): p is UserPublicProfile => p !== null);
    }

    async getPostCount(uid: string): Promise<number> {
        const snap = await getDocs(collection(this.fs, `users/${uid}/posts`));
        return snap.size;
    }

    async getGridLayout(uid: string): Promise<Record<string, string>> {
        const cached = this._profileCache.get(uid);
        if (cached && (cached as any)['gridLayout']) return (cached as any)['gridLayout'] as Record<string, string>;
        const snap = await getDoc(doc(this.fs, `users/${uid}`));
        if (!snap.exists()) return {};
        return (snap.data()['gridLayout'] as Record<string, string>) ?? {};
    }

    async saveGridLayout(uid: string, layout: Record<string, string>): Promise<void> {
        await setDoc(doc(this.fs, `users/${uid}`), { gridLayout: layout }, { merge: true });
    }

    async getDisplayItems(uid: string): Promise<HomeDisplayItem[]> {
        const snap = await getDoc(doc(this.fs, `users/${uid}`));
        if (!snap.exists()) return [];
        const raw = (snap.data()?.['displayItems'] as HomeDisplayItem[]) ?? [];
        return raw.map(item => ({
            ...item,
            type: (item.type ?? ((item.sku || item.brand || item.colorway) ? 'sneaker' : 'post')) as 'sneaker' | 'post' | 'user',
        }));
    }

    getListings$(uid: string): Observable<Listing[]> {
        return collectionData(
            query(collection(this.fs, `users/${uid}/listings`), orderBy('createdAt', 'desc')),
            { idField: 'id' }
        ) as Observable<Listing[]>;
    }

    async createListing(uid: string, data: Omit<Listing, 'id' | 'userId' | 'createdAt'>): Promise<string> {
        const ref = await addDoc(collection(this.fs, `users/${uid}/listings`), {
            ...data,
            userId: uid,
            createdAt: new Date(),
        });
        return ref.id;
    }

    async updateListing(uid: string, listingId: string, data: Partial<Omit<Listing, 'id' | 'userId' | 'createdAt'>>): Promise<void> {
        await updateDoc(doc(this.fs, `users/${uid}/listings/${listingId}`), data as Record<string, unknown>);
    }

    async deleteListing(uid: string, listingId: string): Promise<void> {
        await deleteDoc(doc(this.fs, `users/${uid}/listings/${listingId}`));
    }

    async saveDisplayItems(uid: string, items: HomeDisplayItem[]): Promise<void> {
        await setDoc(doc(this.fs, `users/${uid}`), { displayItems: items }, { merge: true });
    }

    async getFriends(currentUid: string | null, targetUid: string): Promise<UserPublicProfile[]> {
        const targetFollowersSnap = await getDocs(collection(this.fs, `users/${targetUid}/followers`));
        const targetFollowerUids = targetFollowersSnap.docs.map(d => d.id);

        let resultUids: string[];

        if (currentUid && targetFollowerUids.length > 0) {
            const currentFollowingSnap = await getDocs(collection(this.fs, `users/${currentUid}/following`));
            const currentFollowingSet = new Set(currentFollowingSnap.docs.map(d => d.id));
            const common = targetFollowerUids.filter(uid => currentFollowingSet.has(uid));

            if (common.length > 0) {
                resultUids = common.slice(0, 10);
            } else {
                resultUids = [...targetFollowerUids].sort(() => Math.random() - 0.5).slice(0, 10);
            }
        } else {
            resultUids = [...targetFollowerUids].sort(() => Math.random() - 0.5).slice(0, 10);
        }

        const profiles = await Promise.all(resultUids.map(uid => this.getPublicProfile(uid)));
        return profiles.filter((p): p is UserPublicProfile => p !== null);
    }
}
