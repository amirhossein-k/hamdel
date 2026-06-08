// ────────────────────────────────────────────────────
//  models/inbox.model.ts  —  پیام مستقیم و درخواست چت
// ────────────────────────────────────────────────────

import { Schema, model, Document, Model, Types } from 'mongoose';
import { ChatRequestStatus } from '@/types/enums';

// ════════════════════════════════════════════
//  DIRECT MESSAGE
// ════════════════════════════════════════════

export interface IDirectMessage {
       fromId: number;
       toId: number;
       content: string;
       isRead: boolean;
       sentAt: Date;
}

export interface IDirectMessageDocument
       extends IDirectMessage, Document<Types.ObjectId> { }

export interface IDirectMessageModel extends Model<IDirectMessageDocument> {
       getInbox(toId: number, limit?: number): Promise<IDirectMessageDocument[]>;
       markAllRead(toId: number, fromId: number): Promise<void>;
       unreadCount(toId: number): Promise<number>;
}

// ─── Schema ───────────────────────────────────

const DirectMessageSchema = new Schema<IDirectMessageDocument, IDirectMessageModel>(
       {
              fromId: { type: Number, required: true },
              toId: { type: Number, required: true },
              content: { type: String, required: true, maxlength: 2_000 },
              isRead: { type: Boolean, default: false },
              sentAt: { type: Date, default: () => new Date() },
       },
       {
              collection: 'direct_messages',
              timestamps: false,
              versionKey: false,
       },
);

DirectMessageSchema.index({ toId: 1, isRead: 1 });
DirectMessageSchema.index({ fromId: 1 });
DirectMessageSchema.index({ sentAt: -1 });

// ─── Statics ──────────────────────────────────

DirectMessageSchema.statics.getInbox = function (
       toId: number,
       limit = 50,
): Promise<IDirectMessageDocument[]> {
       return this.find({ toId })
              .sort({ sentAt: -1 })
              .limit(limit)
              .exec();
};

DirectMessageSchema.statics.markAllRead = function (
       toId: number,
       fromId: number,
): Promise<void> {
       return this.updateMany(
              { toId, fromId, isRead: false },
              { $set: { isRead: true } },
       ).exec() as unknown as Promise<void>;
};

DirectMessageSchema.statics.unreadCount = async function (
       toId: number,
): Promise<number> {
       return this.countDocuments({ toId, isRead: false }).exec();
};

export const DirectMessageModel = model<IDirectMessageDocument, IDirectMessageModel>(
       'DirectMessage',
       DirectMessageSchema,
);

// ════════════════════════════════════════════
//  CHAT REQUEST
// ════════════════════════════════════════════

export interface IChatRequest {
       fromId: number;
       toId: number;
       status: ChatRequestStatus;
       createdAt: Date;
       respondedAt?: Date;
}

export interface IChatRequestDocument
       extends IChatRequest, Document<Types.ObjectId> {
       accept(): Promise<void>;
       reject(): Promise<void>;
}

export interface IChatRequestModel extends Model<IChatRequestDocument> {
       getPending(toId: number): Promise<IChatRequestDocument[]>;
       hasPending(fromId: number, toId: number): Promise<boolean>;
}

// ─── Schema ───────────────────────────────────

const ChatRequestSchema = new Schema<IChatRequestDocument, IChatRequestModel>(
       {
              fromId: { type: Number, required: true },
              toId: { type: Number, required: true },
              status: {
                     type: String,
                     enum: Object.values(ChatRequestStatus),
                     default: ChatRequestStatus.Pending,
              },
              createdAt: { type: Date, default: () => new Date() },
              respondedAt: { type: Date, default: null },
       },
       {
              collection: 'chat_requests',
              timestamps: false,
              versionKey: false,
       },
);

ChatRequestSchema.index({ toId: 1, status: 1 });
ChatRequestSchema.index({ fromId: 1 });

// ─── Instance Methods ─────────────────────────

ChatRequestSchema.methods.accept = async function (
       this: IChatRequestDocument,
): Promise<void> {
       this.status = ChatRequestStatus.Accepted;
       this.respondedAt = new Date();
       await this.save();
};

ChatRequestSchema.methods.reject = async function (
       this: IChatRequestDocument,
): Promise<void> {
       this.status = ChatRequestStatus.Rejected;
       this.respondedAt = new Date();
       await this.save();
};

// ─── Statics ──────────────────────────────────

ChatRequestSchema.statics.getPending = function (
       toId: number,
): Promise<IChatRequestDocument[]> {
       return this.find({ toId, status: ChatRequestStatus.Pending })
              .sort({ createdAt: -1 })
              .exec();
};

ChatRequestSchema.statics.hasPending = async function (
       fromId: number,
       toId: number,
): Promise<boolean> {
       const count = await this.countDocuments({
              fromId,
              toId,
              status: ChatRequestStatus.Pending,
       }).exec();
       return count > 0;
};

export const ChatRequestModel = model<IChatRequestDocument, IChatRequestModel>(
       'ChatRequest',
       ChatRequestSchema,
);