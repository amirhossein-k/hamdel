// ─────────────────────────────────────────────
//  enums.ts  —  تمام Enum ها و ثابت‌های مشترک
// ─────────────────────────────────────────────

export enum Gender {
       Male = 'male',
       Female = 'female',
}

export enum UserState {
       Start = 'start',
       SetGender = 'set_gender',
       SetName = 'set_name',
       SetAge = 'set_age',
       SetProvince = 'set_province',
       SetCity = 'set_city',
       Complete = 'complete',
       InChat = 'in_chat',
       InQueue = 'in_queue',
}

export enum ChatType {
       Random = 'random',
       Direct = 'direct',
}

export enum ChatStatus {
       Active = 'active',
       Closed = 'closed',
}

export enum MessageType {
       Text = 'text',
       Photo = 'photo',
       Sticker = 'sticker',
}

export enum ChatRequestStatus {
       Pending = 'pending',
       Accepted = 'accepted',
       Rejected = 'rejected',
}

export enum ReportStatus {
       Pending = 'pending',
       Warned = 'warned',
       Banned = 'banned',
       Dismissed = 'dismissed',
}

export enum TransactionStatus {
       Pending = 'pending',
       Paid = 'paid',
       Failed = 'failed',
}

export enum CoinPackageId {
       Pack20 = '20coins',
       Pack40 = '40coins',
       Pack60 = '60coins',
       Pack120 = '120coins',
}

export enum CoinChangeReason {
       Purchase = 'purchase',
       InviteReward = 'invite_reward',
       ChatFemale = 'chat_female',
       Refund = 'refund',
       AdminGift = 'admin_gift',   // اهدای سکه توسط ادمین
}

// ─── ثابت‌های کسب‌وکار ───────────────────────

export const COIN_COST_FEMALE_CHAT = 2;
export const COIN_REWARD_INVITE = 5;
export const MIN_AGE = 9;
export const MAX_AGE = 70;
export const NEW_USER_DAYS = 7;      // تعریف «کاربر تازه» بر حسب روز
export const PROXIMITY_STEPS_KM = [0, 25, 50, 75, 100] as const;

export type ProximityKm = typeof PROXIMITY_STEPS_KM[number];

export interface CoinPackage {
       readonly id: CoinPackageId;
       readonly coins: number;
       readonly price: number;          // تومان
}

export const COIN_PACKAGES: readonly CoinPackage[] = [
       { id: CoinPackageId.Pack20, coins: 20, price: 6_000 },
       { id: CoinPackageId.Pack40, coins: 40, price: 9_000 },
       { id: CoinPackageId.Pack60, coins: 60, price: 15_000 },
       { id: CoinPackageId.Pack120, coins: 120, price: 27_000 },
] as const;
// ─── ثابت‌های مدیریت گزارش ───────────────────
export const AUTO_BAN_THRESHOLD = 3;   // تعداد گزارش برای بن خودکار
export const AUTO_WARN_THRESHOLD = 1;  // تعداد گزارش برای اخطار خودکار

// ─── علایق ───────────────────────────────────
export const INTERESTS = [
       '🎮 بازی',
       '🎵 موسیقی',
       '📚 مطالعه',
       '🏋️ ورزش',
       '🎬 فیلم و سریال',
       '🍳 آشپزی',
       '✈️ سفر',
       '🎨 هنر',
       '💻 تکنولوژی',
       '📸 عکاسی',
] as const;

export type Interest = typeof INTERESTS[number];
