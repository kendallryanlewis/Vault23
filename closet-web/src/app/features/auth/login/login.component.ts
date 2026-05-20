import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { Router } from '@angular/router';

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [FormsModule, RouterLink],
    templateUrl: './login.component.html',
    styleUrl: './login.component.scss', changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
    private auth = inject(AuthService);
    private router = inject(Router);

    email = '';
    password = '';
    loading = signal(false);
    error = signal('');

    async onLogin(): Promise<void> {
        this.loading.set(true);
        this.error.set('');
        try {
            await this.auth.login(this.email, this.password);
            this.router.navigate(['/app/home']);
        } catch (e: any) {
            this.error.set(e.message ?? 'Login failed');
        } finally {
            this.loading.set(false);
        }
    }

    async onApple(): Promise<void> {
        this.loading.set(true);
        this.error.set('');
        try {
            await this.auth.loginWithApple();
            this.router.navigate(['/app/home']);
        } catch (e: any) {
            this.error.set(e.message ?? 'Apple sign-in failed');
        } finally {
            this.loading.set(false);
        }
    }
}
