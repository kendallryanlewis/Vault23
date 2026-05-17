import { Injectable, inject, signal } from '@angular/core';
import {
    Firestore,
    collection,
    collectionData,
    query,
    orderBy,
    where,
    doc,
    setDoc,
    deleteDoc,
    getDoc,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Drop, DropNotification } from '../models/drop.model';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class DropService {
    private fs = inject(Firestore);
    private authService = inject(AuthService);

    readonly brandFilter = signal<string>('all');
    readonly notifiedIds = signal<Set<string>>(new Set());

    upcoming(): Observable<Drop[]> {
        const today = new Date().toISOString().split('T')[0];
        const ref = collection(this.fs, 'drops');
        return collectionData(
            query(ref, where('releaseDate', '>=', today), orderBy('releaseDate', 'asc')),
            { idField: 'id' }
        ) as Observable<Drop[]>;
    }

    async loadMyNotifications(): Promise<void> {
        const uid = this.authService.uid;
        if (!uid) return;
        const ref = collection(this.fs, `users/${uid}/dropNotifications`);
        const snap = await import('@angular/fire/firestore').then(({ getDocs }) => getDocs(ref));
        const ids = new Set<string>(snap.docs.map((d) => d.id));
        this.notifiedIds.set(ids);
    }

    async notify(dropId: string): Promise<void> {
        const uid = this.authService.uid;
        if (!uid) return;
        await setDoc(doc(this.fs, `users/${uid}/dropNotifications/${dropId}`), {
            dropId,
            createdAt: new Date(),
        } satisfies DropNotification);
        this.notifiedIds.update((s) => new Set([...s, dropId]));
    }

    async unnotify(dropId: string): Promise<void> {
        const uid = this.authService.uid;
        if (!uid) return;
        await deleteDoc(doc(this.fs, `users/${uid}/dropNotifications/${dropId}`));
        this.notifiedIds.update((s) => {
            const next = new Set(s);
            next.delete(dropId);
            return next;
        });
    }

    isNotified(dropId: string): boolean {
        return this.notifiedIds().has(dropId);
    }
}
