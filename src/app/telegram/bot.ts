// src\app\telegram\bot.ts
import { Telegraf, session } from "telegraf";
// import session from "telegraf/session";

import { startHandler } from "./handlers/start";
import { handleMessage, handleReplyButton } from "./handlers/message";
const bot = new Telegraf(process.env.BOT_TOKEN!);
// اضافه کردن middleware session
// cast to any to satisfy TypeScript typings for the imported session module
// eslint-disable-next-line @typescript-eslint/no-explicit-any
bot.use(session());
bot.start(startHandler()); // اینجا هندلر استارت جدید

bot.on("text", handleMessage);
bot.action(/reply_to_(.+)/, handleReplyButton); // اضافه کردن هندلر جدید برای دکمه Reply

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
