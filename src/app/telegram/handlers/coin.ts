// src/app/telegram/handlers/coin.ts
// ─── سیستم سکه ───────────────────────────────────────────
//
//  جریان کار:
//  1. کاربر «🪙 سکه‌هام» می‌زند
//  2. موجودی + تاریخچه تغییرات نشان داده می‌شود
//  3. لیست پکیج‌های خرید با inline keyboard نمایش داده می‌شود
//  4. کاربر پکیج انتخاب می‌کند → لینک پرداخت ارسال می‌شود
//  5. بعد از پرداخت موفق (webhook) → سکه اضافه می‌شود
//
//  نکته: درگاه پرداخت = زرین‌پال (ZARINPAL_MERCHANT_ID در .env)

import { Markup, Telegraf, Telegram } from 'telegraf';
import type { BotContext } from '../context';
import {
       COIN_PACKAGES,
       CoinPackageId,
       CoinChangeReason,
       type CoinPackage,
       TransactionStatus,
} from '@/types/enums';
import { TransactionModel, CoinLogModel } from '@/models/coin.model';
import { UserModel } from '@/models/user.model';
import { mainMenuKeyboard } from '@/lib/keyboards';

// ─── متن توضیح هر پکیج ───────────────────────────────────

function packageLabel(pkg: CoinPackage): string {
       const priceFormatted = pkg.price.toLocaleString('fa-IR');
       return `🪙 ${pkg.coins} سکه — ${priceFormatted} تومان`;
}

// ─── Inline keyboard پکیج‌ها ──────────────────────────────

export function coinPackagesKeyboard() {
       const buttons = COIN_PACKAGES.map((pkg) =>
              Markup.button.callback(packageLabel(pkg), `buy_coins:${pkg.id}`),
       );
       // دو تا در هر ردیف
       const rows = [];
       for (let i = 0; i < buttons.length; i += 2) {
              rows.push(buttons.slice(i, i + 2));
       }
       rows.push([Markup.button.callback('🔙 بازگشت', 'coins_back')]);
       return Markup.inlineKeyboard(rows);
}

// ══════════════════════════════════════════════════════════
//  نمایش صفحه سکه
// ══════════════════════════════════════════════════════════

export async function showCoinsPage(ctx: BotContext): Promise<void> {
       const user = ctx.dbUser!;

       // آخرین ۵ تراکنش
       const logs = await CoinLogModel.getHistory(user.telegramId, 5);

       let historyText = '';
       if (logs.length > 0) {
              historyText = '\n\n📋 *آخرین تغییرات:*\n';
              const reasonLabels: Record<CoinChangeReason, string> = {
                     [CoinChangeReason.Purchase]: '💳 خرید',
                     [CoinChangeReason.InviteReward]: '🎁 دعوت دوست',
                     [CoinChangeReason.ChatFemale]: '💬 چت',
                     [CoinChangeReason.Refund]: '↩️ بازگشت',
                     [CoinChangeReason.AdminGift]: '🎁 هدیه ادمین',
              };
              for (const log of logs) {
                     const sign = log.change > 0 ? '+' : '';
                     const label = reasonLabels[log.reason] ?? log.reason;
                     historyText += `${sign}${log.change} — ${label}\n`;
              }
       }

       await ctx.reply(
              `🪙 *موجودی سکه شما*\n\n` +
              `💰 موجودی فعلی: *${user.coins} سکه*\n` +
              `\n📦 برای خرید سکه یکی از پکیج‌های زیر رو انتخاب کن:` +
              historyText,
              { parse_mode: 'Markdown', ...coinPackagesKeyboard() },
       );
}

// ══════════════════════════════════════════════════════════
//  شروع خرید — ساخت تراکنش + لینک پرداخت
// ══════════════════════════════════════════════════════════

