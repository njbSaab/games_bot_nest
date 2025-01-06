import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegramService } from './telegram.service';
import { UsersModule } from '../../users/users.module';
import { GamesModule } from '../../games/games.module';

@Module({
  imports: [ConfigModule, UsersModule, GamesModule],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
