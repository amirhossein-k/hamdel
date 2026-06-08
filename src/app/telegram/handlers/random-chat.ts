// src/app/telegram/handlers/random-chat.ts
// ─── سیستم چت تصادفی (با پشتیبانی از جستجوی انتخابی) 
//  جریان چت تصادفی ساده:
//  1. کاربر «🎲 چت تصادفی» → انتخاب جنسیت طرف مقابل
//  2. ورود به صف با targetGender
//
//  جریان جستجوی انتخابی:
//  1. کاربر «🔍 جستجوی انتخابی» → منوی حالت‌های مختلف
//  2. انتخاب: نزدیکی / هم‌استانی / هم‌سن
//  3. ورود به صف با searchMode
//
//  مچینگ: هر دو کاربر باید یکدیگر را قبول کنند (targetGender متقابل)

import { Telegraf } from 'telegraf';
import type { BotContext } from '../context';
import {
       UserState,
       Gender,
       ChatType,
       MessageType,
       COIN_COST_FEMALE_CHAT,
       TargetGender,
       SearchMode,
} from '@/types/enums';
import { RandomQueueModel } from '@/models/queue.model';
import { ChatModel, MessageModel } from '@/models/chat.model';
import { ReportModel } from '@/models/queue.model';
import { UserModel } from '@/models/user.model';
import {
       inChatKeyboard,
       inQueueKeyboard,
       mainMenuKeyboard,
       targetGenderKeyboard,
       smartSearchKeyboard,
} from '@/lib/keyboards';
import { nanoid } from 'nanoid';
import { forwardPhotoToAdmin, checkAndAutoBan } from './moderation';
import type { Message } from 'telegraf/types';

// ══════════════════════════════════════════════════════════
//  توابع کمکی
// ══════════════════════════════════════════════════════════

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
              return;
       }

       await MessageModel.create({ chatId, senderId, type, content });
}

async function notifyInQueue(ctx: BotContext, searchMode: SearchMode): Promise<void> {
       const modeLabel: Record<SearchMode, string> = {
              [SearchMode.Random]: 'تصادفی',
              [SearchMode.GenderSelect]: 'با جنسیت انتخابی',
              [SearchMode.SameProvince]: 'هم‌استانی',
              [SearchMode.SameAge]: 'هم‌سن',
              [SearchMode.Nearby]: 'در نزدیکی شما',
       };
       await ctx.reply(
              `🔍 داریم دنبال همصحبت ${modeLabel[searchMode]} می‌گردیم...\n\nبرای لغو «❌ لغو جستجو» رو بزن.`,
              inQueueKeyboard,
       );
}

// ══════════════════════════════════════════════════════════
//  شروع چت تصادفی — نمایش انتخاب جنسیت
// ══════════════════════════════════════════════════════════

export async function startRandomChat(ctx: BotContext): Promise<void> {
       const user = ctx.dbUser!;

       if (!user.profileComplete) {
              await ctx.reply('⚠️ ابتدا پروفایلت رو کامل کن. /start بزن.');
              return;
       }

       const existingChat = await ChatModel.findActiveByParticipant(user.telegramId);
       if (existingChat) {
              await ctx.reply('⚠️ تو الان توی یه چت هستی. اول اون رو ببند.', inChatKeyboard);
              return;
       }

       ctx.session.step = 'queue:gender_select';
       ctx.session.pendingSearchMode = SearchMode.GenderSelect;

       await ctx.reply(
              '🎲 <b>چت تصادفی</b>\n\nمی‌خوای با کی چت کنی؟',
              { parse_mode: 'HTML', reply_markup: targetGenderKeyboard.reply_markup },
       );
}

// ══════════════════════════════════════════════════════════
//  شروع جستجوی انتخابی — نمایش منوی حالت‌ها
// ══════════════════════════════════════════════════════════

