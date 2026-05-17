import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { DropService } from '../../core/services/drop.service';
import { Drop } from '../../core/models/drop.model';

interface CalendarDay {
    date: Date;
    dateStr: string;
    drops: Drop[];
    isToday: boolean;
    isPast: boolean;
}

const BRANDS = ['all', 'Nike', 'Jordan', 'Adidas', 'New Balance', 'Yeezy', 'Puma', 'Reebok', 'Asics', 'Converse'];

@Component({
    selector: 'app-drops',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './drops.component.html',
    styleUrl: './drops.component.scss', changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DropsComponent implements OnInit {
    private dropService = inject(DropService);

    readonly brands = BRANDS;
    readonly weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    viewMonth = signal(new Date());
    drops = toSignal(this.dropService.upcoming(), { initialValue: [] as Drop[] });
    brandFilter = this.dropService.brandFilter;
    notifiedIds = this.dropService.notifiedIds;

    filteredDrops = computed(() => {
        const brand = this.brandFilter();
        const all = this.drops();
        return brand === 'all' ? all : all.filter((d) => d.brand === brand);
    });

    calendarDays = computed<CalendarDay[]>(() => {
        const year = this.viewMonth().getFullYear();
        const month = this.viewMonth().getMonth();
        const todayStr = new Date().toISOString().split('T')[0];
        const dropsMap = new Map<string, Drop[]>();

        for (const d of this.filteredDrops()) {
            const arr = dropsMap.get(d.releaseDate) ?? [];
            arr.push(d);
            dropsMap.set(d.releaseDate, arr);
        }

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const days: CalendarDay[] = [];

        // Pad start
        for (let i = 0; i < firstDay.getDay(); i++) {
            const d = new Date(year, month, 1 - (firstDay.getDay() - i));
            const ds = d.toISOString().split('T')[0];
            days.push({ date: d, dateStr: ds, drops: dropsMap.get(ds) ?? [], isToday: ds === todayStr, isPast: ds < todayStr });
        }

        for (let d = 1; d <= lastDay.getDate(); d++) {
            const date = new Date(year, month, d);
            const ds = date.toISOString().split('T')[0];
            days.push({ date, dateStr: ds, drops: dropsMap.get(ds) ?? [], isToday: ds === todayStr, isPast: ds < todayStr });
        }

        // Pad end to complete grid (6 rows × 7 = 42)
        while (days.length < 42) {
            const d = new Date(year, month + 1, days.length - lastDay.getDate() - firstDay.getDay() + 1);
            const ds = d.toISOString().split('T')[0];
            days.push({ date: d, dateStr: ds, drops: dropsMap.get(ds) ?? [], isToday: ds === todayStr, isPast: ds < todayStr });
        }

        return days;
    });

    upcomingList = computed<Drop[]>(() => {
        const today = new Date().toISOString().split('T')[0];
        const year = this.viewMonth().getFullYear();
        const month = this.viewMonth().getMonth();
        const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
        return this.filteredDrops().filter((d) => d.releaseDate >= today && d.releaseDate.startsWith(monthStr));
    });

    monthLabel = computed(() =>
        this.viewMonth().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    );

    ngOnInit(): void { }

    prevMonth(): void {
        this.viewMonth.update((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    }

    nextMonth(): void {
        this.viewMonth.update((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    }

    setBrand(brand: string): void {
        this.dropService.brandFilter.set(brand);
    }

    isCurrentMonth(day: CalendarDay): boolean {
        return day.date.getMonth() === this.viewMonth().getMonth();
    }

    isNotified(id: string): boolean {
        return this.notifiedIds().has(id);
    }

    async toggleNotify(drop: Drop, event: Event): Promise<void> {
        event.stopPropagation();
        if (this.isNotified(drop.id)) {
            await this.dropService.unnotify(drop.id);
        } else {
            await this.dropService.notify(drop.id);
        }
    }
}
