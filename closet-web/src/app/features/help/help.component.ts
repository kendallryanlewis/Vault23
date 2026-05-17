import { Component, inject, signal, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { UiStateService } from '../../core/services/ui-state.service';

@Component({
    selector: 'app-help',
    standalone: true,
    imports: [],
    templateUrl: './help.component.html',
    styleUrl: './help.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpComponent implements OnInit, OnDestroy {
    private router = inject(Router);
    private uiState = inject(UiStateService);

    openSection = signal<string | null>(null);

    ngOnInit(): void {
        this.uiState.navHidden.set(true);
    }

    ngOnDestroy(): void {
        this.uiState.navHidden.set(false);
    }

    toggle(id: string): void {
        this.openSection.update(cur => (cur === id ? null : id));
    }

    back(): void {
        this.router.navigate(['/app/profile/settings']);
    }
}
