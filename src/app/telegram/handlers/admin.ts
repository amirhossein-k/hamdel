// src/app/telegram/handlers/admin.ts
// ─── پنل ادمین ────────────────────────────────────────────
//
//  دسترسی: فقط ADMIN_TELEGRAM_ID
//
//  دستورات:
//  /admin           — منوی اصلی پنل
//  /stats           — آمار کلی ربات
//  /reports         — لیست گزارش‌های pending
//  /ban <id>        — بن کردن کاربر
//  /unban <id>      — آنبن کردن
//  /warn <id>       — اخطار به کاربر
//  /userinfo <id>   — اطلاعات کاربر
//  
//  Callback:
//  admin_report:<reportId>:warn|ban|dismiss  — تصمیم روی گزارش

import { Markup, Telegraf } from 'telegraf';
import type { BotContext } from '../context';
import { ReportStatus, AUTO_BAN_THRESHOLD, Gender, UserState } from '@/types/enums';
import { ReportModel } from '@/models/queue.model';
import { UserModel } from '@/models/user.model';
import { mainMenuKeyboard } from '@/lib/keyboards';

// ─── بررسی دسترسی ادمین ──────────────────────────────────

export function isAdmin(ctx: BotContext): boolean {
       const adminId = Number(process.env.ADMIN_TELEGRAM_ID);
       if (!adminId) return false;
       return ctx.from?.id === adminId;
}

// ─── بررسی با پیام خطا (برای دستوراتی که فقط ادمین می‌زند) ─

export async function requireAdmin(ctx: BotContext): Promise<boolean> {
       const adminId = Number(process.env.ADMIN_TELEGRAM_ID);

       if (!adminId) {
              await ctx.reply(
                     '⚠️ متغیر <code>ADMIN_TELEGRAM_ID</code> در سرور تنظیم نشده است.\n\n' +
                     `آیدی تلگرام شما: <code>${ctx.from?.id}</code>\n\n` +
                     'این مقدار را در فایل <code>.env.local</code> ست کنید:\n' +
                     `<code>ADMIN_TELEGRAM_ID=${ctx.from?.id}</code>`,
                     { parse_mode: 'HTML' },
              );
              return false;
       }

       if (ctx.from?.id !== adminId) {
              // برای کاربر عادی چیزی نشان نمی‌دهیم
              return false;
       }

       return true;
}

// ─── Inline keyboard تصمیم روی گزارش ────────────────────

function reportActionKeyboard(reportId: string) {
       return Markup.inlineKeyboard([
              [
                     Markup.button.callback('⚠️ اخطار', `admin_report:${reportId}:warn`),
                     Markup.button.callback('🚫 بن', `admin_report:${reportId}:ban`),
                     Markup.button.callback('✅ رد گزارش', `admin_report:${reportId}:dismiss`),
              ],
       ]);
}

// ══════════════════════════════════════════════════════════
//  /admin — منوی اصلی پنل
// ══════════════════════════════════════════════════════════

export async function adminMenuHandler(ctx: BotContext): Promise<void> {
       if (!await requireAdmin(ctx)) return;

       const [userCount, pendingReports, activeChats] = await Promise.all([
              UserModel.countDocuments({}),
              ReportModel.countDocuments({ status: ReportStatus.Pending }),
              UserModel.countDocuments({ state: UserState.InChat }),
       ]);

       await ctx.reply(
              `🛡️ <b>پنل ادمین هم‌دل</b>\n\n` +
              `👥 کاربران: ${userCount}\n` +
              `🚨 گزارش‌های pending: ${pendingReports}\n` +
              `💬 چت‌های فعال: ${activeChats}\n\n` +
              `دستورات:\n` +
              `/stats — آمار کامل\n` +
              `/reports — بررسی گزارش‌ها\n` +
              `/users — لیست کاربران\n` +
              `/ban &lt;telegramId&gt; — بن کاربر\n` +
              `/unban &lt;telegramId&gt; — آنبن کاربر\n` +
              `/warn &lt;telegramId&gt; — اخطار\n` +
              `/userinfo &lt;telegramId&gt; — اطلاعات کاربر\n` +
              `/givecoin &lt;telegramId&gt; &lt;مقدار&gt; — اهدای سکه`,
              { parse_mode: 'HTML' },
       );
}

