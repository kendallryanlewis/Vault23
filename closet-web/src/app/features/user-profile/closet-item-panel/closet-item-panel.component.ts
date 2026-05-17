import {
    Component,
    ChangeDetectionStrategy,
    OnInit,
    AfterViewInit,
    OnDestroy,
    input,
    output,
    signal,
    computed,
    ElementRef,
    inject,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Sneaker } from '../../../core/models/sneaker.model';

@Component({
    selector: 'app-closet-item-panel',
    standalone: true,
    imports: [DecimalPipe],
    templateUrl: './closet-item-panel.component.html',
    styleUrl: './closet-item-panel.component.scss', changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClosetItemPanelComponent implements OnInit, AfterViewInit, OnDestroy {
    sneakers = input.required<Sneaker[]>();
    startIndex = input.required<number>();
    closed = output<void>();
    private el = inject(ElementRef);

    private currentIndex = signal(0);

    readonly sneaker = computed(() => {
        const items = this.sneakers();
        const idx = this.currentIndex();
        return items[idx] ?? null;
    });

    readonly hasPrev = computed(() => this.currentIndex() > 0);
    readonly hasNext = computed(() => this.currentIndex() < this.sneakers().length - 1);

    private _touchStartX = 0;

    private readonly _onTouchStart = (e: TouchEvent): void => {
        this._touchStartX = e.touches[0].clientX;
    };

    private readonly _onTouchEnd = (e: TouchEvent): void => {
        const delta = e.changedTouches[0].clientX - this._touchStartX;
        if (delta < -50) this.next();
        else if (delta > 50) this.prev();
    };

    ngOnInit(): void {
        this.currentIndex.set(this.startIndex());
    }

    ngAfterViewInit(): void {
        const host = this.el.nativeElement as HTMLElement;
        host.addEventListener('touchstart', this._onTouchStart as EventListener, { passive: true });
        host.addEventListener('touchend', this._onTouchEnd as EventListener, { passive: true });
    }

    ngOnDestroy(): void {
        const host = this.el.nativeElement as HTMLElement;
        host.removeEventListener('touchstart', this._onTouchStart as EventListener);
        host.removeEventListener('touchend', this._onTouchEnd as EventListener);
    }

    prev(): void {
        if (this.hasPrev()) this.currentIndex.update(i => i - 1);
    }

    next(): void {
        if (this.hasNext()) this.currentIndex.update(i => i + 1);
    }

    close(): void {
        this.closed.emit();
    }
}