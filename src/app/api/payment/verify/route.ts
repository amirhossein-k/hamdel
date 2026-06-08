// src/app/api/payment/verify/route.ts
// ─── Webhook تأیید پرداخت زرین‌پال ──────────────────────
//
//  زرین‌پال بعد از پرداخت کاربر را به این آدرس redirect می‌کند:
//  GET /api/payment/verify?txId=...&Authority=...&Status=OK|NOK

import { NextRequest, NextResponse } from 'next/server';
import { verifyAndCreditCoins } from '@/app/telegram/handlers/coin';
import bot from '@/app/telegram/bot';

export async function GET(req: NextRequest) {
       const { searchParams } = req.nextUrl;

       const txId = searchParams.get('txId');
       const authority = searchParams.get('Authority');
       const status = searchParams.get('Status');

       if (!txId || !authority || !status) {
              return NextResponse.redirect(new URL('/payment/error', req.url));
       }

       const result = await verifyAndCreditCoins(
              bot as Parameters<typeof verifyAndCreditCoins>[0],
              txId,
              authority,
              status,
       );

       if (result.success) {
              return NextResponse.redirect(new URL('/payment/success', req.url));
       } else {
              return NextResponse.redirect(new URL('/payment/error', req.url));
       }
}