// ══════════════════════════════════════════════════════════
//  /stats — آمار کلی
// ══════════════════════════════════════════════════════════

export async function statsHandler(ctx: BotContext): Promise<void> {
       if (!await requireAdmin(ctx)) return;

       const now = new Date();
       const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
       const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

       const [
              totalUsers,
              newUsersToday,
              newUsersWeek,
              bannedUsers,
              maleUsers,
              femaleUsers,
              pendingReports,
              totalReports,
       ] = await Promise.all([
              UserModel.countDocuments({}),
              UserModel.countDocuments({ registeredAt: { $gte: yesterday } }),
              UserModel.countDocuments({ registeredAt: { $gte: lastWeek } }),
              UserModel.countDocuments({ isBanned: true }),
              UserModel.countDocuments({ gender: Gender.Male, profileComplete: true }),
              UserModel.countDocuments({ gender: Gender.Female, profileComplete: true }),
              ReportModel.countDocuments({ status: ReportStatus.Pending }),
              ReportModel.countDocuments({}),
       ]);

       await ctx.reply(
              `📊 <b>آمار ربات هم‌دل</b>\n\n` +
              `👥 <b>کاربران:</b>\n` +
              `• کل: ${totalUsers}\n` +
              `• جدید (۲۴ ساعت): ${newUsersToday}\n` +
              `• جدید (۷ روز): ${newUsersWeek}\n` +
              `• بن‌شده: ${bannedUsers}\n` +
              `• پسر: ${maleUsers} | دختر: ${femaleUsers}\n\n` +
              `🚨 <b>گزارش‌ها:</b>\n` +
              `• در انتظار بررسی: ${pendingReports}\n` +
              `• کل گزارش‌ها: ${totalReports}`,
              { parse_mode: 'HTML' },
       );
}

// ══════════════════════════════════════════════════════════
//  /reports — لیست گزارش‌های pending
// ══════════════════════════════════════════════════════════

export async function reportsHandler(ctx: BotContext): Promise<void> {
       if (!await requireAdmin(ctx)) return;

       const reports = await ReportModel.getPending();

       if (reports.length === 0) {
              await ctx.reply('✅ هیچ گزارش pending‌ای وجود ندارد.');
              return;
       }

       await ctx.reply(`🚨 <b>${reports.length} گزارش در انتظار بررسی:</b>`, { parse_mode: 'HTML' });

       for (const report of reports.slice(0, 10)) {
              // تعداد گزارش‌های قبلی علیه همین کاربر
              const prevCount = await ReportModel.countAgainstUser(report.reportedId);

              const reportText =
                     `🆔 گزارش: <code>${report._id}</code>\n` +
                     `👤 گزارش‌دهنده: <code>${report.reporterId}</code>\n` +
                     `🎯 گزارش‌شده: <code>${report.reportedId}</code>\n` +
                     `📋 دلیل: ${report.reason}\n` +
                     `📅 زمان: ${report.createdAt.toLocaleString('fa-IR')}\n` +
                     `🔢 تعداد گزارش علیه این کاربر: ${prevCount}`;

              await ctx.reply(reportText, {
                     parse_mode: 'HTML',
                     ...reportActionKeyboard(String(report._id)),
              });
       }

       if (reports.length > 10) {
              await ctx.reply(`... و ${reports.length - 10} گزارش دیگر.`);
       }
}

// ══════════════════════════════════════════════════════════
//  /ban <id> — بن کردن کاربر
// ══════════════════════════════════════════════════════════

