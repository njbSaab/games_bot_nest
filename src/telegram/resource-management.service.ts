import { Injectable, Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PrismaService } from '../prisma.service';
import { HttpService } from '@nestjs/axios';
import { catchError, firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import * as cheerio from 'cheerio';
import { NotificationService } from '../notification.service';
import { ConfigService } from '@nestjs/config';
import * as CryptoJS from 'crypto-js';

@Injectable()
export class ResourceManagementService {
  private readonly logger = new Logger(ResourceManagementService.name);
  private readonly adminChatIds: string[];
  private readonly secretKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly httpService: HttpService,
    private readonly notificationService: NotificationService,
    private readonly configService: ConfigService,
  ) {
    this.adminChatIds = this.configService.get<string>('ADMIN_TELEGRAM_IDS', '7066816061,6684314409').split(',');
    this.secretKey = this.configService.get<string>('SECRET_KEY', 'kX9pQz7mW2rY8tL4jN6vB3xA0cF2uI9o');
    this.logger.log('ResourceManagementService инициализирован');
  }

  private escapeMarkdownV2(text: string): string {
    return text.replace(/([_*[\]()~`>#+\-=|{:}.!])/g, '\\$1');
  }

  async getResources(userId: string) {
    return this.prisma.resource.findMany({
      where: { userId },
    });
  }

  async getLogs(resourceId: number) {
    return this.prisma.log.findMany({
      where: { resourceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addResource(data: {
    name: string;
    url: string;
    type: string;
    interval: number;
    userId: string;
    headers?: any;
    frequency?: number;
    period?: string;
  }) {
    if (!['static', 'mailer', 'telegram'].includes(data.type)) {
      throw new Error('Недопустимый тип ресурса');
    }
    const resource = await this.prisma.resource.create({
      data: {
        name: data.name,
        url: data.url,
        type: data.type,
        interval: data.interval,
        userId: data.userId,
        headers: data.headers,
        frequency: data.frequency,
        period: data.period,
        createdAt: new Date(),
      },
    });

    const cronJobName = `check-resource-${resource.id}`;
    const cronJob = new CronJob(`*/${resource.interval} * * * *`, () => {
      this.checkResource(resource);
    });
    this.schedulerRegistry.addCronJob(cronJobName, cronJob);
    cronJob.start();
    this.logger.log(`Добавлен и запланирован ресурс ${resource.url} каждые ${resource.interval} минут`);

    await this.notificationService.notify(
      this.escapeMarkdownV2(
        `Ресурс ${resource.name} (ID: ${resource.id}) успешно добавлен в очередь, через заданное вами время (${resource.interval} минут) будет проверяться!\n` +
        `Проверить статус нажмите сюда 👉: /status`
      )
    );

    return resource;
  }

  async updateResource(
    resourceId: number,
    data: {
      name?: string;
      url?: string;
      type?: string;
      interval?: number;
      userId?: string;
      headers?: any;
      frequency?: number;
      period?: string;
    },
  ) {
    const resource = await this.prisma.resource.findUnique({ where: { id: resourceId } });
    if (!resource || (data.userId && resource.userId !== data.userId && !this.adminChatIds.includes(data.userId))) {
      throw new Error('Ресурс не найден или доступ запрещён');
    }
    if (data.type && !['static', 'mailer', 'telegram'].includes(data.type)) {
      throw new Error('Недопустимый тип ресурса');
    }
    const updated = await this.prisma.resource.update({
      where: { id: resourceId },
      data: {
        name: data.name ?? resource.name,
        url: data.url ?? resource.url,
        type: data.type ?? resource.type,
        interval: data.interval ?? resource.interval,
        headers: data.headers ?? resource.headers,
        frequency: data.frequency ?? resource.frequency,
        period: data.period ?? resource.period,
      },
    });

    const cronJobName = `check-resource-${resourceId}`;
    if (this.schedulerRegistry.doesExist('cron', cronJobName)) {
      this.schedulerRegistry.deleteCronJob(cronJobName);
      this.logger.log(`Остановлена задача cron для ресурса ${resourceId}`);
    }

    const cronJob = new CronJob(`*/${updated.interval} * * * *`, () => {
      this.checkResource(updated);
    });
    this.schedulerRegistry.addCronJob(cronJobName, cronJob);
    cronJob.start();
    this.logger.log(`Обновлён и перезапущен ресурс ${updated.url} каждые ${updated.interval} минут`);

    return updated;
  }

  async deleteResource(resourceId: number, userId: string) {
    const resource = await this.prisma.resource.findUnique({ where: { id: resourceId } });
    if (!resource || (resource.userId !== userId && !this.adminChatIds.includes(userId))) {
      throw new Error('Ресурс не найден или доступ запрещён');
    }
    const cronJobName = `check-resource-${resourceId}`;
    if (this.schedulerRegistry.doesExist('cron', cronJobName)) {
      this.schedulerRegistry.deleteCronJob(cronJobName);
      this.logger.log(`Остановлена задача cron для ресурса ${resourceId}`);
    }
    await this.prisma.log.deleteMany({ where: { resourceId } });
    await this.prisma.resource.delete({ where: { id: resourceId } });
    this.logger.log(`Удалён ресурс ${resourceId} и его логи`);

    await this.notificationService.notify(
      this.escapeMarkdownV2(`Ресурс ID: ${resourceId} успешно удалён!`)
    );
  }

  async checkResource(resource: {
    id: number;
    url: string;
    type: string;
    userId: string;
    name: string;
    headers?: any;
    interval: number;
    frequency?: number;
    period?: string;
  }) {
    const startTime = Date.now();
    try {
      let response;
      let result = true;

      if (resource.type === 'telegram') {
        const headers = resource.headers || {
          'Accept': 'application/json',
        };

        this.logger.debug(`Проверка ресурса ${resource.url}, headers: ${JSON.stringify(headers)}`);

        const apiRes = await firstValueFrom(
          this.httpService.get(resource.url, { headers, timeout: 20000 }).pipe(
            catchError((error: AxiosError) => {
              this.logger.error(`Ошибка HTTP для ${resource.url}: ${error.message}, response: ${JSON.stringify(error.response?.data)}`);
              throw error;
            }),
          ),
        );

        result = apiRes.status >= 200 && apiRes.status < 300 && Array.isArray(apiRes.data) && apiRes.data.length > 0;
        this.logger.debug(`Ответ API: ${JSON.stringify(apiRes.data).slice(0, 1000)}, status: ${apiRes.status}, result: ${result}`);

        response = {
          status: result ? 'success' : 'error',
          response: typeof apiRes.data === 'string' ? apiRes.data.slice(0, 1000) : JSON.stringify(apiRes.data).slice(0, 1000),
          statusCode: apiRes.status,
        };
      } else if (resource.type === 'static') {
        const headers = resource.headers || {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept-Language': 'en,en-GB;q=0.9,ru;q=0.8',
          'Connection': 'keep-alive',
          'Cache-Control': 'no-cache',
        };

        const res = await firstValueFrom(
          this.httpService.get(resource.url, { headers, timeout: 20000, decompress: true, maxRedirects: 5 }).pipe(
            catchError((error: AxiosError) => {
              this.logger.error(`Ошибка HTTP для ${resource.url}: ${error.message}, response: ${JSON.stringify(error.response?.data)}`);
              throw error;
            }),
          ),
        );

        const contentType = res.headers['content-type']?.toLowerCase() || '';
        if (!contentType.includes('text/html')) {
          throw new Error(`Недопустимый Content-Type: ${contentType}`);
        }

        if (typeof res.data !== 'string') {
          throw new Error(`Ответ не является строкой: ${typeof res.data}`);
        }

        const $ = cheerio.load(res.data);
        const title = $('title').text().toLowerCase();
        const isDefaultPage =
          title.includes('welcome to nginx') ||
          title.includes('apache2') ||
          $('h1').text().toLowerCase().includes('it works!');

        result =
          res.status >= 200 &&
          res.status < 300 &&
          res.data.includes('<html') &&
          !isDefaultPage &&
          $('title').length > 0 &&
          ($('header').length > 0 || $('section').length > 0 || $('footer').length > 0);

        response = {
          status: res.status >= 200 && res.status < 300 ? 'success' : 'error',
          response: res.data.slice(0, 1000),
          statusCode: res.status,
        };
      } else if (resource.type === 'mailer') {
        const isVerifyUrl = resource.url.endsWith('/verify');
        const isSendAdminUrl = resource.url.endsWith('/sendadmin');
        const baseUrl = resource.url.substring(0, resource.url.lastIndexOf('/'));
        const verifyUrl = isVerifyUrl ? resource.url : `${baseUrl}/verify`;
        const sendAdminUrl = isSendAdminUrl ? resource.url : `${baseUrl}/sendadmin`;

        const headers = resource.headers || {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        };

        const testEmail = this.configService.get<string>('TEST_EMAIL', 'njs1@ukr.net');
        const adminEmail = this.configService.get<string>('ADMIN_EMAIL', 'info@1xarea.com');
        const isBotTest = resource.name.includes('bot-test-sender');
        const encryptedCode = 'U2FsdGVkX1/JAyc4WVul2djBAs15LiIiMv5w/tz963U='; // Код из тестов curl

        this.logger.debug(`Проверка mailer, verifyUrl: ${verifyUrl}, sendAdminUrl: ${sendAdminUrl}, headers: ${JSON.stringify(headers)}`);

        const verifyPayload = {
          site_url: 'https://1xarea.com/tgvip/', // Используем site_url из клиентского кода
          email_user: isBotTest ? `bot-${testEmail}` : testEmail,
          encrypted_code: encryptedCode,
        };

        let verifyRes;
        try {
          this.logger.debug(`Отправка запроса к ${verifyUrl}: ${JSON.stringify(verifyPayload)}`);
          verifyRes = await firstValueFrom(
            this.httpService.post(verifyUrl, verifyPayload, { headers, timeout: 60000 }).pipe(
              catchError((error: AxiosError) => {
                this.logger.error(`Ошибка HTTP для ${verifyUrl}: ${error.message}, response: ${JSON.stringify(error.response?.data)}, code: ${error.code}`);
                throw error;
              }),
            ),
          );
        } catch (error) {
          throw new Error(`Ошибка проверки /verify: ${error.message}`);
        }

        result = verifyRes.status >= 200 && verifyRes.status < 300 && verifyRes.data?.success === true;
        response = {
          status: result ? 'success' : 'error',
          response: JSON.stringify(verifyRes.data).slice(0, 1000),
          statusCode: verifyRes.status,
          endpointType: 'verify',
        };
        this.logger.debug(`Ответ /verify: ${JSON.stringify(verifyRes.data).slice(0, 1000)}, status: ${verifyRes.status}, result: ${result}`);

        if (result) {
          const sendAdminPayload = {
            site_url: 'https://bot-checker', // Используем site_url из клиентского кода
            email_user: verifyPayload.email_user,
            email_admin: adminEmail,
            encrypted_code: encryptedCode,
            name: isBotTest ? 'bot-test-sender' : 'test-user',
            telegramUsername: isBotTest ? 'bot-test' : 'test-user',
            id_1xbet: '',
            screenshot_1: '',
            id_FB: '',
            id_IG: '',
            id_TT: '',
            id_TW: '',
            id_YT: '',
            screenshot_2: '',
            screenshot_3: '',
            screenshot_4: '',
            screenshot_5: '',
          };

          let sendAdminRes;
          try {
            this.logger.debug(`Отправка запроса к ${sendAdminUrl}: ${JSON.stringify(sendAdminPayload)}`);
            sendAdminRes = await firstValueFrom(
              this.httpService.post(sendAdminUrl, sendAdminPayload, { headers, timeout: 60000 }).pipe(
                catchError((error: AxiosError) => {
                  this.logger.error(`Ошибка HTTP для ${sendAdminUrl}: ${error.message}, response: ${JSON.stringify(error.response?.data)}, code: ${error.code}`);
                  throw error;
                }),
              ),
            );
          } catch (error) {
            throw new Error(`Ошибка проверки /sendadmin: ${error.message}`);
          }

          result = result && sendAdminRes.status >= 200 && sendAdminRes.status < 300 && sendAdminRes.data?.success === true;
          response = {
            status: result ? 'success' : 'error',
            response: JSON.stringify(sendAdminRes.data).slice(0, 1000),
            statusCode: sendAdminRes.status,
            endpointType: 'sendadmin',
          };
          this.logger.debug(`Ответ /sendadmin: ${JSON.stringify(sendAdminRes.data).slice(0, 1000)}, status: ${sendAdminRes.status}, result: ${result}`);
        }
      }  else {
        throw new Error(`Неизвестный тип ресурса: ${resource.type}`);
      }

      const duration = Date.now() - startTime;
      await this.prisma.log.create({
        data: {
          resourceId: resource.id,
          status: response.status,
          response: response.response.slice(0, 1000),
          endpoint: resource.url,
          duration,
          result,
          createdAt: new Date(),
        },
      });

      if (!result) {
        await this.notificationService.notifyError(
          resource,
          response.response,
          response.statusCode
        );
      }

      this.logger.log(`Ресурс ${resource.url} проверен: ${response.status}, результат: ${result}, длительность: ${duration}мс`);
      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error.response?.data?.description || error.message;

      await this.prisma.log.create({
        data: {
          resourceId: resource.id,
          status: 'error',
          response: errorMessage.slice(0, 1000),
          endpoint: resource.url,
          duration,
          result: false,
          createdAt: new Date(),
        },
      });

      await this.notificationService.notifyError(
        resource,
        errorMessage,
        error.response?.status
      );

      this.logger.error(`Ошибка проверки ресурса ${resource.url}: ${errorMessage}`);
      return { status: 'error', response: errorMessage, result: false };
    }
  }
}
