import { Controller, Post, Get, Delete, Patch, Body, Param, UsePipes, ValidationPipe } from '@nestjs/common';
import { ResourceManagementService } from '../telegram/resource-management.service';
import { NotificationService } from '../notification.service';
import { IsString, IsInt, Min, IsOptional, IsIn } from 'class-validator';

class CreateResourceDto {
  @IsString()
  name: string;

  @IsString()
  url: string;

  @IsIn(['static', 'mailer', 'telegram'])
  type: string;

  @IsInt()
  @Min(1)
  interval: number;

  @IsString()
  userId: string;

  @IsOptional()
  headers?: any;

  @IsOptional()
  @IsInt()
  @Min(1)
  frequency?: number;

  @IsOptional()
  @IsString()
  period?: string;
}

class UpdateResourceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsIn(['static', 'mailer', 'telegram'])
  type?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  interval?: number;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  headers?: any;

  @IsOptional()
  @IsInt()
  @Min(1)
  frequency?: number;

  @IsOptional()
  @IsString()
  period?: string;
}

@Controller('resources')
export class TrackerController {
  constructor(
    private readonly resourceManagementService: ResourceManagementService,
    private readonly notificationService: NotificationService,
  ) {}

  @Post()
  @UsePipes(new ValidationPipe())
  async addResource(@Body() body: CreateResourceDto) {
    const resource = await this.resourceManagementService.addResource(body);
    return {
      success: true,
      resource: {
        id: resource.id,
        name: resource.name,
        url: resource.url,
        type: resource.type,
        interval: resource.interval,
        frequency: resource.frequency,
        period: resource.period,
        userId: resource.userId,
        headers: resource.headers,
        created_at: resource.createdAt.toISOString(),
      },
    };
  }

  @Patch(':resourceId')
  @UsePipes(new ValidationPipe())
  async updateResource(@Param('resourceId') resourceId: string, @Body() body: UpdateResourceDto) {
    const resource = await this.resourceManagementService.updateResource(+resourceId, body);
    return {
      success: true,
      resource: {
        id: resource.id,
        name: resource.name,
        url: resource.url,
        type: resource.type,
        interval: resource.interval,
        frequency: resource.frequency,
        period: resource.period,
        userId: resource.userId,
        headers: resource.headers,
        created_at: resource.createdAt.toISOString(),
      },
    };
  }

  @Get('by-telegram/:telegramId')
  async getResourcesByTelegramId(@Param('telegramId') telegramId: string) {
    const resources = await this.notificationService.getResourcesByTelegramId(telegramId);
    return resources.map((resource) => ({
      id: resource.id,
      name: resource.name,
      url: resource.url,
      type: resource.type,
      content: '',
      interval: resource.interval,
      frequency: resource.frequency,
      period: resource.period,
      created_at: resource.createdAt.toISOString(),
    }));
  }

  @Get(':resourceId/logs')
  async getLogsByResourceId(@Param('resourceId') resourceId: string) {
    const logs = await this.resourceManagementService.getLogs(+resourceId);
    return logs.map((log) => ({
      id: log.id,
      message: log.response || log.status,
      result: log.result,
      created_at: log.createdAt.toISOString(),
    }));
  }

  @Delete(':resourceId')
  async deleteResource(@Param('resourceId') resourceId: string, @Body() body: { userId: string }) {
    await this.resourceManagementService.deleteResource(+resourceId, body.userId);
    return { success: true };
  }
}