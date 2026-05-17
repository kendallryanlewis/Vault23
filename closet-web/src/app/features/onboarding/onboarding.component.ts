import { Component, ChangeDetectionStrategy, inject, signal, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../core/services/settings.service';
import { AuthService } from '../../core/services/auth.service';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';

interface Step {
    id: number;
    title: string;
    subtitle: string;
}

const STEPS: Step[] = [
    { id: 0, title: 'Welcome to Vault23', subtitle: 'Your personal sneaker vault.' },
    { id: 1, title: 'Add a Profile Photo', subtitle: 'Put a face to the drip.' },
    { id: 2, title: 'Set Your Shoe Size', subtitle: 'We\'ll use this across the app.' },
    { id: 3, title: 'How It Works', subtitle: 'A quick look at what you can do.' },
    { id: 4, title: 'You\'re In.', subtitle: 'The vault is open.' },
];

@Component({
    selector: 'app-onboarding',
    standalone: true,
    imports: [FormsModule],
    templateUrl: './onboarding.component.html',
    styleUrl: './onboarding.component.scss', changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingComponent {
    private settingsService = inject(SettingsService);
    private authService = inject(AuthService);
    private storage = inject(Storage);

    readonly done = output<void>();

    readonly steps = STEPS;
    currentStep = signal(0);
    uploading = signal(false);
    saving = signal(false);
    photoPreview = signal<string | null>(null);
    shoeSize = signal('');
    error = signal('');

    get photoURL(): string | null {
        return this.authService.currentUser()?.photoURL ?? null;
    }

    next(): void {
        if (this.currentStep() < this.steps.length - 1) {
            this.currentStep.update(s => s + 1);
        }
    }

    isLastStep(): boolean {
        return this.currentStep() === this.steps.length - 1;
    }

    onAvatarChange(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        input.value = '';
        const reader = new FileReader();
        reader.onload = () => this.photoPreview.set(reader.result as string);
        reader.readAsDataURL(file);
        this.uploadPhoto(file);
    }

    private async uploadPhoto(file: File): Promise<void> {
        const uid = this.authService.uid;
        if (!uid) return;
        this.uploading.set(true);
        this.error.set('');
        try {
            const storageRef = ref(this.storage, `userPhotos/${uid}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            await this.authService.updatePhotoURL(url);
            this.photoPreview.set(url);
        } catch {
            this.error.set('Photo upload failed. You can update it later in Settings.');
        } finally {
            this.uploading.set(false);
        }
    }

    async saveShoeSizeAndContinue(): Promise<void> {
        const size = this.shoeSize().trim();
        if (!size) {
            this.next();
            return;
        }
        this.saving.set(true);
        try {
            await this.settingsService.saveShoeSize(size);
        } finally {
            this.saving.set(false);
            this.next();
        }
    }

    async finish(): Promise<void> {
        this.saving.set(true);
        try {
            await this.settingsService.completeTutorial();
        } finally {
            this.saving.set(false);
            this.done.emit();
        }
    }
}
