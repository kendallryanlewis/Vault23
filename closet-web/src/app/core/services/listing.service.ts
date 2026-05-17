import { Injectable, inject, signal } from '@angular/core';
import {
    Firestore,
    collection,
    collectionData,
    addDoc,
    updateDoc,
    doc,
    query,
    where,
    orderBy,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Listing, ListingStatus, ListingType } from '../models/listing.model';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class ListingService {
    private fs = inject(Firestore);
    private authService = inject(AuthService);

    readonly filterType = signal<ListingType | 'all'>('all');

    allListings(): Observable<Listing[]> {
        const ref = collection(this.fs, 'listings');
        const constraints = [
            where('status', '==', 'available'),
            orderBy('createdAt', 'desc'),
        ];
        return collectionData(query(ref, ...constraints), { idField: 'id' }) as Observable<Listing[]>;
    }

    myListings(): Observable<Listing[]> {
        const uid = this.authService.uid!;
        const ref = collection(this.fs, 'listings');
        return collectionData(
            query(ref, where('userId', '==', uid), orderBy('createdAt', 'desc')),
            { idField: 'id' }
        ) as Observable<Listing[]>;
    }

    async create(listing: Omit<Listing, 'id' | 'userId' | 'userDisplayName' | 'userPhotoUrl' | 'createdAt' | 'status'>): Promise<void> {
        const user = this.authService.currentUser()!;
        await addDoc(collection(this.fs, 'listings'), {
            ...listing,
            userId: user.uid,
            userDisplayName: user.displayName ?? '',
            userPhotoUrl: user.photoURL ?? '',
            status: 'available' as ListingStatus,
            createdAt: new Date(),
        });
    }

    async updateStatus(id: string, status: ListingStatus): Promise<void> {
        await updateDoc(doc(this.fs, `listings/${id}`), { status });
    }
}
