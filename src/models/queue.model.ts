// ────────────────────────────────────────────────
//  models/queue.model.ts  —  صف تصادفی و گزارش‌ها
// ────────────────────────────────────────────────

import { Schema, model, Document, Model, Types } from 'mongoose';
import { Gender, ReportStatus, TargetGender, SearchMode } from '@/types/enums';

// ════════════════════════════════════════════
//  RANDOM QUEUE
// ════════════════════════════════════════════

export interface IRandomQueue {
       telegramId: number;
       gender: Gender;
       targetGender: TargetGender;   // جنسیت مورد نظر
       searchMode: SearchMode;        // نوع جستجو
       province?: string;             // استان (برای هم‌استانی)
       age?: number;                  // سن (برای هم‌سن)
       location?: { type: 'Point'; coordinates: [number, number] }; // موقعیت (نزدیکی)
       enteredAt: Date;
}

export interface IRandomQueueDocument
       extends IRandomQueue, Document<Types.ObjectId> { }

export interface IRandomQueueModel extends Model<IRandomQueueDocument> {
       /** کاربر را به صف اضافه می‌کند؛ اگر قبلاً بوده آپدیت می‌کند */
       enqueue(
              telegramId: number,
              gender: Gender,
              targetGender: TargetGender,
              searchMode: SearchMode,
              extra?: { province?: string; age?: number; location?: { type: 'Point'; coordinates: [number, number] } }
       ): Promise<IRandomQueueDocument>;
       /** کاربر را از صف خارج می‌کند */
       dequeue(telegramId: number): Promise<void>;
       /** مچ مناسب را با توجه به searchMode پیدا می‌کند */
       findMatch(excludeId: number, entry: IRandomQueueDocument): Promise<IRandomQueueDocument | null>;
       /** آیا کاربر در صف است */
       isQueued(telegramId: number): Promise<boolean>;
}

// ─── Schema ───────────────────────────────────

const GeoPointQueueSchema = new Schema(
       {
              type: { type: String, enum: ['Point'], default: 'Point' },
              coordinates: { type: [Number], required: true },
       },
       { _id: false },
);

const RandomQueueSchema = new Schema<IRandomQueueDocument, IRandomQueueModel>(
       {
              telegramId: { type: Number, required: true, unique: true },
              gender: { type: String, enum: Object.values(Gender), required: true },
              targetGender: { type: String, enum: Object.values(TargetGender), default: TargetGender.Any },
              searchMode: { type: String, enum: Object.values(SearchMode), default: SearchMode.Random },
              province: { type: String, default: null },
              age: { type: Number, default: null },
              location: { type: GeoPointQueueSchema, default: null },
              enteredAt: { type: Date, default: () => new Date() },
       },
       {
              collection: 'random_queue',
              timestamps: false,
              versionKey: false,
       },
);

RandomQueueSchema.index({ enteredAt: 1 });
RandomQueueSchema.index({ location: '2dsphere' });

// ─── Statics ──────────────────────────────────

RandomQueueSchema.statics.enqueue = function (
       telegramId: number,
       gender: Gender,
       targetGender: TargetGender,
       searchMode: SearchMode,
       extra?: { province?: string; age?: number; location?: { type: 'Point'; coordinates: [number, number] } }
): Promise<IRandomQueueDocument> {
       return this.findOneAndUpdate(
              { telegramId },
              {
                     telegramId,
                     gender,
                     targetGender,
                     searchMode,
                     province: extra?.province ?? null,
                     age: extra?.age ?? null,
                     location: extra?.location ?? null,
                     enteredAt: new Date(),
              },
              { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
       ).exec();
};

RandomQueueSchema.statics.dequeue = function (
       telegramId: number,
): Promise<void> {
       return this.deleteOne({ telegramId }).exec() as unknown as Promise<void>;
};

RandomQueueSchema.statics.findMatch = function (
       excludeId: number,
       entry: IRandomQueueDocument,
): Promise<IRandomQueueDocument | null> {
       const query: Record<string, unknown> = {
              telegramId: { $ne: excludeId },
       };

       // ─── فیلتر جنسیت طرف مقابل ───────────────────────────────
       // کاربر A می‌خواهد با جنسیت X چت کند
       // کاربر B هم باید کاربر A را بپذیرد (targetGender B باید Male/Female/Any باشد)
       if (entry.targetGender !== TargetGender.Any) {
              // طرف مقابل باید جنسیت مورد نظر ما باشد
              query['gender'] = entry.targetGender;
       }
       // طرف مقابل هم باید ما را بخواهد
       query['targetGender'] = { $in: [entry.gender, TargetGender.Any] };

       // ─── فیلترهای searchMode ──────────────────────────────────
       switch (entry.searchMode) {
              case SearchMode.SameProvince:
                     if (entry.province) query['province'] = entry.province;
                     break;

              case SearchMode.SameAge:
                     if (entry.age) {
                            const margin = 5;
                            query['age'] = { $gte: entry.age - margin, $lte: entry.age + margin };
                     }
                     break;

              // نزدیکی جغرافیایی — از طریق $near در MongoDB
              case SearchMode.Nearby:
                     if (entry.location?.coordinates) {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            (query as any)['location'] = {
                                   $near: {
                                          $geometry: { type: 'Point', coordinates: entry.location.coordinates },
                                          $maxDistance: 100_000, // 100 کیلومتر
                                   },
                            };
                     }
                     break;

              // Random و GenderSelect فقط فیلتر جنسیت دارند (بالا انجام شد)
              default:
                     break;
       }

       return this.findOne(query).sort({ enteredAt: 1 }).exec();
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