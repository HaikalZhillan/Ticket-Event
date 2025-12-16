import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { Notification } from 'src/entities/notification.entity';
import { FilterNotificationDto } from './dto/filter-notification.dto';

export enum NotificationType {
  EMAIL = 'email',
  IN_APP = 'in-app',
  SMS = 'sms',
}

export enum NotificationStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
  READ = 'read',
}

export enum NotificationCategory {
  ORDER_CREATED = 'order_created',
  PAYMENT_PENDING = 'payment_pending',
  PAYMENT_SUCCESS = 'payment_success',
  PAYMENT_FAILED = 'payment_failed',
  ORDER_CANCELLED = 'order_cancelled',
  ORDER_EXPIRED = 'order_expired',
  TICKET_GENERATED = 'ticket_generated',
  EVENT_REMINDER = 'event_reminder',
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
  ) {}

  async create(data: {
    userId: string;
    subject: string;
    message: string;
    type?: NotificationType | string;
    category?: NotificationCategory | string;
    payload?: any;
    status?: NotificationStatus | string;
    scheduledAt?: Date;
  }) {
    const notification = this.notificationRepository.create({
      userId: data.userId,
      subject: data.subject,
      message: data.message,
      type: data.type || NotificationType.IN_APP,
      payload: data.payload ? JSON.stringify({
        ...data.payload,
        category: data.category,
      }) : JSON.stringify({ category: data.category }),
      status: data.status || NotificationStatus.PENDING,
      scheduledAt: data.scheduledAt,
    });

    return await this.notificationRepository.save(notification);
  }

  async createEmailNotification(data: {
    userId: string;
    subject: string;
    message: string;
    category: NotificationCategory | string;
    payload?: any;
  }) {
    return this.create({
      ...data,
      type: NotificationType.EMAIL,
      status: NotificationStatus.PENDING,
    });
  }

  async createInAppNotification(data: {
    userId: string;
    subject: string;
    message: string;
    category: NotificationCategory | string;
    payload?: any;
  }) {
    return this.create({
      ...data,
      type: NotificationType.IN_APP,
      status: NotificationStatus.SENT,
    });
  }

  async markAsSent(id: string) {
    const notification = await this.notificationRepository.findOne({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    notification.status = NotificationStatus.SENT;
    notification.sentAt = new Date();

    return await this.notificationRepository.save(notification);
  }

  async markAsFailed(id: string) {
    const notification = await this.notificationRepository.findOne({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    notification.status = NotificationStatus.FAILED;

    return await this.notificationRepository.save(notification);
  }

  async markAsRead(id: string, userId: string) {
    const notification = await this.notificationRepository.findOne({
      where: { id, userId, type: NotificationType.IN_APP },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.status === NotificationStatus.READ) {
      return notification;
    }

    notification.status = NotificationStatus.READ;
    return await this.notificationRepository.save(notification);
  }

  async markMultipleAsRead(ids: string[], userId: string) {
    const result = await this.notificationRepository
      .createQueryBuilder()
      .update(Notification)
      .set({ 
        status: NotificationStatus.READ,
        updatedAt: new Date(),
      })
      .where('id IN (:...ids)', { ids })
      .andWhere('userId = :userId', { userId })
      .andWhere('type = :type', { type: NotificationType.IN_APP })
      .andWhere('status != :status', { status: NotificationStatus.READ })
      .execute();

    return {
      message: `${result.affected} notifications marked as read`,
      affected: result.affected,
    };
  }

  async markAllAsRead(userId: string) {
    const result = await this.notificationRepository
      .createQueryBuilder()
      .update(Notification)
      .set({ 
        status: NotificationStatus.READ,
        updatedAt: new Date(),
      })
      .where('userId = :userId', { userId })
      .andWhere('type = :type', { type: NotificationType.IN_APP })
      .andWhere('status != :status', { status: NotificationStatus.READ })
      .execute();

    return {
      message: `${result.affected} notifications marked as read`,
      affected: result.affected,
    };
  }

  async findByUser(userId: string, filterDto: FilterNotificationDto) {
    const { status, type, page = 1, limit = 20 } = filterDto;

    const queryBuilder = this.notificationRepository
      .createQueryBuilder('notification')
      .where('notification.userId = :userId', { userId });

    queryBuilder.andWhere('notification.type = :type', { 
      type: type || NotificationType.IN_APP 
    });

    if (status) {
      queryBuilder.andWhere('notification.status = :status', { status });
    }

    queryBuilder.orderBy('notification.createdAt', 'DESC');

    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    const formattedData = data.map(notification => ({
      id: notification.id,
      subject: notification.subject,
      message: notification.message,
      type: notification.type,
      status: notification.status,
      payload: notification.payload ? JSON.parse(notification.payload) : null,
      createdAt: notification.createdAt,
    }));

    return {
      data: formattedData,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }


  async getUnreadCount(userId: string): Promise<number> {
    return await this.notificationRepository.count({
      where: { 
        userId, 
        type: NotificationType.IN_APP,
        status: NotificationStatus.SENT,
      },
    });
  }


  async findOne(id: string, userId?: string) {
    const where: any = { id };
    if (userId) {
      where.userId = userId;
    }

    const notification = await this.notificationRepository.findOne({ where });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return {
      ...notification,
      payload: notification.payload ? JSON.parse(notification.payload) : null,
    };
  }


  async deleteNotification(id: string, userId: string) {
    const notification = await this.notificationRepository.findOne({
      where: { id, userId, type: NotificationType.IN_APP },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    await this.notificationRepository.remove(notification);

    return {
      message: 'Notification deleted successfully',
    };
  }


  async deleteAll(userId: string) {
    const result = await this.notificationRepository
      .createQueryBuilder()
      .delete()
      .from(Notification)
      .where('userId = :userId', { userId })
      .andWhere('type = :type', { type: NotificationType.IN_APP })
      .execute();

    return {
      message: `${result.affected} notifications deleted`,
      affected: result.affected,
    };
  }

  async getPendingScheduledDue(now = new Date()) {
    return await this.notificationRepository.find({
      where: [
        { status: NotificationStatus.PENDING, scheduledAt: IsNull() },
        { status: NotificationStatus.PENDING, scheduledAt: LessThanOrEqual(now) },
      ],
      relations: ['user'],
    });
  }
}