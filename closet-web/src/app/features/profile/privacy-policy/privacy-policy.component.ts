import { Component, inject, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { UiStateService } from '../../../core/services/ui-state.service';

@Component({
    selector: 'app-privacy-policy',
    standalone: true,
    imports: [],
    templateUrl: './privacy-policy.component.html',
    styleUrl: './privacy-policy.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyPolicyComponent implements OnInit, OnDestroy {
    private router = inject(Router);
    private uiState = inject(UiStateService);

    ngOnInit(): void {
        this.uiState.navHidden.set(true);
    }

    ngOnDestroy(): void {
        this.uiState.navHidden.set(false);
    }

    back(): void {
        this.router.navigate(['/app/profile/settings']);
    }
}
