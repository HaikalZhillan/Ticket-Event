import { Controller, Post } from '@nestjs/common';
import { GenericMailService } from '../mail/generic-mail.service';

@Controller('test')
export class TestController {
  constructor(private readonly genericMail: GenericMailService) {}

  @Post('direct-email')
  async directEmail() {
    await this.genericMail.send({
      to: 'test@local.test',
      subject: 'Test Mailpit',
      html: '<h1>Email masuk ke Mailpit </h1>',
    });

    return { ok: true };
  }
}