export async function banHandler(ctx: BotContext, bot: Telegraf<BotContext>): Promise<void> {
       if (!await requireAdmin(ctx)) return;

       const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
       const parts = text.split(' ');

       if (parts.length < 2) {
              await ctx.reply('استفاده: /ban &lt;telegramId&gt; [دلیل]', { parse_mode: 'HTML' });
              return;
       }

       const targetId = Number(parts[1]);
       const reason = parts.slice(2).join(' ') || 'نقض قوانین';

       if (isNaN(targetId)) {
              await ctx.reply('❌ telegramId نامعتبر است.');
              return;
       }

       const user = await UserModel.findByTelegramId(targetId);
       if (!user) {
              await ctx.reply('❌ کاربر پیدا نشد.');
              return;
       }

       if (user.isBanned) {
              await ctx.reply(`⚠️ کاربر ${targetId} قبلاً بن شده.`);
              return;
       }

       user.isBanned = true;
       user.banReason = reason;
       await user.save();

       await ctx.reply(`✅ کاربر <code>${targetId}</code> (${user.name}) بن شد.\nدلیل: ${reason}`, {
              parse_mode: 'HTML',
       });

       // اطلاع به کاربر
       await bot.telegram.sendMessage(
              targetId,
              `🚫 حساب شما مسدود شد.\nدلیل: ${reason}\n\nبرای اعتراض با پشتیبانی تماس بگیرید.`,
       ).catch(() => { });
}

// ══════════════════════════════════════════════════════════
//  /unban <id> — آنبن کردن
// ══════════════════════════════════════════════════════════

export async function unbanHandler(ctx: BotContext, bot: Telegraf<BotContext>): Promise<void> {
       if (!await requireAdmin(ctx)) return;

       const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
       const targetId = Number(text.split(' ')[1]);

       if (isNaN(targetId)) {
              await ctx.reply('استفاده: /unban &lt;telegramId&gt;', { parse_mode: 'HTML' });
              return;
       }

       const user = await UserModel.findByTelegramId(targetId);
       if (!user) {
              await ctx.reply('❌ کاربر پیدا نشد.');
              return;
       }

       user.isBanned = false;
       user.banReason = undefined;
       await user.save();

       await ctx.reply(`✅ کاربر <code>${targetId}</code> (${user.name}) آنبن شد.`, { parse_mode: 'HTML' });

       await bot.telegram.sendMessage(
              targetId,
              `✅ مسدودیت حساب شما رفع شد. می‌توانید دوباره از ربات استفاده کنید.`,
              mainMenuKeyboard,
       ).catch(() => { });
}

// ══════════════════════════════════════════════════════════
//  /warn <id> — اخطار به کاربر
// ══════════════════════════════════════════════════════════

export async function warnHandler(ctx: BotContext, bot: Telegraf<BotContext>): Promise<void> {
       if (!await requireAdmin(ctx)) return;

       const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
       const parts = text.split(' ');
       const targetId = Number(parts[1]);
       const reason = parts.slice(2).join(' ') || 'رفتار نامناسب';

       if (isNaN(targetId)) {
              await ctx.reply('استفاده: /warn &lt;telegramId&gt; [دلیل]', { parse_mode: 'HTML' });
              return;
       }

       const user = await UserModel.findByTelegramId(targetId);
       if (!user) {
              await ctx.reply('❌ کاربر پیدا نشد.');
              return;
       }

       user.warnings += 1;
       const shouldBan = user.warnings >= AUTO_BAN_THRESHOLD;
       if (shouldBan) {
              user.isBanned = true;
              user.banReason = `بن خودکار پس از ${user.warnings} اخطار`;
       }
       await user.save();

       await ctx.reply(
              `⚠️ اخطار ${user.warnings} به کاربر <code>${targetId}</code> (${user.name}) ثبت شد.` +
              (shouldBan ? `\n\n🚫 بن خودکار اعمال شد (${user.warnings} اخطار).` : ''),
              { parse_mode: 'HTML' },
       );

       const warnMsg = shouldBan
              ? `🚫 حساب شما به دلیل اخطارهای مکرر مسدود شد.`
              : `⚠️ <b>اخطار ${user.warnings}</b>\n\nرفتار نامناسب گزارش شده: ${reason}\n\nدر صورت تکرار، حساب شما مسدود خواهد شد.`;

       await bot.telegram.sendMessage(targetId, warnMsg, { parse_mode: 'HTML' }).catch(() => { });
}

