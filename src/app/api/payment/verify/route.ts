// src\app\api\payment\verify\route.ts
import { NextRequest, NextResponse } from 'next/server';

import { connectDB } from '@/lib/mongodb';
import { TransactionModel } from '@/models/coin.model';
import { verifyAndCreditCoins } from '@/app/telegram/handlers/coin';

export async function GET(req: NextRequest) {
       await connectDB();

       const authority =
              req.nextUrl.searchParams.get('Authority');

       const status =
              req.nextUrl.searchParams.get('Status');

       if (!authority) {
              return NextResponse.redirect(
                     new URL('/payment/failed', req.url),
              );
       }

       const transaction =
              await TransactionModel.findByAuthority(
                     authority,
              );

       if (!transaction) {
              return NextResponse.redirect(
                     new URL('/payment/failed', req.url),
              );
       }

       const result =
              await verifyAndCreditCoins(

                     transaction._id.toString(),
                     authority,
                     status ?? '',

              );

       return NextResponse.redirect(
              new URL(
                     result.success
                            ? '/payment/success'
                            : '/payment/failed',
                     req.url,
              ),
       );
}