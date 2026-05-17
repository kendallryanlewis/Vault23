export type NotificationType =
    | 'follow_accepted'
    | 'like'
    | 'comment'
    | 'message'
    | 'mention'
    | 'news';

export interface AppNotification {
    id: string;
    type: NotificationType;
    /** UID of the user who triggered this notification (null for news) */
    fromUid?: string;
    fromUsername?: string;
    fromPhotoURL?: string;
    /** Relevant resource ID: postId, chatId, articleUrl, etc. */
    resourceId?: string;
    /** Short human-readable text */
    body: string;
    read: boolean;
    createdAt: any; // Firestore Timestamp or Date
}
