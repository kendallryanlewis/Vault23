import {
    Component,
    ChangeDetectionStrategy,
    input,
    output,
    signal,
    computed,
    inject,
    OnInit,
    AfterViewInit,
    OnDestroy,
    ViewChild,
    ElementRef,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { Post, PostComment } from '../../core/models/post.model';
import { PostService } from '../../core/services/post.service';
import { AuthService } from '../../core/services/auth.service';
import { UserService } from '../../core/services/user.service';
import { UserPublicProfile } from '../../core/models/user.model';

interface CommentThread {
    comment: PostComment;
    replies: PostComment[];
}

@Component({
    selector: 'app-post-view',
    standalone: true,
    imports: [FormsModule],
    templateUrl: './post-view.component.html',
    styleUrl: './post-view.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PostViewComponent implements OnInit, AfterViewInit, OnDestroy {
    posts = input.required<Post[]>();
    startIndex = input.required<number>();
    author = input.required<UserPublicProfile>();
    closed = output<void>();
    postDeleted = output<string>();

    private postService = inject(PostService);
    private authService = inject(AuthService);
    private userService = inject(UserService);

    @ViewChild('snapContainer') snapContainer!: ElementRef<HTMLElement>;

    comments = signal<PostComment[]>([]);
    commentText = signal('');
    commentLoading = signal(false);
    replyingTo = signal<PostComment | null>(null);
    activeIndex = signal(0);
    deleteConfirmOpen = signal(false);
    deleting = signal(false);
    myProfile = signal<UserPublicProfile | null>(null);

    private _commentSub?: Subscription;

    readonly activePost = computed(() => {
        const p = this.posts();
        return p[this.activeIndex()] ?? null;
    });

    // Live post doc — keeps likeCount and likedBy in sync for all viewers
    readonly livePost = toSignal(
        toObservable(this.activePost).pipe(
            switchMap(post => {
                if (!post) return [null] as const;
                return this.postService.getPostLive(this.author().uid, post.id);
            })
        ),
        { initialValue: null as Post | null }
    );

    readonly displayPost = computed(() => this.livePost() ?? this.activePost());

    readonly canDelete = computed(() => {
        return this.authService.uid === this.author().uid;
    });

    readonly threadedComments = computed<CommentThread[]>(() => {
        const all = this.comments();
        const topLevel = all.filter(c => !c.replyToId);
        return topLevel.map(c => ({
            comment: c,
            replies: all.filter(r => r.replyToId === c.id),
        }));
    });

    ngOnInit(): void {
        this.activeIndex.set(this.startIndex());
        this._loadComments();
        const uid = this.authService.uid;
        if (uid) {
            this.userService.getPublicProfile(uid).then(p => this.myProfile.set(p));
        }
    }

    ngAfterViewInit(): void {
        const el = this.snapContainer.nativeElement;
        const startIdx = this.startIndex();
        if (startIdx > 0) {
            // Scroll to the correct slide before attaching the listener so it
            // doesn't race with the programmatic scroll and reset to 0.
            el.scrollTop = startIdx * el.clientHeight;
        }
        el.addEventListener('scroll', this._onContainerScroll, { passive: true });
    }

    ngOnDestroy(): void {
        this._commentSub?.unsubscribe();
        this.snapContainer?.nativeElement.removeEventListener('scroll', this._onContainerScroll);
    }

    private _loadComments(): void {
        this._commentSub?.unsubscribe();
        const post = this.posts()[this.activeIndex()];
        if (!post) return;
        this._commentSub = this.postService
            .getComments(this.author().uid, post.id)
            .subscribe(c => this.comments.set(c));
    }

    private _snapScrollRafId: number | null = null;

    private readonly _onContainerScroll = (): void => {
        if (this._snapScrollRafId !== null) return;
        this._snapScrollRafId = requestAnimationFrame(() => {
            this._snapScrollRafId = null;
            const el = this.snapContainer.nativeElement;
            const slideHeight = el.clientHeight;
            const idx = Math.round(el.scrollTop / slideHeight);
            if (idx !== this.activeIndex()) {
                this.activeIndex.set(idx);
                this.replyingTo.set(null);
                this.commentText.set('');
                this._loadComments();
            }
        });
    };

    setReplyTo(comment: PostComment): void {
        this.replyingTo.set(comment);
        this.commentText.set('@' + comment.authorName + ' ');
    }

    clearReply(): void {
        this.replyingTo.set(null);
        this.commentText.set('');
    }

    async submitComment(): Promise<void> {
        const uid = this.authService.uid;
        const post = this.activePost();
        const text = this.commentText().trim();
        if (!uid || !post || !text || this.commentLoading()) return;
        this.commentLoading.set(true);
        const replyTo = this.replyingTo();
        try {
            const user = this.authService.currentUser();
            const username = this.myProfile()?.username ?? user?.displayName ?? 'Anonymous';
            await this.postService.addComment(this.author().uid, post.id, {
                authorUid: uid,
                authorName: username,
                authorPhotoURL: user?.photoURL ?? '',
                text,
                createdAt: new Date(),
                ...(replyTo ? { replyToId: replyTo.id, replyToName: replyTo.authorName } : {}),
            });
            this.commentText.set('');
            this.replyingTo.set(null);
        } finally {
            this.commentLoading.set(false);
        }
    }

    close(): void {
        this.closed.emit();
    }

    likedByLabel(post: Post): string {
        const count = post.likeCount ?? 0;
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

    openDeleteConfirm(): void {
        this.deleteConfirmOpen.set(true);
    }

    cancelDelete(): void {
        this.deleteConfirmOpen.set(false);
    }

    async confirmDelete(): Promise<void> {
        const post = this.activePost();
        if (!post) return;
        this.deleting.set(true);
        this.deleteConfirmOpen.set(false);
        try {
            await this.postService.deletePost(this.author().uid, post.id);
            this.postDeleted.emit(post.id);
            this.closed.emit();
        } finally {
            this.deleting.set(false);
        }
    }
}