// ══════════════════════════════════════════════════════════
//  /userinfo <id> — اطلاعات کاربر
// ══════════════════════════════════════════════════════════

export async function userInfoHandler(ctx: BotContext): Promise<void> {
       if (!await requireAdmin(ctx)) return;

       const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
       const targetId = Number(text.split(' ')[1]);

       if (isNaN(targetId)) {
              await ctx.reply('استفاده: /userinfo &lt;telegramId&gt;', { parse_mode: 'HTML' });
              return;
       }

       const [user, reportCount] = await Promise.all([
              UserModel.findByTelegramId(targetId),
              ReportModel.countAgainstUser(targetId),
       ]);

       if (!user) {
              await ctx.reply('❌ کاربر پیدا نشد.');
              return;
       }

       const statusEmoji = user.isBanned ? '🚫' : '✅';
       await ctx.reply(
              `👤 <b>اطلاعات کاربر</b>\n\n` +
              `🆔 Telegram ID: <code>${user.telegramId}</code>\n` +
              `📛 نام: ${user.name ?? '—'}\n` +
              `👤 Username: @${user.username ?? '—'}\n` +
              `${user.gender === 'male' ? '👦' : '👧'} جنسیت: ${user.gender === 'male' ? 'پسر' : 'دختر'}\n` +
              `🎂 سن: ${user.age ?? '—'}\n` +
              `📍 ${user.province ?? '—'} — ${user.city ?? '—'}\n` +
              `🪙 سکه: ${user.coins}\n` +
              `🔗 دعوت‌شده‌ها: ${user.invitedUsers.length}\n` +
              `⚠️ اخطارها: ${user.warnings}\n` +
              `🚨 گزارش‌های دریافتی: ${reportCount}\n` +
              `${statusEmoji} وضعیت: ${user.isBanned ? `بن شده — ${user.banReason ?? ''}` : 'فعال'}\n` +
              `📅 ثبت‌نام: ${user.registeredAt.toLocaleDateString('fa-IR')}\n` +
              `🕒 آخرین فعالیت: ${user.lastActive.toLocaleString('fa-IR')}`,
              { parse_mode: 'HTML' },
       );
}

// ─── تابع کمکی: ارسال اطلاعات کاربر (مشترک بین userInfoHandler و callback) ──

export async function sendUserInfo(ctx: BotContext, targetId: number): Promise<void> {
       const [user, reportCount] = await Promise.all([
              UserModel.findByTelegramId(targetId),
              ReportModel.countAgainstUser(targetId),
       ]);

       if (!user) {
              await ctx.reply('❌ کاربر پیدا نشد.');
              return;
       }

       const statusEmoji = user.isBanned ? '🚫' : '✅';
       const photoStatus = user.photo ? '🖼️ دارد' : '—';

       const infoText =
              `👤 <b>اطلاعات کاربر</b>\n\n` +
              `🆔 Telegram ID: <code>${user.telegramId}</code>\n` +
              `📛 نام: ${user.name ?? '—'}\n` +
              `👤 Username: @${user.username ?? '—'}\n` +
              `${user.gender === 'male' ? '👦' : '👧'} جنسیت: ${user.gender === 'male' ? 'پسر' : 'دختر'}\n` +
              `🎂 سن: ${user.age ?? '—'}\n` +
              `📍 ${user.province ?? '—'} — ${user.city ?? '—'}\n` +
              `🖼️ عکس پروفایل: ${photoStatus}\n` +
              `🪙 سکه: ${user.coins}\n` +
              `🔗 دعوت‌شده‌ها: ${user.invitedUsers.length}\n` +
              `⚠️ اخطارها: ${user.warnings}\n` +
              `🚨 گزارش‌های دریافتی: ${reportCount}\n` +
              `${statusEmoji} وضعیت: ${user.isBanned ? `بن شده — ${user.banReason ?? ''}` : 'فعال'}\n` +
              `📅 ثبت‌نام: ${user.registeredAt.toLocaleDateString('fa-IR')}\n` +
              `🕒 آخرین فعالیت: ${user.lastActive.toLocaleString('fa-IR')}`;

       // دکمه‌های ادمین
       const buttons = [];
       if (user.photo) {
              buttons.push([Markup.button.callback('🖼️ مشاهده عکس پروفایل', `admin_photo_view:${targetId}`)]);
       }
       buttons.push([
              Markup.button.callback('⚠️ اخطار', `admin_quick:${targetId}:warn`),
              Markup.button.callback('🚫 بن', `admin_quick:${targetId}:ban`),
       ]);
       if (user.isBanned) {
              buttons.push([Markup.button.callback('✅ آنبن', `admin_quick:${targetId}:unban`)]);
       }

       await ctx.reply(infoText, {
              parse_mode: 'HTML',
              ...Markup.inlineKeyboard(buttons),
       });
}


