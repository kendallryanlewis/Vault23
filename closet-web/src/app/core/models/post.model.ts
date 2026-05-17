export interface Post {
    id: string;
    userId: string;
    imageUrl: string;
    caption: string;
    likeCount: number;
    commentCount: number;
    likedBy: string[];
    createdAt: Date;
}

export interface PostComment {
    id: string;
    authorUid: string;
    authorName: string;
    authorPhotoURL: string;
    text: string;
    createdAt: Date;
    replyToId?: string;
    replyToName?: string;
}

/** Denormalized entry written to timeline/{uid}/feed/{postId} on fan-out */
export interface FeedPost {
    postId: string;
    authorUid: string;
    authorUsername: string;
    authorPhotoURL: string;
    imageUrl: string;
    caption: string;
    likeCount: number;
    commentCount: number;
    likedBy: string[];
    createdAt: Date;
}
