import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

@Injectable()
export class GenericMailService {
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    const host = this.configService.get<string>('MAIL_HOST') || 'localhost';
    const port = Number(this.configService.get<string>('MAIL_PORT') || 1025);

    const user = this.configService.get<string>('MAIL_USER');
    const pass =
      this.configService.get<string>('MAIL_PASS') ||
      this.configService.get<string>('MAIL_PASSWORD');

    const options: SMTPTransport.Options = {
      host,
      port,
      secure: false,
      auth: user && pass ? { user, pass } : undefined,
    };

    this.transporter = nodemailer.createTransport(options);
  }

  async send(data: { to: string; subject: string; html: string }) {
    await this.transporter.sendMail({
      from: this.configService.get('MAIL_FROM') || 'noreply@local.test',
      to: data.to,
      subject: data.subject,
      html: data.html,
    });
  }
}
