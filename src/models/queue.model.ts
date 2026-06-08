// ────────────────────────────────────────────────
//  models/queue.model.ts  —  صف تصادفی و گزارش‌ها
// ────────────────────────────────────────────────

import { Schema, model, Document, Model, Types } from 'mongoose';
import { Gender, ReportStatus } from '@/types/enums';

// ════════════════════════════════════════════
//  RANDOM QUEUE
// ════════════════════════════════════════════

export interface IRandomQueue {
       telegramId: number;
       gender: Gender;
       enteredAt: Date;
}

export interface IRandomQueueDocument
       extends IRandomQueue, Document<Types.ObjectId> { }

export interface IRandomQueueModel extends Model<IRandomQueueDocument> {
       /** کاربر را به صف اضافه می‌کند؛ اگر قبلاً بوده آپدیت می‌کند */
       enqueue(telegramId: number, gender: Gender): Promise<IRandomQueueDocument>;
       /** کاربر را از صف خارج می‌کند */
       dequeue(telegramId: number): Promise<void>;
       /** اولین کاربر منتظر (غیر از خود کاربر) را پیدا می‌کند */
       findMatch(excludeId: number): Promise<IRandomQueueDocument | null>;
       /** آیا کاربر در صف است */
       isQueued(telegramId: number): Promise<boolean>;
}

// ─── Schema ───────────────────────────────────

const RandomQueueSchema = new Schema<IRandomQueueDocument, IRandomQueueModel>(
       {
              telegramId: { type: Number, required: true, unique: true },
              gender: { type: String, enum: Object.values(Gender), required: true },
              enteredAt: { type: Date, default: () => new Date() },
       },
       {
              collection: 'random_queue',
              timestamps: false,
              versionKey: false,
       },
);

RandomQueueSchema.index({ enteredAt: 1 });

// ─── Statics ──────────────────────────────────

RandomQueueSchema.statics.enqueue = function (
       telegramId: number,
       gender: Gender,
): Promise<IRandomQueueDocument> {
       return this.findOneAndUpdate(
              { telegramId },
              { telegramId, gender, enteredAt: new Date() },
              { upsert: true, new: true, setDefaultsOnInsert: true },
       ).exec();
};

RandomQueueSchema.statics.dequeue = function (
       telegramId: number,
): Promise<void> {
       return this.deleteOne({ telegramId }).exec() as unknown as Promise<void>;
};

RandomQueueSchema.statics.findMatch = function (
       excludeId: number,
): Promise<IRandomQueueDocument | null> {
       return this.findOne({ telegramId: { $ne: excludeId } })
              .sort({ enteredAt: 1 })
              .exec();
};

RandomQueueSchema.statics.isQueued = async function (
       telegramId: number,
): Promise<boolean> {
       const count = await this.countDocuments({ telegramId }).exec();
       return count > 0;
};

export const RandomQueueModel = model<IRandomQueueDocument, IRandomQueueModel>(
       'RandomQueue',
       RandomQueueSchema,
);

// ════════════════════════════════════════════
//  REPORT
// ════════════════════════════════════════════

export interface IReport {
       reporterId: number;
       reportedId: number;
       chatId?: string;
       reason: string;
       status: ReportStatus;
       createdAt: Date;
       reviewedAt?: Date;
       reviewedBy?: number;   // telegram_id ادمین
}

export interface IReportDocument extends IReport, Document<Types.ObjectId> {
       resolve(status: ReportStatus.Warned | ReportStatus.Banned | ReportStatus.Dismissed, adminId: number): Promise<void>;
}

export interface IReportModel extends Model<IReportDocument> {
       getPending(): Promise<IReportDocument[]>;
       countAgainstUser(reportedId: number): Promise<number>;
}

// ─── Schema ───────────────────────────────────

const ReportSchema = new Schema<IReportDocument, IReportModel>(
       {
              reporterId: { type: Number, required: true },
              reportedId: { type: Number, required: true },
              chatId: { type: String, default: null },
              reason: { type: String, required: true, maxlength: 500 },
              status: {
                     type: String,
                     enum: Object.values(ReportStatus),
                     default: ReportStatus.Pending,
              },
              createdAt: { type: Date, default: () => new Date() },
              reviewedAt: { type: Date, default: null },
              reviewedBy: { type: Number, default: null },
       },
       {
              collection: 'reports',
              timestamps: false,
              versionKey: false,
       },
);

ReportSchema.index({ reportedId: 1 });
ReportSchema.index({ status: 1, createdAt: -1 });

// ─── Instance Methods ─────────────────────────

ReportSchema.methods.resolve = async function (
       this: IReportDocument,
       status: ReportStatus.Warned | ReportStatus.Banned | ReportStatus.Dismissed,
       adminId: number,
): Promise<void> {
       this.status = status;
       this.reviewedAt = new Date();
       this.reviewedBy = adminId;
       await this.save();
};

// ─── Statics ──────────────────────────────────

ReportSchema.statics.getPending = function (): Promise<IReportDocument[]> {
       return this.find({ status: ReportStatus.Pending })
              .sort({ createdAt: -1 })
              .exec();
};

ReportSchema.statics.countAgainstUser = function (
       reportedId: number,
): Promise<number> {
       return this.countDocuments({ reportedId }).exec();
};

export const ReportModel = model<IReportDocument, IReportModel>(
       'Report',
       ReportSchema,
); 