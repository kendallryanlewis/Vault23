import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { ShellComponent } from './shell/shell.component';
import { homeResolver } from './features/home/home.resolver';

export const routes: Routes = [
    { path: '', redirectTo: 'app/home', pathMatch: 'full' },
    {
        path: 'auth',
        children: [
            { path: 'login', loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent) },
            { path: 'register', loadComponent: () => import('./features/auth/register/register.component').then(m => m.RegisterComponent) },
            { path: 'forgot-password', loadComponent: () => import('./features/auth/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent) },
            { path: '', redirectTo: 'login', pathMatch: 'full' },
        ],
    },
    {
        path: 'app',
        component: ShellComponent,
        canActivate: [authGuard],
        children: [
            { path: 'home', loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent), resolve: { home: homeResolver } },
            { path: 'search', loadComponent: () => import('./features/search/search.component').then(m => m.SearchComponent) },
            { path: 'camera', loadComponent: () => import('./features/camera/camera.component').then(m => m.CameraComponent) },
            { path: 'drops', loadComponent: () => import('./features/drops/drops.component').then(m => m.DropsComponent) },
            { path: 'messages', loadComponent: () => import('./features/messages/messages.component').then(m => m.MessagesComponent) },
            { path: 'profile', loadComponent: () => import('./features/profile/profile.component').then(m => m.ProfileComponent) },
            { path: 'profile/settings', loadComponent: () => import('./features/profile/settings/settings.component').then(m => m.SettingsComponent) },
            { path: 'profile/help', loadComponent: () => import('./features/help/help.component').then(m => m.HelpComponent) },
            { path: 'profile/privacy-policy', loadComponent: () => import('./features/profile/privacy-policy/privacy-policy.component').then(m => m.PrivacyPolicyComponent) },
            { path: 'profile/followers', loadComponent: () => import('./features/profile/follow-list/follow-list.component').then(m => m.FollowListComponent), data: { type: 'followers' } },
            { path: 'profile/following', loadComponent: () => import('./features/profile/follow-list/follow-list.component').then(m => m.FollowListComponent), data: { type: 'following' } },
            { path: 'wishlist', loadComponent: () => import('./features/wishlist/wishlist.component').then(m => m.WishlistComponent) },
            { path: 'listings', loadComponent: () => import('./features/listings/listings.component').then(m => m.ListingsComponent) },
            { path: 'users/:uid', loadComponent: () => import('./features/user-profile/user-profile.component').then(m => m.UserProfileComponent) },
            { path: 'chat/:chatId', loadComponent: () => import('./features/chat/chat.component').then(m => m.ChatComponent) },
            { path: '', redirectTo: 'home', pathMatch: 'full' },
        ],
    },
    { path: '**', redirectTo: 'app/home' },
];
