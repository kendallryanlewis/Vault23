export type ListingType = 'sell' | 'trade';
export type ListingStatus = 'available' | 'pending' | 'sold';

export interface Listing {
    id: string;
    userId: string;
    userDisplayName: string;
    userPhotoUrl: string;
    sneakerId: string;
    sneakerName: string;
    brand: string;
    sku: string;
    imageUrl: string;
    type: ListingType;
    askingPrice: number;
    condition: string;
    size: string;
    quantity: number;
    description: string;
    status: ListingStatus;
    createdAt: Date;
}
