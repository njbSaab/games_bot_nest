import { Update, Ctx, Start, Command, On } from 'nestjs-telegraf';
import { Context, Scenes, Markup } from 'telegraf';
import { Logger } from '@nestjs/common';
import { NotificationService } from '../notification.service';
import { BotKeyboard } from './bot.keyboard';
import { Message } from 'telegraf/typings/core/types/typegram';
import { ConfigService } from '@nestjs/config';

@Update()
export class TelegramUpdate {
  private readonly logger = new Logger(TelegramUpdate.name);
  private readonly allowedUserIds: string[];

  constructor(
    private readonly notificationService: NotificationService,
    private readonly configService: ConfigService,
  ) {
    // Изменение 1: Получаем allowedUserIds из ConfigService
    this.allowedUserIds = this.configService.get<string>('ALLOWED_TELEGRAM_IDS', '7066816061,6684314409').split(',');
    this.logger.log(`Инициализация обработчика обновлений бота, разрешённые userIds: ${this.allowedUserIds.join(', ')}`);
  }

  private escapeMarkdownV2(text: string): string {
    return text.replace(/([_*[\]()~`>#+\-=|{:}.!])/g, '\\$1');
  }

  @Start()
  async onStart(@Ctx() ctx: Scenes.SceneContext) {
    const userId = ctx.from?.id?.toString();
    this.logger.log(`Получена команда /start от ${ctx.from?.username || 'unknown'}, Telegram ID: ${userId || 'unknown'}`);
    if (!userId || !this.allowedUserIds.includes(userId)) {
      await ctx.reply(this.escapeMarkdownV2('🚫 Доступ запрещён. Только для участников'), {
        parse_mode: 'MarkdownV2',
      });
      return;
    }

    try {
      await ctx.telegram.setMyCommands([
        { command: 'start', description: 'Запустить бота' },
        { command: 'status', description: 'Проверить статус ресурсов' },
        { command: 'logs', description: 'Посмотреть логи ресурса по id, name или url' },
        { command: 'addresource', description: 'Добавить новый ресурс' },
        { command: 'updateresource', description: 'Изменить существующий ресурс' },
        { command: 'deleteresource', description: 'Удалить ресурс' },
        { command: 'menu', description: 'Показать меню' },
      ]);

      await ctx.reply(
        this.escapeMarkdownV2(
          `👋 Привет, ${ctx.from?.username || 'пользователь'}, Ваш Telegram ID: ${userId}! Я 😎 бот Чекер, мониторю ресурсы и сообщаю о сбоях 🔝\n` +
            `\n*Доступные команды:*\n` +
            `✔️ /status — Показать список всех ресурсов\n\n` +
            `✔️ /logs <id|name|url> — Получить логи ресурса\n` +
            `  Примеры:\n /logs 1 \n /logs 1xjet \n /logs https://example.com\n\n` +
            `✔️ /addresource — Добавить новый ресурс\n\n` +
            `✔️ /updateresource — Изменить существующий ресурс\n\n` +
            `✔️ /deleteresource — Удалить ресурс\n\n` +
            `✔️ /menu — Показать меню\n\n` +
            `\n👇 Также используй кнопки ниже для удобства. 👇\n` +
            `\n 1 Добавить ресурс` +
            ` — Добавить новый ресурс` +
            `\n 2 Изменить ресурс` +
            ` — Изменить существующий ресурс` +
            `\n 3 Удалить ресурс` +
            ` — Удалить ресурс`,
        ),
        { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup },
      );
      this.logger.debug(`Успешно обработана команда /start для userId: ${userId}`);
    } catch (error) {
      // Изменение 2: Обработка ошибок
      this.logger.error(`Ошибка в команде /start: ${error.message}, stack: ${error.stack}`);
      await ctx.reply(
        this.escapeMarkdownV2('⚠️ Ошибка при инициализации бота. Попробуйте позже или свяжитесь с администратором.'),
        { parse_mode: 'MarkdownV2' },
      );
    }
  }

