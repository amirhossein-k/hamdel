// src/app/telegram/handlers/direct-chat.ts
// ─── سیستم چت مستقیم ─────────────────────────────────────
//
//  جریان کار:
//  1. کاربر «💬 چت مستقیم» می‌زند
//  2. از کاربر username یا inviteCode طرف مقابل پرسیده می‌شود
//  3. کاربر هدف پیدا می‌شود
//  4. بررسی محدودیت‌ها (بن، چت فعال، درخواست تکراری)
//  5. درخواست چت ارسال می‌شود
//  6. طرف مقابل قبول یا رد می‌کند (inline keyboard)
//  7. در صورت قبول → چت شروع می‌شود

import { Markup, Telegraf } from 'telegraf';
import type { BotContext } from '../context';
import { UserState, ChatType, ChatRequestStatus } from '@/types/enums';
import { ChatModel } from '@/models/chat.model';
import { ChatRequestModel } from '@/models/inbox.model';
import { UserModel } from '@/models/user.model';
import { inChatKeyboard, mainMenuKeyboard } from '@/lib/keyboards';
import { nanoid } from 'nanoid';
import { endChat } from './random-chat';

// ─── Inline keyboard برای درخواست چت ─────────────────────

function requestKeyboard(fromId: number) {
       return Markup.inlineKeyboard([
              Markup.button.callback('✅ قبول', `accept_chat:${fromId}`),
              Markup.button.callback('❌ رد', `reject_chat:${fromId}`),
       ]);
}

// ══════════════════════════════════════════════════════════
//  شروع جستجوی کاربر
// ══════════════════════════════════════════════════════════

export async function startDirectChat(ctx: BotContext): Promise<void> {
       const user = ctx.dbUser!;

       if (!user.profileComplete) {
              await ctx.reply('⚠️ ابتدا پروفایلت رو کامل کن. /start بزن.');
              return;
       }

       // ذخیره step در session
       ctx.session.step = 'direct:search';

       await ctx.reply(
              '💬 *چت مستقیم*\n\n' +
              'یوزرنیم تلگرام یا کد دعوت طرف مقابل رو وارد کن:\n\n' +
              '_(مثال: @username یا کد دعوت مثل ABC12345)_',
              { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } },
       );
}

// ══════════════════════════════════════════════════════════
//  پردازش جستجو و ارسال درخواست
// ══════════════════════════════════════════════════════════

export async function handleDirectChatSearch(
       ctx: BotContext,
       bot: Telegraf<BotContext>,
): Promise<void> {
       const user = ctx.dbUser!;
       const text = ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : null;

       if (!text) return;

       // پاک کردن session
       ctx.session.step = undefined;

       // ─── پیدا کردن کاربر هدف ──────────────────────────────
       let target = null;

       if (text.startsWith('@')) {
              // جستجو با username
              const username = text.slice(1);
              target = await UserModel.findOne({ username });
       } else {
              // جستجو با inviteCode
              target = await UserModel.findByInviteCode(text.toUpperCase());
       }

       // ─── بررسی‌های مختلف ──────────────────────────────────

       if (!target) {
              await ctx.reply(
                     '❌ کاربری با این مشخصات پیدا نشد.\n\nمجدداً تلاش کن یا از منو استفاده کن.',
                     mainMenuKeyboard,
              );
              return;
       }

       if (target.telegramId === user.telegramId) {
              await ctx.reply('😅 نمی‌تونی با خودت چت کنی!', mainMenuKeyboard);
              return;
       }

       if (target.isBanned) {
              await ctx.reply('❌ این کاربر در دسترس نیست.', mainMenuKeyboard);
              return;
       }

       if (!target.profileComplete) {
              await ctx.reply('❌ این کاربر هنوز ثبت‌نامش رو کامل نکرده.', mainMenuKeyboard);
              return;
       }

       // بررسی چت فعال بین این دو نفر
       const alreadyChatting = await ChatModel.hasActiveChat(user.telegramId, target.telegramId);
       if (alreadyChatting) {
              await ctx.reply('💬 الان با این کاربر چت فعال داری!', inChatKeyboard);
              return;
       }

       // بررسی درخواست تکراری
       const hasPending = await ChatRequestModel.hasPending(user.telegramId, target.telegramId);
       if (hasPending) {
              await ctx.reply('⏳ قبلاً درخواست چت فرستادی. منتظر جواب باش.', mainMenuKeyboard);
              return;
       }

       // ─── ثبت درخواست و ارسال به طرف مقابل ────────────────

       await ChatRequestModel.create({
              fromId: user.telegramId,
              toId: target.telegramId,
       });

       // پیام تأیید به فرستنده
       await ctx.reply(
              `✅ درخواست چت به *${target.name}* فرستاده شد.\nمنتظر جواب بمون...`,
              { parse_mode: 'Markdown', ...mainMenuKeyboard },
       );

       // پیام درخواست به گیرنده
       try {
              await bot.telegram.sendMessage(
                     target.telegramId,
                     `💬 *${user.name}* می‌خواد باهات چت کنه!\n\nقبول می‌کنی؟`,
                     { parse_mode: 'Markdown', ...requestKeyboard(user.telegramId) },
              );
       } catch {
              await ctx.reply('⚠️ پیام به طرف مقابل ارسال نشد. ممکنه ربات رو بلاک کرده باشه.');
       }
}

