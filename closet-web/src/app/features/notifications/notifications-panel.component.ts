import { Component, ChangeDetectionStrategy, inject, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, of } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';
import { NotificationService } from '../../core/services/notification.service';
import { AuthService } from '../../core/services/auth.service';
import { AppNotification } from '../../core/models/notification.model';
import { Router } from '@angular/router';

@Component({
    selector: 'app-notifications-panel',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './notifications-panel.component.html',
    styleUrl: './notifications-panel.component.scss', changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsPanelComponent {
    private notifService = inject(NotificationService);
    readonly authService = inject(AuthService);
    private router = inject(Router);

    readonly closed = output<void>();

    notifications = toSignal(
        toObservable(this.authService.currentUser).pipe(
            switchMap(user =>
                user ? this.notifService.getNotifications(user.uid) : of([] as AppNotification[])
            )
        ),
        { initialValue: [] as AppNotification[] }
    );

    unreadCount = computed(() => this.notifications().filter(n => !n.read).length);

    private get uid(): string | null {
        return this.authService.uid;
    }

    iconFor(type: AppNotification['type']): string {
        switch (type) {
            case 'follow_accepted': return 'person_add';
            case 'like': return 'favorite';
            case 'comment': return 'chat_bubble';
            case 'message': return 'mail';
            case 'mention': return 'alternate_email';
            case 'news': return 'newspaper';
            default: return 'notifications';
        }
    }

    labelFor(type: AppNotification['type']): string {
        switch (type) {
            case 'follow_accepted': return 'New follower';
            case 'like': return 'Liked your post';
            case 'comment': return 'Commented';
            case 'message': return 'New message';
            case 'mention': return 'Mentioned you';
            case 'news': return 'News';
            default: return '';
        }
    }

    timeAgo(date: any): string {
        if (!date) return '';
        let d: Date;
        if (typeof date?.toDate === 'function') d = date.toDate();
        else d = new Date(date);
        if (isNaN(d.getTime())) return '';
        const mins = Math.floor((Date.now() - d.getTime()) / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return mins + 'm ago';
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return hrs + 'h ago';
        return Math.floor(hrs / 24) + 'd ago';
    }

    async onNotifClick(notif: AppNotification): Promise<void> {
        const uid = this.uid;
        if (!uid) return;
        if (!notif.read) await this.notifService.markRead(uid, notif.id);
        if (notif.type === 'message' && notif.resourceId) {
            this.closed.emit();
            this.router.navigate(['/app/messages', notif.resourceId]);
        } else if (notif.fromUid) {
            this.closed.emit();
            this.router.navigate(['/app/users', notif.fromUid]);
        }
    }

    async dismiss(notif: AppNotification): Promise<void> {
        const uid = this.uid;
        if (!uid) return;
        await this.notifService.dismiss(uid, notif.id);
    }

    async markAllRead(): Promise<void> {
        const uid = this.uid;
        if (!uid) return;
        await this.notifService.markAllRead(uid);
    }

    close(): void {
        this.closed.emit();
    }
}
