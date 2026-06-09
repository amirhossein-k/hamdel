// src/app/telegram/handlers/random-chat.ts

import { Telegraf } from 'telegraf';
import type { BotContext } from '../context';
import {
       UserState,
       ChatType,
       MessageType,
       COIN_COST_CHAT,
       CoinChangeReason,
       TargetGender,
       SearchMode,
} from '@/types/enums';
import { RandomQueueModel } from '@/models/queue.model';
import { ChatModel, MessageModel } from '@/models/chat.model';
import { CoinLogModel } from '@/models/coin.model';
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
//  توابع کمکی داخلی
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
              await bot.telegram.sendPhoto(partnerId, photo.file_id, { caption: msg.caption ?? undefined });
              if (chatId && ctx.from?.id) {
                     await forwardPhotoToAdmin(bot, chatId, ctx.from.id, photo.file_id, msg.caption ?? undefined);
              }
       } else if ('sticker' in msg && msg.sticker) {
              await bot.telegram.sendSticker(partnerId, msg.sticker.file_id);
       } else if ('voice' in msg && msg.voice) {
              await bot.telegram.sendVoice(partnerId, msg.voice.file_id);
       } else if ('video' in msg && msg.video) {
              await bot.telegram.sendVideo(partnerId, msg.video.file_id, { caption: msg.caption ?? undefined });
       } else {
              await ctx.reply('⚠️ این نوع فایل پشتیبانی نمی‌شه.');
       }
}

async function saveMessage(chatId: string, senderId: number, ctx: BotContext): Promise<void> {
       const msg = ctx.message!;
       let type = MessageType.Text;
       let content = '';
       if ('text' in msg && msg.text) {
              type = MessageType.Text; content = msg.text;
       } else if ('photo' in msg && msg.photo) {
              type = MessageType.Photo; content = msg.photo[msg.photo.length - 1].file_id;
       } else if ('sticker' in msg && msg.sticker) {
              type = MessageType.Sticker; content = msg.sticker.file_id;
       } else { return; }
       await MessageModel.create({ chatId, senderId, type, content });
}

async function notifyInQueue(ctx: BotContext, searchMode: SearchMode): Promise<void> {
       const label: Record<SearchMode, string> = {
              [SearchMode.Random]: 'تصادفی',
              [SearchMode.GenderSelect]: 'با جنسیت انتخابی',
              [SearchMode.SameProvince]: 'هم‌استانی',
              [SearchMode.SameAge]: 'هم‌سن',
              [SearchMode.Nearby]: 'در نزدیکی شما',
       };
       await ctx.reply(
              `🔍 داریم دنبال همصحبت ${label[searchMode]} می‌گردیم...\n\nبرای لغو «❌ لغو جستجو» رو بزن.`,
              inQueueKeyboard,
       );
}

// ─── کسر سکه + ثبت لاگ ───────────────────────────────────
// chatId به عنوان refId ذخیره می‌شود تا بتوان هنگام استرداد پیدا کرد
async function deductCoins(userId: number, chatId: string): Promise<void> {
       await UserModel.findOneAndUpdate(
              { telegramId: userId },
              { $inc: { coins: -COIN_COST_CHAT } },
       );
       const updated = await UserModel.findByTelegramId(userId);
       await CoinLogModel.record(
              userId,
              -COIN_COST_CHAT,
              CoinChangeReason.ChatFemale,
              updated?.coins ?? 0,
              chatId,
       );
}

// ─── استرداد سکه + ثبت لاگ ───────────────────────────────
// اگر لاگ کسر برای این chatId وجود داشت، برمی‌گرداند
// مقدار استرداد را برمی‌گرداند (0 اگر استردادی نبود)
async function refundCoinsIfDeducted(userId: number, chatId: string): Promise<number> {
       const deductLog = await CoinLogModel.findOne({
              telegramId: userId,
              change: { $lt: 0 },
              refId: chatId,
       });
       if (!deductLog) return 0;

       const refundAmount = Math.abs(deductLog.change);
       await UserModel.findOneAndUpdate(
              { telegramId: userId },
              { $inc: { coins: refundAmount } },
       );
       const updated = await UserModel.findByTelegramId(userId);
       await CoinLogModel.record(
              userId,
              refundAmount,
              CoinChangeReason.Refund,
              updated?.coins ?? 0,
              chatId,
       );
       return refundAmount;
}

