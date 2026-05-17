import { Component, ChangeDetectionStrategy, inject, signal, OnInit, ViewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PostService } from '../../core/services/post.service';
import { AuthService } from '../../core/services/auth.service';
import { UserService } from '../../core/services/user.service';
import { NotificationService } from '../../core/services/notification.service';
import { CameraStateService } from '../../core/services/camera-state.service';
import { UserPublicProfile } from '../../core/models/user.model';

@Component({
    selector: 'app-camera',
    standalone: true,
    imports: [FormsModule],
    templateUrl: './camera.component.html',
    styleUrl: './camera.component.scss', changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CameraComponent implements OnInit {
    private postService = inject(PostService);
    private auth = inject(AuthService);
    private userService = inject(UserService);
    private notificationService = inject(NotificationService);
    private cameraState = inject(CameraStateService);
    private router = inject(Router);

    @ViewChild('galleryInput') galleryInputRef!: ElementRef<HTMLInputElement>;

    capturedDataUrl = signal<string | null>(null);
    capturedBlob = signal<Blob | null>(null);
    caption = signal('');
    posting = signal(false);
    postError = signal('');
    awaitingPick = signal(false);
    mentionResults = signal<UserPublicProfile[]>([]);

    private _mentionAnchorIndex = -1;
    private _mentionQuery = '';

    ngOnInit(): void {
        const file = this.cameraState.consume();
        if (file) {
            this.capturedBlob.set(file);
            this.capturedDataUrl.set(URL.createObjectURL(file));
        } else {
            this.awaitingPick.set(true);
        }
    }

    pickFromGallery(): void {
        this.galleryInputRef?.nativeElement.click();
    }

    onGallerySelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        const prev = this.capturedDataUrl();
        if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
        this.capturedBlob.set(file);
        this.capturedDataUrl.set(URL.createObjectURL(file));
        this.awaitingPick.set(false);
    }

    onCaptionInput(event: Event): void {
        const ta = event.target as HTMLTextAreaElement;
        const cursor = ta.selectionStart ?? ta.value.length;
        const textBeforeCursor = ta.value.substring(0, cursor);
        const match = textBeforeCursor.match(/@(\w*)$/);
        if (match) {
            this._mentionAnchorIndex = cursor - match[0].length;
            this._mentionQuery = match[1];
            if (match[1].length >= 1) {
                this.userService.searchUsers(match[1]).then(r => this.mentionResults.set(r));
            } else {
                this.mentionResults.set([]);
            }
        } else {
            this._mentionAnchorIndex = -1;
            this._mentionQuery = '';
            this.mentionResults.set([]);
        }
    }

    selectMention(event: Event, user: UserPublicProfile): void {
        event.preventDefault();
        if (this._mentionAnchorIndex < 0 || !user.username) return;
        const current = this.caption();
        const before = current.substring(0, this._mentionAnchorIndex);
        const after = current.substring(this._mentionAnchorIndex + 1 + this._mentionQuery.length);
        this.caption.set(`${before}@${user.username} ${after}`);
        this._mentionAnchorIndex = -1;
        this._mentionQuery = '';
        this.mentionResults.set([]);
    }

    discard(): void {
        const url = this.capturedDataUrl();
        if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
        this.capturedDataUrl.set(null);
        this.capturedBlob.set(null);
        this.caption.set('');
        this.postError.set('');
        this.mentionResults.set([]);
        this.router.navigate(['/app/home'], { replaceUrl: true });
    }

    async publish(): Promise<void> {
        const uid = this.auth.uid;
        const blob = this.capturedBlob();
        if (!uid || !blob || this.posting()) return;
        this.posting.set(true);
        this.postError.set('');
        this.mentionResults.set([]);
        try {
            const user = this.auth.currentUser();
            const [imageUrl, profile] = await Promise.all([
                this.postService.uploadPostImage(uid, blob),
                this.userService.getPublicProfile(uid),
            ]);
            const captionText = this.caption();
            const postId = await this.postService.createPost(
                uid,
                profile?.username ?? user?.displayName ?? '',
                user?.photoURL ?? '',
                imageUrl,
                captionText
            );
            this._sendMentionNotifications(captionText, uid, postId, profile, user?.photoURL ?? '');
            const blobUrl = this.capturedDataUrl();
            if (blobUrl?.startsWith('blob:')) URL.revokeObjectURL(blobUrl);
            this.router.navigate(['/app/home'], { replaceUrl: true });
        } catch (e: any) {
            this.postError.set(e.message ?? 'Failed to post. Try again.');
            this.posting.set(false);
        }
    }

    private _sendMentionNotifications(
        captionText: string,
        authorUid: string,
        postId: string,
        profile: UserPublicProfile | null,
        photoURL: string
    ): void {
        const matches = captionText.match(/@(\w+)/g) ?? [];
        const usernames = [...new Set(matches.map(m => m.slice(1)))];
        for (const username of usernames) {
            this.userService.getUserByUsername(username).then(mentioned => {
                if (mentioned && mentioned.uid !== authorUid) {
                    this.notificationService.push(mentioned.uid, 'mention', {
                        fromUid: authorUid,
                        fromUsername: profile?.username ?? '',
                        fromPhotoURL: photoURL,
                        resourceId: postId,
                        body: 'mentioned you in a post.',
                    }).catch(() => { });
                }
            }).catch(() => { });
        }
    }
}
