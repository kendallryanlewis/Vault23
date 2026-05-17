import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ListingService } from '../../core/services/listing.service';
import { Listing, ListingType } from '../../core/models/listing.model';

type Filter = 'all' | ListingType;

@Component({
    selector: 'app-listings',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './listings.component.html',
    styleUrl: './listings.component.scss', changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListingsComponent {
    private listingService = inject(ListingService);

    filter = signal<Filter>('all');
    allListings = toSignal(this.listingService.allListings(), { initialValue: [] as Listing[] });

    filtered = computed(() => {
        const f = this.filter();
        return f === 'all' ? this.allListings() : this.allListings().filter((l) => l.type === f);
    });

    setFilter(f: Filter): void { this.filter.set(f); }
}
