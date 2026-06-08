// src/app/telegram/context.ts
// ─── تایپ سفارشی Context برای استفاده در تمام هندلرها ───

import { Context } from 'telegraf';
import type { IUserDocument } from '@/models/user.model';

export interface BotSession {
       step?: string;
}

export interface BotContext extends Context {
       session: BotSession;
       dbUser?: IUserDocument;
}