export async function startSmartSearch(ctx: BotContext): Promise<void> {
       const user = ctx.dbUser!;

       if (!user.profileComplete) {
              await ctx.reply('⚠️ ابتدا پروفایلت رو کامل کن. /start بزن.');
              return;
       }

       const existingChat = await ChatModel.findActiveByParticipant(user.telegramId);
       if (existingChat) {
              await ctx.reply('⚠️ تو الان توی یه چت هستی. اول اون رو ببند.', inChatKeyboard);
              return;
       }

       ctx.session.step = 'queue:smart_search';

       await ctx.reply(
              '🔍 <b>جستجوی انتخابی</b>\n\nیه نوع جستجو انتخاب کن:',
              { parse_mode: 'HTML', reply_markup: smartSearchKeyboard.reply_markup },
       );
}

// ══════════════════════════════════════════════════════════
//  هندلر مراحل session مربوط به صف
// ══════════════════════════════════════════════════════════

export async function handleQueueStep(
       ctx: BotContext,
       bot: Telegraf<BotContext>,
       text: string,
): Promise<boolean> {
       const step = ctx.session.step;

       // ─── انتخاب جنسیت طرف مقابل ──────────────────────────
       if (step === 'queue:gender_select') {
              if (text === '🔙 بازگشت') {
                     ctx.session.step = undefined;
                     await ctx.reply('بازگشت به منوی اصلی', mainMenuKeyboard);
                     return true;
              }

              let targetGender: TargetGender;
              if (text === '👦 چت با پسر') targetGender = TargetGender.Male;
              else if (text === '👧 چت با دختر') targetGender = TargetGender.Female;
              else if (text === '🎲 هر کسی (تصادفی)') targetGender = TargetGender.Any;
              else {
                     await ctx.reply('لطفاً یکی از گزینه‌ها را انتخاب کن:', targetGenderKeyboard);
                     return true;
              }

              ctx.session.step = undefined;
              ctx.session.pendingTargetGender = undefined;
              await joinRandomQueue(ctx, bot, targetGender, SearchMode.GenderSelect);
              return true;
       }

       // ─── منوی جستجوی انتخابی ──────────────────────────────
       if (step === 'queue:smart_search') {
              if (text === '🔙 بازگشت') {
                     ctx.session.step = undefined;
                     await ctx.reply('بازگشت به منوی اصلی', mainMenuKeyboard);
                     return true;
              }

              if (text === '🏙️ جستجو هم‌استانی') {
                     ctx.session.step = undefined;
                     const user = ctx.dbUser!;
                     if (!user.province) {
                            await ctx.reply('⚠️ استان خودت رو در پروفایل تنظیم کن. (⚙️ تنظیمات)', mainMenuKeyboard);
                            return true;
                     }
                     await joinRandomQueue(ctx, bot, TargetGender.Any, SearchMode.SameProvince);
                     return true;
              }

              if (text === '🎂 جستجو هم‌سن') {
                     ctx.session.step = undefined;
                     const user = ctx.dbUser!;
                     if (!user.age) {
                            await ctx.reply('⚠️ سن خودت رو در پروفایل تنظیم کن. (⚙️ تنظیمات)', mainMenuKeyboard);
                            return true;
                     }
                     await joinRandomQueue(ctx, bot, TargetGender.Any, SearchMode.SameAge);
                     return true;
              }

              if (text === '📍 جستجو براساس نزدیکی') {
                     const user = ctx.dbUser!;
                     if (user.location?.coordinates) {
                            ctx.session.step = undefined;
                            await joinRandomQueue(ctx, bot, TargetGender.Any, SearchMode.Nearby);
                     } else {
                            ctx.session.step = 'queue:waiting_location';
                            await ctx.reply(
                                   '📍 برای جستجوی نزدیکی، موقعیت مکانی‌ات رو بفرست:\n\n(دکمه 📎 → Location را بزن)',
                                   { reply_markup: { keyboard: [['❌ انصراف']], resize_keyboard: true } },
                            );
                     }
                     return true;
              }

              await ctx.reply('لطفاً یکی از گزینه‌ها را انتخاب کن:', smartSearchKeyboard);
              return true;
       }

       // ─── انتظار برای موقعیت مکانی ────────────────────────
       if (step === 'queue:waiting_location') {
              if (text === '❌ انصراف') {
                     ctx.session.step = undefined;
                     await ctx.reply('لغو شد.', mainMenuKeyboard);
                     return true;
              }
              await ctx.reply('📍 لطفاً موقعیت مکانی‌ات رو از طریق دکمه 📎 → Location بفرست.');
              return true;
       }

       return false;
}

