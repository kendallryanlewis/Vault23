import { Component, ChangeDetectionStrategy, inject, OnInit, effect, DOCUMENT, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, map, of, take } from 'rxjs';
import { DropService } from '../core/services/drop.service';
import { UiStateService } from '../core/services/ui-state.service';
import { AuthService } from '../core/services/auth.service';
import { ChatService } from '../core/services/chat.service';
import { KeyboardService } from '../core/services/keyboard.service';
import { ThemeService } from '../core/services/theme.service';
import { CameraStateService } from '../core/services/camera-state.service';
import { SettingsService } from '../core/services/settings.service';
import { PushService } from '../core/services/push.service';
import { OnboardingComponent } from '../features/onboarding/onboarding.component';
import { TutorialOverlayComponent } from '../features/home/tutorial-overlay/tutorial-overlay.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, OnboardingComponent, TutorialOverlayComponent],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellComponent implements OnInit {
  private drops = inject(DropService);
  readonly uiState = inject(UiStateService);
  private auth = inject(AuthService);
  private chatService = inject(ChatService);
  readonly keyboard = inject(KeyboardService);
  private doc = inject(DOCUMENT);
  private theme = inject(ThemeService);
  private cameraState = inject(CameraStateService);
  private router = inject(Router);
  private settingsService = inject(SettingsService);
  private pushService = inject(PushService);

  showOnboarding = signal(false);
  postPickerOpen = signal(false);

  openPostPicker(): void {
    this.postPickerOpen.set(true);
  }

  hasUnread = toSignal(
    toObservable(this.auth.currentUser).pipe(
      switchMap(user => {
        if (!user) return of(false);
        return this.chatService.getMyChats(user.uid).pipe(
          map(chats => chats.some(c => (c.unreadFor ?? []).includes(user.uid)))
        );
      })
    ),
    { initialValue: false }
  );

  constructor() {
    effect(() => {
      const h = this.keyboard.keyboardHeight();
      this.doc.documentElement.style.setProperty('--keyboard-height', `${h}px`);
    });
  }

  ngOnInit(): void {
    this.drops.loadMyNotifications();
    this.settingsService.getSettings().pipe(take(1)).subscribe(s => {
      if (s.tutorialCompleted !== true) {
        this.showOnboarding.set(true);
      }
    });
    // Register APNs token listener as soon as the authenticated user is known.
    const uid = this.auth.currentUser()?.uid;
    if (uid) this.pushService.startListening(uid);
  }

  onCameraFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.cameraState.set(file);
    this.router.navigate(['/app/camera']);
  }
}

