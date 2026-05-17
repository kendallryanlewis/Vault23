import { Injectable, inject } from '@angular/core';
import {
    Firestore,
    collection,
    collectionData,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    query,
    orderBy,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Sneaker } from '../models/sneaker.model';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class SneakerService {
    private fs = inject(Firestore);
    private authService = inject(AuthService);

    private ref() {
        return collection(this.fs, `users/${this.authService.uid!}/sneakers`);
    }

    list(): Observable<Sneaker[]> {
        return collectionData(
            query(this.ref(), orderBy('addedAt', 'desc')),
            { idField: 'id' }
        ) as Observable<Sneaker[]>;
    }

    async add(sneaker: Omit<Sneaker, 'id' | 'userId' | 'addedAt'>): Promise<void> {
        await addDoc(this.ref(), {
            ...sneaker,
            userId: this.authService.uid!,
            addedAt: new Date(),
        });
    }

    async update(id: string, changes: Partial<Omit<Sneaker, 'id' | 'userId' | 'addedAt'>>): Promise<void> {
        await updateDoc(doc(this.fs, `users/${this.authService.uid!}/sneakers/${id}`), changes as Record<string, unknown>);
    }

    async remove(id: string): Promise<void> {
        await deleteDoc(doc(this.fs, `users/${this.authService.uid!}/sneakers/${id}`));
    }
}