// ══════════════════════════════════════════════════════════
//  Callback: مشاهده عکس پروفایل کاربر توسط ادمین
// ══════════════════════════════════════════════════════════

export async function adminViewPhoto(ctx: BotContext, targetId: number): Promise<void> {
       if (!await requireAdmin(ctx)) return;

       const user = await UserModel.findByTelegramId(targetId);

       if (!user) {
              await ctx.answerCbQuery('❌ کاربر پیدا نشد.');
              return;
       }

       if (!user.photo) {
              await ctx.answerCbQuery('❌ این کاربر عکس پروفایل ندارد.');
              return;
       }

       await ctx.answerCbQuery();

       await ctx.replyWithPhoto(user.photo, {
              caption:
                     `🖼️ <b>عکس پروفایل کاربر</b>\n\n` +
                     `👤 نام: ${user.name ?? '—'}\n` +
                     `🆔 ID: <code>${user.telegramId}</code>`,
              parse_mode: 'HTML',
              ...Markup.inlineKeyboard([
                     [Markup.button.callback('🗑️ حذف عکس پروفایل', `admin_photo_delete:${targetId}`)],
                     [Markup.button.callback('🔙 بازگشت به اطلاعات', `admin_userinfo_back:${targetId}`)],
              ]),
       });
}

// ══════════════════════════════════════════════════════════
//  Callback: حذف عکس پروفایل کاربر توسط ادمین
// ══════════════════════════════════════════════════════════

export async function adminDeletePhoto(
       ctx: BotContext,
       bot: Telegraf<BotContext>,
       targetId: number,
): Promise<void> {
       if (!await requireAdmin(ctx)) return;

       const user = await UserModel.findByTelegramId(targetId);

       if (!user) {
              await ctx.answerCbQuery('❌ کاربر پیدا نشد.');
              return;
       }

       if (!user.photo) {
              await ctx.answerCbQuery('⚠️ این کاربر عکسی ندارد.');
              return;
       }

       user.photo = undefined;
       await user.save();

       await ctx.answerCbQuery('✅ عکس حذف شد.');

       // ویرایش caption پیام عکس
       await ctx.editMessageCaption(
              `🗑️ <b>عکس پروفایل حذف شد</b>\n\n` +
              `👤 نام: ${user.name ?? '—'}\n` +
              `🆔 ID: <code>${user.telegramId}</code>\n\n` +
              `✅ عکس توسط ادمین حذف شد.`,
              { parse_mode: 'HTML' },
       ).catch(() => { });

       // اطلاع به کاربر
       await bot.telegram.sendMessage(
              targetId,
              `📢 <b>اطلاعیه</b>\n\nعکس پروفایل شما توسط مدیریت حذف شد.\n\nلطفاً از قوانین استفاده از تصویر رعایت کنید.`,
              { parse_mode: 'HTML' },
       ).catch(() => { });
}


