// src/app/telegram/handlers/start.ts
// ─── هندلر دستور /start ──────────────────────────────────
// اگر کاربر جدید بود → ثبت‌نام
// اگر نیمه‌کاره بود → ادامه ثبت‌نام
// اگر کامل بود → منوی اصلی

import type { BotContext } from '../context';
import { UserState } from '@/types/enums';
import { askGender, handleRegistrationStep } from './registration';
import { mainMenuKeyboard } from '@/lib/keyboards';
import { adminMenuHandler, isAdmin, requireAdmin } from './admin';

export async function startHandler(ctx: BotContext): Promise<void> {
  const user = ctx.dbUser!;

  // ─── ادمین را مستقیم به پنل می‌فرستیم ─────────────────
  // requireAdmin پیام راهنما می‌دهد اگر ADMIN_TELEGRAM_ID ست نباشد
  const adminEnvId = Number(process.env.ADMIN_TELEGRAM_ID);
  if (!adminEnvId) {
    // env ست نشده — به کاربر فعلی آیدیش را نشان می‌دهیم
    await ctx.reply(
      `⚠️ <b>تنظیم ادمین</b>\n\n` +
      `متغیر <code>ADMIN_TELEGRAM_ID</code> در سرور ست نشده است.\n\n` +
      `آیدی تلگرام شما:\n<code>${ctx.from?.id}</code>\n\n` +
      `این مقدار را در فایل <code>.env.local</code> ست کنید:\n` +
      `<code>ADMIN_TELEGRAM_ID=${ctx.from?.id}</code>`,
      { parse_mode: 'HTML' },
    );
    return;
  }

  if (isAdmin(ctx)) {
    await adminMenuHandler(ctx);
    return;
  }

  switch (user.state) {

    // ─── کاربر جدید یا برگشته به خانه ───────────────────
    case UserState.Start:
      await askGender(ctx);
      break;

    // ─── در حال ثبت‌نام ───────────────────────────────────
    case UserState.SetGender:
    case UserState.SetName:
    case UserState.SetAge:
    case UserState.SetProvince:
    case UserState.SetCity:
      await ctx.reply('⏳ ثبت‌نامت ناتمام مونده، بریم ادامه بدیم...');
      await handleRegistrationStep(ctx);
      break;

    // ─── ثبت‌نام کامل ─────────────────────────────────────
    case UserState.Complete:
    case UserState.InChat:
    case UserState.InQueue:
      await ctx.reply(
        `👋 سلام ${user.name}!\n\nچیکار می‌خوای بکنی؟`,
        mainMenuKeyboard
      );
      break;
  }
}