// ══════════════════════════════════════════════════════════
//  شروع چت تصادفی
// ══════════════════════════════════════════════════════════

export async function startRandomChat(ctx: BotContext): Promise<void> {
       const user = ctx.dbUser!;
       if (!user.profileComplete) { await ctx.reply('⚠️ ابتدا پروفایلت رو کامل کن. /start بزن.'); return; }
       const existingChat = await ChatModel.findActiveByParticipant(user.telegramId);
       if (existingChat) { await ctx.reply('⚠️ تو الان توی یه چت هستی. اول اون رو ببند.', inChatKeyboard); return; }

       ctx.session.step = 'queue:gender_select';
       ctx.session.pendingSearchMode = SearchMode.GenderSelect;
       await ctx.reply('🎲 <b>چت تصادفی</b>\n\nمی‌خوای با کی چت کنی؟', {
              parse_mode: 'HTML', reply_markup: targetGenderKeyboard.reply_markup,
       });
}

// ══════════════════════════════════════════════════════════
//  شروع جستجوی انتخابی
// ══════════════════════════════════════════════════════════

export async function startSmartSearch(ctx: BotContext): Promise<void> {
       const user = ctx.dbUser!;
       if (!user.profileComplete) { await ctx.reply('⚠️ ابتدا پروفایلت رو کامل کن. /start بزن.'); return; }
       const existingChat = await ChatModel.findActiveByParticipant(user.telegramId);
       if (existingChat) { await ctx.reply('⚠️ تو الان توی یه چت هستی. اول اون رو ببند.', inChatKeyboard); return; }

       ctx.session.step = 'queue:smart_search';
       await ctx.reply('🔍 <b>جستجوی انتخابی</b>\n\nیه نوع جستجو انتخاب کن:', {
              parse_mode: 'HTML', reply_markup: smartSearchKeyboard.reply_markup,
       });
}

// ══════════════════════════════════════════════════════════
//  هندلر مراحل session
// ══════════════════════════════════════════════════════════

export async function handleQueueStep(
       ctx: BotContext,
       bot: Telegraf<BotContext>,
       text: string,
): Promise<boolean> {
       const step = ctx.session.step;

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
              else { await ctx.reply('لطفاً یکی از گزینه‌ها را انتخاب کن:', targetGenderKeyboard); return true; }

              ctx.session.step = undefined;
              ctx.session.pendingTargetGender = undefined;
              await joinRandomQueue(ctx, bot, targetGender, SearchMode.GenderSelect);
              return true;
       }

       if (step === 'queue:smart_search') {
              if (text === '🔙 بازگشت') {
                     ctx.session.step = undefined;
                     await ctx.reply('بازگشت به منوی اصلی', mainMenuKeyboard);
                     return true;
              }
              if (text === '🏙️ جستجو هم‌استانی') {
                     ctx.session.step = undefined;
                     const user = ctx.dbUser!;
                     if (!user.province) { await ctx.reply('⚠️ استان خودت رو در پروفایل تنظیم کن. (⚙️ تنظیمات)', mainMenuKeyboard); return true; }
                     await joinRandomQueue(ctx, bot, TargetGender.Any, SearchMode.SameProvince);
                     return true;
              }
              if (text === '🎂 جستجو هم‌سن') {
                     ctx.session.step = undefined;
                     const user = ctx.dbUser!;
                     if (!user.age) { await ctx.reply('⚠️ سن خودت رو در پروفایل تنظیم کن. (⚙️ تنظیمات)', mainMenuKeyboard); return true; }
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
                            await ctx.reply('📍 موقعیت مکانی‌ات رو بفرست:\n\n(دکمه 📎 → Location را بزن)', {
                                   reply_markup: { keyboard: [['❌ انصراف']], resize_keyboard: true },
                            });
                     }
                     return true;
              }
              await ctx.reply('لطفاً یکی از گزینه‌ها را انتخاب کن:', smartSearchKeyboard);
              return true;
       }

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
//  هندلر پیام location
// ══════════════════════════════════════════════════════════

