export interface NewsArticle {
    id: string;
    title: string;
    summary: string;
    imageUrl: string;
    category: string;
    publishedAt: Date;
    sourceUrl: string;
}

export interface NewsSection {
    label: string;
    hero: NewsArticle;
    rows: NewsArticle[];
}
