import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  healthCheck() {
    return {
      status: 'OK',
      timestamp: new Date().toISOString(),
      environment: this.configService.get('app.nodeEnv'),
      database: {
        connected: true,
        host: this.configService.get('database.host'),
      },
    };
  }

  @Get('config/test')
  testConfig() {
    return {
      app: {
        url: this.configService.get('app.url'),
        frontendUrl: this.configService.get('app.frontendUrl'),
        nodeEnv: this.configService.get('app.nodeEnv'),
        port: this.configService.get('app.port'),
      },
      database: {
        host: this.configService.get('database.host'),
        port: this.configService.get('database.port'),
        database: this.configService.get('database.database'),
      },
      xendit: {
        hasSecretKey: !!this.configService.get('xendit.secretKey'),
        secretKeyPrefix: this.configService.get('xendit.secretKey')?.substring(0, 20) + '...',
        hasWebhookToken: !!this.configService.get('xendit.webhookToken'),
        adminFee: this.configService.get('xendit.adminFee'),
        invoiceDuration: this.configService.get('xendit.invoiceDuration'),
        callbackUrl: this.configService.get('xendit.callbackUrl'),
      },
      mail: {
        host: this.configService.get('mail.host'),
        port: this.configService.get('mail.port'),
        from: this.configService.get('mail.from'),
        hasUser: !!this.configService.get('mail.auth.user'),
        hasPassword: !!this.configService.get('mail.auth.pass'),
      },
      jwt: {
        hasSecret: !!this.configService.get('jwt.secret'),
        expiresIn: this.configService.get('jwt.expiresIn'),
      },
    };
  }
}