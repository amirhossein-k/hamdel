// src/app/telegram/context.ts
// ─── تایپ سفارشی Context ─────────────────────────────────

import { Context } from 'telegraf';
import type { IUserDocument } from '@/models/user.model';

export type SessionStep =
       | `report:${number}:${string}`
       | 'direct:search'
       | 'settings:name'
       | 'settings:age'
       | 'settings:province'
       | 'settings:city'
       | undefined;

export interface BotSession {
       step?: SessionStep | string;
}

export interface BotContext extends Context {
       session?: BotSession;
       dbUser?: IUserDocument;
}
