import { Context } from 'telegraf';

// Определяем данные, которые будут храниться в session
interface SessionData {
  currentCategoryName?: string;
}

// Расширяем интерфейс Context из Telegraf, добавляя session
export interface TelegramContext extends Context {
  session: SessionData;
}