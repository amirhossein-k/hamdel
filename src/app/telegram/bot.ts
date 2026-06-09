// src/app/telegram/bot.ts

import { Telegraf, session } from 'telegraf';
import type { BotContext } from './context';
import { authMiddleware } from './middleware/auth';
import { startHandler } from './handlers/start';
import { makeMessageRouter } from './handlers/message';
import { acceptChatRequest, rejectChatRequest } from './handlers/direct-chat';
import { initiatePurchase, showCoinsPage } from './handlers/coin';
import { CoinPackageId } from '@/types/enums';
import {
       adminMenuHandler,
       statsHandler,
       reportsHandler,
       banHandler,
       unbanHandler,
       warnHandler,
       userInfoHandler,
       giveCoinHandler,
       handleReportAction,
       isAdmin,
       usersListHandler,
       adminUserInfoCallback,
       adminQuickAction,
       adminViewPhoto,
       adminDeletePhoto,
       sendUserInfo,
       broadcastStartHandler,
       broadcastSendHandler,
       broadcastCancelHandler,
} from './handlers/admin';
import {
       startEditName,
       startEditAge,
       startEditProvince,
       showInterests,
       toggleInterest,
       saveInterests,
       showSettingsMenu,
       startEditPhoto,
       deletePhoto,
       cancelPhotoEdit,
} from './handlers/settings';
import {
       handleViewProfileCallback,
       handleProfileChatCallback,
       handleProfileMsgCallback,
       handleProfileReportCallback,
       handleProfileBlockCallback,
       handleBrowsePageCallback,
} from './handlers/profile-browse';

const bot = new Telegraf<BotContext>(process.env.BOT_TOKEN!);

// ─── Middleware ها ────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
bot.use(
       session({
              defaultSession: () => ({
                     step: '',
              }),
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
       }) as any
);

bot.use(authMiddleware);

// ─── دستورات عمومی ───────────────────────────────────────

bot.start(startHandler);

// ─── دستورات ادمین (باید قبل از bot.on('message') باشند) ─
// telegraf دستورات را به ترتیب ثبت اجرا می‌کند؛
// اگر bot.on('message') اول بیاید همه پیام‌ها را می‌بلعد.

bot.command('admin', (ctx) => adminMenuHandler(ctx));
bot.command('stats', (ctx) => statsHandler(ctx));
bot.command('reports', (ctx) => reportsHandler(ctx));
bot.command('ban', (ctx) => banHandler(ctx, bot));
bot.command('unban', (ctx) => unbanHandler(ctx, bot));
bot.command('warn', (ctx) => warnHandler(ctx, bot));
bot.command('userinfo', (ctx) => userInfoHandler(ctx));
bot.command('broadcast', (ctx) => broadcastStartHandler(ctx));
bot.command('cancel', async (ctx) => {
       if (ctx.session.step?.startsWith('admin:')) {
              ctx.session.step = undefined;
              ctx.session.broadcastText = undefined;
              await ctx.reply('❌ لغو شد.');
       }
});
bot.command('givecoin', (ctx) => giveCoinHandler(ctx, bot));
bot.command('users', (ctx) => usersListHandler(ctx, 0));

// ─── روتر عمومی پیام‌ها (باید آخر باشد) ──────────────────
bot.on('message', makeMessageRouter(bot));

// ─── Callback Query ها ───────────────────────────────────

// چت مستقیم
bot.action(/^accept_chat:(\d+)$/, async (ctx) => {
       await acceptChatRequest(ctx, bot, Number(ctx.match[1]));
});


// ─── Profile browse callbacks ─────────────────────────────
bot.action(/^view_profile:(\d+)$/, (ctx) => handleViewProfileCallback(ctx, bot));
bot.action(/^profile_chat:(\d+)$/, (ctx) => handleProfileChatCallback(ctx, bot));
bot.action(/^profile_msg:(\d+)$/, (ctx) => handleProfileMsgCallback(ctx));
bot.action(/^profile_report:(\d+)$/, (ctx) => handleProfileReportCallback(ctx, bot));
bot.action(/^profile_block:(\d+)$/, (ctx) => handleProfileBlockCallback(ctx));
bot.action(/^browse_page:/, (ctx) => handleBrowsePageCallback(ctx));
bot.action(/^reject_chat:(\d+)$/, async (ctx) => {
       await rejectChatRequest(ctx, bot, Number(ctx.match[1]));
});

