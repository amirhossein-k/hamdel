// src/app/telegram/handlers/admin.ts
// ─── پنل ادمین ────────────────────────────────────────────
//
//  دسترسی: فقط ADMIN_TELEGRAM_ID
//
//  دستورات:
//  /admin                    — منوی اصلی پنل
//  /stats                    — آمار کلی ربات
//  /reports                  — لیست گزارش‌های pending
//  /ban <id>                 — بن کردن کاربر
//  /unban <id>               — آنبن کردن
//  /warn <id>                — اخطار به کاربر
//  /userinfo <id>            — اطلاعات کاربر
//  /givecoin <id> <amount>   — اهدای سکه به کاربر
//
//  Callback:
//  admin_report:<reportId>:warn|ban|dismiss  — تصمیم روی گزارش

import { Markup, Telegraf } from 'telegraf';
import type { BotContext } from '../context';
import { ReportStatus, AUTO_BAN_THRESHOLD, Gender, UserState, CoinChangeReason } from '@/types/enums';
import { ReportModel } from '@/models/queue.model';
import { UserModel } from '@/models/user.model';
import { CoinLogModel } from '@/models/coin.model';
import { mainMenuKeyboard } from '@/lib/keyboards';

// ─── بررسی دسترسی ادمین ──────────────────────────────────

export function isAdmin(ctx: BotContext): boolean {
       const adminId = Number(process.env.ADMIN_TELEGRAM_ID);
       return !!adminId && ctx.from?.id === adminId;
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
       if (!isAdmin(ctx)) return;

       const [userCount, pendingReports, activeChats] = await Promise.all([
              UserModel.countDocuments({}),
              ReportModel.countDocuments({ status: ReportStatus.Pending }),
              UserModel.countDocuments({ state: UserState.InChat }),
       ]);

       await ctx.reply(
              `🛡️ *پنل ادمین هم‌دل*\n\n` +
              `👥 کاربران: ${userCount}\n` +
              `🚨 گزارش‌های pending: ${pendingReports}\n` +
              `💬 چت‌های فعال: ${activeChats}\n\n` +
              `دستورات:\n` +
              `/stats — آمار کامل\n` +
              `/reports — بررسی گزارش‌ها\n` +
              `/ban <telegramId> — بن کاربر\n` +
              `/unban <telegramId> — آنبن کاربر\n` +
              `/warn <telegramId> — اخطار\n` +
              `/userinfo <telegramId> — اطلاعات کاربر\n` +
              `/givecoin <telegramId> <مقدار> — اهدای سکه`,
              { parse_mode: 'Markdown' },
       );
}

// ══════════════════════════════════════════════════════════
//  /stats — آمار کلی
// ══════════════════════════════════════════════════════════

export async function statsHandler(ctx: BotContext): Promise<void> {
       if (!isAdmin(ctx)) return;

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
              `📊 *آمار ربات هم‌دل*\n\n` +
              `👥 *کاربران:*\n` +
              `• کل: ${totalUsers}\n` +
              `• جدید (۲۴ ساعت): ${newUsersToday}\n` +
              `• جدید (۷ روز): ${newUsersWeek}\n` +
              `• بن‌شده: ${bannedUsers}\n` +
              `• پسر: ${maleUsers} | دختر: ${femaleUsers}\n\n` +
              `🚨 *گزارش‌ها:*\n` +
              `• در انتظار بررسی: ${pendingReports}\n` +
              `• کل گزارش‌ها: ${totalReports}`,
              { parse_mode: 'Markdown' },
       );
}

// ══════════════════════════════════════════════════════════
//  /reports — لیست گزارش‌های pending
// ══════════════════════════════════════════════════════════

