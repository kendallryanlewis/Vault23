export interface User {
    id: string;
    uid: string;
    displayName: string;
    username: string;
    email: string;
    photoUrl: string;
    bio: string;
    size: string;
    followerCount: number;
    followingCount: number;
    collectionCount: number;
    createdAt: Date;
}

export interface UserPublicProfile {
    uid: string;
    username: string;
    usernameLower?: string;
    photoURL: string;
    bio: string;
    location: string;
    shoeSize: string;
    backgroundImageUrl?: string;
    isStoreBrand?: boolean;
    storeDescription?: string;
    storePolicies?: string;
}

export interface UserSettings {
    themeColor: string;
    themeMode: 'dark' | 'light' | 'auto';
    backgroundImageUrl: string;
    bgPreset?: string;
    bio: string;
    username: string;
    location: string;
    shoeSize: string;
    tutorialCompleted?: boolean;
    isStoreBrand?: boolean;
    storeDescription?: string;
    storePolicies?: string;
}

export interface HomeDisplayItem {
    id: string;
    imageUrl: string;
    name: string;
    type: 'sneaker' | 'post' | 'user' | 'tutorial';
    brand?: string;
    sku?: string;
    colorway?: string;
    uid?: string;
}

export const TUTORIAL_GRID_ITEM: HomeDisplayItem = {
    id: '__tutorial__',
    type: 'tutorial',
    name: 'Welcome to Vault23',
    imageUrl: '/assets/backgrounds/Background_1.png',
};
