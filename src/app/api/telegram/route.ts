// app\api\telegram\route.ts
import bot from "@/app/telegram/bot";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    await bot.handleUpdate(body);
    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("❌ Error in POST handler:", err);
    return new Response("Error", { status: 500 });
  }
}

export async function GET() {
  try {
    await bot.telegram.setWebhook(
      `${process.env.NEXT_PUBLIC_DOMAIN}/api/telegram`
    );

    return new Response("✅ Webhook set successfully", { status: 200 });
  } catch (err) {
    console.error("❌ Error setting webhook:", err);
    return new Response("❌ Error setting webhook", { status: 500 });
  }
}
