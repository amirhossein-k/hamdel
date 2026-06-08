// src\app\telegram\bot.ts

import { Telegraf, session, Context } from 'telegraf';
import type { BotContext, BotSession } from './context';
import { authMiddleware } from './middleware/auth';
import { startHandler } from './handlers/start';
import { messageRouter } from './handlers/message';

const bot = new Telegraf<BotContext>(process.env.BOT_TOKEN!);

// ─── Middleware ها (ترتیب مهم است) ───────────────────────

// ۱. session (باید قبل از auth باشد)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
bot.use(session() as any);// ۲. احراز هویت + بارگذاری کاربر از DB
bot.use(authMiddleware);

// ─── Handler ها ──────────────────────────────────────────

bot.start(startHandler);
bot.on('text', messageRouter);


export async function POST(req: Request) {
       try {
              const body = await req.json();
              await bot.handleUpdate(body);
              return new Response("OK", { status: 200 });
       } catch (err) {
              console.error("❌ Error in POST handler:", err);
              return new Response("Error", { status: 500 });
       }
       // ''
}

export default bot;
