// src/app/telegram/handlers/message.ts
// ─── روتر اصلی پیام‌ها ───────────────────────────────────

import { Telegraf } from 'telegraf';
import type { BotContext } from '../context';
import { UserState } from '@/types/enums';
import { handleRegistrationStep } from './registration';
import { mainMenuKeyboard } from '@/lib/keyboards';
import { joinRandomQueue, leaveQueue, forwardChatMessage, submitReport } from './random-chat';
import { startDirectChat, handleDirectChatSearch } from './direct-chat';
import { showCoinsPage } from './coin';
import { showInvitePage } from './invite';
import {
       showSettingsMenu,
       handleEditName,
       handleEditAge,
       handleEditProvince,
       handleEditCity,
} from './settings';
import { isAdmin } from './admin';

// ─── متن پیام ────────────────────────────────────────────

function getText(ctx: BotContext): string | null {
       if (ctx.message && 'text' in ctx.message) return ctx.message.text.trim();
       return null;
}

// ══════════════════════════════════════════════════════════
//  روتر اصلی
// ══════════════════════════════════════════════════════════

export function makeMessageRouter(bot: Telegraf<BotContext>) {
       return async function messageRouter(ctx: BotContext): Promise<void> {
              const user = ctx.dbUser;

              if (!user) {
                     await ctx.reply('❌ خطا. لطفاً /start بزن.');
                     return;
              }

              // ─── ادمین از روتر کاربر عادی خارج می‌شود ────────────
              // دستورات /admin /ban /stats ... توسط bot.command پردازش می‌شوند.
              // پیام‌های متنی ادمین (غیر دستور) نباید وارد فلوی ثبت‌نام شوند.
              if (isAdmin(ctx)) {
                     const msgText = getText(ctx) ?? '';
                     // اگر دستور بود (/) telegraf خودش هندل کرده — اینجا نمی‌رسد
                     // اگر متن آزاد بود، منوی ادمین را نشان بده
                     if (!msgText.startsWith('/')) {
                            const { adminMenuHandler } = await import('./admin');
                            await adminMenuHandler(ctx);
                     }
                     return;
              }

              const text = getText(ctx);

              // ─── session steps ───────────────────────────────────

              const step = ctx.session?.step;
              if (step?.startsWith('report:')) {
                     await submitReport(ctx, bot);
                     return;
              }

              if (step === 'direct:search') {
                     await handleDirectChatSearch(ctx, bot);
                     return;
              }

              if (step === 'settings:name') {
                     await handleEditName(ctx);
                     return;
              }

              if (step === 'settings:age') {
                     await handleEditAge(ctx);
                     return;
              }

              if (step === 'settings:province') {
                     await handleEditProvince(ctx);
                     return;
              }

              if (step === 'settings:city') {
                     await handleEditCity(ctx);
                     return;
              }

              // ─── state-based routing ─────────────────────────────

              switch (user.state) {

                     case UserState.Start:
                     case UserState.SetGender:
                     case UserState.SetName:
                     case UserState.SetAge:
                     case UserState.SetProvince:
                     case UserState.SetCity:
                            await handleRegistrationStep(ctx, bot);
                            break;

                     case UserState.Complete:
                            await handleMainMenu(ctx, bot, text);
                            break;

                     case UserState.InQueue:
                            if (text === '❌ لغو جستجو') {
                                   await leaveQueue(ctx);
                            } else {
                                   await ctx.reply('⏳ داری دنبال همصحبت می‌گردیم... برای لغو «❌ لغو جستجو» بزن.');
                            }
                            break;

                     case UserState.InChat:
                            await forwardChatMessage(ctx, bot);
                            break;
              }
       };
}

// ══════════════════════════════════════════════════════════
//  منوی اصلی
// ══════════════════════════════════════════════════════════

async function handleMainMenu(
       ctx: BotContext,
       bot: Telegraf<BotContext>,
       text: string | null,
): Promise<void> {
       switch (text) {

              case '🎲 چت تصادفی':
                     await joinRandomQueue(ctx, bot);
                     break;

              case '💬 چت مستقیم':
                     await startDirectChat(ctx);
                     break;

              case '👤 پروفایل من':
                     await showProfile(ctx);
                     break;

              case '🪙 سکه‌هام':
                     await showCoinsPage(ctx);
                     break;

              case '🔗 دعوت دوستان':
                     await showInvitePage(ctx);
                     break;

              case '⚙️ تنظیمات':
                     await showSettingsMenu(ctx);
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
       const interestText = user.interests.length > 0 ? user.interests.join('، ') : '—';

       const profileText =
              `👤 *پروفایل شما*\n\n` +
              `📛 نام: ${user.name ?? '—'}\n` +
              `${genderText}\n` +
              `🎂 سن: ${user.age ?? '—'}\n` +
              `📍 استان: ${user.province ?? '—'}\n` +
              `🏙️ شهر: ${user.city ?? '—'}\n` +
              `🎯 علایق: ${interestText}\n` +
              `🪙 سکه: ${user.coins}\n` +
              `🔗 کد دعوت: \`${user.inviteCode}\``;

       await ctx.reply(profileText, { parse_mode: 'Markdown' });
}
