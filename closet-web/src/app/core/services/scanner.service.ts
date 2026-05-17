import { Injectable, inject } from '@angular/core';
import { NativeBridgeService } from './native-bridge.service';
import { ApiService } from './api.service';
import { Observable, fromEvent } from 'rxjs';
import { map, take } from 'rxjs/operators';
import { Sneaker } from '../models/sneaker.model';

export interface ScanResult {
    sku: string;
    barcode: string;
}

@Injectable({ providedIn: 'root' })
export class ScannerService {
    private bridge = inject(NativeBridgeService);
    private api = inject(ApiService);

    /** Opens the native barcode scanner and returns the first scan result. */
    scan(): Observable<ScanResult> {
        this.bridge.send('openScanner');
        return fromEvent<CustomEvent>(window, 'scanResult').pipe(
            take(1),
            map((e) => e.detail as ScanResult)
        );
    }

    /** Looks up a SKU from the API and returns a partial Sneaker to pre-fill a form. */
    lookupSku(sku: string): Observable<Partial<Sneaker>> {
        return this.api.get<Partial<Sneaker>>(`/sneakers/sku/${sku}`);
    }
}
