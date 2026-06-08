// src/app/telegram/context.ts
// ─── تایپ سفارشی Context ─────────────────────────────────

import { Context } from 'telegraf';
import type { IUserDocument } from '@/models/user.model';
import type { TargetGender, SearchMode } from '@/types/enums';

export type SessionStep =
       | `report:${number}:${string}`
       | 'direct:search'
       | 'settings:name'
       | 'settings:age'
       | 'settings:province'
       | 'settings:city'
       | 'queue:gender_select'     // انتخاب جنسیت طرف مقابل
       | 'queue:smart_search'      // منوی جستجوی انتخابی
       | 'queue:waiting_location'  // انتظار برای دریافت موقعیت مکانی
       | 'profile:browse_menu'     // منوی مرور پروفایل‌ها
       | 'profile:browse_province' // انتخاب استان برای مرور
       | 'profile:browse_gender'   // انتخاب جنسیت برای مرور
       | undefined;

export interface BotSession {
       step?: SessionStep | string;
       pendingTargetGender?: TargetGender;   // نگهداری موقت انتخاب جنسیت
       pendingSearchMode?: SearchMode;        // نگهداری موقت نوع جستجو
}

export interface BotContext extends Context {
       session: BotSession;
       dbUser?: IUserDocument;
}
