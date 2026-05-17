import { Component, ChangeDetectionStrategy, inject, signal, computed, viewChild, ElementRef, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { UserService } from '../../../core/services/user.service';
import { AuthService } from '../../../core/services/auth.service';
import { UiStateService } from '../../../core/services/ui-state.service';
import { UserPublicProfile } from '../../../core/models/user.model';

interface FollowUser {
    id: string;
    username: string | null;
    photoUrl: string | null;
}

@Component({
    selector: 'app-follow-list',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './follow-list.component.html',
    styleUrl: './follow-list.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FollowListComponent implements OnInit, AfterViewInit, OnDestroy {
    private router = inject(Router);
    private route = inject(ActivatedRoute);
    private userService = inject(UserService);
    private authService = inject(AuthService);
    private uiState = inject(UiStateService);

    private panelsRef = viewChild<ElementRef<HTMLElement>>('panelsRef');

    activeTab = signal<'followers' | 'following'>('followers');
    followers = signal<FollowUser[]>([]);
    following = signal<FollowUser[]>([]);
    loading = signal(true);
    query = signal('');

    followersCount = computed(() => this.followers().length);
    followingCount = computed(() => this.following().length);

    filteredFollowers = computed(() => {
        const q = this.query().toLowerCase().trim();
        if (!q) return this.followers();
        return this.followers().filter(u => u.username?.toLowerCase().includes(q));
    });

    filteredFollowing = computed(() => {
        const q = this.query().toLowerCase().trim();
        if (!q) return this.following();
        return this.following().filter(u => u.username?.toLowerCase().includes(q));
    });

    async ngOnInit(): Promise<void> {
        this.uiState.navHidden.set(true);
        const t = this.route.snapshot.data['type'] as 'followers' | 'following';
        this.activeTab.set(t ?? 'followers');

        const uid = this.authService.uid;
        if (!uid) { this.loading.set(false); return; }

        const [followerProfiles, followingProfiles] = await Promise.all([
            this.userService.getFollowers(uid),
            this.userService.getFollowing(uid),
        ]);

        const toUser = (p: UserPublicProfile): FollowUser => ({
            id: p.uid,
            username: p.username ?? null,
            photoUrl: p.photoURL ?? null,
        });

        this.followers.set(followerProfiles.map(toUser));
        this.following.set(followingProfiles.map(toUser));
        this.loading.set(false);

        if (t === 'following') {
            setTimeout(() => {
                const el = this.panelsRef()?.nativeElement;
                if (el) el.scrollLeft = el.offsetWidth;
            }, 0);
        }
    }

    ngAfterViewInit(): void {
        const el = this.panelsRef()?.nativeElement;
        if (el) el.addEventListener('scroll', this._onPanelsScroll, { passive: true });
    }

    ngOnDestroy(): void {
        this.uiState.navHidden.set(false);
        const el = this.panelsRef()?.nativeElement;
        if (el) el.removeEventListener('scroll', this._onPanelsScroll);
    }

    setTab(tab: 'followers' | 'following'): void {
        this.activeTab.set(tab);
        const el = this.panelsRef()?.nativeElement;
        if (el) {
            el.scrollTo({ left: tab === 'following' ? el.offsetWidth : 0, behavior: 'smooth' });
        }
    }

    private _panelsScrollRafId: number | null = null;

    private readonly _onPanelsScroll = (e: Event): void => {
        const el = e.target as HTMLElement;
        if (this._panelsScrollRafId !== null) return;
        this._panelsScrollRafId = requestAnimationFrame(() => {
            this._panelsScrollRafId = null;
            const ratio = el.scrollLeft / (el.offsetWidth || 1);
            const tab: 'followers' | 'following' = ratio < 0.5 ? 'followers' : 'following';
            if (this.activeTab() !== tab) this.activeTab.set(tab);
        });
    };

    navigateToProfile(uid: string): void {
        this.router.navigate(['/app/users', uid]);
    }

    back(): void {
        this.router.navigate(['/app/profile']);
    }
}

