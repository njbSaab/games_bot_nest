import { Scene, SceneEnter, Ctx, Action, On } from 'nestjs-telegraf';
import { Scenes, Markup } from 'telegraf';
import { Logger } from '@nestjs/common';
import { ResourceManagementService } from '../resource-management.service';
import { BotKeyboard } from '../bot.keyboard';

interface AddResourceState {
  name?: string;
  url?: string;
  type?: string;
  interval?: number;
  frequency?: number;
  period?: string;
}

@Scene('add_resource_scene')
export class AddResourceScene {
  private readonly logger = new Logger(AddResourceScene.name);

  constructor(private readonly resourceManagementService: ResourceManagementService) {}

  private escapeMarkdownV2(text: string): string {
    const escapedText = text.replace(/([_*[\]()~`>#+\-=|{:}.!])/g, '\\$1');
    this.logger.debug(`Экранированный текст: ${escapedText}`);
    return escapedText;
  }

  @SceneEnter()
  async onSceneEnter(@Ctx() ctx: Scenes.SceneContext) {
    this.logger.log(`Пользователь ${ctx.from?.id} вошёл в сцену добавления ресурса`);
    await ctx.reply(
      this.escapeMarkdownV2('Введите имя ресурса:'),
      {
        parse_mode: 'MarkdownV2',
        reply_markup: Markup.inlineKeyboard([Markup.button.callback('Отмена', 'cancel')]).reply_markup,
      }
    );
    ctx.scene.session.state = {} as AddResourceState;
  }

  @On('text')
  async onText(@Ctx() ctx: Scenes.SceneContext & { message: { text: string } }) {
    const state = ctx.scene.session.state as AddResourceState;
    const text = ctx.message.text.trim();

    if (text.toLowerCase() === 'отмена') {
      await ctx.reply(
        this.escapeMarkdownV2('Добавление ресурса отменено.'),
        { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup }
      );
      await ctx.scene.leave();
      return;
    }

    if (!state.name) {
      state.name = text;
      await ctx.reply(
        this.escapeMarkdownV2('Введите URL ресурса:'),
        {
          parse_mode: 'MarkdownV2',
          reply_markup: Markup.inlineKeyboard([Markup.button.callback('Отмена', 'cancel')]).reply_markup,
        }
      );
    } else if (!state.url) {
      let url = text;
      if (!url.match(/^https?:\/\//)) {
        url = `https://${url}`;
      }
      try {
        new URL(url);
      } catch {
        await ctx.reply(
          this.escapeMarkdownV2('Недопустимый URL. Введите корректный URL (например, https://example.com):'),
          {
            parse_mode: 'MarkdownV2',
            reply_markup: Markup.inlineKeyboard([Markup.button.callback('Отмена', 'cancel')]).reply_markup,
          }
        );
        return;
      }
      state.url = url;
      await ctx.reply(
        this.escapeMarkdownV2('Выберите тип ресурса:'),
        {
          parse_mode: 'MarkdownV2',
          reply_markup: Markup.inlineKeyboard([
            [
              Markup.button.callback('site', 'type_static'),
              Markup.button.callback('mail', 'type_mailer'),
              Markup.button.callback('telegramBot', 'type_telegram'),
            ],
            [Markup.button.callback('Отмена', 'cancel')],
          ]).reply_markup,
        }
      );
    } else if (!state.type) {
      if (!['static', 'mailer', 'telegram'].includes(text.toLowerCase())) {
        await ctx.reply(
          this.escapeMarkdownV2('Недопустимый тип. Выберите static, mailer, telegram:'),
          {
            parse_mode: 'MarkdownV2',
            reply_markup: Markup.inlineKeyboard([
              [
                Markup.button.callback('site', 'type_static'),
                Markup.button.callback('mail', 'type_mailer'),
                Markup.button.callback('telegramBot', 'type_telegram'),
              ],
              [Markup.button.callback('Отмена', 'cancel')],
            ]).reply_markup,
          }
        );
        return;
      }
      state.type = text.toLowerCase();
      await ctx.reply(
        this.escapeMarkdownV2('Введите интервал проверки (в минутах, минимум 1):'),
        {
          parse_mode: 'MarkdownV2',
          reply_markup: Markup.inlineKeyboard([Markup.button.callback('Отмена', 'cancel')]).reply_markup,
        }
      );
    } else if (!state.interval) {
      const interval = parseInt(text, 10);
      if (isNaN(interval) || interval < 1) {
        await ctx.reply(
          this.escapeMarkdownV2('Интервал должен быть числом больше 0. Попробуйте снова:'),
          {
            parse_mode: 'MarkdownV2',
            reply_markup: Markup.inlineKeyboard([Markup.button.callback('Отмена', 'cancel')]).reply_markup,
          }
        );
        return;
      }
      state.interval = interval;
      await ctx.reply(
        this.escapeMarkdownV2('Введите частоту проверок (число, опционально, нажмите "Пропустить" если не нужно):'),
        {
          parse_mode: 'MarkdownV2',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('Пропустить', 'skip_frequency')],
            [Markup.button.callback('Отмена', 'cancel')],
          ]).reply_markup,
        }
      );
    } else if (!state.frequency && state.frequency !== 0) {
      if (text.toLowerCase() === 'пропустить') {
        state.frequency = undefined;
        await ctx.reply(
          this.escapeMarkdownV2('Введите период (например, daily, weekly, опционально, нажмите "Пропустить" если не нужно):'),
          {
            parse_mode: 'MarkdownV2',
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback('Пропустить', 'skip_period')],
              [Markup.button.callback('Отмена', 'cancel')],
            ]).reply_markup,
          }
        );
      } else {
        const frequency = parseInt(text, 10);
        if (isNaN(frequency) || frequency < 1) {
          await ctx.reply(
            this.escapeMarkdownV2('Частота должна быть числом больше 0. Попробуйте снова или нажмите "Пропустить":'),
            {
              parse_mode: 'MarkdownV2',
              reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('Пропустить', 'skip_frequency')],
                [Markup.button.callback('Отмена', 'cancel')],
              ]).reply_markup,
            }
          );
          return;
        }
        state.frequency = frequency;
        await ctx.reply(
          this.escapeMarkdownV2('Введите период (например, daily, weekly, опционально, нажмите "Пропустить" если не нужно):'),
          {
            parse_mode: 'MarkdownV2',
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback('Пропустить', 'skip_period')],
              [Markup.button.callback('Отмена', 'cancel')],
            ]).reply_markup,
          }
        );
      }
    } else {
      state.period = text.toLowerCase() === 'пропустить' ? undefined : text;
      try {
        const resource = await this.resourceManagementService.addResource({
          name: state.name!,
          url: state.url!,
          type: state.type!,
          interval: state.interval!,
          userId: ctx.from?.id?.toString() || '7066816061',
          frequency: state.frequency,
          period: state.period,
        });
        await ctx.reply(
          this.escapeMarkdownV2(
            `Ресурс ${state.name} (ID: ${resource.id}) успешно добавлен в очередь, через заданное вами время (${state.interval} минут) будет проверяться!\n` +
            `Проверить статус нажмите сюда 👉: /status`
          ),
          { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup }
        );
        await ctx.scene.leave();
      } catch (error) {
        this.logger.error(`Ошибка добавления ресурса: • ${error.message}`);
        await ctx.reply(
          this.escapeMarkdownV2(`Ошибка добавления ресурса: возможно этот ресурс уже есть в очереди убедитесь что название уникально • \n${error.message}`),
          { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup }
        );
        await ctx.scene.leave();
      }
    }
  }

  @Action('cancel')
  async onCancel(@Ctx() ctx: Scenes.SceneContext) {
    await ctx.reply(
      this.escapeMarkdownV2('Добавление ресурса отменено.'),
      { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup }
    );
    await ctx.answerCbQuery();
    await ctx.scene.leave();
  }

  @Action(/type_(static|mailer|telegram)/)
  async onTypeSelect(@Ctx() ctx: Scenes.SceneContext & { match: RegExpExecArray }) {
    const state = ctx.scene.session.state as AddResourceState;
    state.type = ctx.match[1];
    await ctx.reply(
      this.escapeMarkdownV2('Введите интервал проверки (в минутах, минимум 1):'),
      {
        parse_mode: 'MarkdownV2',
        reply_markup: Markup.inlineKeyboard([Markup.button.callback('Отмена', 'cancel')]).reply_markup,
      }
    );
    await ctx.answerCbQuery();
  }

  @Action('skip_frequency')
  async onSkipFrequency(@Ctx() ctx: Scenes.SceneContext) {
    const state = ctx.scene.session.state as AddResourceState;
    state.frequency = undefined;
    await ctx.reply(
      this.escapeMarkdownV2('Введите период (например, daily, weekly, опционально, нажмите "Пропустить" если не нужно):'),
      {
        parse_mode: 'MarkdownV2',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('Пропустить', 'skip_period')],
          [Markup.button.callback('Отмена', 'cancel')],
        ]).reply_markup,
      }
    );
    await ctx.answerCbQuery();
  }

  @Action('skip_period')
  async onSkipPeriod(@Ctx() ctx: Scenes.SceneContext) {
    const state = ctx.scene.session.state as AddResourceState;
    state.period = undefined;
    try {
      const resource = await this.resourceManagementService.addResource({
        name: state.name!,
        url: state.url!,
        type: state.type!,
        interval: state.interval!,
        userId: ctx.from?.id?.toString() || '7066816061',
        frequency: state.frequency,
        period: state.period,
      });
      await ctx.reply(
        this.escapeMarkdownV2(
          `Ресурс ${state.name} (ID: ${resource.id}) успешно добавлен в очередь, через заданное вами время (${state.interval} минут) будет проверяться!\n` +
          `Проверить статус нажмите сюда 👉: /status`
        ),
        { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup }
      );
      await ctx.scene.leave();
    } catch (error) {
      this.logger.error(`Ошибка добавления ресурса: ${error.message}`);
      await ctx.reply(
        this.escapeMarkdownV2(`Ошибка: ${error.message}`),
        { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup }
      );
      await ctx.scene.leave();
    }
    await ctx.answerCbQuery();
  }
}