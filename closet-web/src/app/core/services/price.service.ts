import { Injectable, inject } from '@angular/core';
import { Firestore, doc, getDoc, setDoc } from '@angular/fire/firestore';
import { HttpClient } from '@angular/common/http';
import { Observable, from, of } from 'rxjs';
import { switchMap, map, catchError } from 'rxjs/operators';
import { SneakerPrice } from '../models/sneaker.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PriceService {
    private fs = inject(Firestore);
    private http = inject(HttpClient);

    private readonly TTL_MS = 24 * 60 * 60 * 1000;

    getPrice(sku: string): Observable<SneakerPrice | null> {
        return from(this.cachedPrice(sku)).pipe(
            switchMap((cached) => {
                if (cached) return of(cached);
                return this.http.get<SneakerPrice>(`${environment.apiUrl}/prices/${sku}`).pipe(
                    switchMap((price) => from(this.cachePrice(sku, price)).pipe(map(() => price))),
                    catchError(() => of(null))
                );
            })
        );
    }

    collectionValue(skus: string[]): Observable<number> {
        return from(
            Promise.all(
                skus.map((sku) =>
                    this.cachedPrice(sku).then((p) => p?.marketValue ?? 0)
                )
            ).then((vals) => vals.reduce((sum, v) => sum + v, 0))
        );
    }

    private async cachedPrice(sku: string): Promise<SneakerPrice | null> {
        const snap = await getDoc(doc(this.fs, `priceCache/${sku}`));
        if (!snap.exists()) return null;
        const data = snap.data() as SneakerPrice & { fetchedAt: { seconds: number } };
        const fetchedAt = data.fetchedAt?.seconds ? data.fetchedAt.seconds * 1000 : 0;
        if (Date.now() - fetchedAt > this.TTL_MS) return null;
        return data as unknown as SneakerPrice;
    }

    private async cachePrice(sku: string, price: SneakerPrice): Promise<void> {
        await setDoc(doc(this.fs, `priceCache/${sku}`), {
            ...price,
            fetchedAt: new Date(),
        });
    }
}
