// src/app/telegram/handlers/random-chat.ts
// ─── سیستم چت تصادفی ─────────────────────────────────────
//
//  جریان کار:
//  1. کاربر «🎲 چت تصادفی» می‌زند
//  2. بررسی پروفایل کامل + سکه کافی (اگر طرف مقابل دختر بود)
//  3. صف را بررسی می‌کند:
//     - اگر match پیدا شد  → چت شروع می‌شود
//     - وگرنه              → وارد صف می‌شود
//  4. پیام‌ها forward می‌شوند (متن / عکس / استیکر)
//  5. «🔚 پایان چت» → چت بسته می‌شود
//  6. «🚨 گزارش»   → گزارش ثبت می‌شود

import { Telegraf } from 'telegraf';
import type { BotContext } from '../context';
import { UserState, Gender, ChatType, MessageType, COIN_COST_FEMALE_CHAT } from '@/types/enums';
import { RandomQueueModel } from '@/models/queue.model';
import { ChatModel, MessageModel } from '@/models/chat.model';
import { ReportModel } from '@/models/queue.model';
import { UserModel } from '@/models/user.model';
import { inChatKeyboard, inQueueKeyboard, mainMenuKeyboard } from '@/lib/keyboards';
import { nanoid } from 'nanoid';
import { forwardPhotoToAdmin, checkAndAutoBan } from './moderation';

// ─── تابع کمکی: ارسال پیام به کاربر دیگر ─────────────────

async function sendToPartner(
       bot: Telegraf<BotContext>,
       partnerId: number,
       ctx: BotContext,
       chatId?: string,
): Promise<void> {
       const msg = ctx.message!;

       if ('text' in msg && msg.text) {
              await bot.telegram.sendMessage(partnerId, msg.text);
       } else if ('photo' in msg && msg.photo) {
              const photo = msg.photo[msg.photo.length - 1];
              await bot.telegram.sendPhoto(partnerId, photo.file_id, {
                     caption: msg.caption ?? undefined,
              });
              // ارسال نسخه مخفی به ادمین
              if (chatId && ctx.from?.id) {
                     await forwardPhotoToAdmin(bot, chatId, ctx.from.id, photo.file_id, msg.caption ?? undefined);
              }
       } else if ('sticker' in msg && msg.sticker) {
              await bot.telegram.sendSticker(partnerId, msg.sticker.file_id);
       } else if ('voice' in msg && msg.voice) {
              await bot.telegram.sendVoice(partnerId, msg.voice.file_id);
       } else if ('video' in msg && msg.video) {
              await bot.telegram.sendVideo(partnerId, msg.video.file_id, {
                     caption: msg.caption ?? undefined,
              });
       } else {
              await ctx.reply('⚠️ این نوع فایل پشتیبانی نمی‌شه.');
       }
}

// ─── تابع کمکی: ذخیره پیام در DB ─────────────────────────

async function saveMessage(
       chatId: string,
       senderId: number,
       ctx: BotContext,
): Promise<void> {
       const msg = ctx.message!;
       let type = MessageType.Text;
       let content = '';

       if ('text' in msg && msg.text) {
              type = MessageType.Text;
              content = msg.text;
       } else if ('photo' in msg && msg.photo) {
              type = MessageType.Photo;
              content = msg.photo[msg.photo.length - 1].file_id;
       } else if ('sticker' in msg && msg.sticker) {
              type = MessageType.Sticker;
              content = msg.sticker.file_id;
       } else {
              return; // انواع دیگر ذخیره نمی‌شوند
       }

       await MessageModel.create({ chatId, senderId, type, content });
}

// ══════════════════════════════════════════════════════════
//  ورود به صف / شروع چت
// ══════════════════════════════════════════════════════════

