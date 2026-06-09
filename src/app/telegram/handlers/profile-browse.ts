// src/app/telegram/handlers/profile-browse.ts
// ─── مرور و نمایش پروفایل کاربران ────────────────────────

import { Markup, Telegraf } from 'telegraf';
import type { BotContext } from '../context';
import { Gender, ChatRequestStatus, UserState, CoinChangeReason, COIN_COST_CHAT } from '@/types/enums';
import { UserModel } from '@/models/user.model';
import { ChatRequestModel, DirectMessageModel } from '@/models/inbox.model';
import { CoinLogModel } from '@/models/coin.model';
import {
       mainMenuKeyboard,
       profileBrowseKeyboard,
       browseGenderKeyboard,
       provinceKeyboard,
} from '@/lib/keyboards';
import type { IranProvince } from '@/types/iran';
import { IRAN_PROVINCES } from '@/types/iran';

const PAGE_SIZE = 5;

// ─── helpers ──────────────────────────────────────────────

function timeAgo(date: Date): string {
       const diff = Date.now() - date.getTime();
       const mins = Math.floor(diff / 60_000);
       if (mins < 1) return 'همین الان';
       if (mins < 60) return `${mins} دقیقه پیش`;
       const hrs = Math.floor(mins / 60);
       if (hrs < 24) return `${hrs} ساعت پیش`;
       const days = Math.floor(hrs / 24);
       if (days < 30) return `${days} روز پیش`;
       return `${Math.floor(days / 30)} ماه پیش`;
}

// ══════════════════════════════════════════════════════════
//  منوی اصلی
// ══════════════════════════════════════════════════════════

export async function showProfileBrowseMenu(ctx: BotContext): Promise<void> {
       ctx.session.step = 'profile:browse_menu';
       await ctx.reply(
              '👥 <b>جستجو براساس پروفایل</b>\n\nچطور می‌خوای پروفایل‌ها رو ببینی؟',
              { parse_mode: 'HTML', reply_markup: profileBrowseKeyboard.reply_markup },
       );
}

// ══════════════════════════════════════════════════════════
//  هندلر متن‌های مرحله‌ای (session)
// ══════════════════════════════════════════════════════════

export async function handleProfileBrowseStep(
       ctx: BotContext,
       text: string,
): Promise<boolean> {
       const step = ctx.session.step;

       if (step === 'profile:browse_menu') {
              if (text === '🔙 بازگشت') {
                     ctx.session.step = undefined;
                     await ctx.reply('بازگشت به منوی اصلی', mainMenuKeyboard);
                     return true;
              }
              if (text === '🗺️ پروفایل‌ها براساس استان') {
                     ctx.session.step = 'profile:browse_province';
                     await ctx.reply('🗺️ استان مورد نظر رو انتخاب کن:', provinceKeyboard);
                     return true;
              }
              if (text === '⚧️ پروفایل‌ها براساس جنسیت') {
                     ctx.session.step = 'profile:browse_gender';
                     await ctx.reply('⚧️ جنسیت مورد نظر رو انتخاب کن:', browseGenderKeyboard);
                     return true;
              }
              await ctx.reply('لطفاً یکی از گزینه‌ها را انتخاب کن:', profileBrowseKeyboard);
              return true;
       }

       if (step === 'profile:browse_province') {
              if (text === '🔙 بازگشت') {
                     ctx.session.step = 'profile:browse_menu';
                     await ctx.reply('بازگشت', profileBrowseKeyboard);
                     return true;
              }
              const province = text as IranProvince;
              if (!IRAN_PROVINCES.includes(province)) {
                     await ctx.reply('لطفاً استان رو از لیست انتخاب کن:', provinceKeyboard);
                     return true;
              }
              ctx.session.step = undefined;
              await showProfileList(ctx, { province }, `🗺️ استان ${province}`);
              return true;
       }

       if (step === 'profile:browse_gender') {
              if (text === '🔙 بازگشت') {
                     ctx.session.step = 'profile:browse_menu';
                     await ctx.reply('بازگشت', profileBrowseKeyboard);
                     return true;
              }
              let gender: Gender | null = null;
              if (text === '👦 پروفایل‌های پسرها') gender = Gender.Male;
              else if (text === '👧 پروفایل‌های دخترها') gender = Gender.Female;
              if (!gender) {
                     await ctx.reply('لطفاً یکی از گزینه‌ها را انتخاب کن:', browseGenderKeyboard);
                     return true;
              }
              ctx.session.step = undefined;
              const label = gender === Gender.Male ? '👦 پسرها' : '👧 دخترها';
              await showProfileList(ctx, { gender }, label);
              return true;
       }

       // ─── ارسال پیام مستقیم ────────────────────────────────
       if (step?.startsWith('profile:send_msg:')) {
              const targetId = Number(step.split(':')[2]);
              ctx.session.step = undefined;

              if (text === '❌ انصراف') {
                     await ctx.reply('لغو شد.', mainMenuKeyboard);
                     return true;
              }

              const sender = ctx.dbUser!;
              const target = await UserModel.findByTelegramId(targetId);
              if (!target || target.isBanned) {
                     await ctx.reply('⚠️ کاربر یافت نشد.', mainMenuKeyboard);
                     return true;
              }

              await DirectMessageModel.create({
                     fromId: sender.telegramId,
                     toId: targetId,
                     content: text,
              });

              try {
                     await ctx.telegram.sendMessage(
                            targetId,
                            `📩 <b>پیام جدید</b> از ${sender.name ?? 'یک کاربر'}:\n\n${text}\n\n` +
                            `برای پاسخ: «💬 چت مستقیم» را بزن و کد <code>${sender.inviteCode}</code> را وارد کن.`,
                            { parse_mode: 'HTML' },
                     );
              } catch { /* کاربر ربات را بلاک کرده */ }

              await ctx.reply('✅ پیام ارسال شد.', mainMenuKeyboard);
              return true;
       }

       return false;
}

