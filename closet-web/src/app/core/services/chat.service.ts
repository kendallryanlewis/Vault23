import { Injectable, inject } from '@angular/core';
import {
    Firestore,
    collection,
    collectionData,
    doc,
    getDoc,
    setDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    orderBy,
    where,
    serverTimestamp,
    arrayUnion,
    arrayRemove,
} from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Message, Chat } from '../models/chat.model';

@Injectable({ providedIn: 'root' })
export class ChatService {
    private fs = inject(Firestore);
    private storage = inject(Storage);

    getChatId(uid1: string, uid2: string): string {
        return [uid1, uid2].sort().join('_');
    }

    async getOrCreateChat(uid1: string, uid2: string): Promise<string> {
        const chatId = this.getChatId(uid1, uid2);
        await setDoc(
            doc(this.fs, `chats/${chatId}`),
            {
                participants: [uid1, uid2].sort(),
                lastMessage: '',
                lastMessageAt: serverTimestamp(),
                unreadFor: [],
            },
            { merge: true }
        );
        return chatId;
    }

    async createGroupChat(creatorUid: string, participantUids: string[], groupName: string): Promise<string> {
        const chatRef = doc(collection(this.fs, 'chats'));
        const allParticipants = [...new Set([creatorUid, ...participantUids])];
        await setDoc(chatRef, {
            participants: allParticipants,
            lastMessage: '',
            lastMessageAt: serverTimestamp(),
            unreadFor: [],
            isGroup: true,
            groupName,
        });
        return chatRef.id;
    }

    getMyChats(uid: string): Observable<Chat[]> {
        return (collectionData(
            query(
                collection(this.fs, 'chats'),
                where('participants', 'array-contains', uid)
            ),
            { idField: 'id' }
        ) as Observable<Chat[]>).pipe(
            map(chats => chats.sort((a, b) => {
                const aTs = (a.lastMessageAt as any)?.toMillis?.() ?? 0;
                const bTs = (b.lastMessageAt as any)?.toMillis?.() ?? 0;
                return bTs - aTs;
            }))
        );
    }

    getMessages(chatId: string): Observable<Message[]> {
        return collectionData(
            query(
                collection(this.fs, `chats/${chatId}/messages`),
                orderBy('createdAt', 'asc')
            ),
            { idField: 'id' }
        ) as Observable<Message[]>;
    }

    async sendMessage(chatId: string, senderId: string, text: string, imageUrl?: string, allParticipants?: string[]): Promise<void> {
        let unreadUids: string[];
        if (allParticipants && allParticipants.length > 0) {
            unreadUids = allParticipants.filter(u => u !== senderId);
        } else {
            const otherUid = chatId.split('_').find(u => u !== senderId) ?? '';
            unreadUids = otherUid ? [otherUid] : [];
        }
        await addDoc(collection(this.fs, `chats/${chatId}/messages`), {
            senderId,
            text,
            ...(imageUrl ? { imageUrl } : {}),
            createdAt: serverTimestamp(),
            readBy: [senderId],
            unsent: false,
            deleted: false,
        });
        await setDoc(
            doc(this.fs, `chats/${chatId}`),
            {
                lastMessage: imageUrl && !text ? '📷 Image' : text,
                lastMessageAt: serverTimestamp(),
                ...(unreadUids.length > 0 ? { unreadFor: arrayUnion(...unreadUids) } : {}),
            } as any,
            { merge: true }
        );
    }

    async sendImage(chatId: string, senderId: string, file: File, caption = '', allParticipants?: string[]): Promise<void> {
        const storageRef = ref(this.storage, `chatImages/${chatId}/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        const imageUrl = await getDownloadURL(storageRef);
        await this.sendMessage(chatId, senderId, caption, imageUrl, allParticipants);
    }

    async unsendMessage(chatId: string, messageId: string): Promise<void> {
        await updateDoc(doc(this.fs, `chats/${chatId}/messages/${messageId}`), {
            unsent: true,
            text: '',
            imageUrl: null,
        } as any);
    }

    async deleteMessage(chatId: string, messageId: string): Promise<void> {
        await deleteDoc(doc(this.fs, `chats/${chatId}/messages/${messageId}`));
    }

    async markRead(chatId: string, uid: string): Promise<void> {
        try {
            await updateDoc(doc(this.fs, `chats/${chatId}`), {
                unreadFor: arrayRemove(uid),
            } as any);
        } catch {
            // Chat doc may not exist yet; no-op
        }
    }

    async getChatDoc(chatId: string): Promise<Chat | null> {
        const snap = await getDoc(doc(this.fs, `chats/${chatId}`));
        if (!snap.exists()) return null;
        return { id: snap.id, ...snap.data() } as Chat;
    }

    async blockUser(myUid: string, targetUid: string): Promise<void> {
        await setDoc(doc(this.fs, `users/${myUid}/blocked/${targetUid}`), { at: new Date().toISOString() });
    }

    async removeParticipant(chatId: string, uid: string): Promise<void> {
        await updateDoc(doc(this.fs, `chats/${chatId}`), { participants: arrayRemove(uid) } as any);
    }

    async leaveChat(chatId: string, uid: string): Promise<void> {
        const snap = await getDoc(doc(this.fs, `chats/${chatId}`));
        if (!snap.exists()) return;
        const remaining = ((snap.data()!['participants'] as string[]) ?? []).filter(p => p !== uid);
        if (remaining.length === 0) {
            await deleteDoc(doc(this.fs, `chats/${chatId}`));
        } else {
            await updateDoc(doc(this.fs, `chats/${chatId}`), { participants: remaining } as any);
        }
    }
}