  @Command('status')
  async onStatus(@Ctx() ctx: Scenes.SceneContext) {
    const userId = ctx.from?.id?.toString();
    this.logger.log(`Получена команда /status от ${ctx.from?.username || 'unknown'}, Telegram ID: ${userId || 'unknown'}`);
    if (!userId || !this.allowedUserIds.includes(userId)) {
      await ctx.reply(this.escapeMarkdownV2('🚫 Доступ запрещён. Только для участников'), {
        parse_mode: 'MarkdownV2',
      });
      return;
    }

    // Изменение 3: Повторные попытки для запросов к NotificationService
    let attempts = 3;
    let delay = 1000;
    while (attempts > 0) {
      try {
        const resources = await this.notificationService.getResourcesByTelegramId(userId);
        if (resources.length === 0) {
          await ctx.reply(
            this.escapeMarkdownV2('Нет зарегистрированных ресурсов.'),
            { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup },
          );
          this.logger.debug(`Успешно обработана команда /status для userId: ${userId}, ресурсов не найдено`);
          return;
        }

        const uniqueResources = Array.from(new Map(resources.map((r) => [r.url, r])).values()).sort(
          (a, b) => a.id - b.id,
        );
        const logs = await Promise.all(
          uniqueResources.map(async (resource) => {
            const latestLog = (await this.notificationService.getLogsByResourceId(resource.id))[0];
            const date = latestLog?.createdAt
              ? new Date(latestLog.createdAt).toLocaleString('ru-RU')
              : `Нет данных 🤔 (ресурс только что добавлен, он появится через ${resource.interval} минут)`;
            const status = latestLog?.result ? 'Работает ✅' : 'Не работает ❌';
            return this.escapeMarkdownV2(
              `📌 ${date} - ${status}\n` +
                `ID: ${resource.id}\n` +
                `Name: ${resource.name}\n` +
                `Url: ${resource.url}\n` +
                `Type: ${resource.type}\n` +
                `Interval: ${resource.interval} мин\n` +
                `Увидеть логи скопируйте введите команду 👉 /logs ${resource.id}\n`,
            );
          }),
        );

        // Изменение 4: Проверка длины сообщения
        const message = logs.join('\n');
        if (message.length > 4000) {
          await ctx.reply(
            this.escapeMarkdownV2(
              '⚠️ Слишком много ресурсов! Показаны первые 10.\nИспользуйте /logs <id> для просмотра деталей.',
            ),
            { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup },
          );
          await ctx.reply(logs.slice(0, 10).join('\n'), {
            parse_mode: 'MarkdownV2',
            reply_markup: BotKeyboard.getMainKeyboard().reply_markup,
          });
        } else {
          await ctx.reply(message, {
            parse_mode: 'MarkdownV2',
            reply_markup: BotKeyboard.getMainKeyboard().reply_markup,
          });
        }
        this.logger.debug(`Успешно обработана команда /status для userId: ${userId}, найдено ${resources.length} ресурсов`);
        return;
      } catch (error) {
        attempts--;
        this.logger.error(`Ошибка в команде /status, попытка ${4 - attempts}/3: ${error.message}, stack: ${error.stack}`);
        if (attempts === 0) {
          await ctx.reply(
            this.escapeMarkdownV2(
              '⚠️ Ошибка при получении статуса ресурсов. Проверьте подключение к базе данных или попробуйте позже.',
            ),
            { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup },
          );
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  }

  @Command('logs')
  async onLogs(@Ctx() ctx: Scenes.SceneContext & { message: { text: string } }) {
    const userId = ctx.from?.id?.toString();
    this.logger.log(`Получена команда /logs от ${ctx.from?.username || 'unknown'}, Telegram ID: ${userId || 'unknown'}`);
    if (!userId || !this.allowedUserIds.includes(userId)) {
      await ctx.reply(this.escapeMarkdownV2('🚫 Доступ запрещён. Только для участников'), {
        parse_mode: 'MarkdownV2',
      });
      return;
    }

    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 1) {
      await ctx.reply(
        this.escapeMarkdownV2(
          `❗️ Введите id, name или url ресурса. Убедитесь, что они есть в списке: /status\n\n` +
            `/logs id|name|url — Получить логи ресурса\n` +
            `Примеры:\n` +
            `/logs 1\n /logs 1xjet\n /logs https://example.com\n\n` +
            `❌ Избегайте лишних слэшей в URL (например, https://example.com вместо https://example.com/)\n` +
            `💬 Используйте /status для просмотра доступных ресурсов`,
        ),
        { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup },
      );
      return;
    }

    const identifier = args.join(' ').trim();
    let attempts = 3;
    let delay = 1000;
    while (attempts > 0) {
      try {
        const resources = await this.notificationService.getResourcesByTelegramId(userId);
        const uniqueResources = Array.from(new Map(resources.map((r) => [r.url, r])).values());
        let resource;

        // Изменение 5: Поиск без учёта завершающего слэша
        const normalizedIdentifier = identifier.endsWith('/') ? identifier.slice(0, -1) : identifier;
        if (!isNaN(parseInt(normalizedIdentifier))) {
          resource = uniqueResources.find((r) => r.id === parseInt(normalizedIdentifier));
        } else {
          resource = uniqueResources.find(
            (r) =>
              r.name.toLowerCase() === normalizedIdentifier.toLowerCase() ||
              (r.url.endsWith('/') ? r.url.slice(0, -1) : r.url).toLowerCase() ===
                normalizedIdentifier.toLowerCase(),
          );
        }

        if (!resource) {
          const resourceList = uniqueResources
            .map((r) => this.escapeMarkdownV2(`ID: ${r.id}, Name: ${r.name}, URL: ${r.url}`))
            .join('\n');
          await ctx.reply(
            this.escapeMarkdownV2(
              `Ресурс не найден. Проверьте id, name или url.\nДоступные ресурсы:\n${resourceList}`,
            ),
            { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup },
          );
          return;
        }

        const logs = await this.notificationService.getLogsByResourceId(resource.id);
        if (logs.length === 0) {
          await ctx.reply(
            this.escapeMarkdownV2(`Логи не найдены для ресурса ${resource.name} (ID: ${resource.id}).`),
            { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup },
          );
          return;
        }

        // Изменение 6: Ограничение количества логов и обработка JSON
        const logMessages = logs.slice(0, 5).map((log) => {
          const date = new Date(log.createdAt).toLocaleString('ru-RU');
          const status = log.result ? 'success ✅' : 'error ❌';
          let response;
          try {
            const parsed = JSON.parse(log.response);
            response = parsed.response || parsed.error || log.response;
          } catch (parseError) {
            this.logger.warn(
              `Ошибка парсинга JSON в логе для ресурса ${resource.id}: ${parseError.message}, log.response: ${log.response}`,
            );
            response = log.response;
          }
          return this.escapeMarkdownV2(
            `${date} - status: ${status}\n` +
              `response: ${response.slice(0, 100)}\n` +
              (log.status ? `statusCode: ${log.status}\n` : ''),
          );
        });

        const message = logMessages.join('\n');
        if (message.length > 4000) {
          await ctx.reply(
            this.escapeMarkdownV2(
              `⚠️ Слишком много логов! Показаны последние 5.\nРесурс: ${resource.name} (ID: ${resource.id})`,
            ),
            { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup },
          );
          await ctx.reply(message, {
            parse_mode: 'MarkdownV2',
            reply_markup: BotKeyboard.getMainKeyboard().reply_markup,
          });
        } else {
          await ctx.reply(message, {
            parse_mode: 'MarkdownV2',
            reply_markup: BotKeyboard.getMainKeyboard().reply_markup,
          });
        }
        this.logger.debug(`Успешно обработана команда /logs для userId: ${userId}, ресурс ID: ${resource.id}`);
        return;
      } catch (error) {
        attempts--;
        this.logger.error(`Ошибка в команде /logs, попытка ${4 - attempts}/3: ${error.message}, stack: ${error.stack}`);
        if (attempts === 0) {
          await ctx.reply(
            this.escapeMarkdownV2(
              `⚠️ Ошибка при получении логов. Проверьте правильность id, name или url, или попробуйте позже.`,
            ),
            { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup },
          );
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  }

  @Command('addresource')
  async onAddResource(@Ctx() ctx: Scenes.SceneContext) {
    const userId = ctx.from?.id?.toString();
    this.logger.log(`Получена команда /addresource от ${ctx.from?.username || 'unknown'}, Telegram ID: ${userId || 'unknown'}`);
    if (!userId || !this.allowedUserIds.includes(userId)) {
      await ctx.reply(this.escapeMarkdownV2('🚫 Доступ запрещён. Только для участников'), {
        parse_mode: 'MarkdownV2',
      });
      return;
    }

    try {
      await ctx.scene.enter('add_resource_scene');
      this.logger.debug(`Успешно инициирован вход в сцену add_resource_scene для userId: ${userId}`);
    } catch (error) {
      this.logger.error(`Ошибка при входе в сцену add_resource_scene: ${error.message}, stack: ${error.stack}`);
      await ctx.reply(
        this.escapeMarkdownV2('⚠️ Ошибка при запуске добавления ресурса. Попробуйте позже.'),
        { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup },
      );
    }
  }

  @Command('updateresource')
  async onUpdateResource(@Ctx() ctx: Scenes.SceneContext) {
    const userId = ctx.from?.id?.toString();
    this.logger.log(`Получена команда /updateresource от ${ctx.from?.username || 'unknown'}, Telegram ID: ${userId || 'unknown'}`);
    if (!userId || !this.allowedUserIds.includes(userId)) {
      await ctx.reply(this.escapeMarkdownV2('🚫 Доступ запрещён. Только для участников'), {
        parse_mode: 'MarkdownV2',
      });
      return;
    }

    try {
      await ctx.scene.enter('update_resource_scene');
      this.logger.debug(`Успешно инициирован вход в сцену update_resource_scene для userId: ${userId}`);
    } catch (error) {
      this.logger.error(`Ошибка при входе в сцену update_resource_scene: ${error.message}, stack: ${error.stack}`);
      await ctx.reply(
        this.escapeMarkdownV2('⚠️ Ошибка при запуске обновления ресурса. Попробуйте позже.'),
        { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup },
      );
    }
  }

  @Command('deleteresource')
  async onDeleteResource(@Ctx() ctx: Scenes.SceneContext) {
    const userId = ctx.from?.id?.toString();
    this.logger.log(`Получена команда /deleteresource от ${ctx.from?.username || 'unknown'}, Telegram ID: ${userId || 'unknown'}`);
    if (!userId || !this.allowedUserIds.includes(userId)) {
      await ctx.reply(this.escapeMarkdownV2('🚫 Доступ запрещён. Только для участников'), {
        parse_mode: 'MarkdownV2',
      });
      return;
    }

    try {
      await ctx.scene.enter('delete_resource_scene');
      this.logger.debug(`Успешно инициирован вход в сцену delete_resource_scene для userId: ${userId}`);
    } catch (error) {
      this.logger.error(`Ошибка при входе в сцену delete_resource_scene: ${error.message}, stack: ${error.stack}`);
      await ctx.reply(
        this.escapeMarkdownV2('⚠️ Ошибка при запуске удаления ресурса. Попробуйте позже.'),
        { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup },
      );
    }
  }

  @Command('menu')
  async onMenu(@Ctx() ctx: Scenes.SceneContext) {
    const userId = ctx.from?.id?.toString();
    this.logger.log(`Получена команда /menu от ${ctx.from?.username || 'unknown'}, Telegram ID: ${userId || 'unknown'}`);
    if (!userId || !this.allowedUserIds.includes(userId)) {
      await ctx.reply(this.escapeMarkdownV2('🚫 Доступ запрещён. Только для участников'), {
        parse_mode: 'MarkdownV2',
      });
      return;
    }

    try {
      await ctx.reply(
        this.escapeMarkdownV2('👇 Выберите действие: 👇'),
        { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup },
      );
      this.logger.debug(`Успешно обработана команда /menu для userId: ${userId}`);
    } catch (error) {
      this.logger.error(`Ошибка в команде /menu: ${error.message}, stack: ${error.stack}`);
      await ctx.reply(
        this.escapeMarkdownV2('⚠️ Ошибка при открытии меню. Попробуйте позже.'),
        { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup },
      );
    }
  }

  @On('text')
  async onText(@Ctx() ctx: Scenes.SceneContext & { message: Message.TextMessage }) {
    const userId = ctx.from?.id?.toString();
    const text = ctx.message.text.trim();
    this.logger.log(`Получено сообщение от ${ctx.from?.username || 'unknown'}: ${text}, Telegram ID: ${userId || 'unknown'}`);
    if (!userId || !this.allowedUserIds.includes(userId)) {
      await ctx.reply(this.escapeMarkdownV2('🚫 Доступ запрещён. Только для участников'), {
        parse_mode: 'MarkdownV2',
      });
      return;
    }

    if (text.startsWith('/')) {
      return;
    }

    try {
      if (text === 'Добавить ресурс') {
        await ctx.scene.enter('add_resource_scene');
        this.logger.debug(`Успешно инициирован вход в сцену add_resource_scene для userId: ${userId}`);
      } else if (text === 'Изменить ресурс') {
        await ctx.scene.enter('update_resource_scene');
        this.logger.debug(`Успешно инициирован вход в сцену update_resource_scene для userId: ${userId}`);
      } else if (text === 'Удалить ресурс') {
        await ctx.scene.enter('delete_resource_scene');
        this.logger.debug(`Успешно инициирован вход в сцену delete_resource_scene для userId: ${userId}`);
      } else {
        await ctx.reply(
          this.escapeMarkdownV2(
            '💬 Используйте команды /start, /status, /logs, /addresource, /updateresource, /deleteresource или /menu.',
          ),
          { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup },
        );
      }
    } catch (error) {
      this.logger.error(`Ошибка при обработке текстового сообщения "${text}": ${error.message}, stack: ${error.stack}`);
      await ctx.reply(
        this.escapeMarkdownV2('⚠️ Ошибка при обработке команды. Попробуйте позже.'),
        { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup },
      );
    }
  }
}