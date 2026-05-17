import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
    selector: 'app-forgot-password',
    standalone: true,
    imports: [FormsModule, RouterLink],
    templateUrl: './forgot-password.component.html',
    styleUrl: '../login/login.component.scss',
})
export class ForgotPasswordComponent {
    private auth = inject(AuthService);

    email = '';
    loading = signal(false);
    error = signal('');
    sent = signal(false);

    async onSend(): Promise<void> {
        this.loading.set(true);
        this.error.set('');
        try {
            await this.auth.forgotPassword(this.email);
            this.sent.set(true);
        } catch (e: any) {
            this.error.set(e.message ?? 'Failed to send reset email');
        } finally {
            this.loading.set(false);
        }
    }
}
