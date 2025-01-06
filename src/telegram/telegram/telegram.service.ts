import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Markup } from 'telegraf';
import { UsersService } from '../../users/users.service';
import { GamesService } from '../../games/games.service';

@Injectable()
export class TelegramService implements OnModuleInit {
  private bot: Telegraf;
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly gamesService: GamesService,
  ) {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      this.logger.error('Telegram bot token is not defined in .env');
      throw new Error('Telegram bot token is not defined in .env');
    }
    this.bot = new Telegraf(token);
  }

  async onModuleInit() {
    this.logger.log('Initializing Telegram bot...');

    // Команда /start: Инициализация пользователя и показ главного меню
    this.bot.start(async (ctx) => {
        const { id, username, first_name, last_name } = ctx.from;
      
        this.logger.log(`Received /start command from user: ${username} (${id})`);
      
        try {
          const user = await this.usersService.createOrUpdateUser({
            telegramId: id,
            username,
            firstName: first_name,
            lastName: last_name,
          });
      
          if (!user) {
            this.logger.error(`Failed to create or update user: ${username} (${id})`);
            ctx.reply('An error occurred while processing your request.');
          } else {
            this.logger.log(`User ${username} (${id}) successfully created or updated in the database: ${JSON.stringify(user)}`);
      
            // Отправляем картинку с приветствием
            await ctx.replyWithPhoto(
              'https://fanday.net/img/news/CASINO/free-spins.webp', // URL картинки
              {
                caption: 'Welcome to Casino Free Games Bot! Choose a category games:', // Текст под картинкой
              },
            );
      
            // Отображаем главное меню
            ctx.reply('Choose a category:', this.getMainMenuKeyboard());
          }
        } catch (error) {
          this.logger.error(`Error creating or updating user ${username} (${id}): ${error.message}`, error.stack);
          ctx.reply('An error occurred while processing your request.');
        }
      });

    // Обработчик выбора категории через Reply Keyboard
    this.bot.hears(['Spin of Thrones III', 'Popular', 'Exclusive', 'Best in South Korea', 'Drops & Wins'], async (ctx) => {
        const categoryName = ctx.message.text;
        this.logger.log(`Category selected: ${categoryName}`);
      
        const categoryId = this.getCategoryIdByName(categoryName);
        const games = await this.gamesService.findByParentId(categoryId);
      
        // Картинка для категории
        const categoryImages = {
          'Spin of Thrones III': 'https://thenewdawnliberia.com/storage/2024/09/bettt.jpeg',
          'Popular': 'https://example.com/popular.jpg',
          'Exclusive': 'https://example.com/exclusive.jpg',
          'Best in South Korea': 'https://example.com/korea.jpg',
          'Drops & Wins': 'https://example.com/drops.jpg',
        };
      
        const categoryImage = categoryImages[categoryName];
      
        // Отправляем картинку для выбранной категории
        if (categoryImage) {
          await ctx.replyWithPhoto(categoryImage, {
            caption: `You selected the category: ${categoryName}`,
          });
        }
      
        if (games.length === 0) {
          ctx.reply('No games in this category yet.', this.getMainMenuKeyboard());
          return;
        }
      
        ctx.reply('Select a game:', this.getGamesKeyboard(games));
      });

    // Обработчик выбора игры через Reply Keyboard
    this.bot.hears(/.+/, (ctx) => {
      const gameName = ctx.message.text;
      this.logger.log(`Game selected: ${gameName}`);
      ctx.reply(`You selected the game: ${gameName}`, this.getMainMenuKeyboard());
    });

    await this.bot.launch();
    this.logger.log('Telegram bot started');
  }

  // Генерация клавиатуры главного меню (Reply Keyboard)
  private getMainMenuKeyboard() {
    const buttons = [
      ['Spin of Thrones III'], // Первая строка
      ['Popular'], // Вторая строка
      ['Exclusive'], // Третья строка
      ['Best in South Korea'], // Четвёртая строка
      ['Drops & Wins'], // Пятая строка
    ];

    return Markup.keyboard(buttons).resize();
  }

  // Генерация клавиатуры для игр (Reply Keyboard)
  private getGamesKeyboard(games: { id: number; name: string }[]) {
    const buttons = games.map((game) => [game.name]);

    // Добавляем кнопку возврата в главное меню
    buttons.push(['⬅️ Back']);

    return Markup.keyboard(buttons).resize();
  }

  // Утилита для маппинга имени категории на ID
  private getCategoryIdByName(categoryName: string): number {
    const categories = {
      'Spin of Thrones III': 1,
      'Popular': 2,
      'Exclusive': 3,
      'Best in South Korea': 4,
      'Drops & Wins': 5,
    };

    return categories[categoryName] || 0;
  }
}