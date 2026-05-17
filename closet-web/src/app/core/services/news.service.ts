import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, catchError, of } from 'rxjs';
import { NewsArticle } from '../models/news.model';
import { environment } from '../../../environments/environment';

const SECTION_ORDER = ['Latest', 'Releases', 'Culture', 'Collabs', 'Resell'];

// Maps API category strings → section labels used in the feed
const CATEGORY_MAP: Record<string, string> = {
    releases: 'Releases',
    release: 'Releases',
    jordan: 'Releases',
    nike: 'Releases',
    adidas: 'Releases',
    culture: 'Culture',
    lifestyle: 'Culture',
    collabs: 'Collabs',
    collab: 'Collabs',
    collaboration: 'Collabs',
    resell: 'Resell',
    resale: 'Resell',
    market: 'Resell',
};

interface SneaksNewsItem {
    title: string;
    image: string;
    url: string;
    category?: string;
    publishedAt?: string;
    excerpt?: string;
    source?: string;
}

interface SneaksNewsResponse {
    success: boolean;
    data: SneaksNewsItem[];
}

@Injectable({ providedIn: 'root' })
export class NewsService {
    private http = inject(HttpClient);
    private readonly base = environment.sneaksApiUrl;

    readonly sectionOrder = SECTION_ORDER;

    fetchArticles(): Observable<NewsArticle[]> {
        return this.http.get<SneaksNewsResponse>(`${this.base}/news/latest`).pipe(
            map(res => this.mapArticles(res.data ?? [])),
            catchError(() => of(FALLBACK_ARTICLES)),
        );
    }

    private mapArticles(items: SneaksNewsItem[]): NewsArticle[] {
        return items.map((item, i) => ({
            id: String(i + 1),
            title: item.title,
            summary: item.excerpt ?? '',
            imageUrl: item.image,
            category: this.mapCategory(item.category),
            publishedAt: item.publishedAt ? new Date(item.publishedAt) : new Date(),
            sourceUrl: item.url,
        }));
    }

    private mapCategory(raw?: string): string {
        if (!raw) return 'Latest';
        const key = raw.toLowerCase().trim();
        return CATEGORY_MAP[key] ?? 'Latest';
    }
}

// Shown only if the local API is unreachable
const now = Date.now();
const mins = (n: number) => new Date(now - n * 60000);
const hrs = (n: number) => new Date(now - n * 3600000);

const FALLBACK_ARTICLES: NewsArticle[] = [
    { id: '1', category: 'Latest', publishedAt: mins(15), sourceUrl: '#', imageUrl: 'https://placehold.co/800x400/1C1C1E/F97316?text=Vault23+News', title: 'Best Under-$150 Pickups Right Now', summary: '' },
    { id: '2', category: 'Latest', publishedAt: mins(90), sourceUrl: '#', imageUrl: 'https://placehold.co/120x120/222/ccc?text=Tech', title: 'Nike React vs BOOST: Which Cushioning Wins in 2026?', summary: '' },
    { id: '3', category: 'Latest', publishedAt: hrs(2.5), sourceUrl: '#', imageUrl: 'https://placehold.co/120x120/222/ccc?text=Guide', title: 'How to Spot Fake Air Force 1s in Under 60 Seconds', summary: '' },
    { id: '4', category: 'Releases', publishedAt: mins(28), sourceUrl: '#', imageUrl: 'https://placehold.co/800x400/1a1a1a/F97316?text=Jordan+4+Bred', title: 'Air Jordan 4 Bred Reimagined Drops This Weekend', summary: '' },
    { id: '5', category: 'Releases', publishedAt: hrs(2), sourceUrl: '#', imageUrl: 'https://placehold.co/120x120/222/ccc?text=NB', title: 'New Balance 1906R Sales Surge Past $300M', summary: '' },
    { id: '6', category: 'Releases', publishedAt: hrs(3), sourceUrl: '#', imageUrl: 'https://placehold.co/120x120/222/ccc?text=Samba', title: 'Adidas Samba Retains Top Spot in Resell Market', summary: '' },
    { id: '7', category: 'Collabs', publishedAt: hrs(1), sourceUrl: '#', imageUrl: 'https://placehold.co/800x400/111/F97316?text=Travis+x+Nike', title: 'Travis Scott x Nike Unveil Cactus Jack Air Max 1', summary: '' },
    { id: '8', category: 'Collabs', publishedAt: hrs(5), sourceUrl: '#', imageUrl: 'https://placehold.co/120x120/222/ccc?text=Bembury', title: 'Salehe Bembury and New Balance Tease Yurt Colorway', summary: '' },
    { id: '9', category: 'Culture', publishedAt: hrs(4), sourceUrl: '#', imageUrl: 'https://placehold.co/800x400/0a0a0a/aaa?text=Culture', title: 'Sneaker Culture is Reshaping Luxury Fashion', summary: '' },
    { id: '10', category: 'Culture', publishedAt: hrs(6), sourceUrl: '#', imageUrl: 'https://placehold.co/120x120/222/ccc?text=GenZ', title: 'Gen Z Drives Record Sneaker Resale Volume in Q1 2026', summary: '' },
    { id: '11', category: 'Resell', publishedAt: mins(30), sourceUrl: '#', imageUrl: 'https://placehold.co/800x400/111827/F97316?text=StockX', title: 'StockX Reports 40% YoY Growth in Sneaker Trading Volume', summary: '' },
    { id: '12', category: 'Resell', publishedAt: hrs(7), sourceUrl: '#', imageUrl: 'https://placehold.co/120x120/222/ccc?text=GOAT', title: 'GOAT Introduces AI-Powered Authentication', summary: '' },
];

