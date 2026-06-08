// src/app/telegram/handlers/settings.ts
// ─── تنظیمات کاربر ───────────────────────────────────────
//
//  امکانات:
//  - ویرایش نام
//  - ویرایش سن
//  - ویرایش استان/شهر
//  - انتخاب علایق (multi-select با inline keyboard)
//  - تنظیم فیلتر جستجو (محدوده سنی طرف مقابل)

import { Markup } from 'telegraf';
import type { BotContext } from '../context';
import { INTERESTS, MIN_AGE, MAX_AGE } from '@/types/enums';
import type { Interest } from '@/types/enums';
import { IRAN_PROVINCES, isCityInProvince } from '@/types/iran';
import type { IranProvince } from '@/types/iran';
import { provinceKeyboard, cityKeyboard, mainMenuKeyboard } from '@/lib/keyboards';

// ─── Inline keyboard منوی تنظیمات ────────────────────────

export function settingsMenuKeyboard() {
       return Markup.inlineKeyboard([
              [Markup.button.callback('📛 ویرایش نام', 'settings:name')],
              [Markup.button.callback('🎂 ویرایش سن', 'settings:age')],
              [Markup.button.callback('📍 ویرایش استان/شهر', 'settings:province')],
              [Markup.button.callback('🎯 علایق من', 'settings:interests')],
              [Markup.button.callback('🖼️ عکس پروفایل', 'settings:photo')],
       ]);
}

// ─── Inline keyboard علایق ───────────────────────────────

export function interestsKeyboard(selected: string[]) {
       const buttons = INTERESTS.map((interest) => {
              const isSelected = selected.includes(interest);
              return Markup.button.callback(
                     isSelected ? `✅ ${interest}` : interest,
                     `toggle_interest:${interest}`,
              );
       });

       // دو تا در هر ردیف
       const rows: ReturnType<typeof Markup.button.callback>[][] = [];
       for (let i = 0; i < buttons.length; i += 2) {
              rows.push(buttons.slice(i, i + 2));
       }
       rows.push([Markup.button.callback('💾 ذخیره', 'save_interests')]);
       return Markup.inlineKeyboard(rows);
}

// ══════════════════════════════════════════════════════════
//  نمایش منوی تنظیمات
// ══════════════════════════════════════════════════════════

export async function showSettingsMenu(ctx: BotContext): Promise<void> {
       const user = ctx.dbUser!;
       const photoStatus = user.photo ? '✅ آپلود شده' : '❌ ندارم';
       await ctx.reply(
              `⚙️ <b>تنظیمات پروفایل</b>\n\n` +
              `📛 نام: ${user.name ?? '—'}\n` +
              `🎂 سن: ${user.age ?? '—'}\n` +
              `📍 ${user.province ?? '—'} — ${user.city ?? '—'}\n` +
              `🎯 علایق: ${user.interests.length > 0 ? user.interests.join('، ') : '—'}\n` +
              `🖼️ عکس پروفایل: ${photoStatus}\n\n` +
              `چه چیزی می‌خوای ویرایش کنی؟`,
              { parse_mode: 'HTML', ...settingsMenuKeyboard() },
       );
}

// ══════════════════════════════════════════════════════════
//  شروع ویرایش نام
// ══════════════════════════════════════════════════════════

export async function startEditName(ctx: BotContext): Promise<void> {
       ctx.session.step = 'settings:name';
       await ctx.answerCbQuery();
       await ctx.reply(
              `📛 نام فعلی: <b>${ctx.dbUser!.name}</b>\n\nنام جدید رو وارد کن:`,
              { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } },
       );
}

export async function handleEditName(ctx: BotContext): Promise<void> {
       const text = ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : null;

       if (!text || text.length < 2 || text.length > 50) {
              await ctx.reply('⚠️ نام باید بین ۲ تا ۵۰ کاراکتر باشه. دوباره وارد کن:');
              return;
       }

       ctx.dbUser!.name = text;
       await ctx.dbUser!.save();
       ctx.session.step = undefined;

       await ctx.reply(`✅ نام به <b>${text}</b> تغییر کرد.`, { parse_mode: 'HTML', ...mainMenuKeyboard });
}

// ══════════════════════════════════════════════════════════
//  شروع ویرایش سن
// ══════════════════════════════════════════════════════════

