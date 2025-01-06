import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Markup, session } from 'telegraf';
import { UsersService } from '../../users/users.service';
import { GamesService } from '../../games/games.service';
import { TelegramContext } from './telegram.types';

@Injectable()
export class TelegramService implements OnModuleInit {
    private bot: Telegraf<TelegramContext>; // Указываем тип TelegramContext
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

    // Подключение session middleware с настройкой начального значения
    this.bot.use(
      session({
        defaultSession: () => ({
          currentCategoryName: null,
        }),
      }),
    );
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
            'https://fanday.net/img/news/CASINO/free-spins.webp',
            {
              caption: 'Welcome to Casino Free Games Bot! Choose a category games:',
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

      // Сохраняем текущую категорию в сессии
      ctx.session.currentCategoryName = categoryName;

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

    // Обработчик кнопки "⬅️ Back"
    this.bot.hears('⬅️ Back', async (ctx) => {
        const currentCategory = ctx.session?.currentCategoryName;
    
        if (currentCategory) {
        // Если пользователь находится в списке игр, возвращаем его в главное меню категорий
        this.logger.log(`Returning to main menu from category: ${currentCategory}`);
        ctx.session.currentCategoryName = null; // Сбрасываем текущую категорию
        ctx.reply('Main menu:', this.getMainMenuKeyboard());
        } else {
        // Если пользователь уже в главном меню, просто повторно показываем главное меню
        this.logger.log('Already in main menu, showing it again');
        ctx.reply('Main menu:', this.getMainMenuKeyboard());
        }
    });
  
    // Обработчик выбора игры
    this.bot.hears(/.+/, async (ctx) => {
        const gameName = ctx.message.text;
    
        if (gameName === '⬅️ Back') {
        const currentCategory = ctx.session?.currentCategoryName;
    
        if (currentCategory) {
            // Возврат к списку игр текущей категории
            const categoryId = this.getCategoryIdByName(currentCategory);
            const games = await this.gamesService.findByParentId(categoryId);
    
            this.logger.log(`Returning to games list for category: ${currentCategory}`);
            ctx.reply('Select a game:', this.getGamesKeyboard(games));
        } else {
            // Возврат в главное меню
            this.logger.log('Returning to main menu');
            ctx.reply('Main menu:', this.getMainMenuKeyboard());
        }
        return;
        }
    
        // Логика выбора игры
        this.logger.log(`Game selected: ${gameName}`);
        ctx.reply(`You selected the game: ${gameName}`, this.getLastMenuKeyboard());
    });
    await this.bot.launch();
    this.logger.log('Telegram bot started');
  }

  // Генерация клавиатуры главного меню (Reply Keyboard)
  private getMainMenuKeyboard() {
    const buttons = [
      ['Spin of Thrones III'],
      ['Popular'],
      ['Exclusive'],
      ['Best in South Korea'],
      ['Drops & Wins'],
    ];

    return Markup.keyboard(buttons).resize();
  }

  // Генерация клавиатуры для игр (Reply Keyboard)
  private getGamesKeyboard(games: { id: number; name: string }[]) {
    const buttons = games.map((game) => [game.name]);

    // Добавляем кнопку возврата в список категорий
    buttons.push(['⬅️ Back']);

    return Markup.keyboard(buttons).resize();
  }

  // Генерация клавиатуры последнего уровня (Reply Keyboard)
  private getLastMenuKeyboard() {
    return Markup.keyboard([['⬅️ Back']]).resize();
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