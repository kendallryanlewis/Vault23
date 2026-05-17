import { Component, inject, signal, computed, OnInit, OnDestroy, ElementRef, ChangeDetectionStrategy } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { of, Subscription } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { UserService } from '../../core/services/user.service';
import { AuthService } from '../../core/services/auth.service';
import { ChatService } from '../../core/services/chat.service';
import { PostService } from '../../core/services/post.service';
import { NotificationService } from '../../core/services/notification.service';
import { UserPublicProfile, HomeDisplayItem } from '../../core/models/user.model';
import { Sneaker } from '../../core/models/sneaker.model';
import { Post } from '../../core/models/post.model';
import { Listing } from '../../core/models/listing.model';
import { DetailPanelComponent } from '../search/detail-panel/detail-panel.component';
import { CatalogResult } from '../search/search.models';
import { PostViewComponent } from '../post-view/post-view.component';
import { UiStateService } from '../../core/services/ui-state.service';

const BRAND_PATTERNS: [RegExp, string][] = [
    [/air jordan/i, 'Air Jordan'],
    [/jordan/i, 'Jordan'],
    [/adidas/i, 'Adidas'],
    [/new balance/i, 'New Balance'],
    [/yeezy/i, 'Yeezy'],
    [/converse/i, 'Converse'],
    [/under armour/i, 'Under Armour'],
    [/reebok/i, 'Reebok'],
    [/puma/i, 'Puma'],
    [/vans/i, 'Vans'],
    [/nike/i, 'Nike'],
];

function extractBrandFromName(name: string): string {
    for (const [pattern, brand] of BRAND_PATTERNS) {
        if (pattern.test(name)) return brand;
    }
    return '';
}

