import { Injectable } from '@angular/core';

declare global {
    interface Window {
        webkit?: {
            messageHandlers?: {
                nativeBridge?: {
                    postMessage: (message: unknown) => void;
                };
            };
        };
    }
}

/**
 * Service for sending messages from Angular to the native Swift layer.
 *
 * Usage:
 * ```ts
 * bridge.send('openCamera');
 * bridge.send('saveItem', { id: '123', name: 'Blue Jeans' });
 * ```
 *
 * In Swift, handle the action in `WebBridge.handle(action:payload:)`.
 */
@Injectable({ providedIn: 'root' })
export class NativeBridgeService {
    readonly isNative =
        typeof window !== 'undefined' &&
        !!window.webkit?.messageHandlers?.nativeBridge;

    send(action: string, payload?: unknown): void {
        if (!this.isNative) return;
        window.webkit!.messageHandlers!.nativeBridge!.postMessage({ action, payload });
    }
}
