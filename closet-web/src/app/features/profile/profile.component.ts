import { Component, inject, signal, computed, OnInit, ElementRef, ViewChild, AfterViewInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { firstValueFrom, Observable, of } from 'rxjs';
import { map, shareReplay, switchMap } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';
import { SneakerService } from '../../core/services/sneaker.service';
import { PriceService } from '../../core/services/price.service';
import { WishlistService } from '../../core/services/wishlist.service';
import { UiStateService } from '../../core/services/ui-state.service';
import { SettingsService } from '../../core/services/settings.service';
import { UserService } from '../../core/services/user.service';
import { PostService } from '../../core/services/post.service';
import { Sneaker } from '../../core/models/sneaker.model';
import { WishlistItem } from '../../core/models/wishlist-item.model';
import { Post } from '../../core/models/post.model';
import { HomeDisplayItem } from '../../core/models/user.model';
import { DetailPanelComponent } from '../search/detail-panel/detail-panel.component';
import { PostViewComponent } from '../post-view/post-view.component';
import { CatalogResult } from '../search/search.models';
import { UserPublicProfile } from '../../core/models/user.model';
import { Listing, ListingStatus } from '../../core/models/listing.model';

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

type Tab = 'closet' | 'posts' | 'wishlist' | 'store';
type GridSize = '1x1' | '2x1' | '2x2';

const TABS: Tab[] = ['closet', 'posts', 'wishlist', 'store'];

@Component({
    selector: 'app-profile',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterLink, DetailPanelComponent, PostViewComponent],
    templateUrl: './profile.component.html',
    styleUrl: './profile.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent implements OnInit, AfterViewInit, OnDestroy {
    private authService = inject(AuthService);
    private sneakerService = inject(SneakerService);
    private priceService = inject(PriceService);
    private wishlistService = inject(WishlistService);
    private uiState = inject(UiStateService);
    private settingsService = inject(SettingsService);
    private userService = inject(UserService);
    private postService = inject(PostService);
    private router = inject(Router);

    @ViewChild('scrollEl') scrollEl!: ElementRef<HTMLElement>;

    scrolled = signal(false);

    tab = signal<Tab>('closet');
    activeTabs = computed<Tab[]>(() => this.isStoreBrand() ? TABS : TABS.filter(t => t !== 'store') as Tab[]);
    tabIndex = computed(() => this.activeTabs().indexOf(this.tab()));
    collectionValue = signal<number | null>(null);
    gridSizes = signal<Record<string, GridSize>>({});
    followerCount = toSignal(
        toObservable(this.authService.currentUser).pipe(
            switchMap(u => u ? this.userService.getFollowerCount$(u.uid) : of(0))
        ),
        { initialValue: 0 }
    );
    followingCount = toSignal(
        toObservable(this.authService.currentUser).pipe(
            switchMap(u => u ? this.userService.getFollowingCount$(u.uid) : of(0))
        ),
        { initialValue: 0 }
    );

    // Detail panel
    selectedSneaker = signal<Sneaker | null>(null);
    selectedWishlistItem = signal<WishlistItem | null>(null);
    selectedSneakerIndex = signal(0);
    slideAnimating = signal(false);
    carouselDir = signal<'left' | 'right'>('right');

    // Post view & resize sheet
    selectedPost = signal<Post | null>(null);
    selectedPostIndex = signal(0);
    postSheetPostId = signal<string | null>(null);
    postSheetPost = signal<Post | null>(null);

    myProfile = computed<UserPublicProfile>(() => {
        const u = this.user();
        return {
            uid: u?.uid ?? '',
            username: u?.displayName ?? u?.email ?? '',
            photoURL: u?.photoURL ?? '',
            bio: this.bio(),
            location: '',
            shoeSize: '',
        };
    });

    selectedCatalogResult = computed<CatalogResult | null>(() => {
        const w = this.selectedWishlistItem();
        if (w) {
            return {
                id: w.id,
                name: w.name,
                brand: w.brand,
                colorway: w.colorway,
                imageUrl: w.imageUrl,
                largeImageUrl: w.imageUrl,
                retailPrice: w.retailPrice || null,
                lowestPrice: null,
                styleId: w.sku,
                sourceUrl: '',
                releaseDate: null,
            };
        }
        const s = this.selectedSneaker();
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

    // Context menu (long press)
    contextMenuSneaker = signal<Sneaker | null>(null);
    sizeDraft = signal('');
    confirmingDelete = signal(false);
    displayItems = signal<HomeDisplayItem[]>([]);

    // Store tab
    activeStoreListing = signal<Listing | null>(null);
    confirmingDeleteListing = signal(false);

    // Listing sheet
    listingSheetSneaker = signal<Sneaker | null>(null);
    editingListingId = signal<string | null>(null);
    listingPrice = signal(0);
    listingCondition = signal<'DS' | 'VNDS' | 'Used'>('DS');
    listingSize = signal('');
    listingQuantity = signal(1);
    listingNotes = signal('');
    listingSaving = signal(false);
    listings = toSignal(
        toObservable(this.authService.currentUser).pipe(
            switchMap(u => u ? this.userService.getListings$(u.uid) : of([] as Listing[]))
        ),
        { initialValue: [] as Listing[] }
    );

    groupedListings = computed(() => {
        const map = new Map<string, { sneakerId: string; sneakerName: string; imageUrl: string; items: Listing[] }>();
        for (const l of this.listings()) {
            if (!map.has(l.sneakerId)) {
                map.set(l.sneakerId, { sneakerId: l.sneakerId, sneakerName: l.sneakerName, imageUrl: l.imageUrl ?? '', items: [] });
            }
            map.get(l.sneakerId)!.items.push(l);
        }
        return Array.from(map.values());
    });

    hasListing(sneakerId: string): boolean {
        return this.listings().some(l => l.sneakerId === sneakerId);
    }

    listingCount(sneakerId: string): number {
        return this.listings().filter(l => l.sneakerId === sneakerId).length;
    }

    hasPostListing(postId: string): boolean {
        return this.listings().some(l => l.sneakerId === postId);
    }

    openPostListingSheet(post: Post): void {
        const existing = this.listings().find(l => l.sneakerId === post.id);
        this.editingListingId.set(existing?.id ?? null);
        this.listingPrice.set(existing?.askingPrice ?? 0);
        this.listingCondition.set((existing?.condition as 'DS' | 'VNDS' | 'Used') ?? 'DS');
        this.listingSize.set(existing?.size ?? '');
        this.listingQuantity.set(existing?.quantity ?? 1);
        this.listingNotes.set(existing?.description ?? '');
        // Build a pseudo-sneaker so the existing listing sheet works unchanged
        const pseudo: Sneaker = {
            id: post.id,
            userId: this.user()?.uid ?? '',
            sku: '',
            brand: '',
            name: post.caption || 'Post item',
            colorway: '',
            size: '',
            condition: 'DS',
            purchasePrice: 0,
            purchaseDate: '',
            imageUrl: post.imageUrl,
            notes: '',
            forSale: true,
            forTrade: false,
            addedAt: post.createdAt,
        };
        this.listingSheetSneaker.set(pseudo);
        this.closePostSheet();
    }

    removePostListing(post: Post): void {
        const shoe: Sneaker = {
            id: post.id,
            userId: this.user()?.uid ?? '',
            sku: '',
            brand: '',
            name: post.caption || 'Post item',
            colorway: '',
            size: '',
            condition: 'DS',
            purchasePrice: 0,
            purchaseDate: '',
            imageUrl: post.imageUrl,
            notes: '',
            forSale: false,
            forTrade: false,
            addedAt: post.createdAt,
        };
        this.closePostSheet();
        void this.removeListing(shoe);
    }

    private swipeStartX = 0;
    private _longPressTimer: ReturnType<typeof setTimeout> | null = null;
    private _longPressTriggered = false;
    private _scrollCancelled = false;
    private _longPressStartX = 0;
    private _longPressStartY = 0;
    private readonly GRID_SIZES_KEY = 'profile_grid_sizes';
    private _gridSaveTimer: ReturnType<typeof setTimeout> | null = null;
    private _scrollListener!: () => void;

    user = this.authService.currentUser;
    sneakers = toSignal(this.sneakerService.list(), { initialValue: [] as Sneaker[] });
    wishlist = toSignal(this.wishlistService.list(), { initialValue: [] as WishlistItem[] });
    posts = toSignal(
        new Observable<Post[]>(obs => {
            const uid = this.authService.uid;
            if (!uid) { obs.next([]); obs.complete(); return; }
            this.postService.getUserPosts(uid).subscribe(obs);
        }),
        { initialValue: [] as Post[] }
    );
    private readonly _settings$ = this.settingsService.getSettings().pipe(shareReplay(1));
    bio = toSignal(this._settings$.pipe(map(s => s.bio ?? '')), { initialValue: '' });
    isStoreBrand = toSignal(this._settings$.pipe(map(s => s.isStoreBrand ?? false)), { initialValue: false });
    profileHeroBgUrl = toSignal(this._settings$.pipe(
        map(s => {
            if (s.backgroundImageUrl?.startsWith('http')) return `url(${s.backgroundImageUrl})`;
            if (s.bgPreset) return `url(/assets/backgrounds/${s.bgPreset})`;
            return '';
        })
    ), { initialValue: '' });

    async ngOnInit(): Promise<void> {
        const stored = localStorage.getItem(this.GRID_SIZES_KEY);
        if (stored) {
            try { this.gridSizes.set(JSON.parse(stored)); } catch { }
        }
        const uid = this.authService.uid;
        if (uid) {
            const [remoteLayout] = await Promise.all([
                this.userService.getGridLayout(uid),
            ]);
            if (Object.keys(remoteLayout).length > 0) {
                this.gridSizes.set(remoteLayout as Record<string, GridSize>);
                localStorage.setItem(this.GRID_SIZES_KEY, JSON.stringify(remoteLayout));
            }
            const displayItems = await this.userService.getDisplayItems(uid);
            this.displayItems.set(displayItems);
        }
    }

    ngAfterViewInit(): void {
        const el = this.scrollEl.nativeElement;
        this._scrollListener = () => this.scrolled.set(el.scrollTop > 40);
        el.addEventListener('scroll', this._scrollListener, { passive: true });
        el.addEventListener('touchstart', this._onTabSwipeStart as EventListener, { passive: true });
        el.addEventListener('touchend', this._onTabSwipeEnd as EventListener, { passive: true });
    }

    ngOnDestroy(): void {
        const el = this.scrollEl?.nativeElement;
        if (el) {
            el.removeEventListener('scroll', this._scrollListener);
            el.removeEventListener('touchstart', this._onTabSwipeStart as EventListener);
            el.removeEventListener('touchend', this._onTabSwipeEnd as EventListener);
        }
    }

    async loadCollectionValue(): Promise<void> {
        if (this.collectionValue() !== null) return;
        const skus = [...new Set(this.sneakers().map((s) => s.sku).filter(Boolean))];
        if (!skus.length) { this.collectionValue.set(0); return; }
        const value = await firstValueFrom(this.priceService.collectionValue(skus));
        this.collectionValue.set(value);
    }

    setTab(t: Tab): void {
        if (t === 'store' && !this.isStoreBrand()) return;
        this.tab.set(t);
        if (t === 'closet') this.loadCollectionValue();
    }

    cycleGridSize(id: string): void {
        const current = this.gridSizes()[id] ?? '1x1';
        const next: GridSize = current === '1x1' ? '2x1' : current === '2x1' ? '2x2' : '1x1';
        this.gridSizes.update(prev => {
            const updated = { ...prev, [id]: next };
            localStorage.setItem(this.GRID_SIZES_KEY, JSON.stringify(updated));
            return updated;
        });
        // Debounce Firestore write — batch rapid taps into a single write
        if (this._gridSaveTimer) clearTimeout(this._gridSaveTimer);
        this._gridSaveTimer = setTimeout(() => {
            const uid = this.authService.uid;
            if (uid) this.userService.saveGridLayout(uid, this.gridSizes());
        }, 800);
    }

    getColSpan(id: string): number {
        return (this.gridSizes()[id] ?? '1x1') === '1x1' ? 1 : 2;
    }

    getRowSpan(id: string): number {
        return (this.gridSizes()[id] ?? '1x1') === '2x2' ? 2 : 1;
    }

    getGridSizeLabel(id: string): string {
        return this.gridSizes()[id] ?? '1x1';
    }

    private readonly _onTabSwipeStart = (e: TouchEvent): void => {
        this.swipeStartX = e.touches[0]?.clientX ?? 0;
    };

    private readonly _onTabSwipeEnd = (e: TouchEvent): void => {
        const dx = (e.changedTouches[0]?.clientX ?? this.swipeStartX) - this.swipeStartX;
        const tabs = this.activeTabs();
        const idx = this.tabIndex();
        if (dx < -48 && idx < tabs.length - 1) this.setTab(tabs[idx + 1]);
        else if (dx > 48 && idx > 0) this.setTab(tabs[idx - 1]);
    };

    goToFollowers(): void {
        this.router.navigate(['/app/profile/followers']);
    }

    goToFollowing(): void {
        this.router.navigate(['/app/profile/following']);
    }

    viewOwnProfile(): void {
        const uid = this.authService.uid;
        if (uid) this.router.navigate(['/app/users', uid]);
    }

    // ── Card interactions ────────────────────────────────────────────────────
    onCardPointerDown(sneaker: Sneaker, event: PointerEvent): void {
        this._longPressTriggered = false;
        this._scrollCancelled = false;
        this._longPressStartX = event.clientX;
        this._longPressStartY = event.clientY;
        this._longPressTimer = setTimeout(() => {
            this._longPressTriggered = true;
            this.contextMenuSneaker.set(sneaker);
            this.sizeDraft.set(sneaker.size);
            this.uiState.navHidden.set(true);
        }, 500);
    }

    onCardPointerMove(event: PointerEvent): void {
        if (!this._longPressTimer) return;
        const dx = event.clientX - this._longPressStartX;
        const dy = event.clientY - this._longPressStartY;
        if (Math.sqrt(dx * dx + dy * dy) > 8) {
            clearTimeout(this._longPressTimer);
            this._longPressTimer = null;
            this._scrollCancelled = true;
        }
    }

    onCardPointerUp(sneaker: Sneaker, index: number): void {
        if (this._longPressTimer) {
            clearTimeout(this._longPressTimer);
            this._longPressTimer = null;
        }
        if (!this._longPressTriggered && !this._scrollCancelled && !this.contextMenuSneaker()) {
            this.openDetail(sneaker, index);
        }
    }

    onCardPointerCancel(): void {
        if (this._longPressTimer) {
            clearTimeout(this._longPressTimer);
            this._longPressTimer = null;
        }
        // Do NOT reset _longPressTriggered here — it must stay true until the
        // next pointerdown so spurious pointerup events don't open the detail view.
    }

    openDetail(sneaker: Sneaker, index: number): void {
        this.selectedSneakerIndex.set(index);
        this.selectedWishlistItem.set(null);
        this.selectedSneaker.set(sneaker);
        this.uiState.detailOpen.set(true);
    }

    openWishlistDetail(item: WishlistItem): void {
        this.selectedSneaker.set(null);
        this.selectedWishlistItem.set(item);
        this.uiState.detailOpen.set(true);
    }

    closeDetail(): void {
        this.selectedSneaker.set(null);
        this.selectedWishlistItem.set(null);
        this.uiState.detailOpen.set(false);
    }

    onPostCardPointerDown(post: Post, event: PointerEvent): void {
        this._longPressTriggered = false;
        this._longPressStartX = event.clientX;
        this._longPressStartY = event.clientY;
        this._longPressTimer = setTimeout(() => {
            this._longPressTriggered = true;
            // Long-press opens the resize sheet
            this.postSheetPost.set(post);
            this.postSheetPostId.set(post.id);
        }, 500);
    }

    onPostCardPointerUp(post: Post, index: number): void {
        if (this._longPressTimer) {
            clearTimeout(this._longPressTimer);
            this._longPressTimer = null;
        }
        if (!this._longPressTriggered) {
            // Short press opens the post view
            this.selectedPostIndex.set(index);
            this.selectedPost.set(post);
        }
    }

    closePostView(): void {
        this.selectedPost.set(null);
    }

    closePostSheet(): void {
        this.postSheetPostId.set(null);
        this.postSheetPost.set(null);
    }

    setPostGridSize(size: GridSize): void {
        const id = this.postSheetPostId();
        if (!id) return;
        this.gridSizes.update(prev => {
            const updated = { ...prev, [id]: size };
            localStorage.setItem(this.GRID_SIZES_KEY, JSON.stringify(updated));
            return updated;
        });
        if (this._gridSaveTimer) clearTimeout(this._gridSaveTimer);
        this._gridSaveTimer = setTimeout(() => {
            const uid = this.authService.uid;
            if (uid) this.userService.saveGridLayout(uid, this.gridSizes());
        }, 800);
        this.postSheetPostId.set(null);
        this.postSheetPost.set(null);
    }

    isPostDisplayItem(postId: string): boolean {
        return this.displayItems().some(d => d.id === postId);
    }

    async togglePostDisplayItem(): Promise<void> {
        const uid = this.authService.uid;
        const post = this.postSheetPost();
        if (!uid || !post) return;
        const current = this.displayItems();
        let updated: HomeDisplayItem[];
        if (current.some(d => d.id === post.id)) {
            updated = current.filter(d => d.id !== post.id);
        } else {
            if (current.length >= 6) return;
            updated = [...current, { id: post.id, imageUrl: post.imageUrl, name: post.caption || 'Post', type: 'post' }];
        }
        this.displayItems.set(updated);
        await this.userService.saveDisplayItems(uid, updated);
    }

    navigateDetailNext(): void {
        const items = this.sneakers();
        const idx = this.selectedSneakerIndex();
        if (idx >= items.length - 1 || this.slideAnimating()) return;
        this.carouselDir.set('right');
        this.triggerSlide(items[idx + 1], idx + 1);
    }

    navigateDetailPrev(): void {
        const items = this.sneakers();
        const idx = this.selectedSneakerIndex();
        if (idx <= 0 || this.slideAnimating()) return;
        this.carouselDir.set('left');
        this.triggerSlide(items[idx - 1], idx - 1);
    }

    private triggerSlide(sneaker: Sneaker, newIdx: number): void {
        this.slideAnimating.set(true);
        setTimeout(() => {
            this.selectedSneakerIndex.set(newIdx);
            this.selectedSneaker.set(sneaker);
            setTimeout(() => this.slideAnimating.set(false), 500);
        }, 220);
    }

    closeContextMenu(): void {
        this.contextMenuSneaker.set(null);
        this.confirmingDelete.set(false);
        this.uiState.navHidden.set(false);
    }

    async applySize(): Promise<void> {
        const s = this.contextMenuSneaker();
        if (!s) return;
        await this.sneakerService.update(s.id, { size: this.sizeDraft() });
        this.closeContextMenu();
    }

    async deleteFromCloset(): Promise<void> {
        if (!this.confirmingDelete()) {
            this.confirmingDelete.set(true);
            return;
        }
        const s = this.contextMenuSneaker();
        if (!s) return;
        await this.sneakerService.remove(s.id);
        this.closeContextMenu();
    }

    cycleContextMenuGridSize(): void {
        const s = this.contextMenuSneaker();
        if (!s) return;
        this.cycleGridSize(s.id);
        // Keep the context menu open — user closes it by tapping outside
    }

    isDisplayItem(sneakerId: string): boolean {
        return this.displayItems().some(d => d.id === sneakerId);
    }

    async toggleDisplayItem(sneaker: Sneaker): Promise<void> {
        const uid = this.authService.uid;
        if (!uid) return;
        const current = this.displayItems();
        let updated: HomeDisplayItem[];
        if (current.some(d => d.id === sneaker.id)) {
            updated = current.filter(d => d.id !== sneaker.id);
        } else {
            if (current.length >= 6) return;
            updated = [...current, { id: sneaker.id, imageUrl: sneaker.imageUrl, name: sneaker.name, type: 'sneaker', brand: sneaker.brand, sku: sneaker.sku, colorway: sneaker.colorway }];
        }
        this.displayItems.set(updated);
        await this.userService.saveDisplayItems(uid, updated);
    }

    // Always creates a new listing — editing existing ones is done from the Store tab
    openListingSheet(shoe: Sneaker): void {
        this.editingListingId.set(null);
        this.listingPrice.set(0);
        this.listingCondition.set(shoe.condition ?? 'DS');
        this.listingSize.set('');
        this.listingQuantity.set(1);
        this.listingNotes.set('');
        this.listingSheetSneaker.set(shoe);
        this.closeContextMenu();
    }

    goToStore(shoe: Sneaker): void {
        this.closeContextMenu();
        this.setTab('store');
    }

    closeListingSheet(): void {
        this.listingSheetSneaker.set(null);
        this.editingListingId.set(null);
    }

    async saveListing(): Promise<void> {
        const uid = this.authService.uid;
        const shoe = this.listingSheetSneaker();
        if (!uid || !shoe) return;
        this.listingSaving.set(true);
        try {
            const editId = this.editingListingId();
            const data = {
                sneakerId: shoe.id,
                sneakerName: shoe.name,
                imageUrl: shoe.imageUrl,
                askingPrice: this.listingPrice(),
                condition: this.listingCondition(),
                size: this.listingSize(),
                quantity: Math.max(1, this.listingQuantity()),
                description: this.listingNotes(),
                status: 'available' as const,
                type: 'sell' as const,
                brand: shoe.brand ?? '',
                sku: shoe.sku ?? '',
                userDisplayName: this.user()?.displayName ?? '',
                userPhotoUrl: this.user()?.photoURL ?? '',
                sold: false,
            };
            if (editId) {
                await this.userService.updateListing(uid, editId, data);
            } else {
                await this.userService.createListing(uid, data as any);
            }
            this.closeListingSheet();
        } finally {
            this.listingSaving.set(false);
        }
    }

    async removeListing(shoe: Sneaker): Promise<void> {
        const uid = this.authService.uid;
        if (!uid) return;
        const existing = this.listings().find(l => l.sneakerId === shoe.id);
        if (!existing) return;
        await this.userService.deleteListing(uid, existing.id);
        this.closeListingSheet();
        this.closeContextMenu();
    }

    openStoreListingSheet(listing: Listing): void {
        this.activeStoreListing.set(listing);
        this.confirmingDeleteListing.set(false);
        this.uiState.navHidden.set(true);
    }

    closeStoreListingSheet(): void {
        this.activeStoreListing.set(null);
        this.confirmingDeleteListing.set(false);
        this.uiState.navHidden.set(false);
    }

    async updateListingStatus(listing: Listing, status: ListingStatus): Promise<void> {
        const uid = this.authService.uid;
        if (!uid) return;
        await this.userService.updateListing(uid, listing.id, { status });
        this.closeStoreListingSheet();
    }

    async deleteStoreListing(): Promise<void> {
        if (!this.confirmingDeleteListing()) {
            this.confirmingDeleteListing.set(true);
            return;
        }
        const listing = this.activeStoreListing();
        const uid = this.authService.uid;
        if (!uid || !listing) return;
        await this.userService.deleteListing(uid, listing.id);
        this.closeStoreListingSheet();
    }

    openListingSheetFromListing(listing: Listing): void {
        this.editingListingId.set(listing.id);
        this.listingPrice.set(listing.askingPrice);
        this.listingCondition.set(listing.condition as 'DS' | 'VNDS' | 'Used');
        this.listingSize.set(listing.size);
        this.listingQuantity.set(listing.quantity ?? 1);
        this.listingNotes.set(listing.description);
        const shoe: Sneaker = {
            id: listing.sneakerId,
            userId: listing.userId,
            sku: listing.sku,
            brand: listing.brand,
            name: listing.sneakerName,
            colorway: '',
            size: listing.size,
            condition: listing.condition as 'DS' | 'VNDS' | 'Used',
            purchasePrice: 0,
            purchaseDate: '',
            imageUrl: listing.imageUrl,
            notes: listing.description,
            forSale: true,
            forTrade: false,
            addedAt: listing.createdAt,
        };
        this.closeStoreListingSheet();
        this.listingSheetSneaker.set(shoe);
    }
}
