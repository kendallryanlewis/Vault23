import { Injectable, signal } from '@angular/core';
import { CatalogResult } from './search.models';
import { UserPublicProfile } from '../../core/models/user.model';

/**
 * Singleton that holds search UI state across navigations.
 * SearchComponent reads and writes through proxy getters so the template is unchanged.
 */
@Injectable({ providedIn: 'root' })
export class SearchStateService {
    readonly query = signal('');
    readonly catalogResults = signal<CatalogResult[]>([]);
    readonly searchLoading = signal(false);
    readonly page = signal(0);
    readonly totalPages = signal(1);
    readonly userResults = signal<UserPublicProfile[]>([]);
    /** API result cache — survives component destruction so navigating back costs zero extra API calls. */
    readonly resultCache = new Map<string, { data: any[]; nbPages: number }>();
}
