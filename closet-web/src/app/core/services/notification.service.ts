import { Injectable, inject } from '@angular/core';
import {
    Firestore,
    collection,
    collectionData,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    orderBy,
    limit,
    serverTimestamp,
    writeBatch,
    getDocs,
    where,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { AppNotification, NotificationType } from '../models/notification.model';
import { PushService } from './push.service';

@Injectable({ providedIn: 'root' })
export class NotificationService {
    private fs = inject(Firestore);
    private pushService = inject(PushService);

    /** Live stream of a user's 40 most-recent notifications */
    getNotifications(uid: string): Observable<AppNotification[]> {
        return collectionData(
            query(
                collection(this.fs, `notifications/${uid}/items`),
                orderBy('createdAt', 'desc'),
                limit(40)
            ),
            { idField: 'id' }
        ) as Observable<AppNotification[]>;
    }

    /** Push a notification to a recipient */
    async push(
        recipientUid: string,
        type: NotificationType,
        opts: {
            fromUid?: string;
            fromUsername?: string;
            fromPhotoURL?: string;
            resourceId?: string;
            body: string;
        }
    ): Promise<void> {
        await addDoc(collection(this.fs, `notifications/${recipientUid}/items`), {
            type,
            ...opts,
            read: false,
            createdAt: serverTimestamp(),
        });

        // Best-effort native push — silently swallowed so Firestore write is never blocked.
        const title = this._titleForType(type, opts.fromUsername);
        this.pushService.send(recipientUid, title, opts.body).catch(() => { });
    }

    private _titleForType(type: NotificationType, fromUsername?: string): string {
        const who = fromUsername ? `@${fromUsername}` : 'Someone';
        switch (type) {
            case 'message': return `New message from ${who}`;
            case 'comment': return `${who} commented`;
            case 'like': return `${who} liked your post`;
            case 'follow_accepted': return `${who} followed you`;
            case 'mention': return `${who} mentioned you`;
            case 'news': return 'Vault23 News';
            default: return 'Vault23';
        }
    }

    /** Mark a single notification as read */
    async markRead(uid: string, notifId: string): Promise<void> {
        await updateDoc(
            doc(this.fs, `notifications/${uid}/items/${notifId}`),
            { read: true }
        );
    }

    /** Mark all notifications as read */
    async markAllRead(uid: string): Promise<void> {
        const snap = await getDocs(
            query(
                collection(this.fs, `notifications/${uid}/items`),
                where('read', '==', false)
            )
        );
        if (snap.empty) return;
        const batch = writeBatch(this.fs);
        snap.docs.forEach(d => batch.update(d.ref, { read: true }));
        await batch.commit();
    }

    /** Delete a notification */
    async dismiss(uid: string, notifId: string): Promise<void> {
        await deleteDoc(doc(this.fs, `notifications/${uid}/items/${notifId}`));
    }
}
