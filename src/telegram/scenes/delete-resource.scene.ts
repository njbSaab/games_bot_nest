import { Scene, SceneEnter, Ctx, Action, On, Command } from 'nestjs-telegraf';
import { Scenes, Markup } from 'telegraf';
import { Logger } from '@nestjs/common';
import { NotificationService } from '../../notification.service';
import { ResourceManagementService } from '../resource-management.service';
import { BotKeyboard } from '../bot.keyboard';

interface DeleteResourceState {
  resourceId?: number;
  confirmed?: boolean;
}

@Scene('delete_resource_scene')
export class DeleteResourceScene {
  private readonly logger = new Logger(DeleteResourceScene.name);

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
    this.logger.log(`Пользователь ${ctx.from?.id} вошёл в сцену удаления ресурса`);
    const userId = ctx.from?.id?.toString();
    try {
      const resources = await this.notificationService.getResourcesByTelegramId(userId);
      this.logger.debug(`Получено ресурсов: ${resources.length}, URLs: ${resources.map(r => r.url).join(', ')}`);
      const uniqueResources = Array.from(new Map(resources.map(r => [r.url, r])).values());
      if (uniqueResources.length === 0) {
        await ctx.reply(
          this.escapeMarkdownV2('Нет зарегистрированных ресурсов.'),
          { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup },
        );
        await ctx.scene.leave();
        return;
      }
      const sortedResources = uniqueResources.sort((a, b) => a.id - b.id);
      const resourceButtons = sortedResources.map(r =>
        Markup.button.callback(`ID: ${r.id}`, `select_id_${r.id}`),
      );
      const buttonsPerRow = 4;
      const buttonRows = [];
      for (let i = 0; i < resourceButtons.length; i += buttonsPerRow) {
        buttonRows.push(resourceButtons.slice(i, i + buttonsPerRow));
      }
      buttonRows.push([Markup.button.callback('Отмена', 'cancel')]);

      const resourceList = sortedResources
        .map(r => `ID: ${r.id}, Name: ${r.name}, URL: ${r.url}`)
        .join('\n');
      this.logger.debug(`Список ресурсов для отправки: ${resourceList}`);
      await ctx.reply(
        `Введите ID ресурса для удаления или выберите ниже:\nДоступные ресурсы:\n${resourceList}`,
        {
          parse_mode: undefined,
          reply_markup: Markup.inlineKeyboard(buttonRows).reply_markup,
        },
      );
      ctx.scene.session.state = {} as DeleteResourceState;
    } catch (error) {
      this.logger.error(`Ошибка при получении ресурсов: ${error.message}`, error.stack);
      await ctx.reply(
        this.escapeMarkdownV2('Ошибка! Попробуйте позже.'),
        { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup },
      );
      await ctx.scene.leave();
    }
  }

  @Command('cancel')
  async onCancelCommand(@Ctx() ctx: Scenes.SceneContext) {
    await ctx.reply(
      this.escapeMarkdownV2('Удаление ресурса отменено.'),
      { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup },
    );
    await ctx.scene.leave();
  }

  @Action('cancel')
  async onCancelAction(@Ctx() ctx: Scenes.SceneContext) {
    await ctx.reply(
      this.escapeMarkdownV2('Удаление ресурса отменено.'),
      { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup },
    );
    await ctx.answerCbQuery();
    await ctx.scene.leave();
  }

  @Action(/select_id_(\d+)/)
  async onSelectId(@Ctx() ctx: Scenes.SceneContext & { match: RegExpExecArray }) {
    const state = ctx.scene.session.state as DeleteResourceState;
    const resourceId = parseInt(ctx.match[1], 10);
    const userId = ctx.from?.id?.toString();
    const resources = await this.notificationService.getResourcesByTelegramId(userId);
    const resource = resources.find(r => r.id === resourceId);
    if (!resource) {
      const sortedResources = resources.sort((a, b) => a.id - b.id);
      const resourceList = sortedResources
        .map(r => `🟢 ID: ${r.id}, Name: ${r.name}, Type: ${r.type}\n URL: ${r.url}\n `)
        .join('\n');
      const resourceButtons = sortedResources.map(r =>
        Markup.button.callback(`ID: ${r.id}`, `select_id_${r.id}`),
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
        },
      );
      await ctx.answerCbQuery();
      return;
    }
    state.resourceId = resourceId;
    await ctx.reply(
      this.escapeMarkdownV2(
        `Подтвердите удаление ресурса:\nID: ${resource.id}\nName: ${resource.name}\nURL: ${resource.url}`,
      ),
      {
        parse_mode: 'MarkdownV2',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('Подтвердить', 'confirm_delete')],
          [Markup.button.callback('Отмена', 'cancel')],
        ]).reply_markup,
      },
    );
    await ctx.answerCbQuery();
  }

  @Action('confirm_delete')
  async onConfirmDelete(@Ctx() ctx: Scenes.SceneContext) {
    const state = ctx.scene.session.state as DeleteResourceState;
    const userId = ctx.from?.id?.toString();
    if (!userId) {
      this.logger.error('Не удалось определить userId');
      await ctx.reply(
        this.escapeMarkdownV2('Ошибка: не удалось определить пользователя.'),
        { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup },
      );
      await ctx.scene.leave();
      await ctx.answerCbQuery();
      return;
    }
    try {
      await this.resourceManagementService.deleteResource(state.resourceId!, userId);
      await ctx.reply(
        this.escapeMarkdownV2(`Ресурс ID: ${state.resourceId} успешно удалён!`),
        { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup },
      );
      await ctx.scene.leave();
    } catch (error) {
      this.logger.error(`Ошибка удаления ресурса: ${error.message}`, error.stack);
      await ctx.reply(
        this.escapeMarkdownV2(`Ошибка: ${error.message}`),
        { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup },
      );
      await ctx.scene.leave();
    }
    await ctx.answerCbQuery();
  }

  @On('text')
  async onText(@Ctx() ctx: Scenes.SceneContext & { message: { text: string } }) {
    const state = ctx.scene.session.state as DeleteResourceState;
    const text = ctx.message.text.trim();
    const userId = ctx.from?.id?.toString();
    if (!userId) {
      this.logger.error('Не удалось определить userId');
      await ctx.reply(
        this.escapeMarkdownV2('Ошибка: не удалось определить пользователя.'),
        { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup },
      );
      await ctx.scene.leave();
      return;
    }

    if (text.toLowerCase() === 'отмена') {
      await ctx.reply(
        this.escapeMarkdownV2('Удаление ресурса отменено.'),
        { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup },
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
          Markup.button.callback(`ID: ${r.id}`, `select_id_${r.id}`),
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
          },
        );
        return;
      }
      state.resourceId = resourceId;
      await ctx.reply(
        this.escapeMarkdownV2(
          `Подтвердите удаление ресурса:\nID: ${resource.id}\nName: ${resource.name}\nURL: ${resource.url}`,
        ),
        {
          parse_mode: 'MarkdownV2',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('Подтвердить', 'confirm_delete')],
            [Markup.button.callback('Отмена', 'cancel')],
          ]).reply_markup,
        },
      );
    } else if (!state.confirmed) {
      if (text.toLowerCase() !== 'да') {
        await ctx.reply(
          this.escapeMarkdownV2('Удаление отменено.'),
          { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup },
        );
        await ctx.scene.leave();
        return;
      }
      try {
        await this.resourceManagementService.deleteResource(state.resourceId!, userId);
        await ctx.reply(
          this.escapeMarkdownV2(`Ресурс ID: ${state.resourceId} успешно удалён!`),
          { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup },
        );
        await ctx.scene.leave();
      } catch (error) {
        this.logger.error(`Ошибка удаления ресурса: ${error.message}`, error.stack);
        await ctx.reply(
          this.escapeMarkdownV2(`Ошибка: ${error.message}`),
          { parse_mode: 'MarkdownV2', reply_markup: BotKeyboard.getMainKeyboard().reply_markup },
        );
        await ctx.scene.leave();
      }
    }
  }
}