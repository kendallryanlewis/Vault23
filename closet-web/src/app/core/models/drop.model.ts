export interface Drop {
    id: string;
    brand: string;
    name: string;
    sku: string;
    colorway: string;
    imageUrl: string;
    retailPrice: number;
    releaseDate: string;   // ISO date string YYYY-MM-DD
    releaseTime: string;   // e.g. '10:00 AM ET'
    where: string;         // e.g. 'Nike SNKRS, Foot Locker'
    description: string;
    isSoldOut: boolean;
}

export interface DropNotification {
    dropId: string;
    createdAt: Date;
}
