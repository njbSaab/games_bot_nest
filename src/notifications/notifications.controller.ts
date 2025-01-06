import { Controller, Post, Get, Param, Body } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post(':userId')
  async createNotification(
    @Param('userId') userId: number,
    @Body('message') message: string,
  ) {
    return this.notificationsService.createNotification(userId, message);
  }

  @Get(':userId')
  async getUserNotifications(@Param('userId') userId: number) {
    return this.notificationsService.getUserNotifications(userId);
  }
}
