import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class UiStateService {
    readonly detailOpen = signal(false);
    readonly navHidden = signal(false);
}