export async function reportsHandler(ctx: BotContext): Promise<void> {
       if (!isAdmin(ctx)) return;

       const reports = await ReportModel.getPending();

       if (reports.length === 0) {
              await ctx.reply('✅ هیچ گزارش pending‌ای وجود ندارد.');
              return;
       }

       await ctx.reply(`🚨 *${reports.length} گزارش در انتظار بررسی:*`, { parse_mode: 'Markdown' });

       for (const report of reports.slice(0, 10)) {
              // تعداد گزارش‌های قبلی علیه همین کاربر
              const prevCount = await ReportModel.countAgainstUser(report.reportedId);

              const reportText =
                     `🆔 گزارش: \`${report._id}\`\n` +
                     `👤 گزارش‌دهنده: \`${report.reporterId}\`\n` +
                     `🎯 گزارش‌شده: \`${report.reportedId}\`\n` +
                     `📋 دلیل: ${report.reason}\n` +
                     `📅 زمان: ${report.createdAt.toLocaleString('fa-IR')}\n` +
                     `🔢 تعداد گزارش علیه این کاربر: ${prevCount}`;

              await ctx.reply(reportText, {
                     parse_mode: 'Markdown',
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
       if (!isAdmin(ctx)) return;

       const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
       const parts = text.split(' ');

       if (parts.length < 2) {
              await ctx.reply('استفاده: /ban <telegramId> [دلیل]');
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

       await ctx.reply(`✅ کاربر \`${targetId}\` (${user.name}) بن شد.\nدلیل: ${reason}`, {
              parse_mode: 'Markdown',
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
       if (!isAdmin(ctx)) return;

       const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
       const targetId = Number(text.split(' ')[1]);

       if (isNaN(targetId)) {
              await ctx.reply('استفاده: /unban <telegramId>');
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

       await ctx.reply(`✅ کاربر \`${targetId}\` (${user.name}) آنبن شد.`, { parse_mode: 'Markdown' });

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
       if (!isAdmin(ctx)) return;

       const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
       const parts = text.split(' ');
       const targetId = Number(parts[1]);
       const reason = parts.slice(2).join(' ') || 'رفتار نامناسب';

       if (isNaN(targetId)) {
              await ctx.reply('استفاده: /warn <telegramId> [دلیل]');
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
              `⚠️ اخطار ${user.warnings} به کاربر \`${targetId}\` (${user.name}) ثبت شد.` +
              (shouldBan ? `\n\n🚫 بن خودکار اعمال شد (${user.warnings} اخطار).` : ''),
              { parse_mode: 'Markdown' },
       );

       const warnMsg = shouldBan
              ? `🚫 حساب شما به دلیل اخطارهای مکرر مسدود شد.`
              : `⚠️ *اخطار ${user.warnings}*\n\nرفتار نامناسب گزارش شده: ${reason}\n\nدر صورت تکرار، حساب شما مسدود خواهد شد.`;

       await bot.telegram.sendMessage(targetId, warnMsg, { parse_mode: 'Markdown' }).catch(() => { });
}

// ══════════════════════════════════════════════════════════
//  /userinfo <id> — اطلاعات کاربر
// ══════════════════════════════════════════════════════════

export async function userInfoHandler(ctx: BotContext): Promise<void> {
       if (!isAdmin(ctx)) return;

       const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
       const targetId = Number(text.split(' ')[1]);

       if (isNaN(targetId)) {
              await ctx.reply('استفاده: /userinfo <telegramId>');
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
              `👤 *اطلاعات کاربر*\n\n` +
              `🆔 Telegram ID: \`${user.telegramId}\`\n` +
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
              { parse_mode: 'Markdown' },
       );
}


// ══════════════════════════════════════════════════════════
//  /givecoin <id> <amount> — اهدای سکه به کاربر توسط ادمین
// ══════════════════════════════════════════════════════════

export async function giveCoinHandler(
       ctx: BotContext,
       bot: Telegraf<BotContext>,
): Promise<void> {
       if (!isAdmin(ctx)) return;

       const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
       const parts = text.trim().split(/\s+/);

       if (parts.length < 3) {
              await ctx.reply(
                     '❌ فرمت نادرست.\n\n' +
                     'استفاده صحیح:\n' +
                     '`/givecoin <telegramId> <مقدار>`\n\n' +
                     'مثال: `/givecoin 123456789 50`',
                     { parse_mode: 'Markdown' },
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
              await ctx.reply(
                     '❌ مقدار سکه باید یک عدد صحیح غیر صفر باشد.\n' +
                     'برای کسر سکه از عدد منفی استفاده کنید (مثال: `-10`).',
              );
              return;
       }

       const user = await UserModel.findByTelegramId(targetId);
       if (!user) {
              await ctx.reply(`❌ کاربری با آیدی \`${targetId}\` پیدا نشد.`, {
                     parse_mode: 'Markdown',
              });
              return;
       }

       if (user.isBanned) {
              await ctx.reply(`⚠️ کاربر \`${targetId}\` بن است. آیا ادامه می‌دهید؟`, {
                     parse_mode: 'Markdown',
              });
              // ادامه می‌دهیم — ادمین آگاه است
       }

       const balanceBefore = user.coins;
       const balanceAfter = Math.max(0, balanceBefore + amount);

       // کسر بیشتر از موجودی مجاز نیست
       if (amount < 0 && balanceBefore + amount < 0) {
              await ctx.reply(
                     `❌ موجودی کاربر (${balanceBefore} سکه) کمتر از مقدار کسر (${Math.abs(amount)}) است.\n` +
                     `حداکثر می‌توان \`/givecoin ${targetId} -${balanceBefore}\` زد.`,
                     { parse_mode: 'Markdown' },
              );
              return;
       }

       // ذخیره در دیتابیس (atomic update)
       user.coins = balanceAfter;
       await user.save();

       // ثبت در لاگ سکه
       await CoinLogModel.record(
              targetId,
              amount,
              CoinChangeReason.AdminGift,
              balanceAfter,
              String(ctx.from!.id),
       );

       const direction = amount > 0 ? '🎁 اهدا' : '➖ کسر';
       const amountText = amount > 0 ? `+${amount}` : String(amount);

       // پیام تأیید به ادمین
       await ctx.reply(
              `✅ *عملیات موفق*\n\n` +
              `👤 کاربر: \`${targetId}\` (${user.name ?? '—'})\n` +
              `${direction}: *${amountText} سکه*\n` +
              `📊 موجودی قبل: ${balanceBefore} → بعد: ${balanceAfter}`,
              { parse_mode: 'Markdown' },
       );

       // اطلاع‌رسانی به کاربر
       const userMsg =
              amount > 0
                     ? `🎁 *${amount} سکه هدیه دریافت کردی!*\n\nموجودی فعلی: ${balanceAfter} سکه 🪙`
                     : `📢 *اطلاعیه حساب*\n\n${Math.abs(amount)} سکه از حسابت کسر شد.\nموجودی فعلی: ${balanceAfter} سکه 🪙`;

       await bot.telegram
              .sendMessage(targetId, userMsg, { parse_mode: 'Markdown' })
              .catch(() => {
                     // کاربر ربات را بلاک کرده — نادیده می‌گیریم
              });
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
                     `✅ گزارش \`${reportId}\` رد شد.`,
                     { parse_mode: 'Markdown' },
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
                            `⚠️ *اخطار ${reported.warnings}*\n\nرفتارت گزارش شد. در صورت تکرار بن خواهی شد.`,
                            { parse_mode: 'Markdown' },
                     ).catch(() => { });

                     const resultText = autoBan
                            ? `⚠️→🚫 اخطار داده شد و بن خودکار اعمال شد (اخطار ${reported.warnings}).`
                            : `⚠️ اخطار ${reported.warnings} به کاربر \`${report.reportedId}\` داده شد.`;

                     await ctx.answerCbQuery('✅ اخطار ثبت شد.');
                     await ctx.editMessageText(resultText, { parse_mode: 'Markdown' }).catch(() => { });
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
                     `🚫 کاربر \`${report.reportedId}\` بن شد.`,
                     { parse_mode: 'Markdown' },
              ).catch(() => { });
       }
}
