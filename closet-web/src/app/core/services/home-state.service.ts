import { Injectable } from '@angular/core';

type HomeTab = 'home' | 'news' | 'feed';

@Injectable({ providedIn: 'root' })
export class HomeStateService {
    tab: HomeTab = 'home';
    feedScrollTop = 0;
}
