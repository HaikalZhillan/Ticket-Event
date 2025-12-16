import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MailService } from './mail.service';
import { GenericMailService } from './generic-mail.service';

@Module({
  imports: [ConfigModule],
  providers: [MailService, GenericMailService],
  exports: [MailService, GenericMailService],
})
export class MailModule {}