export async function startEditAge(ctx: BotContext): Promise<void> {
       ctx.session.step = 'settings:age';
       await ctx.answerCbQuery();
       await ctx.reply(
              `🎂 سن فعلی: <b>${ctx.dbUser!.age}</b>\n\nسن جدید رو وارد کن:`,
              { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } },
       );
}

export async function handleEditAge(ctx: BotContext): Promise<void> {
       const text = ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : null;
       const age = Number(text);

       if (!text || isNaN(age) || age < MIN_AGE || age > MAX_AGE) {
              await ctx.reply(`⚠️ سن باید بین ${MIN_AGE} تا ${MAX_AGE} باشه:`);
              return;
       }

       ctx.dbUser!.age = age;
       await ctx.dbUser!.save();
       ctx.session.step = undefined;

       await ctx.reply(`✅ سن به <b>${age}</b> تغییر کرد.`, { parse_mode: 'HTML', ...mainMenuKeyboard });
}

// ══════════════════════════════════════════════════════════
//  شروع ویرایش استان
// ══════════════════════════════════════════════════════════

export async function startEditProvince(ctx: BotContext): Promise<void> {
       ctx.session.step = 'settings:province';
       await ctx.answerCbQuery();
       await ctx.reply(
              `📍 استان فعلی: <b>${ctx.dbUser!.province}</b>\n\nاستان جدید رو انتخاب کن:`,
              { parse_mode: 'HTML', ...provinceKeyboard },
       );
}

export async function handleEditProvince(ctx: BotContext): Promise<void> {
       const text = ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : null;

       if (!text || !(IRAN_PROVINCES as readonly string[]).includes(text)) {
              await ctx.reply('⚠️ لطفاً استان رو از لیست انتخاب کن:', provinceKeyboard);
              return;
       }

       ctx.dbUser!.province = text as IranProvince;
       ctx.dbUser!.city = undefined;
       await ctx.dbUser!.save();
       ctx.session.step = 'settings:city';

       await ctx.reply('🏙️ حالا شهرت رو انتخاب کن:', cityKeyboard(text as IranProvince));
}

export async function handleEditCity(ctx: BotContext): Promise<void> {
       const user = ctx.dbUser!;
       const text = ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : null;

       if (text === '🔙 تغییر استان') {
              ctx.session.step = 'settings:province';
              await ctx.reply('📍 استان رو انتخاب کن:', provinceKeyboard);
              return;
       }

       if (!text || !user.province || !isCityInProvince(user.province, text)) {
              await ctx.reply('⚠️ لطفاً شهر رو از لیست انتخاب کن:', cityKeyboard(user.province!));
              return;
       }

       user.city = text;
       await user.save();
       ctx.session.step = undefined;

       await ctx.reply(
              `✅ موقعیت به <b>${user.province} — ${text}</b> تغییر کرد.`,
              { parse_mode: 'HTML', ...mainMenuKeyboard },
       );
}

// ══════════════════════════════════════════════════════════
//  نمایش و مدیریت علایق
// ══════════════════════════════════════════════════════════

export async function showInterests(ctx: BotContext): Promise<void> {
       const user = ctx.dbUser!;
       await ctx.answerCbQuery();
       await ctx.editMessageText(
              `🎯 <b>علایق من</b>\n\n` +
              `علایقت رو انتخاب کن (می‌تونی چند تا انتخاب کنی):\n` +
              `علایق انتخاب‌شده با ✅ مشخص‌اند.`,
              {
                     parse_mode: 'HTML',
                     ...interestsKeyboard(user.interests),
              },
       ).catch(async () => {
              // اگر editMessageText ممکن نبود، پیام جدید ارسال کن
              await ctx.reply(
                     `🎯 <b>علایق من</b>\n\nعلایقت رو انتخاب کن:`,
                     { parse_mode: 'HTML', ...interestsKeyboard(user.interests) },
              );
       });
}

export async function toggleInterest(ctx: BotContext, interest: string): Promise<void> {
       const user = ctx.dbUser!;

       if (!INTERESTS.includes(interest as Interest)) {
              await ctx.answerCbQuery('❌ علاقه نامعتبر');
              return;
       }

       const idx = user.interests.indexOf(interest);
       if (idx === -1) {
              if (user.interests.length >= 5) {
                     await ctx.answerCbQuery('⚠️ حداکثر ۵ علاقه می‌تونی انتخاب کنی.');
                     return;
              }
              user.interests.push(interest);
       } else {
              user.interests.splice(idx, 1);
       }

       await user.save();
       await ctx.answerCbQuery(idx === -1 ? `✅ ${interest} اضافه شد` : `❌ ${interest} حذف شد`);

       // آپدیت keyboard
       await ctx.editMessageReplyMarkup(interestsKeyboard(user.interests).reply_markup).catch(() => { });
}