// ══════════════════════════════════════════════════════════
//  قبول درخواست چت
// ══════════════════════════════════════════════════════════

export async function acceptChatRequest(
       ctx: BotContext,
       bot: Telegraf<BotContext>,
       fromId: number,
): Promise<void> {
       const user = ctx.dbUser!; // گیرنده (کسی که قبول کرد)

       // پیدا کردن درخواست
       const request = await ChatRequestModel.findOne({
              fromId,
              toId: user.telegramId,
              status: ChatRequestStatus.Pending,
       });

       if (!request) {
              await ctx.answerCbQuery('❌ این درخواست دیگه معتبر نیست.');
              return;
       }

       // بررسی چت فعال
       const alreadyChatting = await ChatModel.hasActiveChat(fromId, user.telegramId);
       if (alreadyChatting) {
              await ctx.answerCbQuery('⚠️ الان یه چت فعال دارید.');
              return;
       }

       // قبول درخواست
       await request.accept();

       // ساخت چت
       const chatId = nanoid(12);
       await ChatModel.create({
              chatId,
              participants: [fromId, user.telegramId],
              type: ChatType.Direct,
       });

       // آپدیت state هر دو
       const requester = await UserModel.findByTelegramId(fromId);
       user.state = UserState.InChat;
       await user.save();

       if (requester) {
              requester.state = UserState.InChat;
              await requester.save();
       }

       const startMsg = '✅ درخواست چت قبول شد! بریم چت کنیم 🎉\n\n⚠️ برای پایان «🔚 پایان چت» رو بزن.';

       // ویرایش پیام درخواست (حذف دکمه‌ها)
       await ctx.editMessageText(`💬 درخواست چت از *${requester?.name ?? 'کاربر'}* ✅ قبول شد.`, {
              parse_mode: 'Markdown',
       }).catch(() => { });

       await ctx.reply(startMsg, inChatKeyboard);

       try {
              await bot.telegram.sendMessage(fromId, startMsg, inChatKeyboard);
       } catch {
              // طرف مقابل ربات را بلاک کرده
       }
}

// ══════════════════════════════════════════════════════════
//  رد درخواست چت
// ══════════════════════════════════════════════════════════

export async function rejectChatRequest(
       ctx: BotContext,
       bot: Telegraf<BotContext>,
       fromId: number,
): Promise<void> {
       const user = ctx.dbUser!;

       const request = await ChatRequestModel.findOne({
              fromId,
              toId: user.telegramId,
              status: ChatRequestStatus.Pending,
       });

       if (!request) {
              await ctx.answerCbQuery('❌ این درخواست دیگه معتبر نیست.');
              return;
       }

       await request.reject();

       // ویرایش پیام درخواست
       await ctx.editMessageText(`💬 درخواست چت ❌ رد شد.`).catch(() => { });
       await ctx.answerCbQuery('درخواست رد شد.');

       // اطلاع به فرستنده
       try {
              await bot.telegram.sendMessage(
                     fromId,
                     `❌ *${user.name}* درخواست چتت رو رد کرد.`,
                     { parse_mode: 'Markdown' },
              );
       } catch {
              // طرف مقابل ربات را بلاک کرده
       }
}

// ══════════════════════════════════════════════════════════
//  پایان چت مستقیم (از طریق random-chat.endChat استفاده می‌شود)
// ══════════════════════════════════════════════════════════

export { endChat };