export async function initiatePurchase(
       ctx: BotContext,
       packageId: CoinPackageId,
): Promise<void> {
       const user = ctx.dbUser!;

       // ─── ساخت تراکنش در DB ────────────────────────────
       const transaction = await TransactionModel.createFromPackageId(
              user.telegramId,
              packageId,
       );

       const pkg = COIN_PACKAGES.find((p) => p.id === packageId)!;
       const priceFormatted = pkg.price.toLocaleString('fa-IR');

       // ─── ساخت لینک پرداخت زرین‌پال ───────────────────
       const callbackUrl = `${process.env.APP_URL}/api/payment/verify?txId=${transaction._id}`;

       try {
              const zarinRes = await fetch('https://api.zarinpal.com/pg/v4/payment/request.json', {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({
                            merchant_id: process.env.ZARINPAL_MERCHANT_ID,
                            amount: pkg.price * 10, // تبدیل تومان به ریال
                            description: `خرید ${pkg.coins} سکه در هم‌دل`,
                            callback_url: callbackUrl,
                            metadata: { mobile: '', email: '' },
                     }),
              });

              const zarinData = await zarinRes.json() as {
                     data?: {
                            code: number;
                            authority: string;
                     };
                     errors?: {
                            message?: string;
                     };
              };
              if (zarinData.data?.code === 100) {
                     const authority = zarinData.data.authority;
                     const payUrl = `https://www.zarinpal.com/pg/StartPay/${authority}`;

                     // ذخیره authority در تراکنش
                     transaction.paymentAuthority = authority;
                     await transaction.save();

                     if ('answerCbQuery' in ctx && ctx.callbackQuery) {
                            await ctx.answerCbQuery();
                     } await ctx.editMessageText(
                            `💳 *پرداخت ${pkg.coins} سکه*\n\n` +
                            `مبلغ: *${priceFormatted} تومان*\n\n` +
                            `روی دکمه زیر کلیک کن و پرداخت رو انجام بده.\n` +
                            `بعد از پرداخت موفق، سکه‌ها به حسابت اضافه میشه ✅`,
                            {
                                   parse_mode: 'Markdown',
                                   ...Markup.inlineKeyboard([
                                          [Markup.button.url('💳 پرداخت آنلاین', payUrl)],
                                          [Markup.button.callback('🔙 بازگشت', 'show_coins')],
                                   ]),
                            },
                     );
              } else {
                     throw new Error(`Zarinpal error: ${zarinData.errors?.message ?? 'unknown'}`);
              }
       } catch (err) {
              console.error('[initiatePurchase] ERROR:', err);
              await ctx.answerCbQuery('❌ خطا در اتصال به درگاه پرداخت');
              await ctx.editMessageText(
                     '❌ متأسفانه در حال حاضر امکان اتصال به درگاه پرداخت وجود ندارد.\n\nلطفاً بعداً دوباره تلاش کنید.',
                     {
                            ...Markup.inlineKeyboard([
                                   [Markup.button.callback('🔙 بازگشت', 'show_coins')],
                            ]),
                     },
              );
       }
}

// ══════════════════════════════════════════════════════════
//  تأیید پرداخت (فراخوانی از webhook)
// ══════════════════════════════════════════════════════════

export async function verifyAndCreditCoins(
       bot: Telegraf<BotContext>,
       txId: string,
       authority: string,
       status: string,
): Promise<{ success: boolean; message: string }> {

       const transaction = await TransactionModel.findById(txId);
       if (!transaction) return { success: false, message: 'تراکنش یافت نشد' };
       if (transaction.status !== TransactionStatus.Pending) return { success: false, message: 'تراکنش قبلاً پردازش شده' };

       // ─── تأیید پرداخت از زرین‌پال ─────────────────────
       if (status !== 'OK') {
              await transaction.markFailed();
              return { success: false, message: 'پرداخت لغو شد' };
       }

       try {
              const pkg = COIN_PACKAGES.find((p) => p.id === transaction.package)!;

              const verifyRes = await fetch('https://api.zarinpal.com/pg/v4/payment/verify.json', {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({
                            merchant_id: process.env.ZARINPAL_MERCHANT_ID,
                            amount: pkg.price * 10,
                            authority,
                     }),
              });

              const verifyData = await verifyRes.json() as {
                     data?: {
                            code: number;
                     };
              };
              if (verifyData.data?.code === 100 || verifyData.data?.code === 101) {
                     // پرداخت موفق
                     await transaction.markPaid(authority);

                     // اضافه کردن سکه به کاربر
                     const user = await UserModel.findByTelegramId(transaction.telegramId);
                     if (user) {
                            user.coins += transaction.coins;
                            await user.save();

                            // ثبت لاگ
                            await CoinLogModel.record(
                                   user.telegramId,
                                   transaction.coins,
                                   CoinChangeReason.Purchase,
                                   user.coins,
                                   transaction._id.toString(),
                            );
                            const telegram = new Telegram(process.env.BOT_TOKEN!);

                            // اطلاع به کاربر در تلگرام
                            await telegram.sendMessage(
                                   user.telegramId,
                                   `✅ *پرداخت موفق!*\n\n` +
                                   `🪙 ${transaction.coins} سکه به حسابت اضافه شد.\n` +
                                   `💰 موجودی فعلی: ${user.coins} سکه`,
                                   { parse_mode: 'Markdown', ...mainMenuKeyboard },
                            ).catch(() => { });
                     }

                     return { success: true, message: 'پرداخت موفق' };
              } else {
                     await transaction.markFailed();
                     return { success: false, message: 'تأیید پرداخت ناموفق بود' };
              }
       } catch (err) {
              console.error('[verifyAndCreditCoins] ERROR:', err);
              await transaction.markFailed();
              return { success: false, message: 'خطای داخلی' };
       }
}
