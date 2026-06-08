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
       ['🎲 چت تصادفی', '🔍 جستجوی انتخابی'],
       ['💬 چت مستقیم', '👥 جستجو براساس پروفایل'],
       ['👤 پروفایل من', '🪙 سکه‌هام'],
       ['🔗 دعوت دوستان', '⚙️ تنظیمات'],
]).resize();

// ─── انتخاب جنسیت طرف مقابل در چت تصادفی ────────────────

export const targetGenderKeyboard = Markup.keyboard([
       ['👦 چت با پسر', '👧 چت با دختر'],
       ['🎲 هر کسی (تصادفی)'],
       ['🔙 بازگشت'],
]).resize().oneTime();

// ─── منوی جستجوی انتخابی ─────────────────────────────────

export const smartSearchKeyboard = Markup.keyboard([
       ['📍 جستجو براساس نزدیکی'],
       ['🏙️ جستجو هم‌استانی', '🎂 جستجو هم‌سن'],
       ['🔙 بازگشت'],
]).resize().oneTime();

// ─── منوی جستجو براساس پروفایل ───────────────────────────

export const profileBrowseKeyboard = Markup.keyboard([
       ['🗺️ پروفایل‌ها براساس استان'],
       ['⚧️ پروفایل‌ها براساس جنسیت'],
       ['🔙 بازگشت'],
]).resize().oneTime();

// ─── انتخاب جنسیت برای مرور پروفایل ─────────────────────

export const browseGenderKeyboard = Markup.keyboard([
       ['👦 پروفایل‌های پسرها', '👧 پروفایل‌های دخترها'],
       ['🔙 بازگشت'],
]).resize().oneTime();

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