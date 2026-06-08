// src/app/telegram/handlers/message.ts
// ─── روتر اصلی پیام‌ها ───────────────────────────────────
// بر اساس state کاربر تصمیم می‌گیرد کجا بفرستد

import type { BotContext } from '../context';
import { UserState } from '@/types/enums';
import { handleRegistrationStep } from './registration';
import { mainMenuKeyboard } from '@/lib/keyboards';

// ─── متن پیام ────────────────────────────────────────────

function getText(ctx: BotContext): string | null {
       if (ctx.message && 'text' in ctx.message) return ctx.message.text.trim();
       return null;
}

// ══════════════════════════════════════════════════════════
//  روتر اصلی
// ══════════════════════════════════════════════════════════

export async function messageRouter(ctx: BotContext): Promise<void> {
       const user = ctx.dbUser;

       if (!user) {
              await ctx.reply('❌ خطا. لطفاً /start بزن.');
              return;
       }

       const text = getText(ctx);

       switch (user.state) {

              // ─── در حال ثبت‌نام ───────────────────────────────────
              case UserState.Start:
              case UserState.SetGender:
              case UserState.SetName:
              case UserState.SetAge:
              case UserState.SetProvince:
              case UserState.SetCity:
                     await handleRegistrationStep(ctx);
                     break;

              // ─── منوی اصلی ────────────────────────────────────────
              case UserState.Complete:
                     await handleMainMenu(ctx, text);
                     break;

              // ─── در صف انتظار ─────────────────────────────────────
              case UserState.InQueue:
                     if (text === '❌ لغو جستجو') {
                            // TODO: مرحله ۴ — random-chat handler
                            await ctx.reply('جستجو لغو شد.', mainMenuKeyboard);
                     } else {
                            await ctx.reply('⏳ داری دنبال همصحبت می‌گردیم... برای لغو «❌ لغو جستجو» بزن.');
                     }
                     break;

              // ─── در چت فعال ──────────────────────────────────────
              case UserState.InChat:
                     // TODO: مرحله ۴ — forward پیام به طرف مقابل
                     await ctx.reply('🔧 سیستم چت به زودی فعال می‌شه.');
                     break;
       }
}

// ══════════════════════════════════════════════════════════
//  منوی اصلی
// ══════════════════════════════════════════════════════════

async function handleMainMenu(ctx: BotContext, text: string | null): Promise<void> {
       switch (text) {

              case '🎲 چت تصادفی':
                     // TODO: مرحله ۴
                     await ctx.reply('🔧 چت تصادفی به زودی فعال می‌شه.');
                     break;

              case '💬 چت مستقیم':
                     // TODO: مرحله ۵
                     await ctx.reply('🔧 چت مستقیم به زودی فعال می‌شه.');
                     break;

              case '👤 پروفایل من':
                     await showProfile(ctx);
                     break;

              case '🪙 سکه‌هام':
                     // TODO: مرحله ۶
                     await ctx.reply('🔧 سیستم سکه به زودی فعال می‌شه.');
                     break;

              case '🔗 دعوت دوستان':
                     // TODO: مرحله ۷
                     await ctx.reply('🔧 سیستم دعوت به زودی فعال می‌شه.');
                     break;

              case '⚙️ تنظیمات':
                     await ctx.reply('🔧 تنظیمات به زودی اضافه می‌شه.');
                     break;

              default:
                     await ctx.reply('از منوی پایین یه گزینه انتخاب کن 👇', mainMenuKeyboard);
                     break;
       }
}

// ══════════════════════════════════════════════════════════
//  نمایش پروفایل
// ══════════════════════════════════════════════════════════

async function showProfile(ctx: BotContext): Promise<void> {
       const user = ctx.dbUser!;

       const genderText = user.gender === 'male' ? '👦 پسر' : '👧 دختر';
       const profileText =
              `👤 *پروفایل شما*\n\n` +
              `📛 نام: ${user.name ?? '—'}\n` +
              `${genderText}\n` +
              `🎂 سن: ${user.age ?? '—'}\n` +
              `📍 استان: ${user.province ?? '—'}\n` +
              `🏙️ شهر: ${user.city ?? '—'}\n` +
              `🪙 سکه: ${user.coins}\n` +
              `🔗 کد دعوت: \`${user.inviteCode}\``;

       await ctx.reply(profileText, { parse_mode: 'Markdown' });
}