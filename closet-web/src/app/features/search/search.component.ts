import { Component, ChangeDetectionStrategy, inject, signal, viewChild, ElementRef, afterNextRender, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { UiStateService } from '../../core/services/ui-state.service';
import { HttpClient } from '@angular/common/http';
import { Subject, merge, of, debounceTime, switchMap, catchError, map, from } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { environment } from '../../../environments/environment';
import { CatalogResult } from './search.models';
import { SearchStateService } from './search-state.service';
import { DetailPanelComponent } from './detail-panel/detail-panel.component';
import { UserService } from '../../core/services/user.service';
import { UserPublicProfile } from '../../core/models/user.model';

const BRANDS = [
    { label: 'Nike', query: 'Nike', logo: 'assets/brand-logos/nike.png' },
    { label: 'Jordan', query: 'Air Jordan', logo: 'assets/brand-logos/jordan.svg' },
    { label: 'Adidas', query: 'Adidas', logo: 'assets/brand-logos/adidas.svg' },
    { label: 'New Balance', query: 'New Balance', logo: 'assets/brand-logos/new-balance.svg' },
    { label: 'Yeezy', query: 'Yeezy', logo: 'assets/brand-logos/yeezy.svg' },
    { label: 'Converse', query: 'Converse', logo: 'assets/brand-logos/converse.svg' },
    { label: 'Vans', query: 'Vans', logo: 'assets/brand-logos/vans.svg' },
    { label: 'Puma', query: 'Puma', logo: 'assets/brand-logos/puma.svg' },
    { label: 'Reebok', query: 'Reebok', logo: 'assets/brand-logos/reebok.svg' },
] as const;

@Component({
    selector: 'app-search',
    standalone: true,
    imports: [FormsModule, DetailPanelComponent],
    templateUrl: './search.component.html',
    styleUrl: './search.component.scss', changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchComponent implements OnDestroy {
    private http = inject(HttpClient);
    private readonly sneaksBase = environment.sneaksApiUrl;
    private userService = inject(UserService);
    private router = inject(Router);
    private readonly state = inject(SearchStateService);

    private pageHeader = viewChild<ElementRef<HTMLElement>>('pageHeader');
    private headerSection = viewChild<ElementRef<HTMLElement>>('headerSection');
    private resultsCol = viewChild<ElementRef<HTMLElement>>('resultsCol');
    private searchWrap = viewChild<ElementRef<HTMLElement>>('searchWrap');

    private headerFullHeight = 0;
    private safeAreaTop = 0;

    readonly brands = BRANDS;
    readonly pageSize = 10;

    // Proxy getters — delegate to the singleton so state survives navigation.
    // The template uses query(), catalogResults(), etc. unchanged.
    get query() { return this.state.query; }
    get catalogResults() { return this.state.catalogResults; }
    get searchLoading() { return this.state.searchLoading; }
    get page() { return this.state.page; }
    get totalPages() { return this.state.totalPages; }
    get userResults() { return this.state.userResults; }
    private get resultCache() { return this.state.resultCache; }

    // Detail panel (UI-only, intentionally not persisted across nav)
    selectedItem = signal<CatalogResult | null>(null);
    selectedIndex = signal(0);
    carouselDir = signal<'left' | 'right'>('right');
    slideAnimating = signal(false);

    private querySearch$ = new Subject<string>();
    private pageChange$ = new Subject<void>();
    private userSearch$ = new Subject<string>();

    private _resultsScrollRafId: number | null = null;
    private _resultsScrollEl: HTMLElement | null = null;

    private readonly _onResultsScroll = (): void => {
        if (this._resultsScrollRafId !== null) return;
        this._resultsScrollRafId = requestAnimationFrame(() => {
            this._resultsScrollRafId = null;
            this.onResultsScroll();
        });
    };

    ngOnDestroy(): void {
        if (this._resultsScrollEl) {
            this._resultsScrollEl.removeEventListener('scroll', this._onResultsScroll);
        }
    }

    constructor() {
        afterNextRender(() => {
            const el = this.headerSection()?.nativeElement;
            if (el) {
                this.headerFullHeight = el.getBoundingClientRect().height;
                el.style.height = `${this.headerFullHeight}px`;
            }
            const sentinel = document.createElement('div');
            sentinel.style.paddingTop = 'env(safe-area-inset-top)';
            document.body.appendChild(sentinel);
            this.safeAreaTop = parseInt(getComputedStyle(sentinel).paddingTop) || 0;
            sentinel.remove();
            const colEl = this.resultsCol()?.nativeElement;
            if (colEl) {
                this._resultsScrollEl = colEl;
                colEl.addEventListener('scroll', this._onResultsScroll, { passive: true });
            }
        });

        // Only fetch home data when the cache is cold (i.e. first visit).
        // On subsequent visits the signals already hold the previous state.
        if (!this.resultCache.has('__home__')) {
            this.searchLoading.set(true);
            this.http
                .get<{ success: boolean; data: any[] }>(`${this.sneaksBase}/home?count=20`)
                .pipe(catchError(() => of({ success: false, data: [] })))
                .subscribe(res => {
                    const data = (res as any).data ?? [];
                    this.resultCache.set('__home__', { data, nbPages: 1 });
                    if (!this.query()) {
                        this.catalogResults.set(data.map((p: any) => this.mapProduct(p)));
                    }
                    this.searchLoading.set(false);
                });
        }

        const fromQuery$ = this.querySearch$.pipe(
            debounceTime(400),
            map(q => ({ query: q, page: 0 }))
        );
        const fromPage$ = this.pageChange$.pipe(
            map(() => ({ query: this.query(), page: this.page() }))
        );

        merge(fromQuery$, fromPage$).pipe(
            switchMap(({ query, page }) => {
                if (query.trim().length < 3) return of({ data: [], nbPages: 1 });
                const cacheKey = `${query.toLowerCase().trim()}:${page}`;
                const cached = this.resultCache.get(cacheKey);
                if (cached) return of(cached);
                this.searchLoading.set(true);
                return this.http
                    .get<{ success: boolean; data: any[]; meta: any }>(
                        `${this.sneaksBase}/search/${encodeURIComponent(query + ' ')}?count=${this.pageSize}&page=${page}`
                    )
                    .pipe(
                        map(res => ({ data: res.data ?? [], nbPages: res.meta?.nbPages ?? 1 })),
                        catchError(() => of({ data: [], nbPages: 1 }))
                    );
            }),
            takeUntilDestroyed(),
        ).subscribe(({ data, nbPages }) => {
            const q = this.query().toLowerCase().trim();
            const p = this.page();
            if (q.length >= 3) this.resultCache.set(`${q}:${p}`, { data, nbPages });
            this.catalogResults.set(data.map((item: any) => this.mapProduct(item)));
            this.totalPages.set(Math.max(1, nbPages));
            this.searchLoading.set(false);
        });

        this.userSearch$.pipe(
            debounceTime(400),
            switchMap(q => {
                if (q.trim().length < 2) return of([] as UserPublicProfile[]);
                return from(this.userService.searchUsers(q)).pipe(
                    catchError(() => of([] as UserPublicProfile[]))
                );
            }),
            takeUntilDestroyed(),
        ).subscribe(users => this.userResults.set(users));
    }

    onQueryChange(value: string): void {
        this.query.set(value);
        this.page.set(0);

        // always fire user search in parallel
        if (value.trim().length >= 2) {
            this.userSearch$.next(value);
        } else {
            this.userResults.set([]);
        }

        if (value.trim().length < 3) {
            const home = this.resultCache.get('__home__');
            this.catalogResults.set(home ? home.data.map(p => this.mapProduct(p)) : []);
            this.totalPages.set(1);
        } else {
            this.querySearch$.next(value);
        }
    }

    openUserProfile(uid: string): void {
        this.router.navigate(['/app/users', uid]);
    }

    searchBrand(brandQuery: string): void {
        this.query.set(brandQuery);
        this.userResults.set([]);
        this.page.set(0);
        const cacheKey = `${brandQuery.toLowerCase().trim()}:0`;
        const cached = this.resultCache.get(cacheKey);
        if (cached) {
            this.catalogResults.set(cached.data.map(p => this.mapProduct(p)));
            this.totalPages.set(Math.max(1, cached.nbPages));
            return;
        }
        this.catalogResults.set([]);
        this.totalPages.set(1);
        this.querySearch$.next(brandQuery);
    }

    prevPage(): void {
        if (this.page() === 0) return;
        this.page.update(p => p - 1);
        this.pageChange$.next();
    }

    nextPage(): void {
        if (this.page() >= this.totalPages() - 1) return;
        this.page.update(p => p + 1);
        this.pageChange$.next();
    }

    private readonly uiState = inject(UiStateService);

    selectItem(item: CatalogResult): void {
        const list = this.catalogResults();
        const idx = list.findIndex(r => r.id === item.id);
        this.selectedIndex.set(idx >= 0 ? idx : 0);
        this.selectedItem.set(item);
        this.uiState.detailOpen.set(true);
    }

    closeItem(): void {
        this.selectedItem.set(null);
        this.uiState.detailOpen.set(false);
    }

    navigateNext(): void {
        const list = this.catalogResults();
        const idx = this.selectedIndex();
        if (idx >= list.length - 1 || this.slideAnimating()) return;
        this.carouselDir.set('right');
        this.triggerSlide(list[idx + 1], idx + 1);
    }

    navigatePrev(): void {
        const list = this.catalogResults();
        const idx = this.selectedIndex();
        if (idx <= 0 || this.slideAnimating()) return;
        this.carouselDir.set('left');
        this.triggerSlide(list[idx - 1], idx - 1);
    }

    private triggerSlide(item: CatalogResult, newIdx: number): void {
        this.slideAnimating.set(true);
        setTimeout(() => {
            this.selectedIndex.set(newIdx);
            this.selectedItem.set(item);
            setTimeout(() => this.slideAnimating.set(false), 500);
        }, 220);
    }

    onResultsScroll(): void {
        const col = this.resultsCol()?.nativeElement;
        const header = this.pageHeader()?.nativeElement;
        const section = this.headerSection()?.nativeElement;
        if (!col) return;

        if (!this.headerFullHeight && section) {
            this.headerFullHeight = section.getBoundingClientRect().height;
        }

        const collapseRange = this.headerFullHeight || 100;
        const progress = Math.min(1, Math.max(0, col.scrollTop / collapseRange));

        if (section && this.headerFullHeight) {
            section.style.height = `${(1 - progress) * this.headerFullHeight}px`;
        }

        if (header) {
            const ty = -(progress * 8);
            const scale = 1 - progress * 0.12;
            header.style.transform = `translateY(${ty}px) scale(${scale})`;
            header.style.transformOrigin = 'left center';
            header.style.opacity = String(Math.max(0, 1 - progress * 1.4));
        }

        const wrap = this.searchWrap()?.nativeElement;
        if (wrap && this.safeAreaTop > 0) {
            wrap.style.paddingTop = `${progress * this.safeAreaTop}px`;
        }
    }

    private mapProduct(p: any): CatalogResult {
        return {
            id: p.styleID ?? p.id ?? '',
            name: p.sneakerName ?? '',
            brand: p.make ?? '',
            colorway: p.colorway ?? '',
            imageUrl: p.goatImages?.grid_picture_url ?? p.thumbnail ?? '',
            largeImageUrl: p.goatImages?.main_picture_url ?? p.thumbnail ?? '',
            retailPrice: p.retailPrice ?? null,
            lowestPrice: p.lowestResellPrice?.goat ?? null,
            styleId: p.styleID ?? '',
            sourceUrl: p.productLinks?.goat ?? p.productLinks?.stockX ?? '',
            releaseDate: p.releaseDate ?? null,
        };
    }
}

