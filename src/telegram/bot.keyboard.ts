import { Markup } from 'telegraf';

export class BotKeyboard {
  static getMainKeyboard() {
    return Markup.keyboard([
      [Markup.button.text('Добавить ресурс')],
      [Markup.button.text('Изменить ресурс')],
      [Markup.button.text('Удалить ресурс')],
    ])
    .resize()
    .persistent();
  }
}