// ══════════════════════════════════════════════════════════
//  Callback: تصمیم روی گزارش (warn | ban | dismiss)
// ══════════════════════════════════════════════════════════

export async function handleReportAction(
       ctx: BotContext,
       bot: Telegraf<BotContext>,
       reportId: string,
       action: 'warn' | 'ban' | 'dismiss',
): Promise<void> {
       if (!isAdmin(ctx)) {
              await ctx.answerCbQuery('❌ دسترسی ندارید.');
              return;
       }

       const adminId = ctx.from!.id;
       const report = await ReportModel.findById(reportId);

       if (!report) {
              await ctx.answerCbQuery('❌ گزارش پیدا نشد.');
              return;
       }

       if (report.status !== ReportStatus.Pending) {
              await ctx.answerCbQuery('⚠️ این گزارش قبلاً بررسی شده.');
              return;
       }

       const reported = await UserModel.findByTelegramId(report.reportedId);

       if (action === 'dismiss') {
              await report.resolve(ReportStatus.Dismissed, adminId);
              await ctx.answerCbQuery('✅ گزارش رد شد.');
              await ctx.editMessageText(
                     `✅ گزارش <code>${reportId}</code> رد شد.`,
                     { parse_mode: 'HTML' },
              ).catch(() => { });

       } else if (action === 'warn') {
              await report.resolve(ReportStatus.Warned, adminId);

              if (reported) {
                     reported.warnings += 1;
                     const autoBan = reported.warnings >= AUTO_BAN_THRESHOLD;
                     if (autoBan) {
                            reported.isBanned = true;
                            reported.banReason = `بن خودکار پس از ${reported.warnings} اخطار`;
                     }
                     await reported.save();

                     await bot.telegram.sendMessage(
                            report.reportedId,
                            `⚠️ <b>اخطار ${reported.warnings}</b>\n\nرفتارت گزارش شد. در صورت تکرار بن خواهی شد.`,
                            { parse_mode: 'HTML' },
                     ).catch(() => { });

                     const resultText = autoBan
                            ? `⚠️→🚫 اخطار داده شد و بن خودکار اعمال شد (اخطار ${reported.warnings}).`
                            : `⚠️ اخطار ${reported.warnings} به کاربر <code>${report.reportedId}</code> داده شد.`;

                     await ctx.answerCbQuery('✅ اخطار ثبت شد.');
                     await ctx.editMessageText(resultText, { parse_mode: 'HTML' }).catch(() => { });
              }

       } else if (action === 'ban') {
              await report.resolve(ReportStatus.Banned, adminId);

              if (reported) {
                     reported.isBanned = true;
                     reported.banReason = `بن توسط ادمین — گزارش: ${report.reason.slice(0, 50)}`;
                     await reported.save();

                     await bot.telegram.sendMessage(
                            report.reportedId,
                            `🚫 حساب شما به دلیل نقض قوانین مسدود شد.`,
                     ).catch(() => { });
              }

              await ctx.answerCbQuery('✅ کاربر بن شد.');
              await ctx.editMessageText(
                     `🚫 کاربر <code>${report.reportedId}</code> بن شد.`,
                     { parse_mode: 'HTML' },
              ).catch(() => { });
       }
}

// ══════════════════════════════════════════════════════════
//  /givecoin <id> <amount> — اهدای سکه به کاربر توسط ادمین
// ══════════════════════════════════════════════════════════

