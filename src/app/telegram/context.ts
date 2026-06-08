// src/app/telegram/context.ts
// ─── تایپ سفارشی Context برای استفاده در تمام هندلرها ───

import { Context } from 'telegraf';
import type { SessionFlavor } from 'telegraf';
import type { IUserDocument } from '@/models/user.model';

// ─── Session ──────────────────────────────────────────────

export interface BotSession {
       // مرحله‌ای که کاربر در آن است (برای registration)
       step?: string;
}

// ─── Context سفارشی ───────────────────────────────────────

export interface BotContext extends Context, SessionFlavor<BotSession> {
       // کاربر از DB — توسط auth middleware پر می‌شود
       dbUser?: IUserDocument;
}