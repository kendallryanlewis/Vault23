import { Component, inject, input, output, signal, effect, computed, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, of } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { environment } from '../../../../environments/environment';
import { CatalogResult } from '../search.models';
import { SneakerService } from '../../../core/services/sneaker.service';
import { Sneaker } from '../../../core/models/sneaker.model';
import { WishlistService } from '../../../core/services/wishlist.service';
import { WishlistItem } from '../../../core/models/wishlist-item.model';
import { AuthService } from '../../../core/services/auth.service';
import { ChatService } from '../../../core/services/chat.service';
import { UserService } from '../../../core/services/user.service';
import { UserPublicProfile } from '../../../core/models/user.model';
import { SearchStateService } from '../search-state.service';

const BRAND_LOGOS: Record<string, string> = {
    'nike': 'assets/brand-logos/nike.png',
    'jordan': 'assets/brand-logos/jordan.svg',
    'air jordan': 'assets/brand-logos/jordan.svg',
    'adidas': 'assets/brand-logos/adidas.svg',
    'new balance': 'assets/brand-logos/new-balance.svg',
    'yeezy': 'assets/brand-logos/yeezy.svg',
    'converse': 'assets/brand-logos/converse.svg',
    'vans': 'assets/brand-logos/vans.svg',
    'puma': 'assets/brand-logos/puma.svg',
    'reebok': 'assets/brand-logos/reebok.svg',
    'under armour': 'assets/brand-logos/under-armour.svg',
};

@Component({
    selector: 'app-detail-panel',
    standalone: true,
    imports: [FormsModule],
    templateUrl: './detail-panel.component.html',
    styleUrl: './detail-panel.component.scss',
})
export class DetailPanelComponent {
    private http = inject(HttpClient);
    private sneakerService = inject(SneakerService);
    private wishlistService = inject(WishlistService);
    private router = inject(Router);
    private authService = inject(AuthService);
    private chatService = inject(ChatService);
    private userService = inject(UserService);
    private searchState = inject(SearchStateService);
    private el = inject(ElementRef);
    private readonly sneaksBase = environment.sneaksApiUrl;
    private readonly detailCache = new Map<string, any>();

    readonly conditions = ['DS', 'VNDS', 'Used'] as const;
    addSaving = signal(false);
    addSuccess = signal(false);
    likeSaving = signal(false);

    // Image grid overlay
    showImageGrid = signal(false);
    allImages = computed(() => {
        const d = this.detailItem();
        if (!d) return [];
        const goat = d.goatImages ?? {};
        const urls: string[] = [
            goat.grid_picture_url,
            goat.main_picture_url,
            goat.grid_display_picture_url,
            goat.main_display_picture_url,
            goat.grid_glow_picture_url,
            goat.main_glow_picture_url,
            goat.original_picture_url,
            ...(d.stockxImages?.gallery ?? []),
        ].filter((u: string | undefined): u is string => !!u);
        return [...new Set(urls)];
    });

    // Send-to-user panel
    showSendPanel = signal(false);
    sendQuery = signal('');
    sendResults = signal<UserPublicProfile[]>([]);
    sendSending = signal<string | null>(null);
    sendSent = signal<string | null>(null);

    private wishlistItems = toSignal(this.wishlistService.list(), { initialValue: [] as WishlistItem[] });
    private closetItems = toSignal(this.sneakerService.list(), { initialValue: [] as Sneaker[] });

    isLiked = computed(() => {
        const sku = this.item()?.styleId;
        if (!sku) return false;
        return this.wishlistItems().some(w => w.sku === sku);
    });

    isInCloset = computed(() => {
        const sku = this.item()?.styleId;
        if (!sku) return false;
        return this.closetItems().some(s => s.sku === sku);
    });

    item = input<CatalogResult | null>(null);
    selectedIndex = input<number>(0);
    catalogResultsLength = input<number>(0);
    slideAnimating = input<boolean>(false);
    carouselDir = input<'left' | 'right'>('right');

    closed = output<void>();
    navigatedNext = output<void>();
    navigatedPrev = output<void>();

    detailItem = signal<any | null>(null);
    detailLoading = signal(false);
    ctaHidden = signal(false);
    scrollY = signal(0);
    scrollRatio = computed(() => Math.min(this.scrollY() / 200, 1));
    private _swipeStartX = 0;

