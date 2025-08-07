import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private connectionAttempts = 3;
  private connectionDelay = 5000; // 5 секунд начальной задержки

  constructor(private readonly configService: ConfigService) {
    super({
      // Изменение 1: Конфигурация PrismaClient через ConfigService
      datasources: {
        db: {
          url: configService.get<string>('DATABASE_URL', 'postgresql://user:password@localhost:5432/dbname'),
        },
      },
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
      ],
    });
    this.logger.log('PrismaService инициализирован');
  }

  async onModuleInit() {
    let attempts = this.connectionAttempts;
    while (attempts > 0) {
      try {
        await this.$connect();
        this.logger.log('Успешно подключено к базе данных');
        return;
      } catch (error) {
        attempts--;
        this.logger.error(
          `Не удалось подключиться к базе данных, попытка ${this.connectionAttempts - attempts}/${this.connectionAttempts}: ${error.message}, stack: ${error.stack}`,
        );
        if (attempts === 0) {
          this.logger.error('Все попытки подключения к базе данных исчерпаны');
          throw new Error(`Не удалось подключиться к базе данных: ${error.message}`);
        }
        await new Promise((resolve) => setTimeout(resolve, this.connectionDelay));
        this.connectionDelay *= 2; // Экспоненциальная задержка
      }
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
      this.logger.log('Соединение с базой данных закрыто');
    } catch (error) {
      // Изменение 3: Обработка ошибок при отключении
      this.logger.error(`Ошибка при закрытии соединения с базой данных: ${error.message}, stack: ${error.stack}`);
    }
  }

  // Изменение 4: Механизм переподключения
  private async reconnect() {
    let attempts = this.connectionAttempts;
    while (attempts > 0) {
      try {
        await this.$connect();
        this.logger.log('Успешно переподключено к базе данных');
        this.connectionDelay = 5000; // Сброс задержки
        return;
      } catch (error) {
        attempts--;
        this.logger.error(
          `Не удалось переподключиться к базе данных, попытка ${this.connectionAttempts - attempts}/${this.connectionAttempts}: ${error.message}, stack: ${error.stack}`,
        );
        if (attempts === 0) {
          this.logger.error('Все попытки переподключения исчерпаны');
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, this.connectionDelay));
        this.connectionDelay *= 2;
      }
    }
  }

  // Изменение 5: Проверка состояния соединения
  async isConnected(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      this.logger.debug('Соединение с базой данных активно');
      return true;
    } catch (error) {
      this.logger.warn(`Соединение с базой данных неактивно: ${error.message}`);
      return false;
    }
  }
}