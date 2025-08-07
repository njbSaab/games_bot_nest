import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';
import axios from 'axios';
import axiosRetry from 'axios-retry';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly allowedUserIds: string[];
  private readonly adminTelegramIds: string[];
  private readonly botToken: string;
  private readonly axiosInstance = axios.create();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.allowedUserIds = this.configService.get<string>('ALLOWED_TELEGRAM_IDS', '7066816061').split(',');
    this.adminTelegramIds = this.configService.get<string>('ADMIN_TELEGRAM_IDS', '7066816061').split(',').filter(id => id.trim() !== '');
    this.botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN', '');
    this.logger.log(`NotificationService инициализирован, adminTelegramIds: ${this.adminTelegramIds.join(', ')}, botToken: ${this.botToken ? 'установлен' : 'не установлен'}`);

    axiosRetry(this.axiosInstance, {
      retries: 3,
      retryDelay: (retryCount) => retryCount * 1000,
      retryCondition: (error) =>
        error.response?.status === 429 ||
        error.response?.status >= 500 ||
        error.code === 'ECONNABORTED' ||
        error.code === 'ENOTFOUND',
    });

    if (!this.adminTelegramIds.length) {
      this.logger.warn('ADMIN_TELEGRAM_IDS не указаны в .env. Уведомления в чат не будут отправляться.');
    }
    if (!this.botToken) {
      this.logger.error('TELEGRAM_BOT_TOKEN не указан в .env. Уведомления не будут отправляться.');
    }
    if (this.adminTelegramIds.includes('7445683137')) {
      this.logger.warn('ADMIN_TELEGRAM_IDS содержит ID бота (7445683137), уведомления для этого ID отключены');
    }
  }

  private escapeMarkdownV2(text: string): string {
    return text.replace(/([_*[\]()~`>#+\-=|{:}.!])/g, '\\$1');
  }

  private async sendTelegramMessage(chatId: string, message: string): Promise<boolean> {
    if (!this.botToken) {
      this.logger.error('Токен бота не указан');
      return false;
    }

    if (chatId === '7445683137') {
      this.logger.warn(`Пропуск отправки в chatId ${chatId}: это ID бота`);
      return false;
    }

    const maxMessageLength = 4096;
    if (message.length > maxMessageLength) {
      this.logger.warn(`Сообщение для chatId ${chatId} превышает лимит Telegram (${message.length} символов), разбиваем`);
      const messages = [];
      for (let i = 0; i < message.length; i += maxMessageLength) {
        messages.push(message.slice(i, i + maxMessageLength));
      }
      let success = true;
      for (const chunk of messages) {
        try {
          await this.axiosInstance.post(
            `https://api.telegram.org/bot${this.botToken}/sendMessage`,
            {
              chat_id: chatId,
              text: chunk,
              parse_mode: 'MarkdownV2',
            },
            { timeout: 15000 },
          );
          this.logger.debug(`Часть сообщения отправлена в chatId ${chatId}`);
        } catch (error) {
          this.logger.error(
            `Ошибка отправки части сообщения в chatId ${chatId}: ${error.message}, response: ${JSON.stringify(error.response?.data)}`,
          );
          success = false;
        }
      }
      return success;
    }

    try {
      await this.axiosInstance.post(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        {
          chat_id: chatId,
          text: message,
          parse_mode: 'MarkdownV2',
        },
        { timeout: 15000 },
      );
      this.logger.debug(`Сообщение отправлено в chatId ${chatId}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Ошибка отправки сообщения в chatId ${chatId}: ${error.message}, response: ${JSON.stringify(error.response?.data)}`,
      );
      return false;
    }
  }

  async notifyError(
    resource: { id: number; name: string; url: string; type: string; interval: number; userId?: string },
    errorMessage: string,
    statusCode?: string | number,
  ): Promise<boolean> {
    if (!this.botToken) {
      this.logger.error('Токен бота не указан');
      return false;
    }
    if (!this.adminTelegramIds.length) {
      this.logger.warn('ADMIN_TELEGRAM_IDS не указаны, уведомление в чат не отправлено');
      return false;
    }

    const date = new Date().toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).replace(',', ' -');

    const formattedMessage = this.escapeMarkdownV2(
      `📌 ${date} - Не работает ❌\n` +
        `ID: ${resource.id}\n` +
        `Name: ${resource.name}\n` +
        `Url: ${resource.url}\n` +
        `Type: ${resource.type}\n` +
        `Interval: ${resource.interval} мин\n` +
        `Ошибка: ${errorMessage.slice(0, 200)}\n` +
        (statusCode ? `Код ошибки: ${statusCode}\n` : '') +
        `Причина: ${errorMessage.includes('success: false') ? 'Некорректный или пустой ответ сервера' : 'Сетевой сбой или ошибка сервера'}\n` +
        `Логи: /logs ${resource.id}`,
    );

    let success = true;
    for (const chatId of this.adminTelegramIds) {
      const result = await this.sendTelegramMessage(chatId, formattedMessage);
      if (result) {
        this.logger.log(`Уведомление об ошибке отправлено в чат ${chatId}`);
      } else {
        this.logger.warn(`Не удалось отправить уведомление в чат ${chatId}`);
        success = false;
      }
    }
    return success;
  }

  async notify(message: string): Promise<boolean> {
    if (!this.botToken) {
      this.logger.error('Токен бота не указан');
      return false;
    }
    if (!this.adminTelegramIds.length) {
      this.logger.warn('ADMIN_TELEGRAM_IDS не указаны, уведомление в чат не отправлено');
      return false;
    }

    const escapedMessage = this.escapeMarkdownV2(message);
    let success = true;
    for (const chatId of this.adminTelegramIds) {
      const result = await this.sendTelegramMessage(chatId, escapedMessage);
      if (result) {
        this.logger.log(`Уведомление отправлено в чат ${chatId}`);
      } else {
        this.logger.warn(`Не удалось отправить уведомление в чат ${chatId}`);
        success = false;
      }
    }
    return success;
  }

  async getResourcesByTelegramId(telegramId: string): Promise<any[]> {
    if (!this.allowedUserIds.includes(telegramId)) {
      this.logger.warn(`Попытка получения ресурсов для неразрешённого userId: ${telegramId}`);
      return [];
    }

    let attempts = 3;
    let delay = 1000;
    while (attempts > 0) {
      try {
        const where = this.allowedUserIds.includes(telegramId) ? {} : { userId: telegramId };
        const resources = await this.prisma.resource.findMany({ where });
        this.logger.debug(`Найдено ${resources.length} ресурсов для userId: ${telegramId}`);
        return resources;
      } catch (error) {
        attempts--;
        this.logger.error(
          `Ошибка получения ресурсов для userId ${telegramId}, попытка ${4 - attempts}/3: ${error.message}, stack: ${error.stack}`,
        );
        if (attempts === 0) {
          this.logger.error(`Все попытки получения ресурсов для userId ${telegramId} исчерпаны`);
          return [];
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
    return [];
  }

  async getLogsByResourceId(resourceId: number): Promise<any[]> {
    let attempts = 3;
    let delay = 1000;
    while (attempts > 0) {
      try {
        const logs = await this.prisma.log.findMany({
          where: { resourceId },
          orderBy: { createdAt: 'desc' },
        });
        this.logger.debug(`Найдено ${logs.length} логов для resourceId: ${resourceId}`);
        return logs;
      } catch (error) {
        attempts--;
        this.logger.error(
          `Ошибка получения логов для resourceId ${resourceId}, попытка ${4 - attempts}/3: ${error.message}, stack: ${error.stack}`,
        );
        if (attempts === 0) {
          this.logger.error(`Все попытки получения логов для resourceId ${resourceId} исчерпаны`);
          return [];
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
    return [];
  }
}