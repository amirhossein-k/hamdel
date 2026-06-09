// ─────────────────────────────────────────────
//  models/user.model.ts  —  مدل کاربر
// ─────────────────────────────────────────────

import {
       Schema,
       model,
       Document,
       Model,
       Types,

} from 'mongoose';
import { Gender, UserState, ProximityKm, COIN_COST_FEMALE_CHAT } from '@/types/enums'
import type { IranProvince } from '@/types/iran';
// ─── Interface ────────────────────────────────

export interface IGeoPoint {
       type: 'Point';
       coordinates: [number, number];   // [longitude, latitude]
}

export interface IUser {
       telegramId: number;
       username?: string;
       name?: string;
       gender?: Gender;
       age?: number;
       province?: IranProvince;
       city?: string;
       location?: IGeoPoint;
       photo?: string;         // file_id تلگرام
       interests: string[];
       coins: number;
       inviteCode: string;
       invitedBy?: number;
       invitedUsers: number[];
       isBanned: boolean;
       banReason?: string;
       warnings: number;
       blockedUsers: number[];      // لیست telegramId های بلاک‌شده
       registeredAt: Date;
       lastActive: Date;
       state: UserState;
       profileComplete: boolean;
}

export interface IUserDocument extends IUser, Document<Types.ObjectId> {
       /** آیا موجودی کافی برای چت با دختر دارد */
       hasEnoughCoinsForFemaleChat(): boolean;
       /** آپدیت زمان آخرین فعالیت */
       touchLastActive(): Promise<void>;
}

// ─── Statics ──────────────────────────────────

export interface IUserModel extends Model<IUserDocument> {
       findByTelegramId(telegramId: number): Promise<IUserDocument | null>;
       findByInviteCode(code: string): Promise<IUserDocument | null>;
       findNearby(
              coordinates: [number, number],
              maxDistanceKm: ProximityKm,
              filter: Record<string, unknown>,
              excludeIds: number[],
       ): Promise<IUserDocument[]>;
}

// ─── Schema ───────────────────────────────────

const GeoPointSchema = new Schema<IGeoPoint>(
       {
              type: { type: String, enum: ['Point'], default: 'Point' },
              coordinates: { type: [Number], required: true },
       },
       { _id: false },
);

const UserSchema = new Schema<IUserDocument, IUserModel>(
       {
              telegramId: { type: Number, required: true, unique: true },
              username: { type: String, trim: true },
              name: { type: String, trim: true, maxlength: 50 },
              gender: { type: String, enum: Object.values(Gender) },
              age: { type: Number, min: 9, max: 70 },
              province: { type: String },
              city: { type: String },
              location: { type: GeoPointSchema },
              photo: { type: String },
              interests: { type: [String], default: [] },
              coins: { type: Number, default: 0, min: 0 },
              inviteCode: { type: String, required: true, unique: true },
              invitedBy: { type: Number, default: null },
              invitedUsers: { type: [Number], default: [] },
              isBanned: { type: Boolean, default: false, index: true },
              banReason: { type: String },
              warnings: { type: Number, default: 0, min: 0 },
              blockedUsers: { type: [Number], default: [] },
              registeredAt: { type: Date, default: () => new Date() },
              lastActive: { type: Date, default: () => new Date() },
              state: { type: String, enum: Object.values(UserState), default: UserState.Start },
              profileComplete: { type: Boolean, default: false },
       },
       {
              collection: 'users',
              timestamps: false,
              versionKey: false,
       },
);

// ─── Indexes ──────────────────────────────────

UserSchema.index({ location: '2dsphere' });
UserSchema.index({ gender: 1, province: 1, city: 1 });
UserSchema.index({ gender: 1, age: 1 });
UserSchema.index({ registeredAt: -1 });

// ─── Instance Methods ─────────────────────────

UserSchema.methods.hasEnoughCoinsForFemaleChat = function (
       this: IUserDocument,
): boolean {
       return this.coins >= COIN_COST_FEMALE_CHAT;
};

UserSchema.methods.touchLastActive = async function (
       this: IUserDocument,
): Promise<void> {
       this.lastActive = new Date();
       await this.save();
};

// ─── Static Methods ───────────────────────────

UserSchema.statics.findByTelegramId = function (
       telegramId: number,
): Promise<IUserDocument | null> {
       return this.findOne({ telegramId }).exec();
};

UserSchema.statics.findByInviteCode = function (
       code: string,
): Promise<IUserDocument | null> {
       return this.findOne({ inviteCode: code }).exec();
};

UserSchema.statics.findNearby = function (
       coordinates: [number, number],
       maxDistanceKm: ProximityKm,
       filter: Record<string, unknown>,
       excludeIds: number[],
): Promise<IUserDocument[]> {
       const query: Record<string, unknown> = {
              ...filter,
              isBanned: false,
              profileComplete: true,
              telegramId: { $nin: excludeIds },
       };

       if (maxDistanceKm > 0) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (query as any).location = {
                     $near: {
                            $geometry: { type: 'Point', coordinates },
                            $maxDistance: maxDistanceKm * 1_000,
                     },
              };
       }

       return this.find(query).limit(50).exec();
};

// ─── Export ───────────────────────────────────

export const UserModel = model<IUserDocument, IUserModel>('User', UserSchema);