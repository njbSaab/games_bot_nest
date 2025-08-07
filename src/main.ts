import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Включение CORS
  app.enableCors();
  app.setGlobalPrefix('api', { exclude: ['/'] });
  app.enableShutdownHooks();

  const port = process.env.PORT ?? 4141;
  await app.listen(port);

  logger.log(`Application is running on: http://localhost:${port}/api`);
}
bootstrap();