// ─────────────────────────────────────────────
//  models/chat.model.ts  —  مدل چت و پیام‌ها
// ─────────────────────────────────────────────

import { Schema, model, Document, Model, Types } from 'mongoose';
import { ChatType, ChatStatus, MessageType } from '@/types/enums';

// ════════════════════════════════════════════
//  CHAT
// ════════════════════════════════════════════

export interface IChat {
       chatId: string;           // UUID یکتا
       participants: [number, number]; // [telegramId_1, telegramId_2]
       type: ChatType;
       status: ChatStatus;
       startedAt: Date;
       closedAt?: Date;
       closedBy?: number;           // telegramId کسی که چت را بست
}

export interface IChatDocument extends IChat, Document<Types.ObjectId> {
       close(closedBy: number): Promise<void>;
       getPartnerId(myTelegramId: number): number;
}

export interface IChatModel extends Model<IChatDocument> {
       findActiveByChatId(chatId: string): Promise<IChatDocument | null>;
       findActiveByParticipant(telegramId: number): Promise<IChatDocument | null>;
       hasActiveChat(id1: number, id2: number): Promise<boolean>;
}

// ─── Schema ───────────────────────────────────

const ChatSchema = new Schema<IChatDocument, IChatModel>(
       {
              chatId: { type: String, required: true, unique: true, index: true },
              participants: {
                     type: [Number],
                     validate: {
                            validator: (v: number[]) => v.length === 2,
                            message: 'participants must contain exactly 2 telegram IDs',
                     },
                     required: true,
              },
              type: { type: String, enum: Object.values(ChatType), required: true },
              status: { type: String, enum: Object.values(ChatStatus), default: ChatStatus.Active },
              startedAt: { type: Date, default: () => new Date() },
              closedAt: { type: Date, default: null },
              closedBy: { type: Number, default: null },
       },
       {
              collection: 'chats',
              timestamps: false,
              versionKey: false,
       },
);

ChatSchema.index({ participants: 1 });
ChatSchema.index({ status: 1, startedAt: -1 });

// ─── Instance Methods ─────────────────────────

ChatSchema.methods.close = async function (
       this: IChatDocument,
       closedBy: number,
): Promise<void> {
       this.status = ChatStatus.Closed;
       this.closedAt = new Date();
       this.closedBy = closedBy;
       await this.save();
};

ChatSchema.methods.getPartnerId = function (
       this: IChatDocument,
       myTelegramId: number,
): number {
       return this.participants.find((id) => id !== myTelegramId) as number;
};

// ─── Static Methods ───────────────────────────

ChatSchema.statics.findActiveByChatId = function (
       chatId: string,
): Promise<IChatDocument | null> {
       return this.findOne({ chatId, status: ChatStatus.Active }).exec();
};

ChatSchema.statics.findActiveByParticipant = function (
       telegramId: number,
): Promise<IChatDocument | null> {
       return this.findOne({
              participants: telegramId,
              status: ChatStatus.Active,
       }).exec();
};

ChatSchema.statics.hasActiveChat = async function (
       id1: number,
       id2: number,
): Promise<boolean> {
       const count = await this.countDocuments({
              participants: { $all: [id1, id2] },
              status: ChatStatus.Active,
       }).exec();
       return count > 0;
};

export const ChatModel = model<IChatDocument, IChatModel>('Chat', ChatSchema);

// ════════════════════════════════════════════
//  MESSAGE
// ════════════════════════════════════════════

export interface IMessage {
       chatId: string;
       senderId: number;
       type: MessageType;
       content: string;   // متن پیام یا file_id
       adminCopySent: boolean;  // فقط برای عکس — ارسال مخفی به ادمین
       sentAt: Date;
}

export interface IMessageDocument extends IMessage, Document<Types.ObjectId> { }

export interface IMessageModel extends Model<IMessageDocument> {
       findByChatId(chatId: string, limit?: number): Promise<IMessageDocument[]>;
}

// ─── Schema ───────────────────────────────────

const MessageSchema = new Schema<IMessageDocument, IMessageModel>(
       {
              chatId: { type: String, required: true, index: true },
              senderId: { type: Number, required: true },
              type: { type: String, enum: Object.values(MessageType), required: true },
              content: { type: String, required: true },
              adminCopySent: { type: Boolean, default: false },
              sentAt: { type: Date, default: () => new Date() },
       },
       {
              collection: 'messages',
              timestamps: false,
              versionKey: false,
       },
);

MessageSchema.index({ chatId: 1, sentAt: 1 });
MessageSchema.index({ senderId: 1 });

// ─── Static Methods ───────────────────────────

MessageSchema.statics.findByChatId = function (
       chatId: string,
       limit = 100,
): Promise<IMessageDocument[]> {
       return this.find({ chatId })
              .sort({ sentAt: 1 })
              .limit(limit)
              .exec();
};

export const MessageModel = model<IMessageDocument, IMessageModel>(
       'Message',
       MessageSchema,
);