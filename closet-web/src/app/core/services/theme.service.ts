import { Injectable, inject, effect } from '@angular/core';
import { take } from 'rxjs';
import { SettingsService } from './settings.service';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class ThemeService {
    private settings = inject(SettingsService);
    private authService = inject(AuthService);
    private currentMode: 'dark' | 'light' | 'auto' = 'light';

    constructor() {
        const saved = localStorage.getItem('v23_theme') as 'dark' | 'light' | 'auto' | null;
        this.currentMode = saved ?? 'light';
        this._applyMode(this.currentMode);

        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
                if (this.currentMode === 'auto') {
                    this._applyMode('auto');
                }
            });
        }

        effect(() => {
            const user = this.authService.currentUser();
            if (!user) return;
            this.settings.getSettings().pipe(take(1)).subscribe((s) => {
                const bgUrl = s.bgPreset ? `/assets/backgrounds/${s.bgPreset}` : '';
                this.applyTheme(s.themeColor, bgUrl, s.themeMode ?? 'light');
            });
        });
    }

    init(): void { /* effect runs from constructor */ }

    applyTheme(color: string, bgImageUrl: string, mode: 'dark' | 'light' | 'auto' = 'light'): void {
        const root = document.documentElement;
        if (color) root.style.setProperty('--app-accent', color);
        if (bgImageUrl) {
            root.style.setProperty('--app-bg-image', `url('${bgImageUrl}')`);
            root.classList.add('has-bg-image');
        } else {
            root.style.removeProperty('--app-bg-image');
            root.classList.remove('has-bg-image');
        }
        this.setMode(mode);
    }

    setMode(mode: 'dark' | 'light' | 'auto'): void {
        this.currentMode = mode;
        this._applyMode(mode);
        localStorage.setItem('v23_theme', mode);
    }

    private _applyMode(mode: 'dark' | 'light' | 'auto'): void {
        if (mode === 'auto') {
            const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
            this._setMode(prefersDark ? 'dark' : 'light');
        } else {
            this._setMode(mode);
        }
    }

    private _setMode(mode: 'dark' | 'light'): void {
        document.documentElement.setAttribute('data-theme', mode);
    }
}
