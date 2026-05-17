export interface CatalogResult {
    id: string;
    name: string;
    brand: string;
    colorway: string;
    imageUrl: string;
    largeImageUrl: string;
    retailPrice: number | null;
    lowestPrice: number | null;
    styleId: string;
    sourceUrl: string;
    releaseDate: string | null;
}