    resalePrices = computed(() => {
        const d = this.detailItem();
        if (!d?.lowestResellPrice) return [];
        const labels: Record<string, string> = {
            stockX: 'StockX', goat: 'GOAT',
            flightClub: 'Flight Club', stadiumGoods: 'Stadium Goods',
        };
        const links: Record<string, string> = d.resellLinks ?? {};
        return Object.entries(d.lowestResellPrice as Record<string, number>)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => ({ label: labels[k] ?? k, price: v, url: links[k] ?? '' }));
    });

    displayResellPrice = computed(() => {
        const shoe = this.item();
        const detail = this.detailItem();
        return shoe?.lowestPrice
            || detail?.lowest_ask
            || this.resalePrices()[0]?.price
            || null;
    });

    displayRetailPrice = computed(() => {
        const shoe = this.item();
        const detail = this.detailItem();
        return shoe?.retailPrice || detail?.retailPrice || null;
    });

    marketData = computed(() => {
        const d = this.detailItem();
        if (!d) return null;
        const fc = d.flightclubDetails?.hits?.[0] ?? null;
        const items: { label: string; value: string }[] = [];
        if (d.lowest_ask) items.push({ label: 'Lowest Ask', value: `$${d.lowest_ask}` });
        if (d.highest_bid) items.push({ label: 'Highest Bid', value: `$${d.highest_bid}` });
        if (d.last_sale) items.push({ label: 'Last Sale', value: `$${d.last_sale}` });
        if (d.sales_last_72) items.push({ label: 'Sales (72h)', value: `${d.sales_last_72}` });
        if (fc?.lowest_price_cents) items.push({ label: 'FC Lowest', value: `$${(fc.lowest_price_cents / 100).toFixed(0)}` });
        if (fc?.instant_ship_lowest_price_cents) items.push({ label: 'Instant Ship', value: `$${(fc.instant_ship_lowest_price_cents / 100).toFixed(0)}` });
        return items.length ? items : null;
    });

    designDetails = computed(() => {
        const d = this.detailItem();
        if (!d) return null;
        const fc = d.flightclubDetails?.hits?.[0] ?? null;
        const items: { label: string; value: string }[] = [];
        const nickname = d.nickname ?? fc?.nickname;
        if (nickname) items.push({ label: 'Nickname', value: nickname });
        if (d.silhouette || d.silhoutte) items.push({ label: 'Silhouette', value: d.silhouette ?? d.silhoutte });
        const cat = d.category ?? (Array.isArray(fc?.category) ? fc.category.join(', ') : fc?.category);
        if (cat) items.push({ label: 'Category', value: cat });
        if (fc?.color) items.push({ label: 'Color', value: fc.color });
        const gender = Array.isArray(fc?.gender) ? fc.gender.join(', ') : fc?.gender;
        if (gender) items.push({ label: 'Gender', value: gender });
        const designer = d.designer ?? fc?.designer;
        if (designer) items.push({ label: 'Designer', value: designer });
        const upper = d.upperMaterial ?? fc?.upper_material;
        if (upper) items.push({ label: 'Upper', value: upper });
        if (d.midsole ?? fc?.midsole) items.push({ label: 'Midsole', value: d.midsole ?? fc?.midsole });
        const season = fc?.season_year ?? (d.release_year ? `${d.release_year}` : null);
        if (season) items.push({ label: 'Season', value: season });
        return items.length ? items : null;
    });

    buyLinks = computed(() => {
        const d = this.detailItem();
        if (!d) return null;
        const stockXRaw = d.resellLinks?.stockX ?? d.productLinks?.stockX ?? null;
        const candidates: { label: string; url: string | null }[] = [
            { label: 'StockX', url: stockXRaw ? this.cleanStockXUrl(stockXRaw) : null },
            { label: 'GOAT', url: d.resellLinks?.goat ?? d.productLinks?.goat ?? null },
            { label: 'Flight Club', url: d.resellLinks?.flightClub ?? d.productLinks?.flightClub ?? null },
            { label: 'eBay', url: d.resellLinks?.ebay ?? null },
            { label: 'Stadium Goods', url: d.resellLinks?.stadiumGoods ?? null },
            { label: 'Sneakers N Stuff', url: d.resellLinks?.sneakersnstuff ?? null },
        ];
        const links = candidates.filter(c => !!c.url) as { label: string; url: string }[];
        return links.length ? links : null;
    });

    /** Strip the style-ID slug from StockX product URLs.
     *  e.g. https://stockx.com/air-jordan-5-retro-wolf-grey-2026-dd0587-002
     *  →    https://stockx.com/air-jordan-5-retro-wolf-grey-2026
     */
    private cleanStockXUrl(url: string): string {
        return url.replace(/-[a-z]{2,3}[0-9]{3,6}-[0-9]{3}$/i, '');
    }

    sizePrices = computed(() => {
        const d = this.detailItem();
        if (!d?.resellPrices) return null;
        const { stockX = {}, goat = {}, flightClub = {} } = d.resellPrices as Record<string, Record<string, number>>;
        const sizes = new Set([...Object.keys(stockX), ...Object.keys(goat), ...Object.keys(flightClub)]);
        if (!sizes.size) return null;
        return Array.from(sizes)
            .sort((a, b) => parseFloat(a) - parseFloat(b))
            .map(size => ({
                size,
                stockX: stockX[size] ?? null,
                goat: goat[size] ?? null,
                flightClub: flightClub[size] ?? null,
            }));
    });

    availableSizes = computed(() => {
        const sizes = this.detailItem()?.flightclubDetails?.hits?.[0]?.size_range;
        return Array.isArray(sizes) && sizes.length ? (sizes as number[]) : null;
    });

    constructor() {
        effect(() => {
            const current = this.item();
            this.detailItem.set(null);
            this.addSuccess.set(false);
            if (current?.styleId) {
                this.fetchDetail(current.styleId);
            } else if (current?.name) {
                this.fetchDetailByName(current.name);
            }
        });
    }

    brandLogoUrl(brand: string): string | null {
        return BRAND_LOGOS[brand.toLowerCase()] ?? null;
    }

    brandVertSize(brand: string): string {
        const len = brand.length;
        const dvh = Math.max(5, 20 - len * 1.0);
        const maxRem = Math.max(4, 14 - len * 0.7);
        return `clamp(2rem, ${dvh.toFixed(1)}dvh, ${maxRem.toFixed(1)}rem)`;
    }

    formatDate(dateStr: string | null | undefined): string {
        if (!dateStr) return '';
        try {
            return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        } catch { return dateStr; }
    }

    async addToCloset(shoe: CatalogResult): Promise<void> {
        if (this.addSaving() || this.addSuccess() || this.isInCloset()) return;
        this.addSaving.set(true);
        try {
            const d = this.detailItem();
            await this.sneakerService.add({
                sku: shoe.styleId ?? '',
                brand: shoe.brand ?? '',
                name: shoe.name ?? '',
                colorway: shoe.colorway ?? '',
                size: '',
                condition: 'DS',
                purchasePrice: 0,
                purchaseDate: new Date().toISOString().split('T')[0],
                imageUrl: d?.goatImages?.main_picture_url ?? shoe.largeImageUrl ?? shoe.imageUrl ?? '',
                notes: '',
                forSale: false,
                forTrade: false,
            });
            this.addSuccess.set(true);
        } finally {
            this.addSaving.set(false);
        }
    }

    viewCloset(): void {
        this.router.navigate(['/app/profile']);
        this.closed.emit();
    }

    async toggleLike(shoe: CatalogResult): Promise<void> {
        if (this.likeSaving()) return;
        this.likeSaving.set(true);
        try {
            const existing = this.wishlistItems().find(w => w.sku === shoe.styleId);
            if (existing) {
                await this.wishlistService.remove(existing.id);
            } else {
                const d = this.detailItem();
                await this.wishlistService.add({
                    sku: shoe.styleId ?? '',
                    brand: shoe.brand ?? '',
                    name: shoe.name ?? '',
                    colorway: shoe.colorway ?? '',
                    imageUrl: d?.goatImages?.main_picture_url ?? shoe.largeImageUrl ?? shoe.imageUrl ?? '',
                    retailPrice: shoe.retailPrice ?? 0,
                    size: '',
                    notes: '',
                });
            }
        } finally {
            this.likeSaving.set(false);
        }
    }

    // ── Passive touch / scroll handlers ─────────────────────────────────────
    // Registered via addEventListener({passive:true}) so iOS WebKit never
    // blocks gesture recognition waiting for these handlers to complete.

    private readonly _onTouchStart = (e: TouchEvent): void => {
        this._swipeStartX = e.touches[0].clientX;
    };

    private readonly _onTouchEnd = (e: TouchEvent): void => {
        const dx = e.changedTouches[0].clientX - this._swipeStartX;
        if (Math.abs(dx) < 50) return;
        if (dx < 0) this.navigatedNext.emit();
        else this.navigatedPrev.emit();
    };

    private readonly _onPanelScroll = (e: Event): void => {
        const top = (e.target as HTMLElement).scrollTop;
        this.scrollY.set(top);
        this.ctaHidden.set(top > 40);
    };

    ngAfterViewInit(): void {
        const panel = (this.el.nativeElement as HTMLElement).querySelector('.detail-panel');
        if (!panel) return;
        panel.addEventListener('touchstart', this._onTouchStart as EventListener, { passive: true });
        panel.addEventListener('touchend', this._onTouchEnd as EventListener, { passive: true });
        panel.addEventListener('scroll', this._onPanelScroll, { passive: true });
    }

    ngOnDestroy(): void {
        const panel = (this.el.nativeElement as HTMLElement).querySelector('.detail-panel');
        if (!panel) return;
        panel.removeEventListener('touchstart', this._onTouchStart as EventListener);
        panel.removeEventListener('touchend', this._onTouchEnd as EventListener);
        panel.removeEventListener('scroll', this._onPanelScroll);
    }

    // ── Image grid ───────────────────────────────────────────────────────────
    openImageGrid(): void {
        this.showImageGrid.set(true);
    }

    // ── Send panel ───────────────────────────────────────────────────────────
    openSendPanel(): void {
        this.sendQuery.set('');
        this.sendResults.set([]);
        this.sendSent.set(null);
        this.showSendPanel.set(true);
    }

    async searchSendUsers(): Promise<void> {
        const q = this.sendQuery().trim();
        if (q.length < 2) { this.sendResults.set([]); return; }
        const results = await this.userService.searchUsers(q);
        this.sendResults.set(results);
    }

    async sendToUser(profile: UserPublicProfile, shoe: CatalogResult): Promise<void> {
        const myUid = this.authService.uid;
        if (!myUid || this.sendSending()) return;
        this.sendSending.set(profile.uid);
        try {
            const d = this.detailItem();
            const imgUrl = d?.goatImages?.main_picture_url ?? shoe.largeImageUrl ?? shoe.imageUrl ?? '';
            const text = `${shoe.name}${shoe.styleId ? ' — ' + shoe.styleId : ''}`;
            const chatId = await this.chatService.getOrCreateChat(myUid, profile.uid);
            await this.chatService.sendMessage(chatId, myUid, text, imgUrl, [myUid, profile.uid]);
            this.sendSent.set(profile.uid);
        } finally {
            this.sendSending.set(null);
        }
    }

    // ── Search silhouette ────────────────────────────────────────────────────
    searchSilhouette(): void {
        const d = this.detailItem();
        const term = d?.silhouette ?? d?.silhoutte ?? this.item()?.name ?? '';
        if (!term) return;
        this.searchState.query.set(term);
        this.closed.emit();
        this.router.navigate(['/app/search']);
    }

    private fetchDetail(styleId: string): void {
        if (!styleId) return;
        const cached = this.detailCache.get(styleId);
        if (cached) { this.detailItem.set(cached); return; }
        this.detailLoading.set(true);
        this.http
            .get<{ success: boolean; data: any }>(`${this.sneaksBase}/id/${encodeURIComponent(styleId)}`)
            .pipe(catchError(() => of(null)))
            .subscribe(res => {
                const d = (res as any)?.data ?? null;
                if (d) {
                    this.detailCache.set(styleId, d);
                    this.detailItem.set(d);
                }
                this.detailLoading.set(false);
            });
    }

    private fetchDetailByName(name: string): void {
        this.detailLoading.set(true);
        this.http
            .get<{ success: boolean; data: any[] }>(`${this.sneaksBase}/search/${encodeURIComponent(name)}?count=1`)
            .pipe(catchError(() => of(null)))
            .subscribe(res => {
                const first = ((res as any)?.data ?? [])[0];
                if (first?.styleID) {
                    this.fetchDetail(first.styleID);
                } else {
                    this.detailLoading.set(false);
                }
            });
    }
}
