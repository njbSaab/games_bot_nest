import { Injectable, Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PrismaService } from '../prisma.service';
import { ResourceManagementService } from '../telegram/resource-management.service';

@Injectable()
export class TrackerService {
  private readonly logger = new Logger(TrackerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly resourceManagementService: ResourceManagementService,
  ) {
    this.scheduleAllResources();
  }

  async scheduleAllResources() {
    const resources = await this.prisma.resource.findMany();
    for (const resource of resources) {
      this.scheduleResource(resource);
    }
    this.logger.log('Все ресурсы запланированы для проверки');
  }

  async scheduleResource(resource: {
    id: number;
    name: string;
    url: string;
    type: string;
    interval: number;
    userId: string;
    headers?: any;
    frequency?: number;
    period?: string;
  }) {
    const cronJobName = `check-resource-${resource.id}`;
    if (this.schedulerRegistry.doesExist('cron', cronJobName)) {
      this.schedulerRegistry.deleteCronJob(cronJobName);
      this.logger.log(`Существующая задача для ресурса ${resource.id} удалена`);
    }

    const cronJob = new CronJob(`*/${resource.interval} * * * *`, async () => {
      await this.resourceManagementService.checkResource(resource);
    });
    this.schedulerRegistry.addCronJob(cronJobName, cronJob);
    cronJob.start();
    this.logger.log(`Запланирована проверка ресурса ${resource.name} (ID: ${resource.id}) каждые ${resource.interval} минут`);
  }

  async onResourceAdded(resource: {
    id: number;
    name: string;
    url: string;
    type: string;
    interval: number;
    userId: string;
    headers?: any;
    frequency?: number;
    period?: string;
  }) {
    await this.scheduleResource(resource);
  }

  async onResourceUpdated(resourceId: number) {
    const resource = await this.prisma.resource.findUnique({ where: { id: resourceId } });
    if (resource) {
      await this.scheduleResource(resource);
    }
  }

  async onResourceDeleted(resourceId: number) {
    const cronJobName = `check-resource-${resourceId}`;
    if (this.schedulerRegistry.doesExist('cron', cronJobName)) {
      this.schedulerRegistry.deleteCronJob(cronJobName);
      this.logger.log(`Задача для ресурса ${resourceId} удалена`);
    }
  }
}