// ══════════════════════════════════════════════════════════
//  نمایش لیست کشویی پروفایل‌ها (با pagination)
// ══════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function showProfileList(ctx: BotContext, filter: any, title: string, page = 0): Promise<void> {
       const me = ctx.dbUser!;

       const query = {
              ...filter,
              profileComplete: true,
              isBanned: false,
              telegramId: { $ne: me.telegramId },
       };

       const total = await UserModel.countDocuments(query);

       if (total === 0) {
              await ctx.reply(
                     `😕 در دسته <b>${title}</b> کاربری یافت نشد.`,
                     { parse_mode: 'HTML', reply_markup: mainMenuKeyboard.reply_markup },
              );
              return;
       }

       const users = await UserModel
              .find(query)
              .sort({ lastActive: -1 })
              .skip(page * PAGE_SIZE)
              .limit(PAGE_SIZE)
              .lean()
              .exec();

       const totalPages = Math.ceil(total / PAGE_SIZE);
       const hasNext = page < totalPages - 1;
       const hasPrev = page > 0;

       // ─── هدر لیست ──────────────────────────────────────
       await ctx.reply(
              `👥 <b>${title}</b>\n📊 ${total} کاربر — صفحه ${page + 1} از ${totalPages}`,
              { parse_mode: 'HTML', reply_markup: mainMenuKeyboard.reply_markup },
       );

       // ─── کارت هر کاربر ──────────────────────────────────
       for (const u of users) {
              await sendProfileCard(ctx, u);
       }

       // ─── دکمه‌های صفحه‌بندی ─────────────────────────────
       if (totalPages > 1) {
              const navButtons = [];
              if (hasPrev) navButtons.push(
                     Markup.button.callback('⬅️ قبلی', `browse_page:${JSON.stringify(filter)}:${title}:${page - 1}`)
              );
              if (hasNext) navButtons.push(
                     Markup.button.callback('➡️ بعدی', `browse_page:${JSON.stringify(filter)}:${title}:${page + 1}`)
              );

              if (navButtons.length > 0) {
                     await ctx.reply(
                            `📄 صفحه ${page + 1} از ${totalPages}`,
                            Markup.inlineKeyboard([navButtons]),
                     );
              }
       }
}

// callback handler برای pagination
export async function handleBrowsePageCallback(ctx: BotContext): Promise<void> {
       await ctx.answerCbQuery();
       if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

       // data format: browse_page:{filter}:{title}:{page}
       const raw = ctx.callbackQuery.data;
       const prefix = 'browse_page:';
       const body = raw.slice(prefix.length);

       // آخرین دو : را جدا کن
       const lastColon = body.lastIndexOf(':');
       const page = Number(body.slice(lastColon + 1));
       const rest = body.slice(0, lastColon);
       const secondLast = rest.lastIndexOf(':');
       const title = rest.slice(secondLast + 1);
       const filterStr = rest.slice(0, secondLast);

       try {
              const filter = JSON.parse(filterStr);
              await showProfileList(ctx, filter, title, page);
       } catch {
              await ctx.reply('⚠️ خطا در بارگذاری صفحه. دوباره تلاش کن.');
       }
}