export async function saveInterests(ctx: BotContext): Promise<void> {
       const user = ctx.dbUser!;
       await ctx.answerCbQuery('💾 علایق ذخیره شد!');

       const interestText = user.interests.length > 0
              ? user.interests.join('، ')
              : 'هیچ علاقه‌ای انتخاب نشده';

       await ctx.editMessageText(
              `✅ <b>علایق ذخیره شد</b>\n\nعلایق شما: ${interestText}`,
              { parse_mode: 'HTML', ...settingsMenuKeyboard() },
       ).catch(() => { });
}

// ══════════════════════════════════════════════════════════
//  عکس پروفایل
// ══════════════════════════════════════════════════════════

export async function startEditPhoto(ctx: BotContext): Promise<void> {
       const user = ctx.dbUser!;
       ctx.session.step = 'settings:photo';
       await ctx.answerCbQuery();

       const hasPhoto = !!user.photo;

       const text = hasPhoto
              ? `🖼️ <b>عکس پروفایل</b>\n\nعکس فعلیت رو داری.\nعکس جدید بفرست تا جایگزین بشه، یا دکمه «🗑️ حذف عکس» رو بزن.`
              : `🖼️ <b>عکس پروفایل</b>\n\nهنوز عکس پروفایل نداری.\nیه عکس برام بفرست:`;

       // اگر عکس دارد، ابتدا عکس فعلی را نشان می‌دهیم
       if (hasPhoto) {
              await ctx.replyWithPhoto(user.photo!, {
                     caption: text,
                     parse_mode: 'HTML',
                     ...Markup.inlineKeyboard([
                            [Markup.button.callback('🗑️ حذف عکس', 'settings:photo_delete')],
                            [Markup.button.callback('🔙 بازگشت', 'settings:photo_cancel')],
                     ]),
              });
       } else {
              await ctx.reply(text, {
                     parse_mode: 'HTML',
                     ...Markup.inlineKeyboard([
                            [Markup.button.callback('🔙 بازگشت', 'settings:photo_cancel')],
                     ]),
              });
       }
}

export async function handleEditPhoto(ctx: BotContext): Promise<void> {
       const user = ctx.dbUser!;

       // بررسی اینکه آیا پیام عکس است
       if (!ctx.message || !('photo' in ctx.message) || !ctx.message.photo) {
              await ctx.reply(
                     '⚠️ لطفاً یه <b>عکس</b> بفرست.\n_(فایل یا لینک قبول نمی‌شه)_',
                     {
                            parse_mode: 'HTML',
                            ...Markup.inlineKeyboard([
                                   [Markup.button.callback('🔙 بازگشت', 'settings:photo_cancel')],
                            ]),
                     },
              );
              return;
       }

       // بهترین کیفیت = آخرین آیتم آرایه photo
       const bestPhoto = ctx.message.photo[ctx.message.photo.length - 1];
       const fileId = bestPhoto.file_id;

       user.photo = fileId;
       await user.save();
       ctx.session.step = undefined;

       await ctx.replyWithPhoto(fileId, {
              caption: '✅ <b>عکس پروفایل آپدیت شد!</b>',
              parse_mode: 'HTML',
              ...settingsMenuKeyboard(),
       });
}

export async function deletePhoto(ctx: BotContext): Promise<void> {
       const user = ctx.dbUser!;

       if (!user.photo) {
              await ctx.answerCbQuery('⚠️ عکسی برای حذف وجود نداره.');
              return;
       }

       user.photo = undefined;
       await user.save();
       ctx.session.step = undefined;

       await ctx.answerCbQuery('🗑️ عکس حذف شد.');
       await ctx.editMessageCaption('🗑️ عکس پروفایل حذف شد.').catch(async () => {
              await ctx.reply('🗑️ عکس پروفایل حذف شد.', settingsMenuKeyboard());
       });
}

export async function cancelPhotoEdit(ctx: BotContext): Promise<void> {
       ctx.session.step = undefined;
       await ctx.answerCbQuery();
       await ctx.deleteMessage().catch(() => { });
       await showSettingsMenu(ctx);
}