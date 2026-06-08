// src/app/telegram/handlers/start.ts
// ─── هندلر دستور /start ──────────────────────────────────
// اگر کاربر جدید بود → ثبت‌نام
// اگر نیمه‌کاره بود → ادامه ثبت‌نام
// اگر کامل بود → منوی اصلی

import type { BotContext } from '../context';
import { UserState } from '@/types/enums';
import { askGender, handleRegistrationStep } from './registration';
import { mainMenuKeyboard } from '@/lib/keyboards';
import { adminMenuHandler, isAdmin } from './admin';

export async function startHandler(ctx: BotContext): Promise<void> {
  const user = ctx.dbUser!;

  // ─── ادمین را مستقیم به پنل می‌فرستیم ─────────────────
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