// ──────────────────────────────────────────────────────────
//  کارت کوچک پروفایل
// ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendProfileCard(ctx: BotContext, u: any): Promise<void> {
       const icon = u.gender === 'male' ? '👦' : '👧';
       const interests = u.interests?.length ? u.interests.slice(0, 3).join(' • ') : '—';
       const onlineStatus = timeAgo(new Date(u.lastActive));

       const text =
              `${icon} <b>${u.name ?? '—'}</b>\n` +
              `🎂 ${u.age ?? '—'} سال  |  📍 ${u.city ?? u.province ?? '—'}\n` +
              `🎯 ${interests}\n` +
              `🕐 ${onlineStatus}`;

       const kb = Markup.inlineKeyboard([[
              Markup.button.callback('👁 مشاهده پروفایل', `view_profile:${u.telegramId}`),
       ]]);

       if (u.photo) {
              await ctx.replyWithPhoto(u.photo, {
                     caption: text,
                     parse_mode: 'HTML',
                     ...kb,
              });
       } else {
              await ctx.reply(text, { parse_mode: 'HTML', ...kb });
       }
}

// ══════════════════════════════════════════════════════════
//  نمایش پروفایل کامل  (callback: view_profile:ID)
// ══════════════════════════════════════════════════════════

export async function handleViewProfileCallback(
       ctx: BotContext,
       bot: Telegraf<BotContext>,
): Promise<void> {
       await ctx.answerCbQuery();
       if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

       const targetId = Number(ctx.callbackQuery.data.split(':')[1]);
       if (!targetId) return;

       const target = await UserModel.findByTelegramId(targetId);
       if (!target || target.isBanned || !target.profileComplete) {
              await ctx.answerCbQuery('⚠️ این کاربر دیگر در دسترس نیست.', { show_alert: true });
              return;
       }

       const me = ctx.dbUser!;
       const genderText = target.gender === 'male' ? '👦 پسر' : '👧 دختر';
       const interests = target.interests?.length ? target.interests.join(' • ') : '—';
       const onlineStatus = timeAgo(target.lastActive);

       const profileText =
              `👤 <b>پروفایل کاربر</b>\n\n` +
              `📛 نام: <b>${target.name ?? '—'}</b>\n` +
              `${genderText}  |  🎂 ${target.age ?? '—'} سال\n` +
              `📍 ${target.province ?? '—'} — ${target.city ?? '—'}\n` +
              `🎯 علایق: ${interests}\n` +
              `🕐 آخرین آنلاین: ${onlineStatus}`;

       const isSelf = me.telegramId === targetId;
       const isFemale = target.gender === Gender.Female;
       const coinLabel = isFemale ? ` (۲🪙)` : '';

       const buttons = isSelf ? [] : [
              [
                     Markup.button.callback(`💬 درخواست چت${coinLabel}`, `profile_chat:${targetId}`),
                     Markup.button.callback('📩 ارسال پیام', `profile_msg:${targetId}`),
              ],
              [Markup.button.callback('🚨 گزارش کاربر', `profile_report:${targetId}`)],
       ];

       const kb = Markup.inlineKeyboard(buttons);

       if (target.photo) {
              await ctx.replyWithPhoto(target.photo, {
                     caption: profileText,
                     parse_mode: 'HTML',
                     ...kb,
              });
       } else {
              await ctx.reply(profileText, { parse_mode: 'HTML', ...kb });
       }
}

// ══════════════════════════════════════════════════════════
//  درخواست چت از پروفایل  (callback: profile_chat:ID)
//  قوانین سکه:
//   - اگر طرف مقابل دختر است → ۲ سکه از فرستنده کسر می‌شود
//   - اگر طرف مقابل پیام را قبول نکرد (بلاک) → سکه برمی‌گردد
//   - جستجوی تصادفی مشمول نمی‌شود (این handler نیست)
// ══════════════════════════════════════════════════════════

