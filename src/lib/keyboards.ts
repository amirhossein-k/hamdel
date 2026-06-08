// src/lib/keyboards.ts
// ─── تمام keyboard های ربات در یک جا ────────────────────

import { Markup } from 'telegraf';
import { IRAN_PROVINCES } from '@/types/iran';
import { getCitiesOfProvince } from '@/types/iran';
import type { IranProvince } from '@/types/iran';

// ─── ثبت‌نام ──────────────────────────────────────────────

export const genderKeyboard = Markup.keyboard([
       ['👦 پسر', '👧 دختر'],
]).resize().oneTime();

export const provinceKeyboard = (() => {
       // ۳ استان در هر ردیف
       const rows: string[][] = [];
       for (let i = 0; i < IRAN_PROVINCES.length; i += 3) {
              rows.push([...IRAN_PROVINCES.slice(i, i + 3)]);
       }
       return Markup.keyboard(rows).resize().oneTime();
})();

export function cityKeyboard(province: IranProvince) {
       const cities = getCitiesOfProvince(province);
       const rows: string[][] = [];
       for (let i = 0; i < cities.length; i += 3) {
              rows.push([...cities.slice(i, i + 3)]);
       }
       rows.push(['🔙 تغییر استان']);
       return Markup.keyboard(rows).resize().oneTime();
}

// ─── منوی اصلی ────────────────────────────────────────────

export const mainMenuKeyboard = Markup.keyboard([
       ['🎲 چت تصادفی', '💬 چت مستقیم'],
       ['👤 پروفایل من', '🪙 سکه‌هام'],
       ['🔗 دعوت دوستان', '⚙️ تنظیمات'],
]).resize();

// ─── داخل چت ──────────────────────────────────────────────

export const inChatKeyboard = Markup.keyboard([
       ['🔚 پایان چت', '🚨 گزارش'],
]).resize();

// ─── در صف انتظار ─────────────────────────────────────────

export const inQueueKeyboard = Markup.keyboard([
       ['❌ لغو جستجو'],
]).resize();

// ─── حذف keyboard ─────────────────────────────────────────

export const removeKeyboard = Markup.removeKeyboard();