// src/app/telegram/handlers/registration.ts
// ─── هندلر ثبت‌نام کاربر ────────────────────────────────
// مراحل: set_gender → set_name → set_age → set_province → set_city → complete

import type { Telegraf } from 'telegraf';
import type { BotContext } from '../context';
import { UserState, Gender, MIN_AGE, MAX_AGE, COIN_REWARD_WELCOME } from '@/types/enums';
import { rewardInviter } from './invite';
import { IRAN_PROVINCES, isCityInProvince } from '@/types/iran';
import type { IranProvince } from '@/types/iran';
import {
       genderKeyboard,
       provinceKeyboard,
       cityKeyboard,
       mainMenuKeyboard,
} from '@/lib/keyboards';

// ─── مپ تبدیل متن دکمه به Gender ─────────────────────────

const GENDER_MAP: Record<string, Gender> = {
       '👦 پسر': Gender.Male,
       '👧 دختر': Gender.Female,
};

// ─── ورودی متن کاربر ─────────────────────────────────────

function getText(ctx: BotContext): string | null {
       if (ctx.message && 'text' in ctx.message) return ctx.message.text.trim();
       return null;
}

// ══════════════════════════════════════════════════════════
//  شروع ثبت‌نام — پرسش جنسیت
// ══════════════════════════════════════════════════════════

export async function askGender(ctx: BotContext): Promise<void> {
       const user = ctx.dbUser!;
       user.state = UserState.SetGender;
       await user.save();

       await ctx.reply(
              '👋 سلام! به حامدل خوش اومدی.\n\nاول بگو جنسیتت چیه؟',
              genderKeyboard
       );
}

// ══════════════════════════════════════════════════════════
//  روتر ثبت‌نام — بر اساس state کاربر مرحله بعد را صدا می‌زند
// ══════════════════════════════════════════════════════════

export async function handleRegistrationStep(ctx: BotContext, bot?: Telegraf<BotContext>): Promise<void> {
       const user = ctx.dbUser!;
       const text = getText(ctx);

       switch (user.state) {

              // ─── مرحله ۱: انتخاب جنسیت ──────────────────────────
              case UserState.SetGender: {
                     if (!text || !GENDER_MAP[text]) {
                            await ctx.reply('لطفاً یکی از گزینه‌های زیر را انتخاب کن:', genderKeyboard);
                            return;
                     }

                     user.gender = GENDER_MAP[text];
                     user.state = UserState.SetName;
                     await user.save();

                     await ctx.reply('اسمت چیه؟ (اسم نمایشی در چت)', { reply_markup: { remove_keyboard: true } });
                     break;
              }

              // ─── مرحله ۲: اسم ────────────────────────────────────
              case UserState.SetName: {
                     if (!text || text.length < 2 || text.length > 50) {
                            await ctx.reply('⚠️ اسم باید بین ۲ تا ۵۰ کاراکتر باشه. دوباره وارد کن:');
                            return;
                     }

                     user.name = text;
                     user.state = UserState.SetAge;
                     await user.save();

                     await ctx.reply(`خوشحال از آشناییت ${text}! 😊\n\nچند سالته؟`);
                     break;
              }

              // ─── مرحله ۳: سن ─────────────────────────────────────
              case UserState.SetAge: {
                     const age = Number(text);

                     if (!text || isNaN(age) || age < MIN_AGE || age > MAX_AGE) {
                            await ctx.reply(`⚠️ سن باید بین ${MIN_AGE} تا ${MAX_AGE} باشه. دوباره وارد کن:`);
                            return;
                     }

                     user.age = age;
                     user.state = UserState.SetProvince;
                     await user.save();

                     await ctx.reply('استانت رو انتخاب کن:', provinceKeyboard);
                     break;
              }

              // ─── مرحله ۴: استان ──────────────────────────────────
              case UserState.SetProvince: {
                     if (!text || !(IRAN_PROVINCES as readonly string[]).includes(text)) {
                            await ctx.reply('⚠️ لطفاً استان رو از لیست انتخاب کن:', provinceKeyboard);
                            return;
                     }

                     user.province = text as IranProvince;
                     user.state = UserState.SetCity;
                     await user.save();

                     await ctx.reply('شهرت رو انتخاب کن:', cityKeyboard(text as IranProvince));
                     break;
              }

              // ─── مرحله ۵: شهر ────────────────────────────────────
              case UserState.SetCity: {
                     // دکمه بازگشت
                     if (text === '🔙 تغییر استان') {
                            user.state = UserState.SetProvince;
                            user.province = undefined;
                            await user.save();
                            await ctx.reply('استانت رو انتخاب کن:', provinceKeyboard);
                            return;
                     }

                     if (!text || !user.province || !isCityInProvince(user.province, text)) {
                            await ctx.reply('⚠️ لطفاً شهر رو از لیست انتخاب کن:', cityKeyboard(user.province!));
                            return;
                     }

                     user.city = text;
                     user.state = UserState.Complete;
                     user.profileComplete = true;
                     user.coins += COIN_REWARD_WELCOME;
                     await user.save();

                     // ─── پاداش دعوت ──────────────────────────────────────
                     if (user.invitedBy && bot) {
                            await rewardInviter(bot, user.telegramId, user.invitedBy);
                     }

                     await ctx.reply(
                            `✅ ثبت‌نام کامل شد!\n\n` +
                            `👤 نام: ${user.name}\n` +
                            `${user.gender === Gender.Male ? '👦' : '👧'} جنسیت: ${user.gender === Gender.Male ? 'پسر' : 'دختر'}\n` +
                            `🎂 سن: ${user.age}\n` +
                            `📍 استان: ${user.province} — ${user.city}\n\n` +
                            `🎁 <b>${COIN_REWARD_WELCOME} سکه هدیه خوش‌آمدگویی</b> به حسابت اضافه شد!\n\n` +
                            `حالا می‌تونی شروع کنی! 🎉`,
                            { parse_mode: 'HTML', ...mainMenuKeyboard },
                     );
                     break;
              }

              default:
                     break;
       }
}