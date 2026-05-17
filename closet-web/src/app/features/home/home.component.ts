import { Component, inject, signal, computed, viewChild, ElementRef, afterNextRender, OnDestroy, effect, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { filter, switchMap, take, tap } from 'rxjs/operators';
import { HomeResolvedData } from './home.resolver';
import { NewsService } from '../../core/services/news.service';
import { TimelineService } from '../../core/services/timeline.service';
import { AuthService } from '../../core/services/auth.service';
import { UserService } from '../../core/services/user.service';
import { PostService } from '../../core/services/post.service';
import { ChatService } from '../../core/services/chat.service';
import { NotificationService } from '../../core/services/notification.service';
import { HomeStateService } from '../../core/services/home-state.service';
import { NewsArticle, NewsSection } from '../../core/models/news.model';
import { FeedPost, Post, PostComment } from '../../core/models/post.model';
import { UiStateService } from '../../core/services/ui-state.service';
import { UserPublicProfile, HomeDisplayItem } from '../../core/models/user.model';
import { PostViewComponent } from '../post-view/post-view.component';
import { DetailPanelComponent } from '../search/detail-panel/detail-panel.component';
import { CatalogResult } from '../search/search.models';
import { NotificationsPanelComponent } from '../notifications/notifications-panel.component';

type HomeTab = 'home' | 'news' | 'feed';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, PostViewComponent, NotificationsPanelComponent, DetailPanelComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnDestroy {
  private newsService = inject(NewsService);
  private timelineService = inject(TimelineService);
  private authService = inject(AuthService);
  private userService = inject(UserService);
  private postService = inject(PostService);
  private chatService = inject(ChatService);
  private notifService = inject(NotificationService);
  private homeState = inject(HomeStateService);
  private uiState = inject(UiStateService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private _resolved = this.route.snapshot.data['home'] as HomeResolvedData;
  newsLoaded = signal(false);
  feedLoaded = signal(false);
  notifOpen = signal(false);

  private _notifications = toSignal(
    toObservable(this.authService.currentUser).pipe(
      switchMap(user => user ? this.notifService.getNotifications(user.uid) : of([]))
    ),
    { initialValue: [] as any[] }
  );

  unreadNotifCount = computed(() => this._notifications().filter((n: any) => !n.read).length);

  tab = signal<HomeTab>(this.homeState.tab);

  private articles = toSignal(
    toObservable(this.tab).pipe(
      filter(t => t === 'news'),
      take(1),
      switchMap(() => this.newsService.fetchArticles().pipe(
        tap(articles => {
          this.newsLoaded.set(true);
          if (articles.length) {
            this.featured.set(articles.reduce((latest: NewsArticle, a: NewsArticle) =>
              new Date(a.publishedAt).getTime() > new Date(latest.publishedAt).getTime() ? a : latest
            ));
          }
        })
      ))
    ),
    { initialValue: [] as any[] }
  );

  private feedHeader = viewChild<ElementRef<HTMLElement>>('feedHeader');
  private bannerSection = viewChild<ElementRef<HTMLElement>>('bannerSection');
  private labelsCol = viewChild<ElementRef<HTMLElement>>('labelsCol');
  private articlesCol = viewChild<ElementRef<HTMLElement>>('articlesCol');
  private newsFeed = viewChild<ElementRef<HTMLElement>>('newsFeed');
  private commentsHandle = viewChild<ElementRef<HTMLElement>>('commentsHandle');

  private bannerFullHeight = 0;
  private _bannerDragY = 0;
  private _bannerDragScroll = 0;

  // Swipe-to-switch-tab state
  private _swipeStartX = 0;
  private _swipeStartY = 0;
  private _swipeTracking = false;

  private readonly _feedTouchStartFn = (e: TouchEvent) => this.onFeedTouchStart(e);
  private readonly _feedTouchEndFn = (e: TouchEvent) => this.onFeedTouchEnd(e);

  // Section-panel scroll-bubbling cleanup
  private _panelWheelListeners: Array<{ el: HTMLElement; fn: (e: WheelEvent) => void }> = [];
  private _panelTouchListeners: Array<{ el: HTMLElement; start: (e: TouchEvent) => void; move: (e: TouchEvent) => void }> = [];
  private _feedObserver?: IntersectionObserver;
  private _feedScrollEl?: HTMLElement;
  private _feedScrollHandler?: EventListener;

  feedScrolled = signal(false);

  // ── Feed post detail overlay ──────────────────────────────────────────────
  selectedFeedPost = signal<FeedPost | null>(null);

  // ── Share to DM ───────────────────────────────────────────────────────────
  sharePost = signal<FeedPost | null>(null);
  shareFollowing = signal<UserPublicProfile[]>([]);
  shareSending = signal(false);
  shareSent = signal<string | null>(null);

  // ── Home tab stats ────────────────────────────────────────────────────────
  homeStats = signal<{ posts: number; followers: number; following: number } | null>(this._resolved?.stats ?? null);

  // ── Post options menu ─────────────────────────────────────────────────────
  postMenuPost = signal<FeedPost | null>(null);

  // ── Comments panel ────────────────────────────────────────────────────────
  commentsPost = signal<FeedPost | null>(null);
  commentText = signal('');
  commentSubmitting = signal(false);
  replyingTo = signal<PostComment | null>(null);
  commentsPanelFull = signal(false);
  private _hiddenUsers = toSignal(
    toObservable(this.authService.currentUser).pipe(
      switchMap(user => user
        ? this.userService.getHiddenUsers$(user.uid)
        : of([] as { uid: string; username: string; photoURL: string; hiddenAt: string }[])),
    ),
    { initialValue: [] as { uid: string; username: string; photoURL: string; hiddenAt: string }[] }
  );
  private hiddenAuthorUids = computed(() => new Set(this._hiddenUsers().map(u => u.uid)));
  postMenuProfile = signal<UserPublicProfile | null>(null);
  myProfile = signal<UserPublicProfile | null>(this._resolved?.myProfile ?? null);
  private _commentsDragStartY = 0;
  private _commentsDragStartFull = false;

  readonly myAvatarUrl = computed(() => this.authService.currentUser()?.photoURL ?? '');

  readonly liveComments = toSignal(
    toObservable(this.commentsPost).pipe(
      switchMap(post => post
        ? this.postService.getComments(post.authorUid, post.postId)
        : of([] as PostComment[]))
    ),
    { initialValue: [] as PostComment[] }
  );

  // ── Local like state (optimistic UI) ─────────────────────────────────────
  private feedLiked = new Map<string, boolean>();
  private feedLikeCounts = new Map<string, number>();

  feedPosts = toSignal(
    toObservable(this.authService.currentUser).pipe(
      switchMap(user => {
        if (!user) return of([] as FeedPost[]);
        // Fire-and-forget rebuild for existing follows (no-op after first run)
        this.timelineService.rebuildTimelineIfNeeded(user.uid).catch(() => { });
        return this.timelineService.getFeed(user.uid).pipe(tap(() => this.feedLoaded.set(true)));
      })
    ),
    { initialValue: [] as FeedPost[] }
  );

  filteredFeedPosts = computed(() => {
    const hiddenAuthors = this.hiddenAuthorUids();
    return this.feedPosts().filter(p => !hiddenAuthors.has(p.authorUid));
  });

  constructor() {
    effect(() => {
      this.uiState.navHidden.set(this.notifOpen());
    });
    afterNextRender(() => {
      // Restore feed scroll position from previous visit
      if (this.homeState.feedScrollTop > 0) {
        const feedEl = document.querySelector('.social-feed') as HTMLElement | null;
        if (feedEl) feedEl.scrollTop = this.homeState.feedScrollTop;
      }
      const el = this.bannerSection()?.nativeElement;
      if (el) {
        this.bannerFullHeight = el.getBoundingClientRect().height;
        el.style.height = `${this.bannerFullHeight}px`;
      }
      this._attachSectionScrollBubbling();
      const feedRootEl = this.newsFeed()?.nativeElement;
      if (feedRootEl) {
        feedRootEl.addEventListener('touchstart', this._feedTouchStartFn, { passive: true });
        feedRootEl.addEventListener('touchend', this._feedTouchEndFn, { passive: true });
      }
    });

    // Attach passive listeners to banner & comments handle when they appear
    effect(() => {
      const banner = this.bannerSection()?.nativeElement;
      if (banner) {
        banner.addEventListener('touchstart', (e: TouchEvent) => this.onBannerDragStart(e), { passive: true });
        banner.addEventListener('touchmove', (e: TouchEvent) => this.onBannerDragMove(e), { passive: true });
      }
    });
    effect(() => {
      const handle = this.commentsHandle()?.nativeElement;
      if (handle) {
        handle.addEventListener('touchstart', (e: TouchEvent) => this.onCommentsDragStart(e), { passive: true });
        handle.addEventListener('touchend', (e: TouchEvent) => this.onCommentsDragEnd(e), { passive: true });
      }
    });

    // Re-attach when returning to the news tab (panels are recreated by @if)
    effect(() => {
      const t = this.tab();
      if (t === 'news') {
        setTimeout(() => this._attachSectionScrollBubbling(), 0);
      } else {
        // Clear inline styles that onLabelsScroll() applies to the feed header
        const headerEl = this.feedHeader()?.nativeElement;
        if (headerEl) {
          headerEl.style.transform = '';
          headerEl.style.transformOrigin = '';
        }
      }
      if (t === 'feed') {
        setTimeout(() => {
          this._initFeedObserver();
          this._initFeedScrollHeader();
        }, 50);
      } else {
        this._teardownFeedScrollHeader();
      }
    });

  }

  private _initFeedScrollHeader(): void {
    if (this._feedScrollHandler && this._feedScrollEl) {
      this._feedScrollEl.removeEventListener('scroll', this._feedScrollHandler);
    }
    const el = document.querySelector('.social-feed') as HTMLElement | null;
    if (!el) return;
    this._feedScrollEl = el;
    this._feedScrollHandler = () => this.feedScrolled.set(el.scrollTop > 50);
    el.addEventListener('scroll', this._feedScrollHandler, { passive: true } as AddEventListenerOptions);
  }

  private _teardownFeedScrollHeader(): void {
    if (this._feedScrollHandler && this._feedScrollEl) {
      this._feedScrollEl.removeEventListener('scroll', this._feedScrollHandler);
    }
    if (this._feedScrollEl) {
      this._feedScrollEl.scrollTop = 0;
    }
    this._feedScrollEl = undefined;
    this._feedScrollHandler = undefined;
    this.feedScrolled.set(false);
  }

  onFeedHeaderClick(): void {
    if (this.tab() !== 'feed') return;
    this._feedScrollEl?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private _initFeedObserver(): void {
    this._feedObserver?.disconnect();
    const cards = document.querySelectorAll('.feed-card');
    this._feedObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            this._feedObserver?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -30px 0px' }
    );
    cards.forEach(card => this._feedObserver!.observe(card));
  }

  ngOnDestroy(): void {
    // Persist state so it survives navigation away and back
    this.homeState.tab = this.tab();
    this.homeState.feedScrollTop = this._feedScrollEl?.scrollTop ?? 0;
    this._detachSectionScrollBubbling();
    this._feedObserver?.disconnect();
    this._teardownFeedScrollHeader();
    const feedRootEl = this.newsFeed()?.nativeElement;
    if (feedRootEl) {
      feedRootEl.removeEventListener('touchstart', this._feedTouchStartFn);
      feedRootEl.removeEventListener('touchend', this._feedTouchEndFn);
    }
  }

  // ── Swipe left/right to switch tabs ────────────────────────────────────────
  onFeedTouchStart(e: TouchEvent): void {
    this._swipeStartX = e.touches[0].clientX;
    this._swipeStartY = e.touches[0].clientY;
    this._swipeTracking = true;
  }

  onFeedTouchEnd(e: TouchEvent): void {
    if (!this._swipeTracking) return;
    this._swipeTracking = false;
    const dx = e.changedTouches[0].clientX - this._swipeStartX;
    const dy = e.changedTouches[0].clientY - this._swipeStartY;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const tabs: Array<'home' | 'news' | 'feed'> = ['home', 'news', 'feed'];
    const idx = tabs.indexOf(this.tab());
    if (dx < 0 && idx < tabs.length - 1) {
      this.tab.set(tabs[idx + 1]);
    } else if (dx > 0 && idx > 0) {
      this.tab.set(tabs[idx - 1]);
    }
  }

  // ── Section-panel scroll bubbling (wheel + touch) ─────────────────────────
  // When a .section-panel hits its scroll boundary, forward the delta to
  // labelsCol so the parent view keeps scrolling.
  private _detachSectionScrollBubbling(): void {
    this._panelWheelListeners.forEach(({ el, fn }) => el.removeEventListener('wheel', fn));
    this._panelTouchListeners.forEach(({ el, start, move }) => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
    });
    this._panelWheelListeners = [];
    this._panelTouchListeners = [];
  }

  private _attachSectionScrollBubbling(): void {
    this._detachSectionScrollBubbling();
    const articlesEl = this.articlesCol()?.nativeElement;
    if (!articlesEl) return;
    const panels = articlesEl.querySelectorAll<HTMLElement>('.section-panel');
    panels.forEach(panel => {
      // Wheel (trackpad / mouse)
      const wheelFn = (e: WheelEvent) => {
        const atTop = panel.scrollTop === 0;
        const atBottom = panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 1;
        const scrollingDown = e.deltaY > 0;
        if ((scrollingDown && atBottom) || (!scrollingDown && atTop)) {
          e.preventDefault();
          const left = this.labelsCol()?.nativeElement;
          if (left) {
            left.scrollTop += e.deltaY;
            this.onLabelsScroll();
          }
        }
      };
      panel.addEventListener('wheel', wheelFn, { passive: false });
      this._panelWheelListeners.push({ el: panel, fn: wheelFn });

      // Touch (iOS)
      let touchStartY = 0;
      const touchStartFn = (e: TouchEvent) => {
        touchStartY = e.touches[0].clientY;
      };
      const touchMoveFn = (e: TouchEvent) => {
        const dy = touchStartY - e.touches[0].clientY; // positive = scroll down
        touchStartY = e.touches[0].clientY;
        const atTop = panel.scrollTop === 0;
        const atBottom = panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 1;
        if ((dy > 0 && atBottom) || (dy < 0 && atTop)) {
          e.preventDefault();
          const left = this.labelsCol()?.nativeElement;
          if (left) {
            left.scrollTop += dy;
            this.onLabelsScroll();
          }
        }
      };
      panel.addEventListener('touchstart', touchStartFn, { passive: true });
      panel.addEventListener('touchmove', touchMoveFn, { passive: false });
      this._panelTouchListeners.push({ el: panel, start: touchStartFn, move: touchMoveFn });
    });
  }

  featured = signal<NewsArticle | null>(this._resolved?.featuredArticle ?? null);

  sections = computed<NewsSection[]>(() => {
    const all = this.articles();
    if (!all.length) return [];
    const map = new Map<string, typeof all>();
    for (const a of all) {
      const bucket = map.get(a.category) ?? [];
      bucket.push(a);
      map.set(a.category, bucket);
    }
    const order = this.newsService.sectionOrder;
    const sorted = [
      ...order.filter(k => map.has(k)),
      ...[...map.keys()].filter(k => !order.includes(k)).sort(),
    ];
    return sorted.map(label => ({
      label,
      hero: map.get(label)![0],
      rows: map.get(label)!.slice(1),
    }));
  });

  allArticles(section: NewsSection): NewsArticle[] {
    return [section.hero, ...section.rows];
  }

  openUserProfile(uid: string): void {
    this.router.navigate(['/app/users', uid]);
  }

  goToProfile(): void {
    this.router.navigate(['/app/profile']);
  }

  // ── Home grid item open/close ─────────────────────────────────────────────
  selectedGridPost = signal<Post | null>(null);
  selectedGridSneaker = signal<CatalogResult | null>(null);

  openHomeGridSlot(item: HomeDisplayItem): void {
    if (item.type === 'user') {
      const uid = item.uid ?? item.id;
      this.router.navigate(['/app/users', uid]);
      return;
    }
    if (item.type === 'sneaker') {
      this.selectedGridSneaker.set({
        id: item.id,
        name: item.name,
        brand: item.brand ?? '',
        colorway: item.colorway ?? '',
        imageUrl: item.imageUrl,
        largeImageUrl: item.imageUrl,
        retailPrice: null,
        lowestPrice: null,
        styleId: item.sku ?? '',
        sourceUrl: '',
        releaseDate: null,
      });
    } else {
      this.selectedGridPost.set({
        id: item.id,
        userId: this.authService.uid ?? '',
        imageUrl: item.imageUrl,
        caption: item.name,
        likeCount: 0,
        commentCount: 0,
        likedBy: [],
        createdAt: new Date(),
      });
    }
    this.uiState.navHidden.set(true);
  }

  closeGridItem(): void {
    this.selectedGridPost.set(null);
    this.selectedGridSneaker.set(null);
    this.uiState.navHidden.set(false);
  }

  // ── Home tab ───────────────────────────────────────────────────────────────
  private static readonly _greetings: Record<'morning' | 'afternoon' | 'evening' | 'night', string[]> = {
    morning: ['Morning', 'Good morning', 'Rise and shine', 'Top of the morning', 'Wake up', 'Early bird'],
    afternoon: ['Good afternoon', 'Afternoon', 'Hey there', 'Hope your day is going well'],
    evening: ['Good evening', 'Evening', 'Wind down time', 'Almost there'],
    night: ['Good night', 'Burning the midnight oil', 'Night owl', 'Still up?'],
  };

  greeting(): string {
    const h = new Date().getHours();
    const bucket: 'morning' | 'afternoon' | 'evening' | 'night' =
      h >= 5 && h < 12 ? 'morning'
        : h < 17 ? 'afternoon'
          : h < 21 ? 'evening'
            : 'night';
    const pool = HomeComponent._greetings[bucket];
    // Pick deterministically by day-of-year so it changes daily but is stable on refresh
    const day = Math.floor(Date.now() / 86_400_000);
    return pool[day % pool.length];
  }

  currentUsername(): string {
    return this.authService.currentUser()?.displayName ?? '';
  }

  currentDate(): string {
    return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }

  fullDateTime(): string {
    const now = new Date();
    const date = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    const h = now.getHours();
    const m = now.getMinutes().toString().padStart(2, '0');
    const h12 = h % 12 || 12;
    const ampm = h >= 12 ? 'pm' : 'am';
    return `${date} at ${h12}:${m}${ampm}`;
  }

  emptyHomeSlots(): number[] {
    const filled = Math.min(this.displayItems().length, 6);
    return Array.from({ length: Math.max(0, 6 - filled) }, (_, i) => i);
  }

  displayItems = signal<HomeDisplayItem[]>(this._resolved?.displayItems ?? []);

  // Returns exactly 6 slots in DOM order [0,1,2,5,4,3] so nth-child
  // animation delays fire in visual sequence: top-left→top-center→top-right→bottom-right→bottom-center→bottom-left
  homeGridSlots = computed<Array<HomeDisplayItem | null>>(() => {
    const items = this.displayItems();
    const p: Array<HomeDisplayItem | null> = items.slice(0, 6);
    while (p.length < 6) p.push(null);
    return [p[0], p[1], p[2], p[5], p[4], p[3]];
  });

  // ── Feed actions ───────────────────────────────────────────────────────────
  isLikedByMe(post: FeedPost): boolean {
    if (this.feedLiked.has(post.postId)) return this.feedLiked.get(post.postId)!;
    const uid = this.authService.uid;
    return uid ? (post.likedBy ?? []).includes(uid) : false;
  }

  likeCountFor(post: FeedPost): number {
    if (this.feedLikeCounts.has(post.postId)) return this.feedLikeCounts.get(post.postId)!;
    return post.likeCount;
  }

  async toggleFeedLike(event: Event, post: FeedPost): Promise<void> {
    event.stopPropagation();
    const uid = this.authService.uid;
    if (!uid) return;
    const liked = this.isLikedByMe(post);
    this.feedLiked.set(post.postId, !liked);
    this.feedLikeCounts.set(post.postId, this.likeCountFor(post) + (liked ? -1 : 1));
    await Promise.all([
      this.postService.likePost(post.authorUid, post.postId, uid, liked),
      this.timelineService.updateFeedLike(uid, post.postId, liked, uid),
    ]);
    if (!liked && uid !== post.authorUid) {
      const user = this.authService.currentUser();
      this.notifService.push(post.authorUid, 'like', {
        fromUid: uid,
        fromUsername: this.myProfile()?.username ?? user?.displayName ?? '',
        fromPhotoURL: user?.photoURL ?? '',
        resourceId: post.postId,
        body: 'liked your post.',
      });
    }
  }

  openFeedPost(post: FeedPost): void {
    this.selectedFeedPost.set(post);
    this.uiState.navHidden.set(true);
  }

  closeFeedPost(): void {
    this.selectedFeedPost.set(null);
    this.uiState.navHidden.set(false);
  }

  feedPostAsPost(fp: FeedPost): Post {
    return {
      id: fp.postId,
      userId: fp.authorUid,
      imageUrl: fp.imageUrl,
      caption: fp.caption,
      likeCount: fp.likeCount,
      commentCount: fp.commentCount,
      likedBy: fp.likedBy ?? [],
      createdAt: fp.createdAt,
    };
  }

  feedPostAuthor(fp: FeedPost): UserPublicProfile {
    return {
      uid: fp.authorUid,
      username: fp.authorUsername,
      photoURL: fp.authorPhotoURL,
      bio: '',
      location: '',
      shoeSize: '',
    };
  }

  // ── Share to DM ────────────────────────────────────────────────────────────
  async openShare(event: Event, post: FeedPost): Promise<void> {
    event.stopPropagation();
    this.sharePost.set(post);
    this.shareSent.set(null);
    this.uiState.navHidden.set(true);
    const uid = this.authService.uid;
    if (!uid) return;
    const following = await this.userService.getFollowing(uid);
    this.shareFollowing.set(following);
  }

  closeShare(): void {
    this.sharePost.set(null);
    this.shareFollowing.set([]);
    this.uiState.navHidden.set(false);
  }

  async sendPostToUser(target: UserPublicProfile): Promise<void> {
    const post = this.sharePost();
    const uid = this.authService.uid;
    if (!post || !uid || this.shareSending()) return;
    this.shareSending.set(true);
    try {
      const chatId = await this.chatService.getOrCreateChat(uid, target.uid);
      const text = post.caption ? `📸 ${post.caption}` : '📸 Shared a post';
      await this.chatService.sendMessage(chatId, uid, text, post.imageUrl);
      this.shareSent.set(target.uid);
      setTimeout(() => this.closeShare(), 1200);
    } finally {
      this.shareSending.set(false);
    }
  }

  onBannerDragStart(e: TouchEvent): void {
    this._swipeTracking = false; // banner drag is vertical — cancel tab-swipe detection
    this._bannerDragY = e.touches[0].clientY;
    this._bannerDragScroll = this.labelsCol()?.nativeElement.scrollTop ?? 0;
  }

  onBannerDragMove(e: TouchEvent): void {
    const left = this.labelsCol()?.nativeElement;
    if (!left) return;
    left.scrollTop = this._bannerDragScroll + (this._bannerDragY - e.touches[0].clientY);
    this.onLabelsScroll();
  }

  onLabelsScroll(): void {
    const left = this.labelsCol()?.nativeElement;
    const right = this.articlesCol()?.nativeElement;
    const banner = this.bannerSection()?.nativeElement;
    const header = this.feedHeader()?.nativeElement;
    if (!left) return;

    if (!this.bannerFullHeight && banner) {
      this.bannerFullHeight = banner.getBoundingClientRect().height;
    }

    const collapseRange = this.bannerFullHeight || 140;

    const realContentH = left.scrollHeight - collapseRange;
    const maxScroll = Math.max(collapseRange, realContentH - left.clientHeight);
    if (left.scrollTop > maxScroll) {
      left.scrollTop = maxScroll;
    }

    const scroll = left.scrollTop;

    if (right) right.scrollTop = scroll;

    const progress = Math.min(1, Math.max(0, scroll / collapseRange));

    if (banner && this.bannerFullHeight) {
      banner.style.height = `${(1 - progress) * this.bannerFullHeight}px`;
    }

    if (header) {
      const ty = -(progress * 10);
      const scale = 1 - progress * 0.15;
      header.style.transform = `translateY(${ty}px) scale(${scale})`;
      header.style.transformOrigin = 'left center';
    }
  }

  // ── Post options menu ─────────────────────────────────────────────────────
  openPostMenu(event: Event, post: FeedPost): void {
    event.stopPropagation();
    this.postMenuPost.set(post);
    this.postMenuProfile.set(null);
    this.uiState.navHidden.set(true);
    this.userService.getPublicProfile(post.authorUid).then(p => this.postMenuProfile.set(p));
  }

  closePostMenu(): void {
    this.postMenuPost.set(null);
    this.postMenuProfile.set(null);
    this.uiState.navHidden.set(false);
  }

  async unfollowFromMenu(): Promise<void> {
    const post = this.postMenuPost();
    const uid = this.authService.uid;
    if (!post || !uid) return;
    await this.userService.unfollow(uid, post.authorUid);
    this.hideAuthorPosts(post.authorUid);
  }

  hideAuthorPosts(targetUid: string): void {
    this.closePostMenu();
  }

  async markNotInterested(): Promise<void> {
    const post = this.postMenuPost();
    const uid = this.authService.uid;
    if (!post || !uid) return;
    await this.userService.markUserHidden(uid, post.authorUid, post.authorUsername, post.authorPhotoURL);
    this.closePostMenu();
  }

  async copyPostLink(): Promise<void> {
    const post = this.postMenuPost();
    if (!post) return;
    const url = `${window.location.origin}/app/posts/${post.authorUid}/${post.postId}`;
    await navigator.clipboard.writeText(url);
    this.closePostMenu();
  }

  // ── Comments panel ────────────────────────────────────────────────────────
  openComments(event: Event, post: FeedPost): void {
    event.stopPropagation();
    this.commentsPost.set(post);
    this.commentText.set('');
    this.replyingTo.set(null);
    this.commentsPanelFull.set(false);
    this.uiState.navHidden.set(true);
  }

  closeComments(): void {
    this.commentsPost.set(null);
    this.replyingTo.set(null);
    this.commentText.set('');
    this.uiState.navHidden.set(false);
  }

  setReplyTo(event: Event, comment: PostComment): void {
    event.stopPropagation();
    this.replyingTo.set(comment);
    this.commentText.set('@' + comment.authorName + ' ');
  }

  clearReply(): void {
    this.replyingTo.set(null);
    this.commentText.set('');
  }

  async submitComment(): Promise<void> {
    const post = this.commentsPost();
    const uid = this.authService.uid;
    const text = this.commentText().trim();
    if (!post || !uid || !text || this.commentSubmitting()) return;
    const user = this.authService.currentUser();
    if (!user) return;
    this.commentSubmitting.set(true);
    const replyTo = this.replyingTo();
    const username = this.myProfile()?.username ?? user.displayName ?? user.email ?? 'User';
    try {
      await this.postService.addComment(post.authorUid, post.postId, {
        authorUid: uid,
        authorName: username,
        authorPhotoURL: user.photoURL ?? '',
        text,
        createdAt: new Date(),
        ...(replyTo ? { replyToId: replyTo.id, replyToName: replyTo.authorName } : {})
      });
      if (uid !== post.authorUid) {
        this.notifService.push(post.authorUid, 'comment', {
          fromUid: uid,
          fromUsername: username,
          fromPhotoURL: user.photoURL ?? '',
          resourceId: post.postId,
          body: `commented: “${text}”`,
        });
      }
      this.commentText.set('');
      this.replyingTo.set(null);
    } finally {
      this.commentSubmitting.set(false);
    }
  }

  onCommentsDragStart(e: TouchEvent): void {
    this._commentsDragStartY = e.touches[0].clientY;
    this._commentsDragStartFull = this.commentsPanelFull();
  }

  onCommentsDragEnd(e: TouchEvent): void {
    const dy = e.changedTouches[0].clientY - this._commentsDragStartY;
    if (dy < -60) {
      this.commentsPanelFull.set(true);
    } else if (dy > 60) {
      if (this._commentsDragStartFull) {
        // Large drag from full → close directly; moderate drag → shrink to half
        if (dy > 160) {
          this.closeComments();
        } else {
          this.commentsPanelFull.set(false);
        }
      } else {
        this.closeComments();
      }
    }
  }

  likedByLabel(post: FeedPost): string {
    const count = this.likeCountFor(post);
    if (count === 0) return '';
    if (count === 1) return '1 like';
    return `${count} likes`;
  }

  timeAgo(date: any): string {
    if (!date) return '';
    let d: Date;
    if (typeof date?.toDate === 'function') {
      d = date.toDate();
    } else {
      d = new Date(date);
    }
    if (isNaN(d.getTime())) return '';
    const mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
  }
}
