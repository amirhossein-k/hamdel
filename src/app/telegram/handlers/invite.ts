// src/app/telegram/handlers/invite.ts
// ─── سیستم دعوت دوستان ───────────────────────────────────
//
//  جریان کار:
//  1. کاربر «🔗 دعوت دوستان» می‌زند
//  2. لینک دعوت اختصاصی + آمار نشان داده می‌شود
//  3. وقتی کاربر جدید با لینک دعوت ثبت‌نام کرد و پروفایل کامل کرد:
//     → به دعوت‌کننده COIN_REWARD_INVITE سکه داده می‌شود
//
//  این تابع از auth.ts فراخوانی می‌شود (وقتی invitedBy ست شده)

import type { Telegraf } from 'telegraf';
import type { BotContext } from '../context';
import { COIN_REWARD_INVITE, CoinChangeReason } from '@/types/enums';
import { UserModel } from '@/models/user.model';
import { CoinLogModel } from '@/models/coin.model';

// ══════════════════════════════════════════════════════════
//  نمایش صفحه دعوت دوستان
// ══════════════════════════════════════════════════════════

export async function showInvitePage(ctx: BotContext): Promise<void> {
       const user = ctx.dbUser!;

       const botUsername = (await ctx.telegram.getMe()).username;
       const inviteLink = `https://t.me/${botUsername}?start=${user.inviteCode}`;

       const invitedCount = user.invitedUsers.length;

       const coinsEarned = invitedCount * COIN_REWARD_INVITE;

       await ctx.reply(
              `🔗 <b>دعوت دوستان</b>\n\n` +
              `با دعوت هر دوست، <b>${COIN_REWARD_INVITE} سکه</b> رایگان بگیر!\n\n` +
              `📊 <b>آمار دعوت‌های شما:</b>\n` +
              `👥 تعداد دعوت‌شده‌ها: ${invitedCount} نفر\n` +
              `🪙 سکه کسب‌شده از دعوت: ${coinsEarned} سکه\n\n` +
              `🔗 <b>لینک دعوت اختصاصی شما:</b>\n` +
              `${inviteLink}\n\n` +
              `📋 <b>کد دعوت شما:</b> \`${user.inviteCode}\`\n\n` +
              `_لینک رو برای دوستات بفرست. بعد از تکمیل ثبت‌نام دوستت، سکه‌هات شارژ میشه!_`,
              { parse_mode: 'HTML' },
       );
}

// ══════════════════════════════════════════════════════════
//  پاداش دعوت — وقتی کاربر جدید پروفایل را کامل کرد
//  این تابع از registration.ts بعد از تکمیل مرحله آخر فراخوانی می‌شود
// ══════════════════════════════════════════════════════════

export async function rewardInviter(
       bot: Telegraf<BotContext>,
       newUserTelegramId: number,
       inviterTelegramId: number,
): Promise<void> {
       try {
              const inviter = await UserModel.findByTelegramId(inviterTelegramId);
              if (!inviter) return;

              // جلوگیری از پاداش تکراری
              if (inviter.invitedUsers.includes(newUserTelegramId)) return;

              // اضافه کردن به لیست دعوت‌شده‌ها
              inviter.invitedUsers.push(newUserTelegramId);
              inviter.coins += COIN_REWARD_INVITE;
              await inviter.save();

              // ثبت لاگ
              await CoinLogModel.record(
                     inviter.telegramId,
                     COIN_REWARD_INVITE,
                     CoinChangeReason.InviteReward,
                     inviter.coins,
                     String(newUserTelegramId),
              );

              // اطلاع به دعوت‌کننده
              await bot.telegram.sendMessage(
                     inviter.telegramId,
                     `🎁 <b>پاداش دعوت!</b>\n\n` +
                     `یکی از دوستایی که دعوت کردی ثبت‌نامش رو کامل کرد.\n` +
                     `🪙 <b>${COIN_REWARD_INVITE} سکه</b> به حسابت اضافه شد!\n\n` +
                     `💰 موجودی فعلی: ${inviter.coins} سکه`,
                     { parse_mode: 'HTML' },
              ).catch(() => { });

       } catch (err) {
              console.error('[rewardInviter] ERROR:', err);
       }
}