export async function joinRandomQueue(
       ctx: BotContext,
       bot: Telegraf<BotContext>,
): Promise<void> {
       const user = ctx.dbUser!;

       // ─── بررسی پروفایل ────────────────────────────────────
       if (!user.profileComplete) {
              await ctx.reply('⚠️ ابتدا پروفایلت رو کامل کن. /start بزن.');
              return;
       }

       // ─── بررسی چت فعال موجود ──────────────────────────────
       const existingChat = await ChatModel.findActiveByParticipant(user.telegramId);
       if (existingChat) {
              await ctx.reply('⚠️ تو الان توی یه چت هستی. اول اون رو ببند.', inChatKeyboard);
              return;
       }

       // ─── بررسی صف ─────────────────────────────────────────
       const match = await RandomQueueModel.findMatch(user.telegramId);

       if (match) {
              // ─── مچ پیدا شد → شروع چت ──────────────────────────
              const partner = await UserModel.findByTelegramId(match.telegramId);
              if (!partner) {
                     // طرف مقابل در DB نیست — از صف حذف کن و خودت هم وارد صف شو
                     await RandomQueueModel.dequeue(match.telegramId);
                     await enterQueue(ctx, user.telegramId, user.gender!);
                     return;
              }

              // بررسی سکه: اگر کاربر فعلی پسر و طرف مقابل دختر است
              if (user.gender === Gender.Male && partner.gender === Gender.Female) {
                     if (!user.hasEnoughCoinsForFemaleChat()) {
                            await ctx.reply(
                                   `🪙 برای چت با دختر به ${COIN_COST_FEMALE_CHAT} سکه نیاز داری.\n` +
                                   `موجودی فعلی: ${user.coins} سکه\n\n` +
                                   `برای خرید سکه «🪙 سکه‌هام» رو بزن.`,
                                   mainMenuKeyboard,
                            );
                            return;
                     }
                     // کسر سکه
                     user.coins -= COIN_COST_FEMALE_CHAT;
                     await user.save();
              }

              // ساخت چت جدید
              const chatId = nanoid(12);
              await ChatModel.create({
                     chatId,
                     participants: [user.telegramId, partner.telegramId],
                     type: ChatType.Random,
              });

              // حذف هر دو از صف
              await RandomQueueModel.dequeue(match.telegramId);

              // آپدیت state هر دو
              user.state = UserState.InChat;
              await user.save();

              partner.state = UserState.InChat;
              await partner.save();

              // پیام شروع چت
              const startMsg = '✅ یه نفر پیدا شد! بریم چت کنیم 🎉\n\n⚠️ برای پایان چت «🔚 پایان چت» رو بزن.';
              await ctx.reply(startMsg, inChatKeyboard);
              await bot.telegram.sendMessage(partner.telegramId, startMsg, inChatKeyboard);

       } else {
              // ─── مچی نبود → وارد صف ────────────────────────────
              await enterQueue(ctx, user.telegramId, user.gender!);
       }
}

async function enterQueue(
       ctx: BotContext,
       telegramId: number,
       gender: Gender,
): Promise<void> {
       const user = ctx.dbUser!;
       await RandomQueueModel.enqueue(telegramId, gender);
       user.state = UserState.InQueue;
       await user.save();

       await ctx.reply(
              '🔍 داریم دنبال همصحبت می‌گردیم...\n\nبرای لغو «❌ لغو جستجو» رو بزن.',
              inQueueKeyboard,
       );
}

// ══════════════════════════════════════════════════════════
//  لغو صف
// ══════════════════════════════════════════════════════════

export async function leaveQueue(ctx: BotContext): Promise<void> {
       const user = ctx.dbUser!;

       await RandomQueueModel.dequeue(user.telegramId);
       user.state = UserState.Complete;
       await user.save();

       await ctx.reply('❌ جستجو لغو شد.', mainMenuKeyboard);
}

// ══════════════════════════════════════════════════════════
//  Forward پیام در چت فعال
// ══════════════════════════════════════════════════════════