export async function handleLocationMessage(ctx: BotContext, bot: Telegraf<BotContext>): Promise<void> {
       if (ctx.session.step !== 'queue:waiting_location') return;
       const msg = ctx.message as Message.LocationMessage | undefined;
       if (!msg?.location) return;

       const user = ctx.dbUser!;
       user.location = { type: 'Point', coordinates: [msg.location.longitude, msg.location.latitude] };
       await user.save();
       ctx.session.step = undefined;

       await ctx.reply('✅ موقعیت ثبت شد! در حال جستجو...', inQueueKeyboard);
       await joinRandomQueue(ctx, bot, TargetGender.Any, SearchMode.Nearby);
}

// ══════════════════════════════════════════════════════════
//  ورود به صف / اتصال دو کاربر
//
//  منطق سکه:
//   • GenderSelect + Any  → رایگان (سکه کسر نمی‌شود)
//   • هر حالت دیگر       → ۲ سکه از هر دو کاربر کسر می‌شود
//
//  استرداد:
//   • اگر چت بدون هیچ پیامی قطع شود → سکه‌های کسر‌شده برمی‌گردند
// ══════════════════════════════════════════════════════════

export async function joinRandomQueue(
       ctx: BotContext,
       bot: Telegraf<BotContext>,
       targetGender: TargetGender,
       searchMode: SearchMode,
): Promise<void> {
       const user = ctx.dbUser!;

       if (!user.profileComplete) { await ctx.reply('⚠️ ابتدا پروفایلت رو کامل کن. /start بزن.'); return; }
       const existingChat = await ChatModel.findActiveByParticipant(user.telegramId);
       if (existingChat) { await ctx.reply('⚠️ تو الان توی یه چت هستی. اول اون رو ببند.', inChatKeyboard); return; }

       // تصادفی کاملاً رایگان است
       const isRandomFree = searchMode === SearchMode.GenderSelect && targetGender === TargetGender.Any;

       // بررسی سکه قبل از ورود به صف
       if (!isRandomFree && user.coins < COIN_COST_CHAT) {
              await ctx.reply(
                     `🪙 برای این نوع جستجو به ${COIN_COST_CHAT} سکه نیاز داری.\n` +
                     `موجودی فعلی: ${user.coins} سکه\n\n` +
                     `برای خرید سکه «🪙 سکه‌هام» رو بزن.`,
                     mainMenuKeyboard,
              );
              return;
       }

       // extra برای searchMode
       const extra: { province?: string; age?: number; location?: { type: 'Point'; coordinates: [number, number] } } = {};
       if (searchMode === SearchMode.SameProvince && user.province) extra.province = user.province;
       if (searchMode === SearchMode.SameAge && user.age) extra.age = user.age;
       if (searchMode === SearchMode.Nearby && user.location) extra.location = user.location;

       const myEntry = await RandomQueueModel.enqueue(user.telegramId, user.gender!, targetGender, searchMode, extra);

       // فیلتر بلاک‌شده‌ها
       const blockedByMe = user.blockedUsers ?? [];
       const blockedMeDocs = await UserModel.find({ blockedUsers: user.telegramId }, { telegramId: 1 }).lean();
       const blockedMe = blockedMeDocs.map(d => d.telegramId);

       const match = await RandomQueueModel.findMatch(user.telegramId, myEntry, blockedByMe, blockedMe);

       if (match) {
              const partner = await UserModel.findByTelegramId(match.telegramId);
              if (!partner) {
                     await RandomQueueModel.dequeue(match.telegramId);
                     user.state = UserState.InQueue;
                     await user.save();
                     await notifyInQueue(ctx, searchMode);
                     return;
              }

              // بررسی سکه طرف مقابل (که در صف منتظر بوده)
              const partnerIsRandomFree =
                     match.searchMode === SearchMode.GenderSelect && match.targetGender === TargetGender.Any;

              if (!partnerIsRandomFree && partner.coins < COIN_COST_CHAT) {
                     // طرف مقابل سکه کافی ندارد — از صف حذف و ادامه جستجو
                     await RandomQueueModel.dequeue(match.telegramId);
                     try {
                            await bot.telegram.sendMessage(
                                   partner.telegramId,
                                   `🪙 سکه کافی نداری. برای خرید «🪙 سکه‌هام» رو بزن.`,
                                   mainMenuKeyboard,
                            );
                     } catch { /* ignored */ }
                     user.state = UserState.InQueue;
                     await user.save();
                     await notifyInQueue(ctx, searchMode);
                     return;
              }

              // ─── ساخت chatId ──────────────────────────────────
              const chatId = nanoid(12);

              // ─── کسر سکه از هر دو طرف ────────────────────────
              if (!isRandomFree) {
                     await deductCoins(user.telegramId, chatId);
              }
              if (!partnerIsRandomFree) {
                     await deductCoins(partner.telegramId, chatId);
              }

              // ─── ساخت چت ─────────────────────────────────────
              await ChatModel.create({
                     chatId,
                     participants: [user.telegramId, partner.telegramId],
                     type: ChatType.Random,
              });

              await RandomQueueModel.dequeue(match.telegramId);
              await RandomQueueModel.dequeue(user.telegramId);

              user.state = UserState.InChat; await user.save();
              partner.state = UserState.InChat; await partner.save();

              const startMsg = '✅ یه نفر پیدا شد! بریم چت کنیم 🎉\n\n⚠️ برای پایان چت «🔚 پایان چت» رو بزن.';
              await ctx.reply(startMsg, inChatKeyboard);
              await bot.telegram.sendMessage(partner.telegramId, startMsg, inChatKeyboard);

       } else {
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

export async function forwardChatMessage(ctx: BotContext, bot: Telegraf<BotContext>): Promise<void> {
       const user = ctx.dbUser!;
       const chat = await ChatModel.findActiveByParticipant(user.telegramId);
       if (!chat) {
              user.state = UserState.Complete; await user.save();
              await ctx.reply('⚠️ چت فعالی پیدا نشد.', mainMenuKeyboard);
              return;
       }

       const partnerId = chat.getPartnerId(user.telegramId);

       if (ctx.message && 'text' in ctx.message) {
              const text = ctx.message.text.trim();
              if (text === '🔚 پایان چت') { await endChat(ctx, bot, chat.chatId, user.telegramId, partnerId); return; }
              if (text === '🚨 گزارش') { await startReport(ctx, chat.chatId, partnerId); return; }
              if (text === '👤 پروفایل طرف مقابل') { await showPartnerProfile(ctx, partnerId); return; }
       }

       try {
              await sendToPartner(bot, partnerId, ctx, chat.chatId);
              await saveMessage(chat.chatId, user.telegramId, ctx);
       } catch {
              await ctx.reply('⚠️ پیام ارسال نشد. ممکنه طرف مقابل ربات رو بلاک کرده باشه.');
       }
}

// ══════════════════════════════════════════════════════════
//  پایان چت
//
//  استرداد سکه:
//  اگر هیچ پیامی رد و بدل نشده باشد،
//  سکه‌هایی که برای این chatId کسر شده‌اند به هر طرف برمی‌گردند.
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

       // ─── بررسی پیام‌ها ────────────────────────────────────
       const closerMsgCount = await MessageModel.countDocuments({ chatId, senderId: closerId });
       const partnerMsgCount = await MessageModel.countDocuments({ chatId, senderId: partnerId });
       const noConversation = closerMsgCount === 0 && partnerMsgCount === 0;

       // ─── استرداد سکه (فقط اگر پیامی رد و بدل نشده) ─────
       let closerRefund = 0;
       let partnerRefund = 0;
       if (noConversation) {
              closerRefund = await refundCoinsIfDeducted(closerId, chatId);
              partnerRefund = await refundCoinsIfDeducted(partnerId, chatId);
       }

       // ─── آپدیت state ─────────────────────────────────────
       const closer = await UserModel.findByTelegramId(closerId);
       const partner = await UserModel.findByTelegramId(partnerId);
       if (closer) { closer.state = UserState.Complete; await closer.save(); }
       if (partner) { partner.state = UserState.Complete; await partner.save(); }

       // ─── پیام پایان ──────────────────────────────────────
       const refundNote = (amount: number) =>
              amount > 0 ? `\n\n🪙 چون پیامی رد و بدل نشد، ${amount} سکه به حسابت برگشت.` : '';

       await ctx.reply('🔚 چت تموم شد.\n\nمی‌تونی یه چت جدید شروع کنی 👇' + refundNote(closerRefund), mainMenuKeyboard);
       try {
              await bot.telegram.sendMessage(
                     partnerId,
                     '🔚 چت تموم شد.\n\nمی‌تونی یه چت جدید شروع کنی 👇' + refundNote(partnerRefund),
                     mainMenuKeyboard,
              );
       } catch { /* ignored */ }
}

// ══════════════════════════════════════════════════════════
//  گزارش
// ══════════════════════════════════════════════════════════

export async function startReport(ctx: BotContext, chatId: string, reportedId: number): Promise<void> {
       ctx.session.step = `report:${reportedId}:${chatId}`;
       await ctx.reply('🚨 دلیل گزارش رو بنویس:\n\n(مثلاً: ارسال محتوای نامناسب، آزار و اذیت، ...)', {
              reply_markup: { remove_keyboard: true },
       });
}

export async function submitReport(ctx: BotContext, bot: Telegraf<BotContext>): Promise<void> {
       const user = ctx.dbUser!;
       const text = ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : null;
       if (!text || !ctx.session.step?.startsWith('report:')) return;

       const [, reportedIdStr, chatId] = ctx.session.step.split(':');
       const reportedId = Number(reportedIdStr);

       await ReportModel.create({ reporterId: user.telegramId, reportedId, chatId, reason: text });

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
       if (!partner) { await ctx.reply('⚠️ اطلاعات طرف مقابل یافت نشد.'); return; }

       const genderText = partner.gender === 'male' ? '👦 پسر' : '👧 دختر';
       const interests = partner.interests.length > 0 ? partner.interests.join(' ') : '—';
       const diff = Date.now() - partner.lastActive.getTime();
       const mins = Math.floor(diff / 60_000);
       const onlineStatus =
              mins < 2 ? '🟢 آنلاین' :
                     mins < 60 ? `🟡 ${mins} دقیقه پیش` :
                            mins < 1440 ? `⚫ ${Math.floor(mins / 60)} ساعت پیش` :
                                   `⚫ ${Math.floor(mins / 1440)} روز پیش`;

       const profileText =
              `👤 <b>پروفایل همصحبت</b>\n\n` +
              `📛 نام: <b>${partner.name ?? '—'}</b>\n` +
              `${genderText}\n` +
              `🎂 سن: ${partner.age ?? '—'}\n` +
              `📍 استان: ${partner.province ?? '—'}\n` +
              `🏙️ شهر: ${partner.city ?? '—'}\n` +
              `🎯 علایق: ${interests}\n` +
              `🕐 آخرین آنلاین: ${onlineStatus}`;

       if (partner.photo) {
              await ctx.replyWithPhoto(partner.photo, { caption: profileText, parse_mode: 'HTML' });
       } else {
              await ctx.reply(profileText, { parse_mode: 'HTML' });
       }
}
