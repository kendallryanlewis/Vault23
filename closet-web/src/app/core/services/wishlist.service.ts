import { Injectable, inject } from '@angular/core';
import {
    Firestore,
    collection,
    collectionData,
    addDoc,
    deleteDoc,
    doc,
    query,
    orderBy,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { WishlistItem } from '../models/wishlist-item.model';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class WishlistService {
    private fs = inject(Firestore);
    private authService = inject(AuthService);

    list(): Observable<WishlistItem[]> {
        const uid = this.authService.uid!;
        const ref = collection(this.fs, `users/${uid}/wishlist`);
        return collectionData(query(ref, orderBy('addedAt', 'desc')), { idField: 'id' }) as Observable<WishlistItem[]>;
    }

    async add(item: Omit<WishlistItem, 'id' | 'userId' | 'addedAt'>): Promise<void> {
        const uid = this.authService.uid!;
        await addDoc(collection(this.fs, `users/${uid}/wishlist`), {
            ...item,
            userId: uid,
            addedAt: new Date(),
        });
    }

    async remove(id: string): Promise<void> {
        const uid = this.authService.uid!;
        await deleteDoc(doc(this.fs, `users/${uid}/wishlist/${id}`));
    }
}