export async function forwardChatMessage(
       ctx: BotContext,
       bot: Telegraf<BotContext>,
): Promise<void> {
       const user = ctx.dbUser!;

       // پیدا کردن چت فعال
       const chat = await ChatModel.findActiveByParticipant(user.telegramId);
       if (!chat) {
              // چت در DB نیست ولی state کاربر InChat است — اصلاح
              user.state = UserState.Complete;
              await user.save();
              await ctx.reply('⚠️ چت فعالی پیدا نشد.', mainMenuKeyboard);
              return;
       }

       const partnerId = chat.getPartnerId(user.telegramId);

       // بررسی پیام‌های خاص
       if (ctx.message && 'text' in ctx.message) {
              const text = ctx.message.text.trim();

              if (text === '🔚 پایان چت') {
                     await endChat(ctx, bot, chat.chatId, user.telegramId, partnerId);
                     return;
              }

              if (text === '🚨 گزارش') {
                     await startReport(ctx, chat.chatId, partnerId);
                     return;
              }
       }

       // forward پیام به طرف مقابل
       try {
              await sendToPartner(bot, partnerId, ctx, chat.chatId);
              await saveMessage(chat.chatId, user.telegramId, ctx);
       } catch {
              // طرف مقابل ربات را بلاک کرده یا مشکل دیگری است
              await ctx.reply('⚠️ پیام ارسال نشد. ممکنه طرف مقابل ربات رو بلاک کرده باشه.');
       }
}

// ══════════════════════════════════════════════════════════
//  پایان چت
// ══════════════════════════════════════════════════════════

export async function endChat(
       ctx: BotContext,
       bot: Telegraf<BotContext>,
       chatId: string,
       closerId: number,
       partnerId: number,
): Promise<void> {
       // بستن چت در DB
       const chat = await ChatModel.findActiveByChatId(chatId);
       if (chat) await chat.close(closerId);

       // آپدیت state هر دو
       const closer = await UserModel.findByTelegramId(closerId);
       const partner = await UserModel.findByTelegramId(partnerId);

       if (closer) { closer.state = UserState.Complete; await closer.save(); }
       if (partner) { partner.state = UserState.Complete; await partner.save(); }

       const endMsg = '🔚 چت تموم شد.\n\nمی‌تونی یه چت جدید شروع کنی 👇';
       await ctx.reply(endMsg, mainMenuKeyboard);

       try {
              await bot.telegram.sendMessage(partnerId, endMsg, mainMenuKeyboard);
       } catch {
              // طرف مقابل ربات را بلاک کرده
       }
}

// ══════════════════════════════════════════════════════════
//  گزارش
// ══════════════════════════════════════════════════════════

export async function startReport(
       ctx: BotContext,
       chatId: string,
       reportedId: number,
): Promise<void> {
       const user = ctx.dbUser!;

       // ذخیره reportedId در session
       ctx.session.step = `report:${reportedId}:${chatId}`;

       await ctx.reply(
              '🚨 دلیل گزارش رو بنویس:\n\n' +
              '(مثلاً: ارسال محتوای نامناسب، آزار و اذیت، ...)',
              { reply_markup: { remove_keyboard: true } },
       );
}

export async function submitReport(ctx: BotContext, bot: Telegraf<BotContext>): Promise<void> {
       const user = ctx.dbUser!;
       const text = ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : null;

       if (!text || !ctx.session.step?.startsWith('report:')) return;

       const [, reportedIdStr, chatId] = ctx.session.step.split(':');
       const reportedId = Number(reportedIdStr);

       await ReportModel.create({
              reporterId: user.telegramId,
              reportedId,
              chatId,
              reason: text,
       });

       // اطلاع‌رسانی به ادمین
       const adminId = Number(process.env.ADMIN_TELEGRAM_ID);
       if (adminId) {
              await bot.telegram.sendMessage(
                     adminId,
                     `🚨 گزارش جدید\n\nگزارش‌دهنده: ${user.telegramId}\nگزارش‌شده: ${reportedId}\nدلیل: ${text}`,
              ).catch(() => { });
       }

       // بررسی بن خودکار
       await checkAndAutoBan(bot, reportedId);

       ctx.session.step = undefined;

       // پایان چت بعد از گزارش
       const chat = await ChatModel.findActiveByChatId(chatId);
       if (chat) {
              await endChat(ctx, bot, chatId, user.telegramId, reportedId);
       } else {
              await ctx.reply('✅ گزارش ثبت شد. ممنون از همکاریت.', mainMenuKeyboard);
       }
}