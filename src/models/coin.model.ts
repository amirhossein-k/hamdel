// ──────────────────────────────────────────────────
//  models/coin.model.ts  —  سکه، تراکنش‌ها، لاگ‌ها
// ──────────────────────────────────────────────────

import { Schema, model, Document, Model, Types } from 'mongoose';
import {
       CoinPackageId,
       CoinChangeReason,
       TransactionStatus,
       COIN_PACKAGES,
       type CoinPackage,
} from '@/types/enums';

// ════════════════════════════════════════════
//  TRANSACTION  (خرید سکه)
// ════════════════════════════════════════════

export interface ITransaction {
       telegramId: number;
       package: CoinPackageId;
       coins: number;
       amount: number;           // مبلغ به تومان
       status: TransactionStatus;
       paymentAuthority?: string;           // شناسه درگاه پرداخت
       createdAt: Date;
       paidAt?: Date;
}

export interface ITransactionDocument
       extends ITransaction, Document<Types.ObjectId> {
       markPaid(authority: string): Promise<void>;
       markFailed(): Promise<void>;
}

export interface ITransactionModel extends Model<ITransactionDocument> {
       createFromPackageId(
              telegramId: number,
              packageId: CoinPackageId,
       ): Promise<ITransactionDocument>;
       findByAuthority(authority: string): Promise<ITransactionDocument | null>;
}

// ─── Schema ───────────────────────────────────

const TransactionSchema = new Schema<ITransactionDocument, ITransactionModel>(
       {
              telegramId: { type: Number, required: true },
              package: { type: String, enum: Object.values(CoinPackageId), required: true },
              coins: { type: Number, required: true },
              amount: { type: Number, required: true },
              status: {
                     type: String,
                     enum: Object.values(TransactionStatus),
                     default: TransactionStatus.Pending,
              },
              paymentAuthority: { type: String, default: null, sparse: true },
              createdAt: { type: Date, default: () => new Date() },
              paidAt: { type: Date, default: null },
       },
       {
              collection: 'transactions',
              timestamps: false,
              versionKey: false,
       },
);

TransactionSchema.index({ telegramId: 1 });
TransactionSchema.index({ paymentAuthority: 1 }, { sparse: true });
TransactionSchema.index({ status: 1, createdAt: -1 });

// ─── Instance Methods ─────────────────────────

TransactionSchema.methods.markPaid = async function (
       this: ITransactionDocument,
       authority: string,
): Promise<void> {
       this.status = TransactionStatus.Paid;
       this.paymentAuthority = authority;
       this.paidAt = new Date();
       await this.save();
};

TransactionSchema.methods.markFailed = async function (
       this: ITransactionDocument,
): Promise<void> {
       this.status = TransactionStatus.Failed;
       await this.save();
};

// ─── Statics ──────────────────────────────────

TransactionSchema.statics.createFromPackageId = function (
       telegramId: number,
       packageId: CoinPackageId,
): Promise<ITransactionDocument> {
       const pkg = COIN_PACKAGES.find((p: CoinPackage) => p.id === packageId);
       if (!pkg) throw new Error(`Invalid package: ${packageId}`);

       return this.create({
              telegramId,
              package: pkg.id,
              coins: pkg.coins,
              amount: pkg.price,
       });
};

TransactionSchema.statics.findByAuthority = function (
       authority: string,
): Promise<ITransactionDocument | null> {
       return this.findOne({ paymentAuthority: authority }).exec();
};

export const TransactionModel = model<ITransactionDocument, ITransactionModel>(
       'Transaction',
       TransactionSchema,
);

// ════════════════════════════════════════════
//  COIN LOG  (تاریخچه سکه)
// ════════════════════════════════════════════

export interface ICoinLog {
       telegramId: number;
       change: number;   // مثبت = دریافت | منفی = کسر
       reason: CoinChangeReason;
       refId?: string;   // transaction _id یا telegramId دعوت‌شده
       balanceAfter: number;
       createdAt: Date;
}

export interface ICoinLogDocument
       extends ICoinLog, Document<Types.ObjectId> { }

export interface ICoinLogModel extends Model<ICoinLogDocument> {
       record(
              telegramId: number,
              change: number,
              reason: CoinChangeReason,
              balanceAfter: number,
              refId?: string,
       ): Promise<ICoinLogDocument>;
       getHistory(telegramId: number, limit?: number): Promise<ICoinLogDocument[]>;
}

// ─── Schema ───────────────────────────────────

const CoinLogSchema = new Schema<ICoinLogDocument, ICoinLogModel>(
       {
              telegramId: { type: Number, required: true },
              change: { type: Number, required: true },
              reason: { type: String, enum: Object.values(CoinChangeReason), required: true },
              refId: { type: String, default: null },
              balanceAfter: { type: Number, required: true },
              createdAt: { type: Date, default: () => new Date() },
       },
       {
              collection: 'coin_logs',
              timestamps: false,
              versionKey: false,
       },
);

CoinLogSchema.index({ telegramId: 1, createdAt: -1 });

// ─── Statics ──────────────────────────────────

CoinLogSchema.statics.record = function (
       telegramId: number,
       change: number,
       reason: CoinChangeReason,
       balanceAfter: number,
       refId?: string,
): Promise<ICoinLogDocument> {
       return this.create({ telegramId, change, reason, balanceAfter, refId });
};

CoinLogSchema.statics.getHistory = function (
       telegramId: number,
       limit = 20,
): Promise<ICoinLogDocument[]> {
       return this.find({ telegramId })
              .sort({ createdAt: -1 })
              .limit(limit)
              .exec();
};

export const CoinLogModel = model<ICoinLogDocument, ICoinLogModel>(
       'CoinLog',
       CoinLogSchema,
);