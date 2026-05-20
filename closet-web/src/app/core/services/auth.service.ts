import { Injectable, inject, signal, computed, NgZone } from '@angular/core';
import {
  Auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  OAuthProvider,
  signInWithPopup,
  signInWithCredential,
  onAuthStateChanged,
  updateProfile,
  deleteUser,
  User as FirebaseUser,
} from '@angular/fire/auth';
import { Firestore, doc, setDoc } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { UserService } from './user.service';
import { NativeBridgeService } from './native-bridge.service';

type NativeSocialProvider = 'apple';

interface NativeAuthResult {
  provider: NativeSocialProvider;
  requestId: string;
  idToken?: string;
  nonce?: string;
  error?: string;
}

const INITIAL_SETTINGS = {
  themeColor: '#F97316',
  themeMode: 'dark' as const,
  backgroundImageUrl: 'Background_1.png',
  bgPreset: 'Background_1.png',
  bio: '',
  username: '',
  location: '',
  shoeSize: '',
  tutorialCompleted: false,
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = inject(Auth);
  private fs = inject(Firestore);
  private router = inject(Router);
  private userService = inject(UserService);
  private zone = inject(NgZone);
  private bridge = inject(NativeBridgeService);

  readonly currentUser = signal<FirebaseUser | null>(null);
  readonly isLoggedIn = computed(() => this.currentUser() !== null);

  constructor() {
    onAuthStateChanged(this.auth, (user) => {
      this.zone.run(() => {
        this.currentUser.set(user);
        if (user) {
          // Only sync photoURL — username is written explicitly by register()
          // and by social login helpers to avoid race conditions.
          this.userService.upsertPublicProfile(user.uid, {
            uid: user.uid,
            photoURL: user.photoURL ?? '',
          });
        }
      });
    });
  }

  get uid(): string | null {
    return this.currentUser()?.uid ?? null;
  }

  async register(email: string, password: string, displayName: string, username: string): Promise<void> {
    const cred = await createUserWithEmailAndPassword(this.auth, email, password);
    await updateProfile(cred.user, { displayName });
    await Promise.all([
      this.userService.upsertPublicProfile(cred.user.uid, {
        uid: cred.user.uid,
        username,
        photoURL: '',
      }),
      setDoc(doc(this.fs, `userSettings/${cred.user.uid}`), { ...INITIAL_SETTINGS, username }),
    ]);
  }

  login(email: string, password: string): Promise<void> {
    return signInWithEmailAndPassword(this.auth, email, password).then(() => { });
  }

  async loginWithApple(): Promise<void> {
    const nativeHandled = await this.loginWithNativeSocial('apple');
    if (!nativeHandled) {
      const provider = new OAuthProvider('apple.com');
      provider.addScope('email');
      provider.addScope('name');
      const result = await signInWithPopup(this.auth, provider);
      await this.ensureSocialProfile(result.user);
    }
  }

  private async ensureSocialProfile(user: FirebaseUser): Promise<void> {
    const existing = await this.userService.getPublicProfile(user.uid);
    if (!existing?.username) {
      const username = (user.displayName ?? '').toLowerCase().replace(/\s+/g, '');
      await Promise.all([
        this.userService.upsertPublicProfile(user.uid, {
          uid: user.uid,
          username,
          photoURL: user.photoURL ?? '',
        }),
        setDoc(doc(this.fs, `userSettings/${user.uid}`), { ...INITIAL_SETTINGS, username }),
      ]);
    }
  }

  private async loginWithNativeSocial(provider: NativeSocialProvider): Promise<boolean> {
    if (!this.bridge.isNative) return false;

    const result = await this.requestNativeSocial(provider);
    if (result.error) throw new Error(result.error);

    if (!result.idToken) {
      throw new Error('Apple sign-in did not return an identity token');
    }
    const appleProvider = new OAuthProvider('apple.com');
    const credential = appleProvider.credential({
      idToken: result.idToken,
      rawNonce: result.nonce,
    });
    const authResult = await signInWithCredential(this.auth, credential);
    await this.ensureSocialProfile(authResult.user);
    return true;
  }

  private requestNativeSocial(provider: NativeSocialProvider): Promise<NativeAuthResult> {
    const requestId = `${provider}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const timeoutMs = 60_000;

    return new Promise<NativeAuthResult>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error(`${provider} sign-in timed out`));
      }, timeoutMs);

      const handler = (event: Event) => {
        const detail = (event as CustomEvent<NativeAuthResult>).detail;
        if (!detail || detail.provider !== provider || detail.requestId !== requestId) return;
        cleanup();
        resolve(detail);
      };

      const cleanup = () => {
        window.clearTimeout(timeout);
        window.removeEventListener('nativeAuthResult', handler);
      };

      window.addEventListener('nativeAuthResult', handler);
      this.bridge.send('socialAuth', { provider, requestId });
    });
  }

  async forgotPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(this.auth, email);
  }

  async updateUsername(name: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) return;
    await updateProfile(user, { displayName: name });
    this.currentUser.set({ ...user, displayName: name } as FirebaseUser);
    await this.userService.upsertPublicProfile(user.uid, { username: name });
  }

  async updatePhotoURL(url: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) return;
    await updateProfile(user, { photoURL: url });
    this.currentUser.set({ ...user, photoURL: url } as FirebaseUser);
    await this.userService.upsertPublicProfile(user.uid, { photoURL: url });
  }

  async logout(): Promise<void> {
    await signOut(this.auth);
    this.router.navigate(['/auth/login']);
  }

  async deleteAccount(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) return;
    await this.userService.deleteAccountData(user.uid);
    await deleteUser(user);
    this.router.navigate(['/auth/login']);
  }
}
