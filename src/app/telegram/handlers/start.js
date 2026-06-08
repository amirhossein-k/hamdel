// // app\telegram\handlers\start.js
// import { connectDB } from "@/app/lib/mongodb";
const MESSAGES = {};
export function startHandler() {
  return async (ctx) => {
    await ctx.reply("خوش اومدی");
  };
}
