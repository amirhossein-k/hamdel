// app/api/payment/request/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { dbConnect } from "../../mongodb";
import ZarinPal from "zarinpal-node-sdk";           // ✅ default import (درست)
import { createHash } from "crypto";

function generateUUIDFromIds(chargeId: string, telegramId: string): string {
  // یک namespace ثابت (مثلاً DNS)
  const NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
  const input = `${chargeId}:${telegramId}`;
  // هش SHA-256
  const hash = createHash('sha256').update(input).digest();
  // 16 بایت اول (128 بیت)
  const bytes = hash.subarray(0, 16);
  // تنظیم نسخه (version 5)
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  // تنظیم variant (RFC 4122)
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export async function POST(req: NextRequest) {    // ✅ NextRequest
  try {
    console.log("📥 Payment request received");

    // 1️⃣ بررسی session
    const session = await getServerSession(authOptions);
    if (!session?.user?.codeYekta) {
      return NextResponse.json(
        { error: "Unauthorized - no codeYekta" },
        { status: 401 }
      );
    }
    console.log("✅ Session valid:", session.user.codeYekta);

    // 2️⃣ اتصال به دیتابیس
    await dbConnect();
    console.log("✅ DB connected");

    // 3️⃣ دریافت body
    const body = await req.json();                // ✅ req.json() روی NextRequest
    const { amount, planId } = body;
    console.log("✅ Body parsed:", { amount, planId });

    if (!amount || !planId) {
      return NextResponse.json(
        { error: "amount و planId الزامی هستند" },
        { status: 400 }
      );
    }

    // 4️⃣ import مدل‌ها (با try-catch مجزا)
    let Purchase, TempPayment;
    try {
      Purchase = (await import("@/app/models/Purchase")).default;
      TempPayment = (await import("@/app/models/TempPayment")).default;
    } catch (err) {
      console.error("❌ Model import failed:", err);
      return NextResponse.json(
        { error: "خطا در بارگذاری مدل‌ها" },
        { status: 500 }
      );
    }

    // 5️⃣ پیدا کردن purchase
    const existingPurchase = await Purchase.findOne({
      codeYekta: session.user.codeYekta,
      status: "pending",
    });
    if (!existingPurchase) {
      return NextResponse.json(
        { error: "هیچ خریدی در انتظار پرداخت یافت نشد" },
        { status: 404 }
      );
    }
    console.log("✅ Purchase found:", existingPurchase._id);


    const amountInRials = Number(amount) * 10;

    // const zarinpal = new ZarinPal({
    //   merchantId: process.env.ZARINPAL_MERCHANT_ID!,
    //   sandbox: false,
    // });
    // /////////////////////
    const merchantId = generateUUIDFromIds(existingPurchase._id, existingPurchase._id);

    const zarinpal = new ZarinPal({
      merchantId: merchantId,
      sandbox: true,
    });
    ////////////////////////
    console.log(process.env.NEXTAUTH_URL, 'process.env.NEXTAUTH_URL')
    const paymentRequest = await zarinpal.payments.create({
      amount: amountInRials,                     // ✅ اطمینان از عدد بودن
      description: `پرداخت برای طرح ${planId}`,
      callback_url: `${process.env.NEXTAUTH_URL}/api/payment/verify`,
      mobile: session.user.phoneNumber || "",
    });
    console.log("✅ Zarinpal response:", JSON.stringify(paymentRequest, null, 2));


    // ✅ دریافت Authority و ساخت redirect URL
    const authority = paymentRequest.data?.authority;
    if (!authority) {
      throw new Error(paymentRequest.errors?.message || "No authority received");
    }
    // //////////////////
    const redirectUrl = `https://sandbox.zarinpal.com/pg/StartPay/${authority}`;
    // /////////////
    // const redirectUrl = `https://www.zarinpal.com/pg/StartPay/${authority}`;


    // 7️⃣ ذخیره موقت
    await TempPayment.create({
      purchaseId: existingPurchase._id,
      authority,
      amount: amountInRials,
      planId,
    });

    return NextResponse.json({
      redirectUrl
    });

  } catch (error: any) {
    console.error("❌ Error details:", {
      message: error.message,
      response: error.response?.data,

      stack: error.stack?.split("\n").slice(0, 3).join("\n"),
      // name: error.name,
    });

    return NextResponse.json(
      { error: error.response?.data?.errors?.message || error.message || "خطای ناشناخته" },
      { status: 500 }
    );
  }
}
