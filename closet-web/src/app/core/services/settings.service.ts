import { Injectable, inject } from '@angular/core';
import { Firestore, doc, docData, setDoc } from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { UserSettings } from '../models/user.model';
import { AuthService } from './auth.service';
import { UserService } from './user.service';

const DEFAULT_SETTINGS: UserSettings = {
    themeColor: '#F97316',
    themeMode: 'dark',
    backgroundImageUrl: 'Background_1.png',
    bgPreset: 'Background_1.png',
    bio: '',
    username: '',
    location: '',
    shoeSize: '',
    tutorialCompleted: false,
};

@Injectable({ providedIn: 'root' })
export class SettingsService {
    private fs = inject(Firestore);
    private storage = inject(Storage);
    private authService = inject(AuthService);
    private userService = inject(UserService);

    getSettings(): Observable<UserSettings> {
        const uid = this.authService.uid;
        if (!uid) return of(DEFAULT_SETTINGS);
        return docData(doc(this.fs, `userSettings/${uid}`)).pipe(
            map((data) => {
                const settings = (data ?? {}) as Partial<UserSettings>;
                // If the doc exists but tutorialCompleted is not explicitly set,
                // treat the user as having completed it (pre-existing account).
                return {
                    ...DEFAULT_SETTINGS,
                    ...settings,
                    tutorialCompleted: settings.tutorialCompleted ?? (data !== undefined),
                } as UserSettings;
            }),
            catchError(() => of({ ...DEFAULT_SETTINGS, tutorialCompleted: true }))
        );
    }

    async saveThemeColor(hex: string): Promise<void> {
        const uid = this.authService.uid;
        if (!uid) return;
        await setDoc(doc(this.fs, `userSettings/${uid}`), { themeColor: hex }, { merge: true });
    }

    async saveThemeMode(mode: 'dark' | 'light' | 'auto'): Promise<void> {
        const uid = this.authService.uid;
        if (!uid) return;
        await setDoc(doc(this.fs, `userSettings/${uid}`), { themeMode: mode }, { merge: true });
    }

    async saveBio(bio: string): Promise<void> {
        const uid = this.authService.uid;
        if (!uid) return;
        await setDoc(doc(this.fs, `userSettings/${uid}`), { bio }, { merge: true });
        await this.userService.upsertPublicProfile(uid, { bio });
    }

    async saveUsername(username: string): Promise<void> {
        const uid = this.authService.uid;
        if (!uid) return;
        await setDoc(doc(this.fs, `userSettings/${uid}`), { username }, { merge: true });
        await this.userService.upsertPublicProfile(uid, { username });
    }

    async saveLocation(location: string): Promise<void> {
        const uid = this.authService.uid;
        if (!uid) return;
        await setDoc(doc(this.fs, `userSettings/${uid}`), { location }, { merge: true });
        await this.userService.upsertPublicProfile(uid, { location });
    }

    async saveShoeSize(shoeSize: string): Promise<void> {
        const uid = this.authService.uid;
        if (!uid) return;
        await setDoc(doc(this.fs, `userSettings/${uid}`), { shoeSize }, { merge: true });
        await this.userService.upsertPublicProfile(uid, { shoeSize });
    }

    async savePresetBackground(preset: string | null): Promise<void> {
        const uid = this.authService.uid;
        if (!uid) return;
        await setDoc(doc(this.fs, `userSettings/${uid}`), { bgPreset: preset ?? '' }, { merge: true });
        // Presets are app-internal; do NOT write to users/{uid} public profile
    }

    async completeTutorial(): Promise<void> {
        const uid = this.authService.uid;
        if (!uid) return;
        await setDoc(doc(this.fs, `userSettings/${uid}`), { tutorialCompleted: true }, { merge: true });
    }

    async saveStoreBrand(enabled: boolean): Promise<void> {
        const uid = this.authService.uid;
        if (!uid) return;
        await setDoc(doc(this.fs, `userSettings/${uid}`), { isStoreBrand: enabled }, { merge: true });
        await this.userService.upsertPublicProfile(uid, { isStoreBrand: enabled });
    }

    async saveStoreDescription(desc: string): Promise<void> {
        const uid = this.authService.uid;
        if (!uid) return;
        await setDoc(doc(this.fs, `userSettings/${uid}`), { storeDescription: desc }, { merge: true });
        await this.userService.upsertPublicProfile(uid, { storeDescription: desc });
    }

    async saveStorePolicies(policies: string): Promise<void> {
        const uid = this.authService.uid;
        if (!uid) return;
        await setDoc(doc(this.fs, `userSettings/${uid}`), { storePolicies: policies }, { merge: true });
        await this.userService.upsertPublicProfile(uid, { storePolicies: policies });
    }

    async saveProfilePhoto(file: File): Promise<string> {
        const uid = this.authService.uid;
        if (!uid) throw new Error('Not authenticated');
        const storageRef = ref(this.storage, `userPhotos/${uid}`);
        await uploadBytes(storageRef, file);
        return getDownloadURL(storageRef);
    }

    async saveProfileWallpaper(file: File): Promise<string> {
        const uid = this.authService.uid;
        if (!uid) throw new Error('Not authenticated');
        const storageRef = ref(this.storage, `userWallpapers/${uid}`);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        await setDoc(doc(this.fs, `userSettings/${uid}`), { backgroundImageUrl: url }, { merge: true });
        await this.userService.upsertPublicProfile(uid, { backgroundImageUrl: url });
        return url;
    }

    async saveProfileBackground(url: string): Promise<void> {
        const uid = this.authService.uid;
        if (!uid) return;
        await this.userService.upsertPublicProfile(uid, { backgroundImageUrl: url });
    }
}
