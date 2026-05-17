export interface Message {
    id: string;
    senderId: string;
    text: string;
    imageUrl?: string;
    createdAt: Date;
    readBy: string[];
    unsent: boolean;
    deleted: boolean;
}

export interface Chat {
    id: string;
    participants: string[];
    lastMessage: string;
    lastMessageAt: Date;
    unreadFor: string[];
    isGroup?: boolean;
    groupName?: string;
    groupPhotoURL?: string;
}
