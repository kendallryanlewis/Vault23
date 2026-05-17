import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CameraStateService {
    readonly pendingFile = signal<File | null>(null);

    set(file: File): void {
        this.pendingFile.set(file);
    }

    consume(): File | null {
        const f = this.pendingFile();
        this.pendingFile.set(null);
        return f;
    }
}
