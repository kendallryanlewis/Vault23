import { Injectable, inject } from '@angular/core';
import { Firestore, doc, setDoc, arrayUnion } from '@angular/fire/firestore';
import { environment } from '../../../environments/environment';

/**
 * PushService — bridges APNs device tokens received from the native iOS shell
 * into Firestore, and forwards notification payloads to the Sneaker-API push
 * endpoint which delivers them via FCM to the registered device.
 *
 * Token registration:
 *   On app start, iOS registers for remote notifications and forwards the raw
 *   APNs token through the WebBridge as a CustomEvent('apnsToken').
 *   Call `startListening(uid)` after the user signs in to capture it and write
 *   it to `users/{uid}.pushTokens` (array-union, deduped by Firestore).
 *
 * Sending:
 *   `send(recipientUid, title, body, data?)` reads the recipient's tokens from
 *   Firestore then hits POST /api/push for each one. Failures for individual
 *   tokens are logged but do not throw.
 */
@Injectable({ providedIn: 'root' })
export class PushService {
    private fs = inject(Firestore);

    private _tokenListener: ((e: Event) => void) | null = null;
    private _currentToken: string | null = null;

    /** Call once after sign-in. Listens for the APNs token from the native bridge
     *  and persists it to the authenticated user's Firestore document. */
    startListening(uid: string): void {
        if (this._tokenListener) return; // already registered

        this._tokenListener = async (e: Event) => {
            const token = (e as CustomEvent<{ token: string }>).detail?.token;
            if (!token || token === this._currentToken) return;
            this._currentToken = token;
            await this._saveToken(uid, token);
        };

        window.addEventListener('apnsToken', this._tokenListener);
    }

    stopListening(): void {
        if (this._tokenListener) {
            window.removeEventListener('apnsToken', this._tokenListener);
            this._tokenListener = null;
        }
    }

    /**
     * Send a push notification to every registered device of `recipientUid`.
     * Reads push tokens from `users/{recipientUid}.pushTokens`.
     * Silently skips if no tokens exist.
     */
    async send(
        recipientUid: string,
        title: string,
        body: string,
        data: Record<string, string> = {}
    ): Promise<void> {
        let tokens: string[] = [];
        try {
            const { getDoc } = await import('@angular/fire/firestore');
            const snap = await getDoc(doc(this.fs, `users/${recipientUid}`));
            tokens = (snap.data() as any)?.pushTokens ?? [];
        } catch {
            return;
        }
        if (!tokens.length) return;

        await Promise.allSettled(
            tokens.map(token =>
                fetch(`${environment.sneaksApiUrl}/api/push`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, title, body, data }),
                }).then(r => {
                    if (!r.ok) console.warn('[PushService] FCM error for token', token, r.status);
                }).catch(err => {
                    console.warn('[PushService] fetch error', err);
                })
            )
        );
    }

    private async _saveToken(uid: string, token: string): Promise<void> {
        try {
            await setDoc(
                doc(this.fs, `users/${uid}`),
                { pushTokens: arrayUnion(token) },
                { merge: true }
            );
        } catch (err) {
            console.warn('[PushService] failed to save token', err);
        }
    }
}
