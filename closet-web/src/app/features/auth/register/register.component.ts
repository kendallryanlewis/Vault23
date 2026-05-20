import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
    selector: 'app-register',
    standalone: true,
    imports: [FormsModule, RouterLink],
    templateUrl: './register.component.html',
    styleUrl: '../login/login.component.scss', changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterComponent {
    private auth = inject(AuthService);
    private router = inject(Router);

    displayName = '';
    username = '';
    email = '';
    password = '';
    loading = signal(false);
    error = signal('');

    async onRegister(): Promise<void> {
        this.loading.set(true);
        this.error.set('');
        try {
            await this.auth.register(this.email, this.password, this.displayName, this.username.toLowerCase().trim());
            this.router.navigate(['/app/home']);
        } catch (e: any) {
            this.error.set(e.message ?? 'Registration failed');
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