// سکه
bot.action(/^buy_coins:(.+)$/, async (ctx) => {
       const packageId = ctx.match[1] as CoinPackageId;
       if (!Object.values(CoinPackageId).includes(packageId)) {
              await ctx.answerCbQuery('❌ پکیج نامعتبر');
              return;
       }
       await initiatePurchase(ctx, packageId);
});

bot.action('show_coins', async (ctx) => {
       await ctx.answerCbQuery();
       await ctx.deleteMessage().catch(() => { });
       await showCoinsPage(ctx);
});

bot.action('coins_back', async (ctx) => {
       await ctx.answerCbQuery();
       await ctx.deleteMessage().catch(() => { });
       await showCoinsPage(ctx);
});

// تنظیمات
bot.action('settings:name', (ctx) => startEditName(ctx));
bot.action('settings:age', (ctx) => startEditAge(ctx));
bot.action('settings:province', (ctx) => startEditProvince(ctx));
bot.action('settings:interests', (ctx) => showInterests(ctx));
bot.action('settings:photo', (ctx) => startEditPhoto(ctx));
bot.action('settings:photo_delete', (ctx) => deletePhoto(ctx));
bot.action('settings:photo_cancel', (ctx) => cancelPhotoEdit(ctx));

bot.action(/^toggle_interest:(.+)$/, async (ctx) => {
       await toggleInterest(ctx, ctx.match[1]);
});

bot.action('save_interests', (ctx) => saveInterests(ctx));

bot.action('settings:back', async (ctx) => {
       await ctx.answerCbQuery();
       await ctx.deleteMessage().catch(() => { });
       await showSettingsMenu(ctx);
});

// ─── پنل ادمین ────────────────────────────────────────────

// broadcast
bot.action('broadcast_confirm', (ctx) => broadcastSendHandler(ctx, bot));
bot.action('broadcast_cancel', (ctx) => broadcastCancelHandler(ctx));

// تصمیم روی گزارش
bot.action(/^admin_report:([^:]+):(warn|ban|dismiss)$/, async (ctx) => {
       const reportId = ctx.match[1];
       const action = ctx.match[2] as 'warn' | 'ban' | 'dismiss';
       await handleReportAction(ctx, bot, reportId, action);
});

// صفحه‌بندی لیست کاربران
bot.action(/^admin_users_page:(\d+)$/, async (ctx) => {
       await usersListHandler(ctx, Number(ctx.match[1]));
});

// باز کردن پروفایل کاربر از لیست
bot.action(/^admin_userinfo:(\d+)$/, async (ctx) => {
       await adminUserInfoCallback(ctx, Number(ctx.match[1]));
});

// مشاهده عکس پروفایل
bot.action(/^admin_photo_view:(\d+)$/, async (ctx) => {
       await adminViewPhoto(ctx, Number(ctx.match[1]));
});

// حذف عکس پروفایل
bot.action(/^admin_photo_delete:(\d+)$/, async (ctx) => {
       await adminDeletePhoto(ctx, bot, Number(ctx.match[1]));
});

// بازگشت به اطلاعات کاربر از صفحه عکس
bot.action(/^admin_userinfo_back:(\d+)$/, async (ctx) => {
       await ctx.answerCbQuery();
       await ctx.deleteMessage().catch(() => { });
       await sendUserInfo(ctx, Number(ctx.match[1]));
});

// اقدام سریع (warn/ban/unban) از پروفایل کاربر
bot.action(/^admin_quick:(\d+):(warn|ban|unban)$/, async (ctx) => {
       const targetId = Number(ctx.match[1]);
       const action = ctx.match[2] as 'warn' | 'ban' | 'unban';
       await adminQuickAction(ctx, bot, targetId, action);
});

// ─── Webhook Handler ──────────────────────────────────────

export async function POST(req: Request) {
       try {
              const body = await req.json();
              await bot.handleUpdate(body);
              return new Response('OK', { status: 200 });
       } catch (err) {
              console.error('❌ Error in POST handler:', err);
              return new Response('Error', { status: 500 });
       }
}

export default bot;