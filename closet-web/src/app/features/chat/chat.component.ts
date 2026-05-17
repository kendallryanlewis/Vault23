import {
    Component,
    ChangeDetectionStrategy,
    inject,
    signal,
    OnInit,
    AfterViewInit,
    OnDestroy,
    AfterViewChecked,
    ViewChild,
    ElementRef,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService } from '../../core/services/chat.service';
import { UserService } from '../../core/services/user.service';
import { AuthService } from '../../core/services/auth.service';
import { UiStateService } from '../../core/services/ui-state.service';
import { Message } from '../../core/models/chat.model';
import { UserPublicProfile } from '../../core/models/user.model';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-chat',
    standalone: true,
    imports: [FormsModule],
    templateUrl: './chat.component.html',
    styleUrl: './chat.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatComponent implements OnInit, AfterViewInit, AfterViewChecked, OnDestroy {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private location = inject(Location);
    private chatService = inject(ChatService);
    private userService = inject(UserService);
    private authService = inject(AuthService);
    private uiState = inject(UiStateService);

    @ViewChild('messageList') messageList!: ElementRef<HTMLElement>;
    @ViewChild('imageInput') imageInputRef!: ElementRef<HTMLInputElement>;

    messages = signal<Message[]>([]);
    otherUser = signal<UserPublicProfile | null>(null);
    groupParticipants = signal<UserPublicProfile[]>([]);
    isGroup = signal(false);
    groupName = signal('');
    chatParticipants = signal<string[]>([]);
    messageText = signal('');
    sending = signal(false);
    imageFile = signal<File | null>(null);
    imagePreview = signal<string | null>(null);
    activeMenu = signal<{ id: string; isOwn: boolean } | null>(null);

    chatId = '';
    chatMenuOpen = signal(false);
    groupMembersOpen = signal(false);
    private sub?: Subscription;
    private shouldScroll = false;
    private longPressTimer: ReturnType<typeof setTimeout> | null = null;

    get currentUid(): string | null {
        return this.authService.uid;
    }

    ngOnInit(): void {
        this.uiState.navHidden.set(true);
        this.chatId = this.route.snapshot.paramMap.get('chatId') ?? '';
        const draft = this.route.snapshot.queryParamMap.get('draft');
        if (draft) this.messageText.set(draft);
        const uid = this.currentUid;

        if (uid && this.chatId) {
            this.chatService.markRead(this.chatId, uid);
        }

        this.chatService.getChatDoc(this.chatId).then(chat => {
            if (!chat) return;
            this.chatParticipants.set(chat.participants);
            if (chat.isGroup) {
                this.isGroup.set(true);
                this.groupName.set(chat.groupName ?? 'Group');
                const others = chat.participants.filter(p => p !== uid);
                Promise.all(others.map(p => this.userService.getPublicProfile(p))).then(profiles => {
                    this.groupParticipants.set(profiles.filter((p): p is UserPublicProfile => p !== null));
                });
            } else {
                const otherUid = chat.participants.find(u => u !== uid);
                if (otherUid) {
                    this.userService.getPublicProfile(otherUid).then(p => this.otherUser.set(p));
                }
            }
        });

        this.sub = this.chatService.getMessages(this.chatId).subscribe(msgs => {
            this.messages.set(msgs);
            this.shouldScroll = true;
            if (uid && this.chatId) {
                this.chatService.markRead(this.chatId, uid);
            }
        });
    }

    ngAfterViewInit(): void { }

    ngOnDestroy(): void {
        this.uiState.navHidden.set(false);
        this.sub?.unsubscribe();
        this.clearLongPress();
    }

    ngAfterViewChecked(): void {
        if (this.shouldScroll) {
            this.scrollToBottom();
            this.shouldScroll = false;
        }
    }

    private scrollToBottom(): void {
        const el = this.messageList?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
    }

    async send(): Promise<void> {
        const uid = this.currentUid;
        const text = this.messageText().trim();
        const file = this.imageFile();
        if (!uid || (!text && !file) || this.sending()) return;
        this.sending.set(true);
        this.messageText.set('');
        this.imageFile.set(null);
        this.imagePreview.set(null);
        const participants = this.chatParticipants();
        try {
            if (file) {
                await this.chatService.sendImage(this.chatId, uid, file, text, participants);
            } else {
                await this.chatService.sendMessage(this.chatId, uid, text, undefined, participants);
            }
        } finally {
            this.sending.set(false);
        }
    }

    onFileSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        this.imageFile.set(file);
        const reader = new FileReader();
        reader.onload = () => this.imagePreview.set(reader.result as string);
        reader.readAsDataURL(file);
        input.value = '';
    }

    clearImage(): void {
        this.imageFile.set(null);
        this.imagePreview.set(null);
    }

    onContextMenu(event: Event, msg: Message): void {
        event.preventDefault();
        this.activeMenu.set({ id: msg.id, isOwn: msg.senderId === this.currentUid });
    }

    onTouchStart(event: TouchEvent, msg: Message): void {
        this.longPressTimer = setTimeout(() => {
            this.activeMenu.set({ id: msg.id, isOwn: msg.senderId === this.currentUid });
            this.longPressTimer = null;
        }, 500);
    }

    onTouchEnd(): void {
        this.clearLongPress();
    }

    private clearLongPress(): void {
        if (this.longPressTimer !== null) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
    }

    async unsend(messageId: string): Promise<void> {
        this.activeMenu.set(null);
        await this.chatService.unsendMessage(this.chatId, messageId);
    }

    async deleteMsg(messageId: string): Promise<void> {
        this.activeMenu.set(null);
        await this.chatService.deleteMessage(this.chatId, messageId);
    }

    async blockUser(): Promise<void> {
        const uid = this.currentUid;
        const other = this.otherUser();
        if (!uid || !other) return;
        await this.chatService.blockUser(uid, other.uid);
        await this.chatService.leaveChat(this.chatId, uid);
        this.chatMenuOpen.set(false);
        this.goBack();
    }

    async leaveGroup(): Promise<void> {
        const uid = this.currentUid;
        if (!uid) return;
        await this.chatService.leaveChat(this.chatId, uid);
        this.chatMenuOpen.set(false);
        this.goBack();
    }

    goBack(): void {
        this.location.back();
    }

    viewProfile(): void {
        const uid = this.otherUser()?.uid;
        if (uid) {
            this.router.navigate(['/app/users', uid]);
        }
    }

    openGroupMembers(): void {
        this.groupMembersOpen.set(true);
    }

    closeGroupMembers(): void {
        this.groupMembersOpen.set(false);
    }

    navigateToMember(uid: string): void {
        this.closeGroupMembers();
        this.router.navigate(['/app/users', uid]);
    }

    senderName(senderId: string): string {
        if (senderId === this.currentUid) return 'You';
        if (this.isGroup()) {
            const p = this.groupParticipants().find(u => u.uid === senderId);
            return p?.username ?? '';
        }
        return this.otherUser()?.username ?? '';
    }
}
