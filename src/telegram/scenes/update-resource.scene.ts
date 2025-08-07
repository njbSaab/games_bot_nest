import { Scene, SceneEnter, Ctx, Action, On, Command } from 'nestjs-telegraf';
import { Scenes, Markup } from 'telegraf';
import { Logger } from '@nestjs/common';
import { NotificationService } from '../../notification.service';
import { ResourceManagementService } from '../resource-management.service';
import { BotKeyboard } from '../bot.keyboard';

interface UpdateResourceState {
  resourceId?: number;
  name: string | null;
  url: string | null;
  type: string | null;
  interval: number | null;
  frequency: number | null;
  period: string | null;
  resource?: any;
}

@Scene('update_resource_scene')
export class UpdateResourceScene {
  private readonly logger = new Logger(UpdateResourceScene.name);

  constructor(
    private readonly resourceManagementService: ResourceManagementService,
    private readonly notificationService: NotificationService,
  ) {}

  private escapeMarkdownV2(text: string): string {
    const escapedText = text.replace(/([_*[\]()~`>#+\-=|{:}.!])/g, '\\$1');
    this.logger.debug(`Экранированный текст: ${escapedText}`);
    return escapedText;
  }

  @SceneEnter()
  async onSceneEnter(@Ctx() ctx: Scenes.SceneContext) {
    this.logger.log(`Пользователь ${ctx.from?.id} вошёл в сцену изменения ресурса`);
    const userId = ctx.from?.id?.toString();
    try {
      const resources = await this.notificationService.getResourcesByTelegramId(userId);
      this.logger.debug(`Получено ресурсов: ${resources.length}, URLs: ${resources.map(r => r.url).join(', ')}`);
      const uniqueResources = Array.from(new Map(resources.map(r => [r.url, r])).values());
      if (uniqueResources.length === 0) {
        await ctx.reply(
          this.escapeMarkdownV2('Нет зарегистрированных ресурсов.'),
          { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup }
        );
        await ctx.scene.leave();
        return;
      }
      const sortedResources = uniqueResources.sort((a, b) => a.id - b.id);
      const resourceButtons = sortedResources.map(r =>
        Markup.button.callback(`ID: ${r.id}`, `select_id_${r.id}`)
      );
      const buttonsPerRow = 4;
      const buttonRows = [];
      for (let i = 0; i < resourceButtons.length; i += buttonsPerRow) {
        buttonRows.push(resourceButtons.slice(i, i + buttonsPerRow));
      }
      buttonRows.push([Markup.button.callback('Отмена', 'cancel')]);
      
      const resourceList = sortedResources
        .map(r => `🟢 ID: ${r.id}, Name: ${r.name}, Type: ${r.type}\n URL: ${r.url}\n `)
        .join('\n');
      this.logger.debug(`🔎 Список ресурсов для отправки: ${resourceList}`);
      await ctx.reply(
        `Введите ID ресурса или выберите кнопку для изменения ресурса:\nДоступные ресурсы:\n${resourceList}`,
        {
          parse_mode: undefined,
          reply_markup: Markup.inlineKeyboard(buttonRows).reply_markup,
        }
      );
      ctx.scene.session.state = {} as UpdateResourceState;
    } catch (error) {
      this.logger.error(`Ошибка при получении ресурсов: ${error.message}`, error.stack);
      await ctx.reply(
        this.escapeMarkdownV2('Ошибка! Попробуйте позже.'),
        { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup }
      );
      await ctx.scene.leave();
    }
  }

  @Command('cancel')
  async onCancelCommand(@Ctx() ctx: Scenes.SceneContext) {
    this.logger.log(`Пользователь ${ctx.from?.id} отменил изменение ресурса`);
    await ctx.reply(
      this.escapeMarkdownV2('Изменение ресурса отменено.'),
      { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup }
    );
    await ctx.scene.leave();
  }

  @Command('start')
  async onStartCommand(@Ctx() ctx: Scenes.SceneContext) {
    this.logger.log(`Пользователь ${ctx.from?.id} прервал изменение ресурса командой /start`);
    await ctx.reply(
      this.escapeMarkdownV2('Изменение ресурса отменено.'),
      { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup }
    );
    await ctx.scene.leave();
  }

  @Action('cancel')
  async onCancelAction(@Ctx() ctx: Scenes.SceneContext) {
    this.logger.log(`Пользователь ${ctx.from?.id} отменил изменение ресурса через действие`);
    await ctx.reply(
      this.escapeMarkdownV2('Изменение ресурса отменено.'),
      { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup }
    );
    await ctx.answerCbQuery();
    await ctx.scene.leave();
  }

  @Action(/select_id_(\d+)/)
  async onSelectId(@Ctx() ctx: Scenes.SceneContext & { match: RegExpExecArray }) {
    const state = ctx.scene.session.state as UpdateResourceState;
    const resourceId = parseInt(ctx.match[1], 10);
    const userId = ctx.from?.id?.toString();
    const resources = await this.notificationService.getResourcesByTelegramId(userId);
    const resource = resources.find(r => r.id === resourceId);
    if (!resource) {
      const sortedResources = resources.sort((a, b) => a.id - b.id);
      const resourceList = sortedResources
        .map(r => `ID: ${r.id}, Name: ${r.name}, URL: ${r.url}`)
        .join('\n');
      const resourceButtons = sortedResources.map(r =>
        Markup.button.callback(`ID: ${r.id}`, `select_id_${r.id}`)
      );
      const buttonsPerRow = 4;
      const buttonRows = [];
      for (let i = 0; i < resourceButtons.length; i += buttonsPerRow) {
        buttonRows.push(resourceButtons.slice(i, i + buttonsPerRow));
      }
      buttonRows.push([Markup.button.callback('Отмена', 'cancel')]);
      
      await ctx.reply(
        `Ресурс не найден. Введите правильный ID или выберите ниже:\nДоступные ресурсы:\n${resourceList}`,
        {
          parse_mode: undefined,
          reply_markup: Markup.inlineKeyboard(buttonRows).reply_markup,
        }
      );
      await ctx.answerCbQuery();
      return;
    }
    state.resourceId = resourceId;
    state.name = null;
    state.url = null;
    state.type = null;
    state.interval = null;
    state.frequency = null;
    state.period = null;
    state.resource = resource;
    this.logger.debug(`Выбран ресурс ID: ${resourceId}, state: ${JSON.stringify(state)}`);
    const displayName = resource.name.length > 30 ? resource.name.substring(0, 27) + '...' : resource.name;
    await ctx.reply(
      this.escapeMarkdownV2(
        `Текущее имя ресурса: ${resource.name}\nВведите новое имя ресурса (или выберите текущее):`
      ),
      {
        parse_mode: 'MarkdownV2',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback(displayName, 'use_current_name')],
          [Markup.button.callback('Отмена', 'cancel')],
        ]).reply_markup,
      }
    );
    await ctx.answerCbQuery();
  }

  @Action('use_current_name')
  async onUseCurrentName(@Ctx() ctx: Scenes.SceneContext) {
    const state = ctx.scene.session.state as UpdateResourceState;
    state.name = state.resource.name;
    this.logger.debug(`Использовано текущее имя: ${state.name}, state: ${JSON.stringify(state)}`);
    const displayUrl = state.resource.url.length > 30 ? state.resource.url.substring(0, 27) + '...' : state.resource.url;
    await ctx.reply(
      this.escapeMarkdownV2(
        `Текущий URL ресурса: ${state.resource.url}\nВведите новый URL ресурса (или выберите текущее):`
      ),
      {
        parse_mode: 'MarkdownV2',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback(displayUrl, 'use_current_url')],
          [Markup.button.callback('Отмена', 'cancel')],
        ]).reply_markup,
      }
    );
    await ctx.answerCbQuery();
  }

  @Action('use_current_url')
  async onUseCurrentUrl(@Ctx() ctx: Scenes.SceneContext) {
    const state = ctx.scene.session.state as UpdateResourceState;
    state.url = state.resource.url;
    this.logger.debug(`Использовано текущий URL: ${state.url}, state: ${JSON.stringify(state)}`);
    await ctx.reply(
      this.escapeMarkdownV2(
        `Текущий тип ресурса: ${state.resource.type}\nВыберите новый тип ресурса (или выберите текущее):`
      ),
      {
        parse_mode: 'MarkdownV2',
        reply_markup: Markup.inlineKeyboard([
          [
            Markup.button.callback('site', 'type_static'),
            Markup.button.callback('mail', 'type_mailer'),
            Markup.button.callback('telegramBot', 'type_telegram'),
          ],
          [Markup.button.callback(state.resource.type, 'use_current_type')],
          [Markup.button.callback('Отмена', 'cancel')],
        ]).reply_markup,
      }
    );
    await ctx.answerCbQuery();
  }

  @Action(/type_(static|mailer|telegram)/)
  async onTypeSelect(@Ctx() ctx: Scenes.SceneContext & { match: RegExpExecArray }) {
    const state = ctx.scene.session.state as UpdateResourceState;
    state.type = ctx.match[1];
    this.logger.debug(`Выбран тип: ${state.type}, state: ${JSON.stringify(state)}`);
    await ctx.reply(
      this.escapeMarkdownV2(
        `Текущий интервал проверки: ${state.resource.interval} минут\nВведите новый интервал проверки (в минутах, минимум 1, или выберите текущее):`
      ),
      {
        parse_mode: 'MarkdownV2',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback(`${state.resource.interval} минут`, 'use_current_interval')],
          [Markup.button.callback('Отмена', 'cancel')],
        ]).reply_markup,
      }
    );
    await ctx.answerCbQuery();
  }

  @Action('use_current_type')
  async onUseCurrentType(@Ctx() ctx: Scenes.SceneContext) {
    const state = ctx.scene.session.state as UpdateResourceState;
    state.type = state.resource.type;
    this.logger.debug(`Использовано текущий тип: ${state.type}, state: ${JSON.stringify(state)}`);
    await ctx.reply(
      this.escapeMarkdownV2(
        `Текущий интервал проверки: ${state.resource.interval} минут\nВведите новый интервал проверки (в минутах, минимум 1, или выберите текущее):`
      ),
      {
        parse_mode: 'MarkdownV2',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback(`${state.resource.interval} минут`, 'use_current_interval')],
          [Markup.button.callback('Отмена', 'cancel')],
        ]).reply_markup,
      }
    );
    await ctx.answerCbQuery();
  }

  @Action('use_current_interval')
  async onUseCurrentInterval(@Ctx() ctx: Scenes.SceneContext) {
    const state = ctx.scene.session.state as UpdateResourceState;
    state.interval = state.resource.interval;
    this.logger.debug(`Использовано текущий интервал: ${state.interval}, state: ${JSON.stringify(state)}`);
    await ctx.reply(
      this.escapeMarkdownV2(
        `Текущая частота: ${state.resource.frequency ?? 'не указана'}\nВведите новую частоту (число, опционально, нажмите "Пропустить" если не нужно):`
      ),
      {
        parse_mode: 'MarkdownV2',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback(state.resource.frequency ? `${state.resource.frequency}` : 'Пропустить', 'use_current_frequency')],
          [Markup.button.callback('Отмена', 'cancel')],
        ]).reply_markup,
      }
    );
    await ctx.answerCbQuery();
  }

  @Action('use_current_frequency')
  async onUseCurrentFrequency(@Ctx() ctx: Scenes.SceneContext) {
    const state = ctx.scene.session.state as UpdateResourceState;
    state.frequency = state.resource.frequency ?? null;
    this.logger.debug(`Использована текущая частота: ${state.frequency}, state: ${JSON.stringify(state)}`);
    await ctx.reply(
      this.escapeMarkdownV2(
        `Текущий период: ${state.resource.period ?? 'не указан'}\nВведите новый период (например, daily, weekly, опционально, нажмите "Пропустить" если не нужно):`
      ),
      {
        parse_mode: 'MarkdownV2',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback(state.resource.period ? `${state.resource.period}` : 'Пропустить', 'use_current_period')],
          [Markup.button.callback('Отмена', 'cancel')],
        ]).reply_markup,
      }
    );
    await ctx.answerCbQuery();
  }

  @Action('use_current_period')
  async onUseCurrentPeriod(@Ctx() ctx: Scenes.SceneContext) {
    const state = ctx.scene.session.state as UpdateResourceState;
    state.period = state.resource.period ?? null;
    this.logger.debug(`Использован текущий период: ${state.period}, state: ${JSON.stringify(state)}`);
    await this.updateResource(ctx, state);
    await ctx.answerCbQuery();
  }

  async updateResource(ctx: Scenes.SceneContext, state: UpdateResourceState) {
    try {
      if (!state.name || !state.url || !state.type || !state.interval) {
        this.logger.warn(`Незаполненные поля: ${JSON.stringify(state)}`);
        await ctx.reply(
          this.escapeMarkdownV2('Ошибка: не все обязательные поля заполнены. Пожалуйста, начните заново.'),
          { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup }
        );
        await ctx.scene.leave();
        return;
      }
      const updateData: any = {
        name: state.name,
        url: state.url,
        type: state.type,
        interval: state.interval,
        frequency: state.frequency,
        period: state.period,
        userId: ctx.from?.id?.toString() || '7066816061',
      };
      this.logger.debug(`updateData: ${JSON.stringify(updateData)}`);

      await this.resourceManagementService.updateResource(state.resourceId!, updateData);
      this.logger.log(`Ресурс ID: ${state.resourceId} успешно обновлён`);
      await ctx.reply(
        this.escapeMarkdownV2(`Ресурс ID: ${state.resourceId} успешно обновлён!`),
        { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup }
      );
      await ctx.scene.leave();
    } catch (error) {
      this.logger.error(`Ошибка обновления ресурса: ${error.message}`, error.stack);
      await ctx.reply(
        this.escapeMarkdownV2(`Ошибка: ${error.message}`),
        { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup }
      );
      await ctx.scene.leave();
    }
  }

  @On('text')
  async onText(@Ctx() ctx: Scenes.SceneContext & { message: { text: string } }) {
    const state = ctx.scene.session.state as UpdateResourceState;
    const text = ctx.message.text.trim();
    const userId = ctx.from?.id?.toString();
    const isSkip = text === '' || text.toLowerCase() === 'пропустить' || text === '/Enter';

    this.logger.debug(`Получен текст: "${text}", isSkip: ${isSkip}, state: ${JSON.stringify(state)}`);

    if (text.startsWith('/')) {
      this.logger.log(`Пользователь ${ctx.from?.id} прервал изменение ресурса командой ${text}`);
      await ctx.reply(
        this.escapeMarkdownV2('Изменение ресурса отменено.'),
        { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup }
      );
      await ctx.scene.leave();
      return;
    }

    if (!state.resourceId) {
      const resourceId = parseInt(text, 10);
      const resources = await this.notificationService.getResourcesByTelegramId(userId);
      const resource = resources.find(r => r.id === resourceId);
      if (!resource) {
        const sortedResources = resources.sort((a, b) => a.id - b.id);
        const resourceList = sortedResources
          .map(r => `ID: ${r.id}, Name: ${r.name}, URL: ${r.url}`)
          .join('\n');
        const resourceButtons = sortedResources.map(r =>
          Markup.button.callback(`ID: ${r.id}`, `select_id_${r.id}`)
        );
        const buttonsPerRow = 4;
        const buttonRows = [];
        for (let i = 0; i < resourceButtons.length; i += buttonsPerRow) {
          buttonRows.push(resourceButtons.slice(i, i + buttonsPerRow));
        }
        buttonRows.push([Markup.button.callback('Отмена', 'cancel')]);
        
        await ctx.reply(
          `Ресурс не найден. Введите правильный ID или выберите ниже:\nДоступные ресурсы:\n${resourceList}`,
          {
            parse_mode: undefined,
            reply_markup: Markup.inlineKeyboard(buttonRows).reply_markup,
          }
        );
        return;
      }
      state.resourceId = resourceId;
      state.name = null;
      state.url = null;
      state.type = null;
      state.interval = null;
      state.frequency = null;
      state.period = null;
      state.resource = resource;
      this.logger.debug(`Выбран ресурс ID: ${resourceId}, state: ${JSON.stringify(state)}`);
      const displayName = resource.name.length > 30 ? resource.name.substring(0, 27) + '...' : resource.name;
      await ctx.reply(
        this.escapeMarkdownV2(
          `Текущее имя ресурса: ${resource.name}\nВведите новое имя ресурса (или выберите текущее):`
        ),
        {
          parse_mode: 'MarkdownV2',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback(displayName, 'use_current_name')],
            [Markup.button.callback('Отмена', 'cancel')],
          ]).reply_markup,
        }
      );
    } else if (state.name === null) {
      state.name = isSkip ? state.resource.name : text;
      this.logger.debug(`Установлено имя: ${state.name}, state: ${JSON.stringify(state)}`);
      const displayUrl = state.resource.url.length > 30 ? state.resource.url.substring(0, 27) + '...' : state.resource.url;
      await ctx.reply(
        this.escapeMarkdownV2(
          `Текущий URL ресурса: ${state.resource.url}\nВведите новый URL ресурса (или выберите текущее):`
        ),
        {
          parse_mode: 'MarkdownV2',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback(displayUrl, 'use_current_url')],
            [Markup.button.callback('Отмена', 'cancel')],
          ]).reply_markup,
        }
      );
    } else if (state.url === null) {
      let newUrl = isSkip ? state.resource.url : text;
      if (!isSkip) {
        if (!newUrl.match(/^https?:\/\//)) {
          newUrl = `https://${newUrl}`;
        }
        try {
          new URL(newUrl);
        } catch {
          await ctx.reply(
            this.escapeMarkdownV2(
              `Недопустимый URL. Введите корректный URL (например, https://example.com) или выберите текущее:\nТекущий URL: ${state.resource.url}`
            ),
            {
              parse_mode: 'MarkdownV2',
              reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback(state.resource.url.length > 30 ? state.resource.url.substring(0, 27) + '...' : state.resource.url, 'use_current_url')],
                [Markup.button.callback('Отмена', 'cancel')],
              ]).reply_markup,
            }
          );
          return;
        }
      }
      state.url = newUrl;
      this.logger.debug(`Установлен URL: ${state.url}, state: ${JSON.stringify(state)}`);
      await ctx.reply(
        this.escapeMarkdownV2(
          `Текущий тип ресурса: ${state.resource.type}\nВыберите новый тип ресурса (или выберите текущее):`
        ),
        {
          parse_mode: 'MarkdownV2',
          reply_markup: Markup.inlineKeyboard([
            [
              Markup.button.callback('site', 'type_static'),
              Markup.button.callback('mail', 'type_mailer'),
              Markup.button.callback('telegramBot', 'type_telegram'),
            ],
            [Markup.button.callback(state.resource.type, 'use_current_type')],
            [Markup.button.callback('Отмена', 'cancel')],
          ]).reply_markup,
        }
      );
    } else if (state.type === null) {
      if (!isSkip && !['static', 'mailer', 'telegram'].includes(text.toLowerCase())) {
        await ctx.reply(
          this.escapeMarkdownV2(
            `Недопустимый тип. Выберите static, mailer, telegram или выберите текущее:\nТекущий тип: ${state.resource.type}`
          ),
          {
            parse_mode: 'MarkdownV2',
            reply_markup: Markup.inlineKeyboard([
              [
                Markup.button.callback('site', 'type_static'),
                Markup.button.callback('mail', 'type_mailer'),
                Markup.button.callback('telegramBot', 'type_telegram'),
              ],
              [Markup.button.callback(state.resource.type, 'use_current_type')],
              [Markup.button.callback('Отмена', 'cancel')],
            ]).reply_markup,
          }
        );
        return;
      }
      state.type = isSkip ? state.resource.type : text.toLowerCase();
      this.logger.debug(`Установлен тип: ${state.type}, state: ${JSON.stringify(state)}`);
      await ctx.reply(
        this.escapeMarkdownV2(
          `Текущий интервал проверки: ${state.resource.interval} минут\nВведите новый интервал проверки (в минутах, минимум 1, или выберите текущее):`
        ),
        {
          parse_mode: 'MarkdownV2',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback(`${state.resource.interval} минут`, 'use_current_interval')],
            [Markup.button.callback('Отмена', 'cancel')],
          ]).reply_markup,
        }
      );
    } else if (state.interval === null) {
      let interval;
      if (!isSkip) {
        interval = parseInt(text, 10);
        if (isNaN(interval) || interval < 1) {
          await ctx.reply(
            this.escapeMarkdownV2(
              `Интервал должен быть числом больше 0. Попробуйте снова или выберите текущее:\nТекущий интервал: ${state.resource.interval} минут`
            ),
            {
              parse_mode: 'MarkdownV2',
              reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback(`${state.resource.interval} минут`, 'use_current_interval')],
                [Markup.button.callback('Отмена', 'cancel')],
              ]).reply_markup,
            }
          );
          return;
        }
        state.interval = interval;
      } else {
        state.interval = state.resource.interval;
      }
      this.logger.debug(`Установлен интервал: ${state.interval}, state: ${JSON.stringify(state)}`);
      await ctx.reply(
        this.escapeMarkdownV2(
          `Текущая частота: ${state.resource.frequency ?? 'не указана'}\nВведите новую частоту (число, опционально, нажмите "Пропустить" если не нужно):`
        ),
        {
          parse_mode: 'MarkdownV2',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback(state.resource.frequency ? `${state.resource.frequency}` : 'Пропустить', 'use_current_frequency')],
            [Markup.button.callback('Отмена', 'cancel')],
          ]).reply_markup,
        }
      );
    } else if (state.frequency === null) {
      if (isSkip || text.toLowerCase() === 'пропустить') {
        state.frequency = state.resource.frequency ?? null;
        await ctx.reply(
          this.escapeMarkdownV2(
            `Текущий период: ${state.resource.period ?? 'не указан'}\nВведите новый период (например, daily, weekly, опционально, нажмите "Пропустить" если не нужно):`
          ),
          {
            parse_mode: 'MarkdownV2',
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback(state.resource.period ? `${state.resource.period}` : 'Пропустить', 'use_current_period')],
              [Markup.button.callback('Отмена', 'cancel')],
            ]).reply_markup,
          }
        );
      } else {
        const frequency = parseInt(text, 10);
        if (isNaN(frequency) || frequency < 1) {
          await ctx.reply(
            this.escapeMarkdownV2(
              `Частота должна быть числом больше 0. Попробуйте снова или выберите текущее:\nТекущая частота: ${state.resource.frequency ?? 'не указана'}`
            ),
            {
              parse_mode: 'MarkdownV2',
              reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback(state.resource.frequency ? `${state.resource.frequency}` : 'Пропустить', 'use_current_frequency')],
                [Markup.button.callback('Отмена', 'cancel')],
              ]).reply_markup,
            }
          );
          return;
        }
        state.frequency = frequency;
        await ctx.reply(
          this.escapeMarkdownV2(
            `Текущий период: ${state.resource.period ?? 'не указан'}\nВведите новый период (например, daily, weekly, опционально, нажмите "Пропустить" если не нужно):`
          ),
          {
            parse_mode: 'MarkdownV2',
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback(state.resource.period ? `${state.resource.period}` : 'Пропустить', 'use_current_period')],
              [Markup.button.callback('Отмена', 'cancel')],
            ]).reply_markup,
          }
        );
      }
    } else {
      state.period = isSkip || text.toLowerCase() === 'пропустить' ? state.resource.period ?? null : text;
      this.logger.debug(`Установлен период: ${state.period}, state: ${JSON.stringify(state)}`);
      await this.updateResource(ctx, state);
    }
  }
}