// ══════════════════════════════════════════════════════════
//  هندلر پیام location (موقعیت مکانی)
// ══════════════════════════════════════════════════════════

export async function handleLocationMessage(
       ctx: BotContext,
       bot: Telegraf<BotContext>,
): Promise<void> {
       const step = ctx.session.step;
       if (step !== 'queue:waiting_location') return;

       const msg = ctx.message as Message.LocationMessage | undefined;
       if (!msg?.location) return;

       const user = ctx.dbUser!;
       const { longitude, latitude } = msg.location;

       user.location = { type: 'Point', coordinates: [longitude, latitude] };
       await user.save();

       ctx.session.step = undefined;

       await ctx.reply('✅ موقعیت ثبت شد! در حال جستجو...', inQueueKeyboard);
       await joinRandomQueue(ctx, bot, TargetGender.Any, SearchMode.Nearby);
}

// ══════════════════════════════════════════════════════════
//  ورود به صف / شروع چت
// ══════════════════════════════════════════════════════════

export async function joinRandomQueue(
       ctx: BotContext,
       bot: Telegraf<BotContext>,
       targetGender: TargetGender,
       searchMode: SearchMode,
): Promise<void> {
       const user = ctx.dbUser!;

       if (!user.profileComplete) {
              await ctx.reply('⚠️ ابتدا پروفایلت رو کامل کن. /start بزن.');
              return;
       }

       const existingChat = await ChatModel.findActiveByParticipant(user.telegramId);
       if (existingChat) {
              await ctx.reply('⚠️ تو الان توی یه چت هستی. اول اون رو ببند.', inChatKeyboard);
              return;
       }

       // ─── ساخت extra برای searchMode ─────────────────────
       const extra: {
              province?: string;
              age?: number;
              location?: { type: 'Point'; coordinates: [number, number] };
       } = {};
       if (searchMode === SearchMode.SameProvince && user.province) extra.province = user.province;
       if (searchMode === SearchMode.SameAge && user.age) extra.age = user.age;
       if (searchMode === SearchMode.Nearby && user.location) extra.location = user.location;

       // ─── ثبت در صف ───────────────────────────────────────
       const myEntry = await RandomQueueModel.enqueue(
              user.telegramId,
              user.gender!,
              targetGender,
              searchMode,
              extra,
       );

       // ─── جستجوی مچ ───────────────────────────────────────
       const match = await RandomQueueModel.findMatch(user.telegramId, myEntry);

       if (match) {
              const partner = await UserModel.findByTelegramId(match.telegramId);
              if (!partner) {
                     // طرف مقابل در DB نیست — از صف حذف و در صف بمان
                     await RandomQueueModel.dequeue(match.telegramId);
                     user.state = UserState.InQueue;
                     await user.save();
                     await notifyInQueue(ctx, searchMode);
                     return;
              }

              // ─── بررسی سکه: پسر + دختر ──────────────────────
              if (user.gender === Gender.Male && partner.gender === Gender.Female) {
                     if (!user.hasEnoughCoinsForFemaleChat()) {
                            await RandomQueueModel.dequeue(user.telegramId);
                            await ctx.reply(
                                   `🪙 برای چت با دختر به ${COIN_COST_FEMALE_CHAT} سکه نیاز داری.\n` +
                                   `موجودی فعلی: ${user.coins} سکه\n\n` +
                                   `برای خرید سکه «🪙 سکه‌هام» رو بزن.`,
                                   mainMenuKeyboard,
                            );
                            return;
                     }
                     user.coins -= COIN_COST_FEMALE_CHAT;
                     await user.save();
              }

              // ─── ساخت چت جدید ────────────────────────────────
              const chatId = nanoid(12);
              await ChatModel.create({
                     chatId,
                     participants: [user.telegramId, partner.telegramId],
                     type: ChatType.Random,
              });

              // حذف هر دو از صف
              await RandomQueueModel.dequeue(match.telegramId);
              await RandomQueueModel.dequeue(user.telegramId);

              // آپدیت state هر دو
              user.state = UserState.InChat;
              await user.save();
              partner.state = UserState.InChat;
              await partner.save();

              const startMsg = '✅ یه نفر پیدا شد! بریم چت کنیم 🎉\n\n⚠️ برای پایان چت «🔚 پایان چت» رو بزن.';
              await ctx.reply(startMsg, inChatKeyboard);
              await bot.telegram.sendMessage(partner.telegramId, startMsg, inChatKeyboard);

       } else {
              // ─── مچ نشد — در صف بمان ─────────────────────────
              user.state = UserState.InQueue;
              await user.save();
              await notifyInQueue(ctx, searchMode);
       }
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

       const chat = await ChatModel.findActiveByParticipant(user.telegramId);
       if (!chat) {
              user.state = UserState.Complete;
              await user.save();
              await ctx.reply('⚠️ چت فعالی پیدا نشد.', mainMenuKeyboard);
              return;
       }

       const partnerId = chat.getPartnerId(user.telegramId);

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

              if (text === '👤 پروفایل طرف مقابل') {
                     await showPartnerProfile(ctx, partnerId);
                     return;
              }
       }

       // forward پیام به طرف مقابل
       try {
              await sendToPartner(bot, partnerId, ctx, chat.chatId);
              await saveMessage(chat.chatId, user.telegramId, ctx);
       } catch {
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
       const chat = await ChatModel.findActiveByChatId(chatId);
       if (chat) await chat.close(closerId);

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
       ctx.session.step = `report:${reportedId}:${chatId}`;
       await ctx.reply(
              '🚨 دلیل گزارش رو بنویس:\n\n(مثلاً: ارسال محتوای نامناسب، آزار و اذیت، ...)',
              { reply_markup: { remove_keyboard: true } },
       );
}

