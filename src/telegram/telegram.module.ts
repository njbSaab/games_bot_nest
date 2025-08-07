import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TelegrafModule } from 'nestjs-telegraf';
import { session } from 'telegraf';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { TelegramUpdate } from './telegram.update';
import { SharedModule } from '../shared.module';
import { AddResourceScene } from './scenes/add-resource.scene';
import { UpdateResourceScene } from './scenes/update-resource.scene';
import { DeleteResourceScene } from './scenes/delete-resource.scene';
import { BotKeyboard } from './bot.keyboard';

@Module({
  imports: [
    ConfigModule,
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        token: configService.get<string>('TELEGRAM_BOT_TOKEN') || 'default_token',
        launchOptions: { dropPendingUpdates: true },
        middlewares: [session()],
      }),
    }),
    ScheduleModule.forRoot(),
    HttpModule,
    SharedModule,
  ],
  providers: [
    TelegramUpdate,
    AddResourceScene,
    UpdateResourceScene,
    DeleteResourceScene,
    BotKeyboard,
  ],
})
export class TelegramModule {}