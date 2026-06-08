// src/app/telegram/handlers/moderation.ts
// ─── مدیریت محتوا (مرحله ۱۰) ──────────────────────────────
//
//  امکانات:
//  1. ارسال مخفی عکس‌ها به ادمین (adminCopySent)
//  2. بن خودکار بر اساس تعداد گزارش (AUTO_BAN_THRESHOLD)
//
//  این ماژول توسط random-chat.ts و direct-chat.ts فراخوانی می‌شود.

import { Telegraf } from 'telegraf';
import type { BotContext } from '../context';
import { AUTO_BAN_THRESHOLD, AUTO_WARN_THRESHOLD, MessageType } from '@/types/enums';
import { ReportModel } from '@/models/queue.model';
import { MessageModel } from '@/models/chat.model';
import { UserModel } from '@/models/user.model';
import { mainMenuKeyboard } from '@/lib/keyboards';

// ══════════════════════════════════════════════════════════
//  ارسال نسخه مخفی عکس به ادمین
// ══════════════════════════════════════════════════════════

export async function forwardPhotoToAdmin(
       bot: Telegraf<BotContext>,
       chatId: string,
       senderId: number,
       fileId: string,
       caption?: string,
): Promise<void> {
       const adminId = Number(process.env.ADMIN_TELEGRAM_ID);
       if (!adminId) return;

       try {
              await bot.telegram.sendPhoto(adminId, fileId, {
                     caption:
                            `📸 <b>عکس ارسال‌شده در چت</b>\n` +
                            `👤 فرستنده: \`${senderId}\`\n` +
                            `🆔 چت: \`${chatId}\`` +
                            (caption ? `\n📝 کپشن: ${caption}` : ''),
                     parse_mode: 'HTML',
              });

              // علامت‌گذاری adminCopySent در پیام
              await MessageModel.findOneAndUpdate(
                     { chatId, senderId, type: MessageType.Photo, content: fileId },
                     { $set: { adminCopySent: true } },
              );
       } catch (err) {
              console.error('[forwardPhotoToAdmin] ERROR:', err);
       }
}

// ══════════════════════════════════════════════════════════
//  بررسی و اعمال بن خودکار بعد از ثبت گزارش
// ══════════════════════════════════════════════════════════

export async function checkAndAutoBan(
       bot: Telegraf<BotContext>,
       reportedId: number,
): Promise<{ autoBanned: boolean; autoWarned: boolean }> {
       const reportCount = await ReportModel.countAgainstUser(reportedId);
       const user = await UserModel.findByTelegramId(reportedId);

       if (!user || user.isBanned) return { autoBanned: false, autoWarned: false };

       // بن خودکار
       if (reportCount >= AUTO_BAN_THRESHOLD) {
              user.isBanned = true;
              user.banReason = `بن خودکار — ${reportCount} گزارش دریافتی`;
              await user.save();

              await bot.telegram.sendMessage(
                     reportedId,
                     `🚫 حساب شما به دلیل گزارش‌های مکرر به صورت موقت مسدود شد.\nبرای اعتراض با پشتیبانی تماس بگیرید.`,
              ).catch(() => { });

              // اطلاع به ادمین
              const adminId = Number(process.env.ADMIN_TELEGRAM_ID);
              if (adminId) {
                     await bot.telegram.sendMessage(
                            adminId,
                            `🚫 <b>بن خودکار</b>\n\nکاربر \`${reportedId}\` به دلیل ${reportCount} گزارش بن شد.`,
                            { parse_mode: 'HTML' },
                     ).catch(() => { });
              }

              return { autoBanned: true, autoWarned: false };
       }

       // اخطار خودکار
       if (reportCount >= AUTO_WARN_THRESHOLD && user.warnings < reportCount) {
              user.warnings = reportCount;
              await user.save();

              await bot.telegram.sendMessage(
                     reportedId,
                     `⚠️ <b>اخطار سیستم</b>\n\nرفتارت گزارش شده. در صورت ادامه، حسابت مسدود خواهد شد.`,
                     { parse_mode: 'HTML' },
              ).catch(() => { });

              return { autoBanned: false, autoWarned: true };
       }

       return { autoBanned: false, autoWarned: false };
}
