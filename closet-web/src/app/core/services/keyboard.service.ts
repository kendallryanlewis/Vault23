import { Injectable, signal, NgZone, OnDestroy, inject } from '@angular/core';

/**
 * Listens for `keyboardChange` CustomEvents dispatched by the Swift WebBridge
 * and exposes the current keyboard height as a signal.
 *
 * On web (non-native), the Visual Viewport API is used as a fallback so the
 * service works correctly in the browser too.
 *
 * Consumers can read `keyboardHeight()` directly, or bind the pre-built
 * CSS custom property `--keyboard-height` that the ShellComponent sets on
 * the document root.
 */
@Injectable({ providedIn: 'root' })
export class KeyboardService implements OnDestroy {
    private zone = inject(NgZone);

    readonly keyboardHeight = signal(0);

    private nativeHandler = (e: Event) => {
        const detail = (e as CustomEvent<{ height: number; duration: number }>).detail;
        this.zone.run(() => this.keyboardHeight.set(detail.height));
    };

    private vpHandler = () => {
        if (!window.visualViewport) return;
        const hidden = window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop;
        this.zone.run(() => this.keyboardHeight.set(Math.max(0, hidden)));
    };

    constructor() {
        if (typeof window === 'undefined') return;
        window.addEventListener('keyboardChange', this.nativeHandler);
        // Fallback for web browser testing
        window.visualViewport?.addEventListener('resize', this.vpHandler);
    }

    ngOnDestroy(): void {
        window.removeEventListener('keyboardChange', this.nativeHandler);
        window.visualViewport?.removeEventListener('resize', this.vpHandler);
    }
}