@Component({
    selector: 'app-user-profile',
    standalone: true,
    imports: [DetailPanelComponent, PostViewComponent],
    templateUrl: './user-profile.component.html',
    styleUrl: './user-profile.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserProfileComponent implements OnInit {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private location = inject(Location);
    private userService = inject(UserService);
    private authService = inject(AuthService);
    private uiState = inject(UiStateService);
    private chatService = inject(ChatService);
    private postService = inject(PostService);
    private notificationService = inject(NotificationService);
    private el = inject(ElementRef);
    private sanitizer = inject(DomSanitizer);

    readonly targetUid = signal('');

    profile = signal<UserPublicProfile | null>(null);

    readonly locationMapUrl = computed((): SafeResourceUrl | null => {
        const loc = this.profile()?.location;
        if (!loc) return null;
        const url = `https://maps.google.com/maps?q=${encodeURIComponent(loc)}&t=&z=13&ie=UTF8&iwloc=&output=embed`;
        return this.sanitizer.bypassSecurityTrustResourceUrl(url);
    });

    closet = toSignal(
        toObservable(this.targetUid).pipe(
            switchMap(uid => uid ? this.userService.getUserCloset(uid) : of([] as Sneaker[]))
        ),
        { initialValue: [] as Sneaker[] }
    );
    posts = toSignal(
        toObservable(this.targetUid).pipe(
            switchMap(uid => uid ? this.postService.getUserPosts(uid) : of([] as Post[]))
        ),
        { initialValue: [] as Post[] }
    );
    friends = signal<UserPublicProfile[]>([]);
    followerCount = toSignal(
        toObservable(this.targetUid).pipe(
            switchMap(uid => uid ? this.userService.getFollowerCount$(uid) : of(0))
        ),
        { initialValue: 0 }
    );
    followingCount = toSignal(
        toObservable(this.targetUid).pipe(
            switchMap(uid => uid ? this.userService.getFollowingCount$(uid) : of(0))
        ),
        { initialValue: 0 }
    );
    postCount = computed(() => this.posts().length);
    following = signal(false);
    loading = signal(true);
    followLoading = signal(false);
    followError = signal('');
    gridSizes = signal<Record<string, string>>({})

    // Store Brand
    profileTab = signal<'shop' | 'posts' | 'closet' | 'about'>('shop');
    listings = toSignal(
        toObservable(this.targetUid).pipe(
            switchMap(uid => uid ? this.userService.getListings$(uid) : of([] as Listing[]))
        ),
        { initialValue: [] as Listing[] }
    );
    myDisplayItems = signal<HomeDisplayItem[]>([]);
    isInHomeGrid = computed(() => {
        const uid = this.targetUid();
        return this.myDisplayItems().some(d => d.type === 'user' && d.id === uid);
    });

    // Overlay state
    selectedSneakerIndex = signal<number | null>(null);
    selectedPostIndex = signal<number | null>(null);
    selectedListing = signal<Listing | null>(null);
    slideAnimating = signal(false);
    carouselDir = signal<'left' | 'right'>('right');

    readonly selectedListingResult = computed<CatalogResult | null>(() => {
        const l = this.selectedListing();
        if (!l) return null;
        return {
            id: l.sneakerId,
            name: l.sneakerName,
            brand: l.brand || extractBrandFromName(l.sneakerName),
            colorway: '',
            imageUrl: l.imageUrl ?? '',
            largeImageUrl: l.imageUrl ?? '',
            retailPrice: null,
            lowestPrice: l.askingPrice,
            styleId: l.sku,
            sourceUrl: '',
            releaseDate: null,
        };
    });

    readonly closetPreview = computed(() => this.closet().slice(0, 9));

    readonly isOwnProfile = computed(() => this.authService.currentUser()?.uid === this.targetUid());

    readonly selectedSneakerItem = computed<CatalogResult | null>(() => {
        const idx = this.selectedSneakerIndex();
        if (idx === null) return null;
        const s = this.closet()[idx];
        if (!s) return null;
        return {
            id: s.id,
            name: s.name,
            brand: s.brand || extractBrandFromName(s.name),
            colorway: s.colorway,
            imageUrl: s.imageUrl,
            largeImageUrl: s.imageUrl,
            retailPrice: null,
            lowestPrice: null,
            styleId: s.sku,
            sourceUrl: '',
            releaseDate: null,
        };
    });

    get currentUid(): string | null {
        return this.authService.uid;
    }

    // ── Scroll handler ──────────────────────────────────────────────────────
    // Registered as a passive event listener (not via template binding) so
    // WebKit never has to wait for it before deciding whether to scroll.
    // rAF-throttled so CSS var writes are batched to one per frame.
    private _lastScrollTop = 0;
    private _scrollRafId: number | null = null;
    private _profileSub: Subscription | null = null;

    private readonly _onScroll = (event: Event): void => {
        this._lastScrollTop = (event.target as HTMLElement).scrollTop;
        if (this._scrollRafId !== null) return;
        this._scrollRafId = requestAnimationFrame(() => {
            this._scrollRafId = null;
            const el = this.el.nativeElement as HTMLElement;
            const fullH = window.innerHeight * 0.65;
            const maxScroll = fullH - 200;
            const scrolled = Math.min(Math.max(this._lastScrollTop, 0), maxScroll);
            el.style.setProperty('--scroll-ratio', maxScroll > 0 ? String(scrolled / maxScroll) : '0');
            el.style.setProperty('--cover-h', `${fullH - scrolled}px`);
            el.style.setProperty('--cover-spacer', `${scrolled}px`);
        });
    };

    async ngOnInit(): Promise<void> {
        this.uiState.navHidden.set(true);

        const uid = this.route.snapshot.paramMap.get('uid') ?? '';
        this.targetUid.set(uid);

        // Show profile as soon as the core doc is fetched — no need to block on counts
        const prof = await this.userService.getPublicProfile(uid);
        this.profile.set(prof);
        this.loading.set(false);

        // Wait for Angular to render the conditional profile block, then attach
        // the passive scroll listener to the newly-rendered scroll container.
        requestAnimationFrame(() => {
            const container = (this.el.nativeElement as HTMLElement)
                .querySelector<HTMLElement>('.user-profile');
            container?.addEventListener('scroll', this._onScroll, { passive: true });
        });

        // Load follow status + grid layout in parallel without blocking the UI
        const [gridLayout, isFollowing] = await Promise.all([
            this.userService.getGridLayout(uid),
            this.currentUid ? this.userService.isFollowing(this.currentUid, uid) : Promise.resolve(false),
        ]);
        this.gridSizes.set(gridLayout);
        this.following.set(isFollowing);

        this.userService.getFriends(this.currentUid, uid).then(f => this.friends.set(f));

        // Live subscription — keeps profile (isStoreBrand, backgroundImageUrl, etc.) up to date
        // without requiring a page reload when settings change.
        this._profileSub = this.userService.getPublicProfile$(uid).subscribe(updated => {
            if (updated) this.profile.set(updated);
        });

        // Load current user's display items for Save to Home button
        if (this.currentUid && !this.isOwnProfile()) {
            const items = await this.userService.getDisplayItems(this.currentUid);
            this.myDisplayItems.set(items);
        }
    }

    ngOnDestroy(): void {
        this.uiState.navHidden.set(false);
        const container = (this.el.nativeElement as HTMLElement)
            .querySelector<HTMLElement>('.user-profile');
        container?.removeEventListener('scroll', this._onScroll);
        this._profileSub?.unsubscribe();
    }

    async toggleFollow(): Promise<void> {
        const uid = this.currentUid;
        if (!uid || this.followLoading()) return;
        this.followLoading.set(true);
        this.followError.set('');
        try {
            if (this.following()) {
                await this.userService.unfollow(uid, this.targetUid());
                this.following.set(false);
            } else {
                await this.userService.follow(uid, this.targetUid());
                this.following.set(true);
                const me = this.authService.currentUser();
                this.notificationService.push(this.targetUid(), 'follow_accepted', {
                    fromUid: uid,
                    fromUsername: me?.displayName ?? '',
                    fromPhotoURL: me?.photoURL ?? '',
                    body: 'started following you.',
                }).catch(() => { });
            }
        } catch (e: any) {
            this.followError.set(e?.message ?? 'Could not update follow. Try again.');
        } finally {
            this.followLoading.set(false);
        }
    }

    async openDM(): Promise<void> {
        const uid = this.currentUid;
        if (!uid) return;
        const chatId = await this.chatService.getOrCreateChat(uid, this.targetUid());
        this.router.navigate(['/app/chat', chatId]);
    }

    openListing(l: Listing): void {
        this.selectedListing.set(l);
    }

    closeListing(): void {
        this.selectedListing.set(null);
    }

    async openDMForListing(l: Listing): Promise<void> {
        const uid = this.currentUid;
        if (!uid) return;
        const chatId = await this.chatService.getOrCreateChat(uid, this.targetUid());
        const draft = `Hi, I'm interested in your ${l.sneakerName} (Size ${l.size}) listed at $${l.askingPrice}. Is it still available?`;
        this.router.navigate(['/app/chat', chatId], { queryParams: { draft } });
    }

    openSneaker(index: number): void {
        this.selectedSneakerIndex.set(index);
    }

    closeSneaker(): void {
        this.selectedSneakerIndex.set(null);
    }

    navigateNextSneaker(): void {
        const idx = this.selectedSneakerIndex();
        if (idx === null || idx >= this.closet().length - 1 || this.slideAnimating()) return;
        this.carouselDir.set('right');
        this.triggerSlide(idx + 1);
    }

    navigatePrevSneaker(): void {
        const idx = this.selectedSneakerIndex();
        if (idx === null || idx <= 0 || this.slideAnimating()) return;
        this.carouselDir.set('left');
        this.triggerSlide(idx - 1);
    }

    private triggerSlide(newIdx: number): void {
        this.slideAnimating.set(true);
        setTimeout(() => {
            this.selectedSneakerIndex.set(newIdx);
            setTimeout(() => this.slideAnimating.set(false), 500);
        }, 220);
    }

    openPost(index: number): void {
        this.selectedPostIndex.set(index);
    }

    getColSpan(id: string): number {
        return (this.gridSizes()[id] ?? '1x1') === '1x1' ? 1 : 2;
    }

    getRowSpan(id: string): number {
        return (this.gridSizes()[id] ?? '1x1') === '2x2' ? 2 : 1;
    }

    closePost(): void {
        this.selectedPostIndex.set(null);
    }

    goBack(): void {
        this.location.back();
    }

    async toggleSaveToHomeGrid(): Promise<void> {
        const uid = this.currentUid;
        const p = this.profile();
        if (!uid || !p) return;
        const current = this.myDisplayItems();
        let updated: HomeDisplayItem[];
        if (this.isInHomeGrid()) {
            updated = current.filter(d => !(d.type === 'user' && d.id === this.targetUid()));
        } else {
            if (current.length >= 6) return;
            updated = [...current, {
                id: this.targetUid(),
                uid: this.targetUid(),
                imageUrl: p.photoURL,
                name: p.username,
                type: 'user',
            }];
        }
        this.myDisplayItems.set(updated);
        await this.userService.saveDisplayItems(uid, updated);
    }
}
