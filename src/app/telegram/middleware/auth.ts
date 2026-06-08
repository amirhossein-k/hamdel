// src/app/telegram/middleware/auth.ts
// ─── Middleware احراز هویت ───────────────────────────────
// روی هر آپدیت اجرا می‌شود:
//   1. به DB وصل می‌شود
//   2. کاربر را پیدا یا می‌سازد
//   3. اگر بن بود، پیام می‌دهد و متوقف می‌شود
//   4. آخرین فعالیت را آپدیت می‌کند
//   5. کاربر را به ctx.dbUser اضافه می‌کند

import { MiddlewareFn } from 'telegraf';
import { connectDB } from '@/lib/mongodb';
import { UserModel } from '@/models/user.model';
import { UserState, Gender } from '@/types/enums';
import type { BotContext } from '../context';
import { nanoid } from 'nanoid';

// ─── تولید کد دعوت یکتا ──────────────────────────────────

function generateInviteCode(): string {
       return nanoid(8).toUpperCase();
}

// ─── Middleware ───────────────────────────────────────────

export const authMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
       // فقط آپدیت‌هایی که از یک کاربر واقعی می‌آیند
       const telegramId = ctx.from?.id;
       if (!telegramId) return next();

       try {
              await connectDB();

              let user = await UserModel.findByTelegramId(telegramId);

              if (!user) {
                     // ─── کاربر جدید ─────────────────────────────────────
                     // بررسی لینک دعوت (اگر با /start <code> آمده)
                     let invitedBy: number | undefined;
                     const startPayload =
                            ctx.message && 'text' in ctx.message
                                   ? ctx.message.text.split(' ')[1]
                                   : undefined;

                     if (startPayload) {
                            const inviter = await UserModel.findByInviteCode(startPayload);
                            if (inviter) invitedBy = inviter.telegramId;
                     }

                     // ─── ادمین → مستقیم Complete، بدون ثبت‌نام ──────────────
                     const adminTelegramId = Number(process.env.ADMIN_TELEGRAM_ID);
                     const isAdminUser = !!adminTelegramId && telegramId === adminTelegramId;

                     user = await UserModel.create({
                            telegramId,
                            username: ctx.from.username,
                            name: ctx.from.first_name,
                            inviteCode: generateInviteCode(),
                            invitedBy,
                            state: isAdminUser ? UserState.Complete : UserState.Start,
                            coins: isAdminUser ? 999_999 : 0,
                            interests: [],
                            invitedUsers: [],
                            isBanned: false,
                            warnings: 0,
                            profileComplete: isAdminUser,
                            ...(isAdminUser && {
                                   gender: Gender.Male,
                                   age: 30,
                                   province: 'تهران',
                                   city: 'تهران',
                            }),
                     });
              } else {
                     // ─── کاربر موجود ─────────────────────────────────────
                     // بررسی بن — ادمین هرگز بن نمی‌شود
                     const adminTelegramId = Number(process.env.ADMIN_TELEGRAM_ID);
                     const isAdminUser = !!adminTelegramId && telegramId === adminTelegramId;

                     if (!isAdminUser && user.isBanned) {
                            await ctx.reply(
                                   `🚫 حساب شما به دلیل زیر مسدود شده است:\n${user.banReason ?? 'نقض قوانین'}\n\nبرای اعتراض با پشتیبانی تماس بگیرید.`
                            );
                            return; // متوقف — next() صدا نمی‌شود
                     }

                     // آپدیت username در صورت تغییر
                     if (ctx.from.username && ctx.from.username !== user.username) {
                            user.username = ctx.from.username;
                     }

                     await user.touchLastActive();
              }

              ctx.dbUser = user;
              return next();
       } catch (err) {
              console.error('[authMiddleware] ERROR:', err);
              await ctx.reply('❌ خطای داخلی. لطفاً دوباره تلاش کنید.').catch(() => { });
       }
};