// src/app/telegram/handlers/profile-browse.ts
// ─── مرور پروفایل کاربران ─────────────────────────────────
//
//  دو حالت:
//  1. براساس استان → نمایش لیست پروفایل‌ها
//  2. براساس جنسیت → نمایش لیست پروفایل‌ها
//
//  هر پروفایل: نام، سن، شهر + دکمه اینلاین برای نمایش ID

import type { Telegraf } from 'telegraf';
import type { BotContext } from '../context';
import { Gender } from '@/types/enums';
import { UserModel } from '@/models/user.model';
import { mainMenuKeyboard, profileBrowseKeyboard, browseGenderKeyboard, provinceKeyboard } from '@/lib/keyboards';
import type { IranProvince } from '@/types/iran';
import { IRAN_PROVINCES } from '@/types/iran';
import { Markup } from 'telegraf';

const PAGE_SIZE = 8; // تعداد پروفایل در هر صفحه

// ══════════════════════════════════════════════════════════
//  نمایش منوی اصلی مرور پروفایل
// ══════════════════════════════════════════════════════════

export async function showProfileBrowseMenu(ctx: BotContext): Promise<void> {
       ctx.session.step = 'profile:browse_menu';
       await ctx.reply(
              '👥 <b>جستجو براساس پروفایل</b>\n\nچطور می‌خوای پروفایل‌ها رو ببینی؟',
              { parse_mode: 'HTML', reply_markup: profileBrowseKeyboard.reply_markup },
       );
}

// ══════════════════════════════════════════════════════════
//  هندلر متن‌های مرحله‌ای
// ══════════════════════════════════════════════════════════

export async function handleProfileBrowseStep(
       ctx: BotContext,
       text: string,
): Promise<boolean> {
       const step = ctx.session.step;

       // ─── منوی اصلی مرور ──────────────────────────────────
       if (step === 'profile:browse_menu') {
              if (text === '🔙 بازگشت') {
                     ctx.session.step = undefined;
                     await ctx.reply('بازگشت به منوی اصلی', mainMenuKeyboard);
                     return true;
              }

              if (text === '🗺️ پروفایل‌ها براساس استان') {
                     ctx.session.step = 'profile:browse_province';
                     await ctx.reply(
                            '🗺️ استان مورد نظر رو انتخاب کن:',
                            provinceKeyboard,
                     );
                     return true;
              }

              if (text === '⚧️ پروفایل‌ها براساس جنسیت') {
                     ctx.session.step = 'profile:browse_gender';
                     await ctx.reply(
                            '⚧️ جنسیت مورد نظر رو انتخاب کن:',
                            browseGenderKeyboard,
                     );
                     return true;
              }

              await ctx.reply('لطفاً یکی از گزینه‌ها را انتخاب کن:', profileBrowseKeyboard);
              return true;
       }

       // ─── انتخاب استان ────────────────────────────────────
       if (step === 'profile:browse_province') {
              if (text === '🔙 بازگشت') {
                     ctx.session.step = 'profile:browse_menu';
                     await ctx.reply('بازگشت به منوی مرور پروفایل', profileBrowseKeyboard);
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

       // ─── انتخاب جنسیت ────────────────────────────────────
       if (step === 'profile:browse_gender') {
              if (text === '🔙 بازگشت') {
                     ctx.session.step = 'profile:browse_menu';
                     await ctx.reply('بازگشت به منوی مرور پروفایل', profileBrowseKeyboard);
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

       return false;
}

// ══════════════════════════════════════════════════════════
//  نمایش پروفایل‌ها براساس استان
// ══════════════════════════════════════════════════════════

async function showProfilesByProvince(ctx: BotContext, province: IranProvince): Promise<void> {
       const currentUser = ctx.dbUser!;

       const users = await UserModel.find({
              province,
              profileComplete: true,
              isBanned: false,
              telegramId: { $ne: currentUser.telegramId },
       })
              .sort({ lastActive: -1 })
              .limit(PAGE_SIZE)
              .lean()
              .exec();

       if (users.length === 0) {
              await ctx.reply(
                     `😕 در استان <b>${province}</b> کاربری یافت نشد.`,
                     { parse_mode: 'HTML', reply_markup: mainMenuKeyboard.reply_markup },
              );
              return;
       }

       await ctx.reply(
              `🗺️ <b>پروفایل‌های استان ${province}</b> (${users.length} نفر)`,
              { parse_mode: 'HTML', reply_markup: mainMenuKeyboard.reply_markup },
       );

       for (const u of users) {
              await sendProfileCard(ctx, u);
       }
}

// ══════════════════════════════════════════════════════════
//  نمایش پروفایل‌ها براساس جنسیت
// ══════════════════════════════════════════════════════════

async function showProfilesByGender(ctx: BotContext, gender: Gender): Promise<void> {
       const currentUser = ctx.dbUser!;
       const genderLabel = gender === Gender.Male ? '👦 پسرها' : '👧 دخترها';

       const users = await UserModel.find({
              gender,
              profileComplete: true,
              isBanned: false,
              telegramId: { $ne: currentUser.telegramId },
       })
              .sort({ lastActive: -1 })
              .limit(PAGE_SIZE)
              .lean()
              .exec();

       if (users.length === 0) {
              await ctx.reply(
                     `😕 هیچ کاربری در دسته <b>${genderLabel}</b> یافت نشد.`,
                     { parse_mode: 'HTML', reply_markup: mainMenuKeyboard.reply_markup },
              );
              return;
       }

       await ctx.reply(
              `⚧️ <b>پروفایل‌های ${genderLabel}</b> (${users.length} نفر)`,
              { parse_mode: 'HTML', reply_markup: mainMenuKeyboard.reply_markup },
       );

       for (const u of users) {
              await sendProfileCard(ctx, u);
       }
}

// ══════════════════════════════════════════════════════════
//  کارت پروفایل — نام، سن، شهر + دکمه نمایش آیدی
// ══════════════════════════════════════════════════════════

async function sendProfileCard(
       ctx: BotContext,
       // eslint-disable-next-line @typescript-eslint/no-explicit-any
       u: any,
): Promise<void> {
       const genderIcon = u.gender === 'male' ? '👦' : '👧';
       const text =
              `${genderIcon} <b>${u.name ?? '—'}</b>\n` +
              `🎂 سن: ${u.age ?? '—'}\n` +
              `🏙️ شهر: ${u.city ?? u.province ?? '—'}`;

       const buttons = Markup.inlineKeyboard([
              Markup.button.callback('👁 نمایش آیدی', `show_id:${u.telegramId}`),
       ]);

       await ctx.reply(text, { parse_mode: 'HTML', ...buttons });
}

// ══════════════════════════════════════════════════════════
//  هندلر callback دکمه «نمایش آیدی»
// ══════════════════════════════════════════════════════════

export async function handleShowIdCallback(ctx: BotContext): Promise<void> {
       await ctx.answerCbQuery();

       if (!('data' in ctx.callbackQuery!)) return;
       const targetId = Number(ctx.callbackQuery.data.split(':')[1]);

       const target = await UserModel.findByTelegramId(targetId);
       if (!target || target.isBanned || !target.profileComplete) {
              await ctx.answerCbQuery('⚠️ این کاربر دیگر در دسترس نیست.', { show_alert: true });
              return;
       }

       const username = target.username ? `@${target.username}` : null;
       const msg = username
              ? `🆔 آیدی: ${username}`
              : `🆔 آیدی تلگرام: <code>${target.telegramId}</code>`;

       await ctx.reply(msg, { parse_mode: 'HTML' });
}