export async function giveCoinHandler(
       ctx: BotContext,
       bot: Telegraf<BotContext>,
): Promise<void> {
       if (!await requireAdmin(ctx)) return;

       const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
       const parts = text.trim().split(/\s+/);

       if (parts.length < 3) {
              await ctx.reply(
                     '❌ فرمت نادرست.\n\n' +
                     'استفاده صحیح:\n' +
                     '<code>/givecoin &lt;telegramId&gt; &lt;مقدار&gt;</code>\n\n' +
                     'مثال: <code>/givecoin 123456789 50</code>\n' +
                     'کسر سکه: <code>/givecoin 123456789 -10</code>',
                     { parse_mode: 'HTML' },
              );
              return;
       }

       const targetId = Number(parts[1]);
       const amount = Number(parts[2]);

       if (!Number.isInteger(targetId) || targetId <= 0) {
              await ctx.reply('❌ telegramId نامعتبر است.');
              return;
       }

       if (!Number.isInteger(amount) || amount === 0) {
              await ctx.reply('❌ مقدار سکه باید یک عدد صحیح غیر صفر باشد.');
              return;
       }

       const user = await UserModel.findByTelegramId(targetId);
       if (!user) {
              await ctx.reply(`❌ کاربری با آیدی <code>${targetId}</code> پیدا نشد.`, {
                     parse_mode: 'HTML',
              });
              return;
       }

       const balanceBefore = user.coins;
       const balanceAfter = Math.max(0, balanceBefore + amount);

       if (amount < 0 && balanceBefore + amount < 0) {
              await ctx.reply(
                     `❌ موجودی کاربر (${balanceBefore} سکه) کمتر از مقدار کسر است.\n` +
                     `حداکثر: <code>/givecoin ${targetId} -${balanceBefore}</code>`,
                     { parse_mode: 'HTML' },
              );
              return;
       }

       user.coins = balanceAfter;
       await user.save();

       // ثبت لاگ — CoinLogModel را lazy import می‌کنیم تا circular dependency نباشد
       const { CoinLogModel } = await import('@/models/coin.model');
       const { CoinChangeReason } = await import('@/types/enums');
       await CoinLogModel.record(
              targetId,
              amount,
              CoinChangeReason.AdminGift,
              balanceAfter,
              String(ctx.from!.id),
       );

       const direction = amount > 0 ? '🎁 اهدا' : '➖ کسر';
       const amountText = amount > 0 ? `+${amount}` : String(amount);

       await ctx.reply(
              `✅ <b>عملیات موفق</b>\n\n` +
              `👤 کاربر: <code>${targetId}</code> (${user.name ?? '—'})\n` +
              `${direction}: <b>${amountText} سکه</b>\n` +
              `📊 موجودی: ${balanceBefore} → ${balanceAfter}`,
              { parse_mode: 'HTML' },
       );

       const userMsg = amount > 0
              ? `🎁 <b>${amount} سکه هدیه دریافت کردی!</b>\n\nموجودی فعلی: ${balanceAfter} سکه 🪙`
              : `📢 <b>اطلاعیه حساب</b>\n\n${Math.abs(amount)} سکه از حسابت کسر شد.\nموجودی فعلی: ${balanceAfter} سکه 🪙`;

       await bot.telegram
              .sendMessage(targetId, userMsg, { parse_mode: 'HTML' })
              .catch(() => { });
}
// ══════════════════════════════════════════════════════════
//  /users — لیست کشویی کاربران (صفحه‌بندی شده)
// ══════════════════════════════════════════════════════════

const USERS_PAGE_SIZE = 8;

