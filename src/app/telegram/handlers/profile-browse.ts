// src/app/telegram/handlers/profile-browse.ts
// ─── مرور و نمایش پروفایل کاربران ───────────────────────────────────────────
//
//  جریان:
//  1. کاربر «👥 جستجو براساس پروفایل» → منوی انتخاب فیلتر
//  2. فیلتر براساس استان یا جنسیت → لیست کارت‌های کوچک
//  3. هر کارت یک دکمه «👁 مشاهده پروفایل» دارد (با profileId منحصربه‌فرد)
//  4. با زدن آن → پروفایل کامل + دکمه‌های درخواست چت / پیام / گزارش

import { Markup, Telegraf } from 'telegraf';
import type { BotContext } from '../context';
import { Gender, ChatRequestStatus, UserState } from '@/types/enums';
import { UserModel } from '@/models/user.model';
import { ChatRequestModel } from '@/models/inbox.model';
import { DirectMessageModel } from '@/models/inbox.model';
import {
       mainMenuKeyboard,
       profileBrowseKeyboard,
       browseGenderKeyboard,
       provinceKeyboard,
} from '@/lib/keyboards';
import type { IranProvince } from '@/types/iran';
import { IRAN_PROVINCES } from '@/types/iran';

const PAGE_SIZE = 8;

// ─── تبدیل تاریخ به «چه مدت پیش» ─────────────────────────

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
              await showProfilesByProvince(ctx, province);
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
              await showProfilesByGender(ctx, gender);
              return true;
       }

       // ─── مرحله ارسال پیام به کاربر از پروفایل ────────────
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

              // ذخیره پیام در inbox
              await DirectMessageModel.create({
                     fromId: sender.telegramId,
                     toId: targetId,
                     content: text,
              });

              // اطلاع‌رسانی به گیرنده
              try {
                     await ctx.telegram.sendMessage(
                            targetId,
                            `📩 <b>پیام جدید</b> از ${sender.name ?? 'یک کاربر'}:\n\n${text}\n\n` +
                            `برای پاسخ: «💬 چت مستقیم» را بزن و کد دعوت <code>${sender.inviteCode}</code> را وارد کن.`,
                            { parse_mode: 'HTML' },
                     );
              } catch {
                     // کاربر ربات را بلاک کرده
              }

              await ctx.reply('✅ پیام ارسال شد.', mainMenuKeyboard);
              return true;
       }

       return false;
}

// ══════════════════════════════════════════════════════════
//  نمایش لیست پروفایل‌ها براساس استان
// ══════════════════════════════════════════════════════════

async function showProfilesByProvince(ctx: BotContext, province: IranProvince): Promise<void> {
       const me = ctx.dbUser!;
       const users = await UserModel.find({
              province,
              profileComplete: true,
              isBanned: false,
              telegramId: { $ne: me.telegramId },
       }).sort({ lastActive: -1 }).limit(PAGE_SIZE).lean().exec();

       if (users.length === 0) {
              await ctx.reply(`😕 در استان <b>${province}</b> کاربری یافت نشد.`,
                     { parse_mode: 'HTML', reply_markup: mainMenuKeyboard.reply_markup });
              return;
       }
       await ctx.reply(`🗺️ <b>پروفایل‌های استان ${province}</b> — ${users.length} نفر`,
              { parse_mode: 'HTML', reply_markup: mainMenuKeyboard.reply_markup });
       for (const u of users) await sendProfileCard(ctx, u);
}

// ══════════════════════════════════════════════════════════
//  نمایش لیست پروفایل‌ها براساس جنسیت
// ══════════════════════════════════════════════════════════

async function showProfilesByGender(ctx: BotContext, gender: Gender): Promise<void> {
       const me = ctx.dbUser!;
       const label = gender === Gender.Male ? '👦 پسرها' : '👧 دخترها';
       const users = await UserModel.find({
              gender,
              profileComplete: true,
              isBanned: false,
              telegramId: { $ne: me.telegramId },
       }).sort({ lastActive: -1 }).limit(PAGE_SIZE).lean().exec();

       if (users.length === 0) {
              await ctx.reply(`😕 هیچ کاربری در دسته <b>${label}</b> یافت نشد.`,
                     { parse_mode: 'HTML', reply_markup: mainMenuKeyboard.reply_markup });
              return;
       }
       await ctx.reply(`⚧️ <b>پروفایل‌های ${label}</b> — ${users.length} نفر`,
              { parse_mode: 'HTML', reply_markup: mainMenuKeyboard.reply_markup });
       for (const u of users) await sendProfileCard(ctx, u);
}

// ══════════════════════════════════════════════════════════
//  کارت کوچک پروفایل (در لیست)
// ══════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendProfileCard(ctx: BotContext, u: any): Promise<void> {
       const icon = u.gender === 'male' ? '👦' : '👧';
       const text = `${icon} <b>${u.name ?? '—'}</b> | ${u.age ?? '—'} سال | ${u.city ?? u.province ?? '—'}`;
       await ctx.reply(text, {
              parse_mode: 'HTML',
              ...Markup.inlineKeyboard([
                     Markup.button.callback('👁 مشاهده پروفایل', `view_profile:${u.telegramId}`),
              ]),
       });
}

