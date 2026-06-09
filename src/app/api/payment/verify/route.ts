// app/api/payment/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import Zarinpal from "zarinpal-node-sdk";

import { createHash } from "crypto";
import { connectDB } from "@/lib/mongodb";
const BASE_URL = process.env.NEXTAUTH_URL || "https://hamdel.netlify.app/";  // ✅ fallback


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

export async function GET(req: NextRequest) {
       await connectDB()
       const authority = req.nextUrl.searchParams.get("Authority");
       const status = req.nextUrl.searchParams.get("Status");

       // 1. اعتبارسنجی اولیه پارامترها
       if (status !== "OK" || !authority || typeof authority !== "string") {
              return NextResponse.redirect(new URL(`${BASE_URL}/payment/failed`, req.url));
       }

       // 2. یافتن اطلاعات موقت پرداخت
       const tempPayment = await TempPayment.findOne({ authority });
       if (!tempPayment) {
              console.log("TempPayment not found for authority:", authority);

              // احتمال حمله با Authority نامعتبر
              return NextResponse.redirect(new URL(`${BASE_URL}/payment/failed`, req.url));
       }

       // 3. جلوگیری از پرداخت دوباره (replay attack) با بررسی وضعیت Purchase
       const existingPurchase = await Purchase.findById(tempPayment.purchaseId);
       if (!existingPurchase) {
              console.log("Purchase not found for tempPayment:", tempPayment._id);

              await TempPayment.deleteOne({ _id: tempPayment._id });
              return NextResponse.redirect(new URL(`${BASE_URL}/payment/failed`, req.url));
       }

       if (existingPurchase.status === "paid") {
              console.log("Purchase already paid:", existingPurchase._id);

              // قبلاً پرداخت شده است – حذف رکورد موقت و هدایت به موفقیت
              await TempPayment.deleteOne({ _id: tempPayment._id });
              return NextResponse.redirect(new URL(`${BASE_URL}/payment/success`, req.url));
       }

       // 4. راه‌اندازی SDK زرین‌پال
       // const zarinpal = new Zarinpal({
       //   merchantId: process.env.ZARINPAL_MERCHANT_ID!,
       //   sandbox: false // استفاده از متغیر محیطی برای حالت sandbox
       // });
       ////////////////
       const merchantId = generateUUIDFromIds(existingPurchase._id, existingPurchase._id);

       const zarinpal = new Zarinpal({
              merchantId: merchantId,
              sandbox: true // استفاده از متغیر محیطی برای حالت sandbox
       });
       //////////////////////
       try {
              // 5. تأیید پرداخت با زرین‌پال
              const verification = await zarinpal.verifications.verify({
                     amount: tempPayment.amount,
                     authority,
              });
              console.log("Verification response:", {
                     code: verification.data?.code,
                     ref_id: verification.data?.ref_id,
                     message: verification.errors?.message,
              });

              if (verification.data.code === 100) {
                     const des = `${tempPayment.planId}-${tempPayment.authority}`
                     // 6. به‌روزرسانی اتمیک Purchase فقط در صورت pending بودن
                     const updateResult = await Purchase.updateOne(
                            { _id: tempPayment.purchaseId, status: "pending" },
                            {
                                   $set: {
                                          status: "paid",
                                          transactionId: verification.data.ref_id,
                                          paymentGateway: "zarinpal",
                                          paidAt: new Date(),
                                          amount: tempPayment.amount,
                                          // planId: tempPayment.planId,
                                          verified: true,
                                          activationCode: des
                                   },
                            }
                     );

                     // اگر هیچ سندی به‌روز نشد، یعنی وضعیت قبلاً تغییر کرده بود
                     if (updateResult.matchedCount === 0) {
                            console.log("Race condition - purchase already processed");
                            const currentPurchase = await Purchase.findById(tempPayment.purchaseId);
                            if (currentPurchase?.status === "paid") {
                                   await TempPayment.deleteOne({ _id: tempPayment._id });
                                   try {
                                          await User.findByIdAndUpdate(existingPurchase.userId, { role: 'admin', botState: 'awaiting_building_name' })
                                   } catch (error) {
                                          // بهینه کن
                                          return NextResponse.redirect(new URL(`${BASE_URL}/payment/failed`, req.url));

                                   }
                                   return NextResponse.redirect(new URL(`${BASE_URL}/payment/success`, req.url));
                            }
                            return NextResponse.redirect(new URL(`${BASE_URL}/payment/failed`, req.url));
                     }

                     // 7. حذف رکورد موقت
                     await TempPayment.deleteOne({ _id: tempPayment._id });
                     try {
                            await User.findByIdAndUpdate(existingPurchase.userId, { role: 'admin', botState: 'awaiting_building_name' })
                     } catch (error) {
                            // بهینه کن
                            return NextResponse.redirect(new URL(`${BASE_URL}/payment/failed`, req.url));

                     }
                     return NextResponse.redirect(new URL(`${BASE_URL}/payment/success`, req.url));
              } else {
                     console.log("Payment failed with code:", verification.data?.code);

                     // پرداخت ناموفق – وضعیت را به failed تغییر می‌دهیم (اختیاری)
                     await Purchase.updateOne(
                            { _id: tempPayment.purchaseId, status: "pending" },
                            { $set: { status: "failed" } }
                     );


                     await TempPayment.deleteOne({ _id: tempPayment._id });
                     return NextResponse.redirect(new URL(`${BASE_URL}/payment/failed`, req.url));
              }
       } catch (error) {
              console.error("Verification error:", error);
              // در صورت خطای شبکه یا خطای سرور، رکورد موقت را حذف نکنید (اجازه دهید کاربر دوباره تلاش کند)
              return NextResponse.redirect(new URL(`${BASE_URL}/payment/failed`, req.url));
       }
}