import {
    Component,
    ChangeDetectionStrategy,
    output,
    signal,
    computed,
    OnInit,
    OnDestroy,
    inject,
    DOCUMENT,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

export interface TutorialStep {
    id: string;
    title: string;
    body: string;
    /** CSS selector for the element to highlight. Null = no highlight. */
    targetSelector: string | null;
    /** Route to navigate to before showing the step. Null = stay on current. */
    navigateTo: string | null;
    /** If true, the step auto-advances when the user taps the highlighted element. */
    waitForTap: boolean;
}

const STEPS: TutorialStep[] = [
    {
        id: 'welcome',
        title: 'Welcome to Vault23',
        body: 'Your personal sneaker vault. Let\'s take a quick tour so you feel right at home.',
        targetSelector: null,
        navigateTo: null,
        waitForTap: false,
    },
    {
        id: 'home-tabs',
        title: 'Three Ways to Browse',
        body: 'HOME shows your grid, NEWS shows the latest sneaker releases and stories, and FEED shows posts from people you follow.',
        targetSelector: '.feed-header__tabs',
        navigateTo: '/app/home',
        waitForTap: false,
    },
    {
        id: 'home-grid',
        title: 'Your Home Grid',
        body: 'Pin your favourite sneakers, posts, and profiles here for quick access. Long-press any card to remove it.',
        targetSelector: '.home-tab__grid',
        navigateTo: '/app/home',
        waitForTap: false,
    },
    {
        id: 'search',
        title: 'Search & Discover',
        body: 'Explore millions of sneakers, find other collectors, and browse the full catalog. Tap the search icon to continue.',
        targetSelector: 'a[routerLink="/app/search"]',
        navigateTo: null,
        waitForTap: true,
    },
    {
        id: 'search-bar',
        title: 'Find Anything',
        body: 'Search by brand, model, colorway, SKU, or username. Results appear instantly as you type.',
        targetSelector: '.search-wrap',
        navigateTo: '/app/search',
        waitForTap: false,
    },
    {
        id: 'search-brands',
        title: 'Browse by Brand',
        body: 'Tap any brand logo on the left to instantly filter the catalog by that brand.',
        targetSelector: '.left-bank--brands',
        navigateTo: '/app/search',
        waitForTap: false,
    },
    {
        id: 'camera',
        title: 'Share a Post',
        body: 'Tap the camera to post a photo of your latest pickup or favourite pair.',
        targetSelector: '.tab-bar__item:nth-child(3)',
        navigateTo: null,
        waitForTap: false,
    },
    {
        id: 'messages',
        title: 'Messages',
        body: 'Chat with other sneakerheads. Tap the message icon to continue.',
        targetSelector: 'a[routerLink="/app/messages"]',
        navigateTo: null,
        waitForTap: true,
    },
    {
        id: 'profile',
        title: 'Your Profile',
        body: 'Manage your collection, listings, and settings from your profile. Tap the profile icon to continue.',
        targetSelector: 'a[routerLink="/app/profile"]',
        navigateTo: null,
        waitForTap: true,
    },
    {
        id: 'profile-page',
        title: 'Closet, Posts & Wishlist',
        body: 'Switch between tabs to view your sneaker closet, your posts, and your wishlist.',
        targetSelector: '.profile-page__tab-bar',
        navigateTo: '/app/profile',
        waitForTap: false,
    },
    {
        id: 'settings',
        title: 'Settings',
        body: 'Update your photo, bio, username, and preferences all in one place. Tap the gear icon to continue.',
        targetSelector: '.profile-page__settings-btn',
        navigateTo: '/app/profile',
        waitForTap: true,
    },
    {
        id: 'settings-page',
        title: 'Customise Your Account',
        body: 'Change your avatar, display name, bio, background image, notifications, and more.',
        targetSelector: '.s-content',
        navigateTo: '/app/profile/settings',
        waitForTap: false,
    },
    {
        id: 'addToGrid',
        title: 'Build Your Grid',
        body: 'Tap \'Add to Home\' from any sneaker or post to pin it to your home grid. Long-press a card to remove it.',
        targetSelector: null,
        navigateTo: '/app/home',
        waitForTap: false,
    },
    {
        id: 'done',
        title: 'You\'re all set!',
        body: 'Explore at your own pace. You can remove this tutorial card from your home grid at any time by long-pressing it.',
        targetSelector: null,
        navigateTo: null,
        waitForTap: false,
    },
];

@Component({
    selector: 'app-tutorial-overlay',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './tutorial-overlay.component.html',
    styleUrl: './tutorial-overlay.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TutorialOverlayComponent implements OnInit, OnDestroy {
    private doc = inject(DOCUMENT);
    private router = inject(Router);

    readonly closed = output<void>();

    readonly steps = STEPS;
    readonly stepIndex = signal(0);
    readonly currentStep = computed(() => STEPS[this.stepIndex()]);
    readonly isLast = computed(() => this.stepIndex() === STEPS.length - 1);

    readonly highlightRect = signal<DOMRect | null>(null);

    private _tapListener: ((e: Event) => void) | null = null;
    private _tapEl: HTMLElement | null = null;
    private _elevatedEls: Array<{ el: HTMLElement; position: string; zIndex: string }> = [];

    ngOnInit(): void {
        this._applyStep();
    }

    ngOnDestroy(): void {
        this._cleanup();
    }

    private _applyStep(): void {
        this._cleanup();
        const step = this.currentStep();
        if (step.navigateTo) {
            this.router.navigateByUrl(step.navigateTo).then(() => {
                setTimeout(() => this._updateHighlight(), 150);
            });
        } else {
            setTimeout(() => this._updateHighlight(), 80);
        }
    }

    private _updateHighlight(): void {
        const step = this.currentStep();
        if (!step.targetSelector) {
            this.highlightRect.set(null);
            return;
        }
        const el = this.doc.querySelector(step.targetSelector) as HTMLElement | null;
        if (!el) {
            this.highlightRect.set(null);
            return;
        }
        this.highlightRect.set(el.getBoundingClientRect());
        this._elevateAboveOverlay(el);

        if (step.waitForTap) {
            this._tapEl = el;
            this._tapListener = (e: Event) => {
                e.preventDefault();
                e.stopImmediatePropagation();
                this.next();
            };
            el.addEventListener('click', this._tapListener, { capture: true });
        }
    }

    /** Temporarily elevate the target element (and any lower-z stacking ancestors)
     *  above the tutorial overlay (z-index 9000). */
    private _elevateAboveOverlay(el: HTMLElement): void {
        const toElevate: HTMLElement[] = [el];
        let node = el.parentElement;
        while (node && node !== this.doc.body) {
            const computed = window.getComputedStyle(node);
            const z = parseInt(computed.zIndex, 10);
            if (!isNaN(z) && z > 0 && z < 9000) {
                toElevate.push(node);
            }
            node = node.parentElement;
        }
        for (const t of toElevate) {
            this._elevatedEls.push({ el: t, position: t.style.position, zIndex: t.style.zIndex });
            t.style.position = 'relative';
            t.style.zIndex = '9001';
        }
    }

    private _cleanup(): void {
        if (this._tapListener && this._tapEl) {
            this._tapEl.removeEventListener('click', this._tapListener, { capture: true } as EventListenerOptions);
        }
        this._tapListener = null;
        this._tapEl = null;
        for (const { el, position, zIndex } of this._elevatedEls) {
            el.style.position = position;
            el.style.zIndex = zIndex;
        }
        this._elevatedEls = [];
    }

    next(): void {
        if (this.isLast()) {
            this.close();
            return;
        }
        this.stepIndex.update(i => i + 1);
        this._applyStep();
    }

    close(): void {
        this._cleanup();
        this.closed.emit();
    }

    /**
     * Positions the card in the top or bottom safe zone of the screen,
     * on the opposite side from the highlighted element's midpoint.
     * This avoids pixel-tracking element edges (which breaks for tall elements)
     * and guarantees the card is always fully on-screen.
     *
     * - No highlight → centred vertically inside the safe area.
     * - Highlight midpoint in lower half → card anchored to top safe zone.
     * - Highlight midpoint in upper half → card anchored to bottom safe zone.
     */
    readonly cardStyle = computed((): Record<string, string> => {
        const rect = this.highlightRect();

        if (!rect) {
            return {
                top: '50%',
                bottom: 'auto',
                transform: 'translateY(-50%)',
            };
        }

        const midY = rect.top + rect.height / 2;
        const screenH = window.innerHeight;

        if (midY > screenH / 2) {
            // Highlight is in the lower half — anchor card to top safe zone
            return {
                top: 'calc(env(safe-area-inset-top, 0px) + 16px)',
                bottom: 'auto',
                transform: 'none',
            };
        } else {
            // Highlight is in the upper half — anchor card to bottom safe zone
            // --nav-height covers the tab bar; fall back to 100px
            return {
                bottom: 'calc(env(safe-area-inset-bottom, 0px) + var(--nav-height, 100px) + 12px)',
                top: 'auto',
                transform: 'none',
            };
        }
    });

    /** Pulse ring dimensions — slightly larger than the highlight rect */
    pulseStyle(rect: DOMRect): Record<string, string> {
        const pad = 6;
        return {
            top: `${rect.top - pad}px`,
            left: `${rect.left - pad}px`,
            width: `${rect.width + pad * 2}px`,
            height: `${rect.height + pad * 2}px`,
        };
    }

    maskTop(rect: DOMRect): Record<string, string> {
        return { top: '0', left: '0', right: '0', height: `${Math.max(0, rect.top)}px` };
    }

    maskBottom(rect: DOMRect): Record<string, string> {
        return { top: `${rect.bottom}px`, left: '0', right: '0', bottom: '0' };
    }

    maskLeft(rect: DOMRect): Record<string, string> {
        return {
            top: `${rect.top}px`,
            left: '0',
            width: `${Math.max(0, rect.left)}px`,
            height: `${rect.height}px`,
        };
    }

    maskRight(rect: DOMRect): Record<string, string> {
        return {
            top: `${rect.top}px`,
            left: `${rect.right}px`,
            right: '0',
            height: `${rect.height}px`,
        };
    }
}