export async function submitReport(
       ctx: BotContext,
       bot: Telegraf<BotContext>,
): Promise<void> {
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

       const adminId = Number(process.env.ADMIN_TELEGRAM_ID);
       if (adminId) {
              await bot.telegram.sendMessage(
                     adminId,
                     `🚨 گزارش جدید\n\nگزارش‌دهنده: ${user.telegramId}\nگزارش‌شده: ${reportedId}\nدلیل: ${text}`,
              ).catch(() => { });
       }

       await checkAndAutoBan(bot, reportedId);

       ctx.session.step = undefined;

       const chat = await ChatModel.findActiveByChatId(chatId);
       if (chat) {
              await endChat(ctx, bot, chatId, user.telegramId, reportedId);
       } else {
              await ctx.reply('✅ گزارش ثبت شد. ممنون از همکاریت.', mainMenuKeyboard);
       }
}

// ══════════════════════════════════════════════════════════
//  نمایش پروفایل طرف مقابل در حین چت
// ══════════════════════════════════════════════════════════

async function showPartnerProfile(ctx: BotContext, partnerId: number): Promise<void> {
       const partner = await UserModel.findByTelegramId(partnerId);
       if (!partner) {
              await ctx.reply('⚠️ اطلاعات طرف مقابل یافت نشد.');
              return;
       }

       const genderText = partner.gender === 'male' ? '👦 پسر' : '👧 دختر';
       const interests = partner.interests.length > 0 ? partner.interests.join(' ') : '—';

       const diff = Date.now() - partner.lastActive.getTime();
       const mins = Math.floor(diff / 60_000);
       let onlineStatus: string;
       if (mins < 2) onlineStatus = '🟢 آنلاین';
       else if (mins < 60) onlineStatus = `🟡 ${mins} دقیقه پیش`;
       else if (mins < 1440) onlineStatus = `⚫ ${Math.floor(mins / 60)} ساعت پیش`;
       else onlineStatus = `⚫ ${Math.floor(mins / 1440)} روز پیش`;

       await ctx.reply(
              `👤 <b>پروفایل همصحبت</b>\n\n` +
              `📛 نام: <b>${partner.name ?? '—'}</b>\n` +
              `${genderText}\n` +
              `🎂 سن: ${partner.age ?? '—'}\n` +
              `📍 استان: ${partner.province ?? '—'}\n` +
              `🏙️ شهر: ${partner.city ?? '—'}\n` +
              `🎯 علایق: ${interests}\n` +
              `🕐 آخرین آنلاین: ${onlineStatus}`,
              { parse_mode: 'HTML' },
       );
}