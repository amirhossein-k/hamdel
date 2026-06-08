/* eslint-disable @typescript-eslint/no-explicit-any */
// app/telegram/handlers/message.ts
import { Context } from "telegraf";
import { connectDB } from "@/lib/mongodb";

const MESSAGES = {

};

// تعریف تایپ برای session (برای TypeScript)
interface MySession {

       waitingForMessage?: boolean;

       replyingTo?: string;

}

export async function handleReplyButton(ctx: any & { session?: MySession }) {
       // دریافت داده مستقیم از callback_query
       const callbackData = ctx.callbackQuery?.data;
       if (!callbackData) return;

       const userChatId = callbackData.replace('reply_to_', '');
       if (!userChatId) return;
       // ذخیره chatId کاربر در session جاری (ادمین) برای استفاده در مرحله بعد
       ctx.session = ctx.session || {};
       ctx.session.replyingTo = userChatId;


       // اطلاع‌رسانی به ادمین برای ارسال پاسخ
       await ctx.answerCbQuery('✅ در حال آماده‌سازی پاسخ...');
       await ctx.reply(`✏️ لطفاً پاسخ خود را برای کاربر با آیدی ${userChatId} ارسال کنید.`);

       // در صورت تمایل می‌توانید بعد از کلیک، دکمه را غیرفعال کنید
       await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
}

export async function handleMessage(ctx: Context & { session?: MySession }) {
       try {
              const msg = ctx.message;
              if (!msg || !("text" in msg) || !msg.text) return;

              const chatId = String(ctx.chat?.id);
              const text = msg.text.trim();
              const firstName = msg.from?.first_name || "کاربر";


       } catch (err: any) {
              console.error("[handleMessage] ERROR:", err.message);
              try {
                     await ctx.reply("❌ خطایی رخ داد. لطفاً دوباره تلاش کنید.");
              } catch (e) { }
       }
}