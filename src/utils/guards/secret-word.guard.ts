import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SecretWordGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const secretWord = request.headers['x-secret-word'];

    const expectedSecretWord = this.configService.get<string>('SECRET_WORD');
    console.log(`Received X-Secret-Word: ${secretWord}`); // Для отладки
    if (!secretWord || secretWord !== expectedSecretWord) {
      throw new UnauthorizedException('Invalid or missing secret word');
    }

    return true;
  }
}