import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from '../../entities/notification.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsCron } from './cron/notificaitons.cron';
import { MailModule } from 'src/mail/mail.module';

@Module({
  imports: [TypeOrmModule.forFeature([Notification]),MailModule],
  exports: [NotificationsService],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsCron],
})
export class NotificationsModule {}
