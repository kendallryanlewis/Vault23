import {
    Component,
    ChangeDetectionStrategy,
    inject,
    signal,
    computed,
    effect,
    OnInit,
    AfterViewInit,
    OnDestroy,
    ElementRef,
} from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, from, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, map, catchError } from 'rxjs';
import { ChatService } from '../../core/services/chat.service';
import { UserService } from '../../core/services/user.service';
import { AuthService } from '../../core/services/auth.service';
import { UiStateService } from '../../core/services/ui-state.service';
import { Chat } from '../../core/models/chat.model';
import { UserPublicProfile } from '../../core/models/user.model';

@Component({
    selector: 'app-messages',
    standalone: true,
    imports: [FormsModule],
    templateUrl: './messages.component.html',
    styleUrl: './messages.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessagesComponent implements OnInit, AfterViewInit, OnDestroy {
    private router = inject(Router);
    private chatService = inject(ChatService);
    private userService = inject(UserService);
    private auth = inject(AuthService);
    private uiState = inject(UiStateService);

    constructor() {
        effect(() => this.uiState.navHidden.set(this.showCompose()));
    }

    chats = signal<Chat[]>([]);
    profiles = signal<Map<string, UserPublicProfile>>(new Map());
    filter = signal<'all' | 'unread'>('all');
    showCompose = signal(false);
    searchQuery = signal('');
    searchResults = signal<UserPublicProfile[]>([]);
    searching = signal(false);
    starting = signal(false);
    groupMode = signal(false);
    selectedUsers = signal<UserPublicProfile[]>([]);
    groupNameInput = signal('');
    creating = signal(false);
    swipedChatId = signal<string | null>(null);

    private _swipeStartX = 0;
    private _swipeStartChatId = '';
    private _swipeCurrentX = 0;

    private chatSub?: Subscription;
    private searchSub?: Subscription;
    private searchSubject = new Subject<string>();

    get currentUid(): string | null {
        return this.auth.uid;
    }

    filteredChats = computed(() => {
        const uid = this.currentUid;
        const cs = this.chats();
        if (this.filter() === 'unread') {
            return cs.filter(c => uid && (c.unreadFor ?? []).includes(uid));
        }
        return cs;
    });

    ngOnInit(): void {
        const uid = this.currentUid;
        if (!uid) return;

        this.chatSub = this.chatService.getMyChats(uid).subscribe(async chats => {
            this.chats.set(chats);
            await this.loadProfiles(chats, uid);
        });

        this.searchSub = this.searchSubject.pipe(
            debounceTime(300),
            distinctUntilChanged(),
            switchMap(q => {
                if (q.trim().length < 2) {
                    this.searching.set(false);
                    return of<UserPublicProfile[]>([]);
                }
                this.searching.set(true);
                return from(this.userService.searchUsers(q)).pipe(
                    map(results => results.filter(u => u.uid !== uid)),
                    catchError(() => of<UserPublicProfile[]>([]))
                );
            })
        ).subscribe(results => {
            this.searchResults.set(results);
            this.searching.set(false);
        });
    }

    ngAfterViewInit(): void { }

    ngOnDestroy(): void {
        this.uiState.navHidden.set(false);
        this.chatSub?.unsubscribe();
        this.searchSub?.unsubscribe();
    }

    private async loadProfiles(chats: Chat[], currentUid: string): Promise<void> {
        const uidsNeeded = new Set<string>();
        const currentMap = this.profiles();
        for (const chat of chats) {
            const otherUid = chat.participants.find(u => u !== currentUid);
            if (otherUid && !currentMap.has(otherUid)) {
                uidsNeeded.add(otherUid);
            }
        }
        if (uidsNeeded.size === 0) return;
        const loaded = await Promise.all([...uidsNeeded].map(uid => this.userService.getPublicProfile(uid)));
        const newMap = new Map(currentMap);
        for (const profile of loaded) {
            if (profile) newMap.set(profile.uid, profile);
        }
        this.profiles.set(newMap);
    }

    getOtherProfile(chat: Chat): UserPublicProfile | null {
        const uid = this.currentUid;
        const otherUid = chat.participants.find(u => u !== uid);
        return otherUid ? (this.profiles().get(otherUid) ?? null) : null;
    }

    isUnread(chat: Chat): boolean {
        const uid = this.currentUid;
        return uid ? (chat.unreadFor ?? []).includes(uid) : false;
    }

    formatTime(chat: Chat): string {
        const ts = chat.lastMessageAt as any;
        const date: Date = ts?.toDate ? ts.toDate() : new Date(ts);
        if (isNaN(date.getTime())) return '';
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return 'now';
        if (diffMins < 60) return `${diffMins}m`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h`;
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays < 7) return `${diffDays}d`;
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    openChat(chat: Chat): void {
        this.router.navigate(['/app/chat', chat.id]);
    }

    onSearch(q: string): void {
        this.searchSubject.next(q);
    }

    async startChat(user: UserPublicProfile): Promise<void> {
        const uid = this.currentUid;
        if (!uid || this.starting()) return;
        this.starting.set(true);
        try {
            const chatId = await this.chatService.getOrCreateChat(uid, user.uid);
            this.closeCompose();
            this.router.navigate(['/app/chat', chatId]);
        } finally {
            this.starting.set(false);
        }
    }

    closeCompose(): void {
        this.showCompose.set(false);
        this.searchQuery.set('');
        this.searchResults.set([]);
        this.searching.set(false);
        this.groupMode.set(false);
        this.selectedUsers.set([]);
        this.groupNameInput.set('');
    }

    setGroupMode(value: boolean): void {
        this.groupMode.set(value);
        this.selectedUsers.set([]);
    }

    isUserSelected(uid: string): boolean {
        return this.selectedUsers().some(u => u.uid === uid);
    }

    toggleUserSelection(user: UserPublicProfile): void {
        const current = this.selectedUsers();
        if (current.some(u => u.uid === user.uid)) {
            this.selectedUsers.set(current.filter(u => u.uid !== user.uid));
        } else {
            this.selectedUsers.set([...current, user]);
        }
    }

    deselectUser(user: UserPublicProfile): void {
        this.selectedUsers.set(this.selectedUsers().filter(u => u.uid !== user.uid));
    }

    async createGroup(): Promise<void> {
        const uid = this.currentUid;
        const name = this.groupNameInput().trim();
        const participants = this.selectedUsers().map(u => u.uid);
        if (!uid || !name || participants.length === 0 || this.creating()) return;
        this.creating.set(true);
        try {
            const chatId = await this.chatService.createGroupChat(uid, participants, name);
            this.closeCompose();
            this.router.navigate(['/app/chat', chatId]);
        } finally {
            this.creating.set(false);
        }
    }

    onSwipeStart(event: TouchEvent, chatId: string): void {
        this._swipeStartX = event.touches[0].clientX;
        this._swipeCurrentX = event.touches[0].clientX;
        this._swipeStartChatId = chatId;
    }

    onSwipeMove(event: TouchEvent): void {
        this._swipeCurrentX = event.touches[0].clientX;
    }

    onSwipeEnd(): void {
        const delta = this._swipeStartX - this._swipeCurrentX;
        if (delta > 60) {
            this.swipedChatId.set(this._swipeStartChatId);
        } else {
            this.swipedChatId.set(null);
        }
    }

    dismissSwipe(): void {
        this.swipedChatId.set(null);
    }

    async deleteConversation(chat: Chat): Promise<void> {
        const uid = this.currentUid;
        if (!uid) return;
        this.swipedChatId.set(null);
        await this.chatService.leaveChat(chat.id, uid);
        this.chats.update(list => list.filter(c => c.id !== chat.id));
    }
}