export async function usersListHandler(ctx: BotContext, page = 0): Promise<void> {
       if (!await requireAdmin(ctx)) return;

       const total = await UserModel.countDocuments({ profileComplete: true });
       const users = await UserModel.find({ profileComplete: true })
              .sort({ registeredAt: -1 })
              .skip(page * USERS_PAGE_SIZE)
              .limit(USERS_PAGE_SIZE)
              .lean();

       if (users.length === 0) {
              await ctx.reply('❌ کاربری پیدا نشد.');
              return;
       }

       const totalPages = Math.ceil(total / USERS_PAGE_SIZE);

       // ─── دکمه‌های لیست کاربران ────────────────────────────
       const userButtons = users.map((u) => {
              const genderIcon = u.gender === 'male' ? '👦' : '👧';
              const banIcon = u.isBanned ? '🚫' : '';
              const photoIcon = u.photo ? '🖼️' : '';
              const label = `${genderIcon}${banIcon}${photoIcon} ${u.name ?? '—'} | ${u.age ?? '—'} | ${u.city ?? u.province ?? '—'}`;
              return [Markup.button.callback(label, `admin_userinfo:${u.telegramId}`)];
       });

       // ─── دکمه‌های صفحه‌بندی ───────────────────────────────
       const navButtons: ReturnType<typeof Markup.button.callback>[] = [];
       if (page > 0)
              navButtons.push(Markup.button.callback('◀️ قبلی', `admin_users_page:${page - 1}`));
       if (page < totalPages - 1)
              navButtons.push(Markup.button.callback('بعدی ▶️', `admin_users_page:${page + 1}`));

       const keyboard = navButtons.length > 0
              ? Markup.inlineKeyboard([...userButtons, navButtons])
              : Markup.inlineKeyboard(userButtons);

       const header =
              `👥 <b>لیست کاربران</b>\n\n` +
              `📊 کل: ${total} کاربر | صفحه ${page + 1} از ${totalPages}\n\n` +
              `راهنما: 👦/👧 جنسیت | 🚫 بن‌شده | 🖼️ دارای عکس`;

       if (ctx.callbackQuery) {
              await ctx.editMessageText(header, { parse_mode: 'HTML', ...keyboard }).catch(async () => {
                     await ctx.reply(header, { parse_mode: 'HTML', ...keyboard });
              });
              await ctx.answerCbQuery();
       } else {
              await ctx.reply(header, { parse_mode: 'HTML', ...keyboard });
       }
}

// ══════════════════════════════════════════════════════════
//  Callback: نمایش اطلاعات کاربر از لیست
// ══════════════════════════════════════════════════════════

export async function adminUserInfoCallback(ctx: BotContext, targetId: number): Promise<void> {
       if (!await requireAdmin(ctx)) return;
       await ctx.answerCbQuery();
       await sendUserInfo(ctx, targetId);
}

// ══════════════════════════════════════════════════════════
//  Callback: اقدام سریع روی کاربر (warn/ban/unban)
// ══════════════════════════════════════════════════════════

export async function adminQuickAction(
       ctx: BotContext,
       bot: Telegraf<BotContext>,
       targetId: number,
       action: 'warn' | 'ban' | 'unban',
): Promise<void> {
       if (!await requireAdmin(ctx)) return;

       const user = await UserModel.findByTelegramId(targetId);
       if (!user) {
              await ctx.answerCbQuery('❌ کاربر پیدا نشد.');
              return;
       }

       if (action === 'warn') {
              user.warnings += 1;
              const autoBan = user.warnings >= AUTO_BAN_THRESHOLD;
              if (autoBan) {
                     user.isBanned = true;
                     user.banReason = `بن خودکار پس از ${user.warnings} اخطار`;
              }
              await user.save();
              await ctx.answerCbQuery(`⚠️ اخطار ${user.warnings} ثبت شد.`);
              await bot.telegram.sendMessage(
                     targetId,
                     `⚠️ <b>اخطار ${user.warnings}</b>\n\nرفتار نامناسب گزارش شده. در صورت تکرار بن خواهید شد.`,
                     { parse_mode: 'HTML' },
              ).catch(() => { });

       } else if (action === 'ban') {
              user.isBanned = true;
              user.banReason = 'بن توسط ادمین';
              await user.save();
              await ctx.answerCbQuery('🚫 کاربر بن شد.');
              await bot.telegram.sendMessage(targetId, '🚫 حساب شما مسدود شد.').catch(() => { });

       } else if (action === 'unban') {
              user.isBanned = false;
              user.banReason = undefined;
              await user.save();
              await ctx.answerCbQuery('✅ کاربر آنبن شد.');
              await bot.telegram.sendMessage(
                     targetId,
                     '✅ مسدودیت حساب شما رفع شد.',
                     mainMenuKeyboard,
              ).catch(() => { });
       }

       // رفرش اطلاعات کاربر
       await ctx.deleteMessage().catch(() => { });
       await sendUserInfo(ctx, targetId);
}