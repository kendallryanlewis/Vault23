export interface WishlistItem {
    id: string;
    userId: string;
    sku: string;
    brand: string;
    name: string;
    colorway: string;
    imageUrl: string;
    retailPrice: number;
    size: string;
    notes: string;
    addedAt: Date;
}
