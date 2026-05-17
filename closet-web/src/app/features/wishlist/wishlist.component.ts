import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { WishlistService } from '../../core/services/wishlist.service';
import { WishlistItem } from '../../core/models/wishlist-item.model';

@Component({
    selector: 'app-wishlist',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './wishlist.component.html',
    styleUrl: './wishlist.component.scss', changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WishlistComponent {
    private wishlistService = inject(WishlistService);

    items = toSignal(this.wishlistService.list(), { initialValue: [] as WishlistItem[] });

    async remove(id: string): Promise<void> {
        await this.wishlistService.remove(id);
    }
}
