import { Component, inject, signal, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { take } from 'rxjs';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/operators';
import { of } from 'rxjs';
import { SettingsService } from '../../../core/services/settings.service';
import { ThemeService } from '../../../core/services/theme.service';
import { AuthService } from '../../../core/services/auth.service';
import { UserService } from '../../../core/services/user.service';
import { UiStateService } from '../../../core/services/ui-state.service';

@Component({
    selector: 'app-settings',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './settings.component.html',
    styleUrl: './settings.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent implements OnInit, OnDestroy {
    private settingsService = inject(SettingsService);
    private themeService = inject(ThemeService);
    private router = inject(Router);
    private authService = inject(AuthService);
    private userService = inject(UserService);
    private uiState = inject(UiStateService);

    // ── Draft signals (not applied until Save) ────────────────────────────
    themeColor = signal('#F97316');
    themeMode = signal<'dark' | 'light' | 'auto'>('dark');
    readonly bgPresets = ['', 'Background_1.png', 'Background_2.jpg', 'Background_3.png', 'Background_4.jpg', 'Background_5.png', 'Background_6.png', 'Background_7.png', 'Background_8.jpg'];
    bgPresetIdx = signal(0);
    bio = signal('');
    username = signal('');
    location = signal('');
    shoeSize = signal('');
    photoPreview = signal<string | null>(null);
    saving = signal(false);
    error = signal('');
    success = signal('');
    isStoreBrand = signal(false);
    storeDescription = signal('');
    storePolicies = signal('');
    wallpaperPreview = signal<string | null>(null);
    wallpaperUploading = signal(false);
    confirmingDelete = signal(false);
    deleting = signal(false);
    deleteError = signal('');
    hiddenUsers = toSignal(
        toObservable(this.authService.currentUser).pipe(
            switchMap(u => u
                ? this.userService.getHiddenUsers$(u.uid)
                : of([] as { uid: string; username: string; photoURL: string; hiddenAt: string }[]))
        ),
        { initialValue: [] as { uid: string; username: string; photoURL: string; hiddenAt: string }[] }
    );

    readonly presetColors = [
        '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16',
        '#22C55E', '#14B8A6', '#06B6D4', '#3B82F6', '#6366F1',
        '#8B5CF6', '#A855F7', '#EC4899', '#F43F5E', '#FB923C',
        '#64748B', '#10B981', '#0EA5E9', '#E879F9',
    ];

    activeBackground(): string {
        const preset = this.bgPresets[this.bgPresetIdx()];
        return preset ? `/assets/backgrounds/${preset}` : '';
    }

    ngOnInit(): void {
        this.uiState.navHidden.set(true);
        const u = this.authService.currentUser();
        if (u) {
            this.username.set(u.displayName ?? '');
            if (u.photoURL) this.photoPreview.set(u.photoURL);
        }
        this.settingsService.getSettings().pipe(take(1)).subscribe((s) => {
            if (s.themeColor) this.themeColor.set(s.themeColor);
            if (s.themeMode) this.themeMode.set(s.themeMode);
            if (s.bgPreset) {
                const idx = this.bgPresets.indexOf(s.bgPreset);
                if (idx >= 0) this.bgPresetIdx.set(idx);
            }
            this.bio.set(s.bio ?? '');
            if (s.username) this.username.set(s.username);
            this.location.set(s.location ?? '');
            this.shoeSize.set(s.shoeSize ?? '');
            this.isStoreBrand.set(s.isStoreBrand ?? false);
            this.storeDescription.set(s.storeDescription ?? '');
            this.storePolicies.set(s.storePolicies ?? '');
            if (s.backgroundImageUrl?.startsWith('http')) {
                this.wallpaperPreview.set(s.backgroundImageUrl);
            }
        });
    }

    // Draft-only setters — no live apply
    selectColor(c: string): void {
        this.themeColor.set(c);
    }

    selectMode(mode: 'dark' | 'light' | 'auto'): void {
        this.themeMode.set(mode);
    }

    cycleBg(dir: 1 | -1): void {
        const newIdx = (this.bgPresetIdx() + dir + this.bgPresets.length) % this.bgPresets.length;
        this.bgPresetIdx.set(newIdx);
    }

    onAvatarChange(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => this.photoPreview.set(reader.result as string);
        reader.readAsDataURL(file);
        this.uploadAvatar(file);
    }

    onWallpaperChange(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => this.wallpaperPreview.set(reader.result as string);
        reader.readAsDataURL(file);
        this.uploadWallpaper(file);
    }

    private async uploadWallpaper(file: File): Promise<void> {
        this.wallpaperUploading.set(true);
        this.error.set('');
        try {
            const url = await this.settingsService.saveProfileWallpaper(file);
            this.wallpaperPreview.set(url);
        } catch (e: any) {
            this.error.set(e.message ?? 'Failed to upload wallpaper');
        } finally {
            this.wallpaperUploading.set(false);
        }
    }

    clearWallpaper(): void {
        this.wallpaperPreview.set(null);
        const preset = this.bgPresets[this.bgPresetIdx()];
        const fallbackUrl = preset ? `/assets/backgrounds/${preset}` : '';
        this.settingsService.saveProfileBackground(fallbackUrl).catch(() => { });
    }

    private async uploadAvatar(file: File): Promise<void> {
        this.saving.set(true);
        this.error.set('');
        try {
            const url = await this.settingsService.saveProfilePhoto(file);
            this.photoPreview.set(url);
            await this.authService.updatePhotoURL(url);
            this.success.set('Profile photo updated.');
        } catch (e: any) {
            this.error.set(e.message ?? 'Failed to upload photo');
        } finally {
            this.saving.set(false);
        }
    }

    async saveAll(): Promise<void> {
        const name = this.username().trim();
        const preset = this.bgPresets[this.bgPresetIdx()];
        this.saving.set(true);
        this.error.set('');
        this.success.set('');
        try {
            await Promise.all([
                name ? this.authService.updateUsername(name) : Promise.resolve(),
                name ? this.settingsService.saveUsername(name) : Promise.resolve(),
                this.settingsService.saveBio(this.bio()),
                this.settingsService.saveLocation(this.location()),
                this.settingsService.saveShoeSize(this.shoeSize()),
                this.settingsService.saveThemeColor(this.themeColor()),
                this.settingsService.saveThemeMode(this.themeMode()),
                this.settingsService.savePresetBackground(preset || null),
                this.settingsService.saveStoreBrand(this.isStoreBrand()),
                this.settingsService.saveStoreDescription(this.storeDescription()),
                this.settingsService.saveStorePolicies(this.storePolicies()),
            ]);
            // Sync profile background: custom wallpaper takes priority, else use preset
            if (!this.wallpaperPreview()?.startsWith('http')) {
                const bgUrl = preset ? `/assets/backgrounds/${preset}` : '';
                await this.settingsService.saveProfileBackground(bgUrl);
            }
            // Apply theme only after successful save
            this.themeService.applyTheme(this.themeColor(), this.activeBackground(), this.themeMode());
            this.themeService.setMode(this.themeMode());
            this.success.set('Settings saved.');
        } catch (e: any) {
            this.error.set(e.message ?? 'Failed to save');
        } finally {
            this.saving.set(false);
        }
    }

    ngOnDestroy(): void {
        this.uiState.navHidden.set(false);
    }

    back(): void {
        this.router.navigate(['/app/profile']);
    }

    goHelp(): void {
        this.router.navigate(['/app/profile/help']);
    }

    goPrivacyPolicy(): void {
        this.router.navigate(['/app/profile/privacy-policy']);
    }

    async logout(): Promise<void> {
        await this.authService.logout();
    }

    async deleteAccount(): Promise<void> {
        if (!this.confirmingDelete()) {
            this.confirmingDelete.set(true);
            return;
        }
        this.deleting.set(true);
        this.deleteError.set('');
        try {
            await this.authService.deleteAccount();
        } catch (e: any) {
            const code = e?.code ?? '';
            if (code === 'auth/requires-recent-login') {
                this.deleteError.set('Please sign out and sign back in, then try again.');
            } else {
                this.deleteError.set(e.message ?? 'Failed to delete account.');
            }
            this.confirmingDelete.set(false);
        } finally {
            this.deleting.set(false);
        }
    }

    async unhideUser(authorUid: string): Promise<void> {
        const uid = this.authService.uid;
        if (!uid) return;
        await this.userService.unhideUser(uid, authorUid);
    }
}