// ══════════════════════════════════════════════════════════
//  نمایش پروفایل کامل (callback: view_profile:ID)
// ══════════════════════════════════════════════════════════

export async function handleViewProfileCallback(
       ctx: BotContext,
       bot: Telegraf<BotContext>,
): Promise<void> {
       await ctx.answerCbQuery();

       if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
       const targetId = Number(ctx.callbackQuery.data.split(':')[1]);

       const target = await UserModel.findByTelegramId(targetId);
       if (!target || target.isBanned || !target.profileComplete) {
              await ctx.answerCbQuery('⚠️ این کاربر دیگر در دسترس نیست.', { show_alert: true });
              return;
       }

       const me = ctx.dbUser!;
       const genderText = target.gender === 'male' ? '👦 پسر' : '👧 دختر';
       const interests = target.interests.length > 0 ? target.interests.join(' ') : '—';
       const onlineStatus = timeAgo(target.lastActive);

       const profileText =
              `👤 <b>پروفایل کاربر</b>\n\n` +
              `📛 نام: <b>${target.name ?? '—'}</b>\n` +
              `${genderText}\n` +
              `🎂 سن: ${target.age ?? '—'}\n` +
              `📍 استان: ${target.province ?? '—'}\n` +
              `🏙️ شهر: ${target.city ?? '—'}\n` +
              `🎯 علایق: ${interests}\n` +
              `🕐 آخرین آنلاین: ${onlineStatus}\n` +
              `🆔 کد دعوت: <code>${target.inviteCode}</code>`;

       // دکمه‌ها — برای خودت دکمه چت و پیام و گزارش نشون نده
       const buttons =
              me.telegramId === targetId
                     ? []
                     : [
                            [
                                   Markup.button.callback('💬 درخواست چت', `profile_chat:${targetId}`),
                                   Markup.button.callback('📩 ارسال پیام', `profile_msg:${targetId}`),
                            ],
                            [
                                   Markup.button.callback('🚨 گزارش کاربر', `profile_report:${targetId}`),
                            ],
                     ];

       await ctx.reply(profileText, {
              parse_mode: 'HTML',
              ...Markup.inlineKeyboard(buttons),
       });
}

// ══════════════════════════════════════════════════════════
//  درخواست چت از صفحه پروفایل (callback: profile_chat:ID)
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

       // بررسی درخواست تکراری
       const existing = await ChatRequestModel.findOne({
              fromId: me.telegramId,
              toId: targetId,
              status: ChatRequestStatus.Pending,
       });
       if (existing) {
              await ctx.reply('⏳ قبلاً برای این کاربر درخواست چت فرستادی. منتظر پاسخ باش.');
              return;
       }

       // ثبت درخواست
       await ChatRequestModel.create({
              fromId: me.telegramId,
              toId: targetId,
              status: ChatRequestStatus.Pending,
       });

       // ارسال به هدف
       try {
              await bot.telegram.sendMessage(
                     targetId,
                     `💬 <b>${me.name ?? 'یک کاربر'}</b> درخواست چت مستقیم دارد.\n` +
                     `🎂 سن: ${me.age ?? '—'} | 📍 ${me.province ?? '—'}`,
                     {
                            parse_mode: 'HTML',
                            ...Markup.inlineKeyboard([
                                   Markup.button.callback('✅ قبول', `accept_chat:${me.telegramId}`),
                                   Markup.button.callback('❌ رد', `reject_chat:${me.telegramId}`),
                            ]),
                     },
              );
       } catch {
              await ctx.reply('⚠️ پیام به کاربر ارسال نشد. ممکنه ربات رو بلاک کرده باشه.');
              return;
       }

       await ctx.reply('✅ درخواست چت ارسال شد. منتظر پاسخ باش.', mainMenuKeyboard);
}

// ══════════════════════════════════════════════════════════
//  ارسال پیام مستقیم از صفحه پروفایل (callback: profile_msg:ID)
// ══════════════════════════════════════════════════════════

export async function handleProfileMsgCallback(ctx: BotContext): Promise<void> {
       await ctx.answerCbQuery();
       if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

       const targetId = Number(ctx.callbackQuery.data.split(':')[1]);
       const me = ctx.dbUser!;

       const target = await UserModel.findByTelegramId(targetId);
       if (!target || target.isBanned) {
              await ctx.reply('⚠️ این کاربر در دسترس نیست.');
              return;
       }

       // ذخیره مرحله در session
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
//  گزارش از صفحه پروفایل (callback: profile_report:ID)
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

       // استفاده از همان مکانیزم گزارش چت — chatId خالی
       ctx.session.step = `report:${targetId}:profile`;

       await ctx.reply(
              '🚨 دلیل گزارش رو بنویس:\n\n(مثلاً: تصویر پروفایل نامناسب، رفتار آزاردهنده، ...)',
              { reply_markup: { remove_keyboard: true } },
       );
}
