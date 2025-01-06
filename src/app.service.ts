import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  constructor(private readonly configService: ConfigService) {}

  getHello(): string {
    const port = this.configService.get<string>('PORT');
    return `Hello World! App is running on port ${port}`;
  }

  getBotToken(): string {
    return this.configService.get<string>('TELEGRAM_BOT_TOKEN');
  }
}