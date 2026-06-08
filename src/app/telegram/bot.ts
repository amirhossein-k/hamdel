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
       handleReportAction,
       isAdmin,
} from './handlers/admin';
import {
       startEditName,
       startEditAge,
       startEditProvince,
       showInterests,
       toggleInterest,
       saveInterests,
       showSettingsMenu,
} from './handlers/settings';

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
bot.on('message', makeMessageRouter(bot));

// ─── دستورات ادمین ───────────────────────────────────────

bot.command('admin', (ctx) => adminMenuHandler(ctx));
bot.command('stats', (ctx) => statsHandler(ctx));
bot.command('reports', (ctx) => reportsHandler(ctx));
bot.command('ban', (ctx) => banHandler(ctx, bot));
bot.command('unban', (ctx) => unbanHandler(ctx, bot));
bot.command('warn', (ctx) => warnHandler(ctx, bot));
bot.command('userinfo', (ctx) => userInfoHandler(ctx));

// ─── Callback Query ها ───────────────────────────────────

// چت مستقیم
bot.action(/^accept_chat:(\d+)$/, async (ctx) => {
       await acceptChatRequest(ctx, bot, Number(ctx.match[1]));
});

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

bot.action(/^toggle_interest:(.+)$/, async (ctx) => {
       await toggleInterest(ctx, ctx.match[1]);
});

bot.action('save_interests', (ctx) => saveInterests(ctx));

bot.action('settings:back', async (ctx) => {
       await ctx.answerCbQuery();
       await ctx.deleteMessage().catch(() => { });
       await showSettingsMenu(ctx);
});

// پنل ادمین — تصمیم روی گزارش
bot.action(/^admin_report:([^:]+):(warn|ban|dismiss)$/, async (ctx) => {
       const reportId = ctx.match[1];
       const action = ctx.match[2] as 'warn' | 'ban' | 'dismiss';
       await handleReportAction(ctx, bot, reportId, action);
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
