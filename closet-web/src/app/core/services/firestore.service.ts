import { Injectable, inject } from '@angular/core';
import {
    Firestore,
    collection,
    collectionData,
    doc,
    docData,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    QueryConstraint,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

/**
 * Generic Firestore wrapper.
 * Use domain-specific services (e.g. SneakerService) that inject this
 * and call these helpers with typed generics.
 */
@Injectable({ providedIn: 'root' })
export class FirestoreService {
    private fs = inject(Firestore);

    list<T>(path: string, ...constraints: QueryConstraint[]): Observable<T[]> {
        const ref = collection(this.fs, path);
        return collectionData(query(ref, ...constraints), { idField: 'id' }) as Observable<T[]>;
    }

    get<T>(path: string, id: string): Observable<T> {
        return docData(doc(this.fs, path, id), { idField: 'id' }) as Observable<T>;
    }

    add<T extends object>(path: string, data: T): Promise<string> {
        return addDoc(collection(this.fs, path), data).then(ref => ref.id);
    }

    update(path: string, id: string, data: Partial<unknown>): Promise<void> {
        return updateDoc(doc(this.fs, path, id), data as Record<string, unknown>);
    }

    remove(path: string, id: string): Promise<void> {
        return deleteDoc(doc(this.fs, path, id));
    }

    // Re-export constraint helpers so callers don't need to import from @angular/fire/firestore
    readonly where = where;
    readonly orderBy = orderBy;
}
