export interface Sneaker {
  id: string;
  userId: string;
  sku: string;
  brand: string;
  name: string;
  colorway: string;
  size: string;
  condition: 'DS' | 'VNDS' | 'Used';
  purchasePrice: number;
  purchaseDate: string;    // ISO date string
  imageUrl: string;
  notes: string;
  forSale: boolean;
  forTrade: boolean;
  addedAt: Date;
}

export interface SneakerPrice {
  sku: string;
  marketValue: number;
  low: number;
  high: number;
  changePercent: number;
  currency: string;
  fetchedAt: Date;
}