export async function handleProfileChatCallback(
       ctx: BotContext,
       bot: Telegraf<BotContext>,
): Promise<void> {
       await ctx.answerCbQuery();
       if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

       const targetId = Number(ctx.callbackQuery.data.split(':')[1]);
       const me = ctx.dbUser!;

       if (!me.profileComplete) {
              await ctx.reply('⚠️ ابتدا پروفایلت رو کامل کن.');
              return;
       }

       const target = await UserModel.findByTelegramId(targetId);
       if (!target || target.isBanned) {
              await ctx.reply('⚠️ این کاربر در دسترس نیست.');
              return;
       }

       // ─── بررسی و کسر سکه ─────────────────────────────────
       const needsCoin = target.gender === Gender.Female;
       if (needsCoin) {
              if (me.coins < COIN_COST_CHAT) {
                     await ctx.reply(
                            `🪙 برای چت با دختر به <b>${COIN_COST_CHAT} سکه</b> نیاز داری.\n` +
                            `موجودی فعلی: ${me.coins} سکه\n\n` +
                            `برای خرید «🪙 سکه‌هام» را بزن.`,
                            { parse_mode: 'HTML' },
                     );
                     return;
              }
       }

       // ─── بررسی درخواست تکراری ────────────────────────────
       const existing = await ChatRequestModel.findOne({
              fromId: me.telegramId,
              toId: targetId,
              status: ChatRequestStatus.Pending,
       });
       if (existing) {
              await ctx.reply('⏳ قبلاً برای این کاربر درخواست چت فرستادی. منتظر پاسخ باش.');
              return;
       }

       // ─── کسر سکه پیش از ارسال پیام ──────────────────────
       if (needsCoin) {
              me.coins -= COIN_COST_CHAT;
              await me.save();
              await CoinLogModel.record(
                     me.telegramId,
                     -COIN_COST_CHAT,
                     CoinChangeReason.ChatFemale,
                     me.coins,
                     String(targetId),
              );
       }

       // ─── ثبت درخواست ─────────────────────────────────────
       await ChatRequestModel.create({
              fromId: me.telegramId,
              toId: targetId,
              status: ChatRequestStatus.Pending,
       });

       // ─── ارسال پیام به هدف ───────────────────────────────
       let sent = false;
       try {
              await bot.telegram.sendMessage(
                     targetId,
                     `💬 <b>${me.name ?? 'یک کاربر'}</b> درخواست چت مستقیم دارد.\n` +
                     `🎂 سن: ${me.age ?? '—'} | 📍 ${me.province ?? '—'}`,
                     {
                            parse_mode: 'HTML',
                            ...Markup.inlineKeyboard([
                                   [
                                          Markup.button.callback('✅ قبول', `accept_chat:${me.telegramId}`),
                                          Markup.button.callback('❌ رد', `reject_chat:${me.telegramId}`),
                                   ],
                            ]),
                     },
              );
              sent = true;
       } catch {
              sent = false;
       }

       // ─── برگشت سکه اگر پیام ارسال نشد ──────────────────
       if (!sent && needsCoin) {
              me.coins += COIN_COST_CHAT;
              await me.save();
              await CoinLogModel.record(
                     me.telegramId,
                     +COIN_COST_CHAT,
                     CoinChangeReason.Refund,
                     me.coins,
                     String(targetId),
              );
              await ctx.reply(
                     '⚠️ پیام به کاربر ارسال نشد (احتمالاً ربات را بلاک کرده).\n' +
                     `🪙 <b>${COIN_COST_CHAT} سکه</b> به حسابت برگشت.`,
                     { parse_mode: 'HTML' },
              );
              return;
       }

       if (!sent) {
              await ctx.reply('⚠️ پیام به کاربر ارسال نشد. ممکنه ربات رو بلاک کرده باشه.');
              return;
       }

       const coinMsg = needsCoin ? `\n🪙 <b>${COIN_COST_CHAT} سکه</b> کسر شد. موجودی: ${me.coins}` : '';
       await ctx.reply(
              `✅ درخواست چت ارسال شد. منتظر پاسخ باش.${coinMsg}`,
              { parse_mode: 'HTML', reply_markup: mainMenuKeyboard.reply_markup },
       );
}

// ══════════════════════════════════════════════════════════
//  ارسال پیام مستقیم از پروفایل  (callback: profile_msg:ID)
// ══════════════════════════════════════════════════════════

export async function handleProfileMsgCallback(ctx: BotContext): Promise<void> {
       await ctx.answerCbQuery();
       if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

       const targetId = Number(ctx.callbackQuery.data.split(':')[1]);
       const target = await UserModel.findByTelegramId(targetId);
       if (!target || target.isBanned) {
              await ctx.reply('⚠️ این کاربر در دسترس نیست.');
              return;
       }

       ctx.session.step = `profile:send_msg:${targetId}`;
       await ctx.reply(
              `📩 پیامت رو برای <b>${target.name ?? 'این کاربر'}</b> بنویس:\n\n(برای انصراف «❌ انصراف» بزن)`,
              {
                     parse_mode: 'HTML',
                     reply_markup: { keyboard: [['❌ انصراف']], resize_keyboard: true },
              },
       );
}

// ══════════════════════════════════════════════════════════
//  گزارش از پروفایل  (callback: profile_report:ID)
// ══════════════════════════════════════════════════════════

export async function handleProfileReportCallback(
       ctx: BotContext,
       bot: Telegraf<BotContext>,
): Promise<void> {
       await ctx.answerCbQuery();
       if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

       const targetId = Number(ctx.callbackQuery.data.split(':')[1]);
       const me = ctx.dbUser!;
       if (me.telegramId === targetId) return;

       ctx.session.step = `report:${targetId}:profile`;
       await ctx.reply(
              '🚨 دلیل گزارش رو بنویس:\n\n(مثلاً: تصویر نامناسب، رفتار آزاردهنده، ...)',
              { reply_markup: { remove_keyboard: true } },
       );
}
