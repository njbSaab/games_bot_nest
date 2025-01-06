import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PushNotification } from './entities/push-notification.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(PushNotification)
    private readonly notificationRepository: Repository<PushNotification>,
  ) {}

  async createNotification(userId: number, message: string): Promise<PushNotification> {
    const notification = this.notificationRepository.create({ user: { id: userId }, message });
    return this.notificationRepository.save(notification);
  }

  async getUserNotifications(userId: number): Promise<PushNotification[]> {
    return this.notificationRepository.find({ where: { user: { id: userId } } });
  }

  async markAsSent(notificationId: number): Promise<void> {
    await this.notificationRepository.update(notificationId, { isSent: true, sentAt: new Date() });
  }
}
