import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Xendit from 'xendit-node';

import { Payment } from 'src/entities/payment.entity';
import { Order } from 'src/entities/order.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentWebhookDto } from './dto/payment-webhook.dto';
import { OrdersService } from '../orders/orders.service';
import { TicketsService } from '../tickets/tickets.service';
import { MailService } from 'src/mail/mail.service';

import {
  PaymentProvider,
  PaymentType,
  PaymentStatus,
  PaymentChannel,
  PaymentChannelCode,
  XenditInvoiceStatus,
} from 'src/common/enums/payment.enums';
import { OrderStatus } from 'src/common/enums/order.enums';

import {
  NotificationsService,
  NotificationCategory,
  NotificationType,
  NotificationStatus,
} from '../notifications/notifications.service';


@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private xenditClient: any;
  private useMockMode: boolean;
  private readonly webhookToken: string;

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @Inject(forwardRef(() => OrdersService))
    private readonly ordersService: OrdersService,
    private readonly ticketsService: TicketsService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly notificationsService: NotificationsService,

  ) {
    const secretKey = this.configService.get<string>('xendit.secretKey') || '';
    this.webhookToken = this.configService.get<string>('xendit.webhookToken') || '';

    this.useMockMode = !secretKey || secretKey.includes('your_secret_key_here');

    if (this.useMockMode) {
      this.logger.warn('Running in MOCK MODE - Xendit integration disabled');
      this.logger.warn('Set XENDIT_SECRET_KEY in .env to enable real payments');
    } else {
      try {
        this.xenditClient = new Xendit({ secretKey });
        this.logger.log('Xendit client initialized successfully');
        this.logger.log(`Webhook token configured: ${this.webhookToken ? 'Yes' : 'No'}`);
      } catch (error) {
        this.logger.error(`Failed to initialize Xendit: ${error.message}`);
        this.logger.error('Falling back to MOCK MODE');
        this.useMockMode = true;
      }
    }
  }

  private verifyWebhookSignature(callbackToken: string): boolean {
    if (this.useMockMode) return true;
    if (this.webhookToken && callbackToken === this.webhookToken) return true;
    this.logger.warn('Webhook verification failed');
    return false;
  }

  private generateReferenceId(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
    return `PAY-${year}${month}${day}-${random}`;
  }

  private generateMockPaymentUrl(referenceId: string, method: string): string {
    const baseUrl = this.configService.get<string>('app.url') || 'http://localhost:3000';
    return `${baseUrl}/mock-payment/${referenceId}?method=${method}`;
  }

  private mapXenditStatusToPaymentStatus(xenditStatus: string): PaymentStatus {
    const s = (xenditStatus || '').toUpperCase();

    switch (s) {
      case XenditInvoiceStatus.PAID:
        return PaymentStatus.PAID;
      case XenditInvoiceStatus.EXPIRED:
        return PaymentStatus.EXPIRED;
      case XenditInvoiceStatus.FAILED:
        return PaymentStatus.FAILED;
      default:
        return PaymentStatus.PENDING;
    }
  }

  private mapMethodToChannel(method?: string): PaymentChannel | undefined {
    if (!method || method === PaymentChannelCode.VARIOUS) return undefined;

    const m = method.toUpperCase();

    if (['BCA', 'BNI', 'BRI', 'MANDIRI', 'PERMATA'].includes(m)) return PaymentChannel.VIRTUAL_ACCOUNT;
    if (['OVO', 'DANA', 'SHOPEEPAY', 'LINKAJA'].includes(m)) return PaymentChannel.E_WALLET;
    if (m === 'QRIS') return PaymentChannel.QRIS;
    if (['ALFAMART', 'INDOMARET'].includes(m)) return PaymentChannel.RETAIL_OUTLET;
    if (m === 'CREDIT_CARD') return PaymentChannel.CREDIT_CARD;

    return undefined;
  }

  private inferChannelAndCodeFromWebhook(webhook: any): {
    channel?: PaymentChannel;
    channelCode?: PaymentChannelCode;
  } {
    const bankCode = webhook.bank_code as string | undefined;
    const paymentChannel = webhook.payment_channel as string | undefined;
    const paymentMethod = webhook.payment_method as string | undefined;

    if (bankCode) {
      const upper = bankCode.toUpperCase();
      if (upper in PaymentChannelCode) {
        return {
          channel: PaymentChannel.VIRTUAL_ACCOUNT,
          channelCode: PaymentChannelCode[upper as keyof typeof PaymentChannelCode],
        };
      }
    }

    if (paymentChannel?.toUpperCase() === 'QRIS' || paymentMethod?.toUpperCase() === 'QRIS') {
      return { channel: PaymentChannel.QRIS, channelCode: PaymentChannelCode.QRIS };
    }

    const maybeCode = (paymentMethod || paymentChannel || '').toUpperCase();
    if (maybeCode && maybeCode in PaymentChannelCode) {
      const code = PaymentChannelCode[maybeCode as keyof typeof PaymentChannelCode];

      if ([PaymentChannelCode.OVO, PaymentChannelCode.DANA, PaymentChannelCode.SHOPEEPAY, PaymentChannelCode.LINKAJA].includes(code)) {
        return { channel: PaymentChannel.E_WALLET, channelCode: code };
      }

      if ([PaymentChannelCode.ALFAMART, PaymentChannelCode.INDOMARET].includes(code)) {
        return { channel: PaymentChannel.RETAIL_OUTLET, channelCode: code };
      }

      if (code === PaymentChannelCode.CREDIT_CARD) {
        return { channel: PaymentChannel.CREDIT_CARD, channelCode: PaymentChannelCode.CREDIT_CARD };
      }
    }

    return {};
  }

  async create(createPaymentDto: CreatePaymentDto, userId?: string) {
    const { orderId, paymentMethod } = createPaymentDto;

    this.logger.log(`Creating payment for order: ${orderId}`);

    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['event', 'user', 'event.category'],
    });

    if (!order) throw new NotFoundException(`Order with ID '${orderId}' not found`);

    if (userId && order.userId !== userId) {
      throw new ForbiddenException('You do not have permission to create payment for this order');
    }

    if (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.AWAITING_PAYMENT) {
      throw new BadRequestException(`Cannot create payment for order with status '${order.status}'`);
    }

    if (order.expiredAt && new Date() > new Date(order.expiredAt)) {
      await this.ordersService.updateStatus(order.id, OrderStatus.EXPIRED);
      throw new BadRequestException('Order has expired');
    }

    const existingPayment = await this.paymentRepository.findOne({ where: { orderId } });

    if (existingPayment) {
      if (existingPayment.status === PaymentStatus.PENDING) {
        return {
          message: 'Payment already exists',
          payment: {
            id: existingPayment.id,
            referenceId: existingPayment.referenceId,
            paymentMethod: existingPayment.paymentMethod,
            amount: existingPayment.amount,
            status: existingPayment.status,
            paymentUrl: existingPayment.paymentUrl,
            expiresAt: order.expiredAt,
            isMock: this.useMockMode,
          },
        };
      }

      throw new BadRequestException(`Payment already exists with status: ${existingPayment.status}`);
    }

    const referenceId = this.generateReferenceId();

    const selectedMethod = (paymentMethod ?? PaymentChannelCode.VARIOUS) as unknown as string;

    const result = this.useMockMode
      ? await this.createMockPayment(order, referenceId, selectedMethod)
      : await this.createXenditPayment(order, referenceId, selectedMethod);

    try {
      await this.mailService.sendOrderCreatedEmail({
        email: order.user.email,
        userName: order.user.name || order.user.email,
        orderNumber: order.orderNumber,
        invoiceNumber: order.invoiceNumber,
        eventTitle: (order.event as any).title,
        quantity: order.quantity,
        totalAmount: order.totalAmount,
        expiredAt: order.expiredAt,
        paymentUrl: result.payment.paymentUrl,
      } as any);
    } catch (error) {
      this.logger.error(`Failed to send order email: ${error.message}`);
    }

    try {
      await this.notificationsService.createInAppNotification({
        userId: order.userId,
        subject: 'Menunggu Pembayaran',
        message: `Silakan selesaikan pembayaran untuk order ${order.orderNumber}.`,
        category: NotificationCategory.PAYMENT_PENDING,
        payload: {
          orderId: order.id,
          referenceId: result.payment.referenceId,
          paymentUrl: result.payment.paymentUrl,
          expiredAt: order.expiredAt,
        },
      });
    } catch (e: any) {
      this.logger.error(`Failed to create pending notification: ${e.message}`);
    }

    return result;
  }

  private async createMockPayment(order: Order, referenceId: string, paymentMethod: string) {
    const paymentUrl = this.generateMockPaymentUrl(referenceId, paymentMethod);

    const channel = this.mapMethodToChannel(paymentMethod);
    const channelCode =
      paymentMethod === PaymentChannelCode.VARIOUS ? undefined : (paymentMethod as any);

    const payment = this.paymentRepository.create({
      orderId: order.id,
      provider: PaymentProvider.XENDIT,
      type: PaymentType.INVOICE,
      paymentMethod,
      channel,
      channelCode,
      referenceId,
      amount: Number(order.totalAmount),
      status: PaymentStatus.PENDING,
      paymentUrl,
      metadata: {
        orderNumber: order.orderNumber,
        eventTitle: (order.event as any)?.title,
        quantity: order.quantity,
        mockPayment: true,
        instructions:
          'This is a mock payment. Use /payments/simulate endpoint to complete payment.',
      },
    });

    const savedPayment = await this.paymentRepository.save(payment);

    return {
      message: 'Payment created successfully (Mock Mode)',
      payment: {
        id: savedPayment.id,
        referenceId: savedPayment.referenceId,
        paymentMethod: savedPayment.paymentMethod,
        amount: savedPayment.amount,
        status: savedPayment.status,
        paymentUrl: savedPayment.paymentUrl,
        expiresAt: order.expiredAt,
        isMock: true,
      },
    };
  }

  private async createXenditPayment(order: Order, referenceId: string, paymentMethod: string) {
    try {
      const { Invoice } = this.xenditClient;

      const invoiceDurationSeconds = 3600;

      const adminFee = this.configService.get<number>('xendit.adminFee') || 5000;
      const totalWithFee = Number(order.totalAmount) + Number(adminFee);

      const invoicePayload = {
        externalId: referenceId,
        amount: totalWithFee,
        payerEmail: order.user.email,
        description: `Pembayaran tiket ${(order.event as any).title}`,
        invoiceDuration: invoiceDurationSeconds,
        successRedirectUrl: this.configService.get('xendit.successRedirectUrl'),
        failureRedirectUrl: this.configService.get('xendit.failureRedirectUrl'),
        currency: 'IDR',
        items: [
          {
            name: (order.event as any).title,
            quantity: order.quantity,
            price: Number(order.unitPrice),
            category: (order.event as any).category?.name || 'Event',
          },
        ],
        customer: {
          givenNames: order.user.name || 'Customer',
          email: order.user.email,
          mobileNumber: (order.user as any).phone || '+6281234567890',
        },
        fees: [
          {
            type: 'Admin Fee',
            value: adminFee,
          },
        ],
      };

      const invoice = await Invoice.createInvoice({ data: invoicePayload });

      const channel = this.mapMethodToChannel(paymentMethod);
      const channelCode =
        paymentMethod === PaymentChannelCode.VARIOUS ? undefined : (paymentMethod as any);

      const payment = this.paymentRepository.create({
        orderId: order.id,
        provider: PaymentProvider.XENDIT,
        type: PaymentType.INVOICE,
        paymentMethod,
        channel,
        channelCode,
        referenceId,
        amount: Number(order.totalAmount),
        status: PaymentStatus.PENDING,
        paymentUrl: invoice.invoice_url,
        metadata: {
          xenditInvoiceId: invoice.id,
          orderNumber: order.orderNumber,
          eventTitle: (order.event as any).title,
          quantity: order.quantity,
          adminFee,
          totalWithFee,
          xenditExpiryDate: invoice.expiry_date,
        },
      });

      const savedPayment = await this.paymentRepository.save(payment);

      return {
        message: 'Payment created successfully',
        payment: {
          id: savedPayment.id,
          referenceId: savedPayment.referenceId,
          paymentMethod: savedPayment.paymentMethod,
          amount: savedPayment.amount,
          adminFee,
          totalWithFee,
          status: savedPayment.status,
          paymentUrl: savedPayment.paymentUrl,
          expiresAt: order.expiredAt,
          isMock: false,
          xenditInvoiceId: invoice.id,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to create Xendit invoice: ${error.message}`);
      throw new BadRequestException(`Failed to create payment: ${error.message || 'Unknown error'}`);
    }
  }

  async handleWebhook(webhookDto: PaymentWebhookDto, callbackToken?: string) {
    const externalId = (webhookDto as any).external_id || (webhookDto as any).externalId;
    const status = (webhookDto as any).status as string;

    this.logger.log(`Webhook received: ${externalId} - Status: ${status}`);

    if (!this.verifyWebhookSignature(callbackToken ?? '')) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const payment = await this.paymentRepository.findOne({
      where: { referenceId: externalId },
      relations: ['order', 'order.event', 'order.user'],
    });

    if (!payment) {
      this.logger.warn(`Payment not found for webhook externalId=${externalId} (ignored)`);
      return { message: 'ignored' };
    }

    const mappedStatus = this.mapXenditStatusToPaymentStatus(status);

    if (payment.status === mappedStatus) {
      return {
        message: 'Webhook already processed',
        payment: { id: payment.id, referenceId: payment.referenceId, status: payment.status },
      };
    }

    const oldStatus = payment.status;

    const inferred = this.inferChannelAndCodeFromWebhook(webhookDto as any);
    if (inferred.channel) payment.channel = inferred.channel;
    if (inferred.channelCode) payment.channelCode = inferred.channelCode;

    payment.status = mappedStatus;

    payment.metadata = {
      ...(payment.metadata || {}),
      xenditInvoiceId: (webhookDto as any).id,
      userId: (webhookDto as any).user_id,
      paidAmount: (webhookDto as any).paid_amount,
      bankCode: (webhookDto as any).bank_code,
      paymentChannel: (webhookDto as any).payment_channel,
      paymentDestination: (webhookDto as any).payment_destination,
      merchantName: (webhookDto as any).merchant_name,
      adjustedReceivedAmount: (webhookDto as any).adjusted_received_amount,
      feesPaidAmount: (webhookDto as any).fees_paid_amount,
      isHigh: (webhookDto as any).is_high,
    };

    if (mappedStatus === PaymentStatus.PAID) {
      payment.paidAt = (webhookDto as any).paid_at ? new Date((webhookDto as any).paid_at) : new Date();

      await this.ordersService.updateStatus(payment.orderId, OrderStatus.PAID, {
        paymentMethod: (webhookDto as any).payment_method,
        paymentChannel: (webhookDto as any).payment_channel,
        bankCode: (webhookDto as any).bank_code,
      });

      try {
        await this.notificationsService.createInAppNotification({
          userId: payment.order.userId,
          subject: 'Pembayaran Berhasil',
          message: `Pembayaran untuk order ${payment.order.orderNumber} berhasil.`,
          category: NotificationCategory.PAYMENT_SUCCESS,
          payload: {
            orderId: payment.orderId,
            referenceId: payment.referenceId,
            paidAt: payment.paidAt,
          },
        });
      } catch (e: any) {
        this.logger.error(`Failed to create success notification: ${e.message}`);
      }

       try {
        const tickets = await this.ticketsService.generateTicketsForOrder(payment.orderId);

        await this.mailService.sendOrderPaidEmail({
          email: payment.order.user.email,
          userName: payment.order.user.name || payment.order.user.email,
          orderNumber: payment.order.orderNumber,
          invoiceNumber: payment.order.invoiceNumber,
          eventTitle: (payment.order.event as any).title,
          eventLocation: (payment.order.event as any).location,
          eventStartTime: (payment.order.event as any).startTime,
          quantity: payment.order.quantity,
          totalAmount: payment.order.totalAmount,
          paidAt: payment.paidAt,
          paymentMethod:
            (webhookDto as any).payment_method ||
            (webhookDto as any).payment_channel ||
            'Xendit',
          tickets: tickets.map((t) => ({
            id: t.id,
            ticketNumber: t.ticketNumber,
            seatNumber: t.seatNumber,
            qrCodeUrl: t.qrCodeUrl,
            pdfUrl: t.pdfUrl,
          })),
        } as any);

         const eventStart = new Date((payment.order.event as any).startTime);
        const reminderAt = new Date(eventStart);
        reminderAt.setHours(reminderAt.getHours() - 24);

        await this.notificationsService.create({
          userId: payment.order.userId,
          subject: 'Reminder Event',
          message: `Event ${(payment.order.event as any).title} akan dimulai besok.`,
          type: NotificationType.EMAIL,
          status: NotificationStatus.PENDING,
          category: NotificationCategory.EVENT_REMINDER,
          scheduledAt: reminderAt,
          payload: {
            eventTitle: (payment.order.event as any).title,
            eventStartTime: (payment.order.event as any).startTime,
          },
        });
      } catch (e: any) {
        this.logger.error(`Failed to generate/send tickets/reminder: ${e.message}`);
      }
    } else if (mappedStatus === PaymentStatus.EXPIRED || mappedStatus === PaymentStatus.FAILED) {
      await this.ordersService.updateStatus(payment.orderId, OrderStatus.EXPIRED);
      try {
        await this.notificationsService.createInAppNotification({
          userId: payment.order.userId,
          subject: 'Pembayaran Gagal / Kedaluwarsa',
          message: `Order ${payment.order.orderNumber} gagal atau kedaluwarsa.`,
          category: NotificationCategory.PAYMENT_FAILED,
          payload: {
            orderId: payment.orderId,
            referenceId: payment.referenceId,
          },
        });
      } catch (e: any) {
        this.logger.error(`Failed to create failed notification: ${e.message}`);
      }
    }

    await this.paymentRepository.save(payment);

    this.logger.log(`Payment status updated: ${oldStatus} → ${payment.status}`);

    return {
      message: 'Payment status updated',
      payment: {
        id: payment.id,
        referenceId: payment.referenceId,
        oldStatus,
        newStatus: payment.status,
        paidAt: payment.paidAt,
      },
    };
  }

  async findByOrderId(orderId: string) {
    const payment = await this.paymentRepository.findOne({
      where: { orderId },
      relations: ['order', 'order.event', 'order.user'],
    });

    if (!payment) throw new NotFoundException('Payment not found for this order');

    return {
      id: payment.id,
      referenceId: payment.referenceId,
      provider: payment.provider,
      type: payment.type,
      channel: payment.channel,
      channelCode: payment.channelCode,
      paymentMethod: payment.paymentMethod,
      amount: payment.amount,
      status: payment.status,
      paymentUrl: payment.paymentUrl,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
      isMock: this.useMockMode,
      metadata: payment.metadata,
      order: {
        id: payment.order.id,
        orderNumber: payment.order.orderNumber,
        status: payment.order.status,
        quantity: payment.order.quantity,
        totalAmount: payment.order.totalAmount,
      },
    };
  }

  async findByReferenceId(referenceId: string) {
    const payment = await this.paymentRepository.findOne({
      where: { referenceId },
      relations: ['order', 'order.event', 'order.user'],
    });

    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  async simulatePayment(referenceId: string, status: 'PAID' | 'FAILED' | 'EXPIRED') {
    if (!this.useMockMode) {
      throw new BadRequestException('Simulate payment only available in mock mode');
    }

    return this.handleWebhook(
      {
        external_id: referenceId,
        externalId: referenceId,
        status,
        amount: 0,
        paymentMethod: 'simulation',
      } as any,
      this.webhookToken,
    );
  }

  async checkPaymentStatus(referenceId: string) {
    if (this.useMockMode) {
      throw new BadRequestException('Check payment status not available in mock mode');
    }

    try {
      const { Invoice } = this.xenditClient;
      const payment = await this.findByReferenceId(referenceId);

      const xenditInvoiceId = payment.metadata?.xenditInvoiceId;
      if (!xenditInvoiceId) throw new BadRequestException('Xendit invoice ID not found');

      const invoice = await Invoice.getInvoice({ invoiceId: xenditInvoiceId });

      return {
        referenceId: payment.referenceId,
        status: invoice.status,
        amount: invoice.amount,
        paidAt: invoice.paid_at,
        paymentMethod: invoice.payment_method,
        xenditData: invoice,
      };
    } catch (error) {
      this.logger.error(`Failed to check payment status: ${error.message}`);
      throw new BadRequestException('Failed to check payment status');
    }
  }

  async expireInvoice(referenceId: string) {
    if (this.useMockMode) {
      throw new BadRequestException('Expire invoice not available in mock mode');
    }

    try {
      const payment = await this.findByReferenceId(referenceId);

      const xenditInvoiceId = payment.metadata?.xenditInvoiceId;
      if (!xenditInvoiceId) throw new BadRequestException('Xendit invoice ID not found');

      const { Invoice } = this.xenditClient;
      const invoice = await Invoice.expireInvoice({ invoiceId: xenditInvoiceId });

      payment.status = PaymentStatus.EXPIRED;
      await this.paymentRepository.save(payment);

      await this.ordersService.updateStatus(payment.orderId, OrderStatus.EXPIRED);

      return {
        message: 'Invoice expired successfully',
        payment: {
          referenceId: payment.referenceId,
          status: payment.status,
          xenditInvoiceId,
          xenditStatus: invoice.status,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to expire invoice: ${error.message}`);
      throw new BadRequestException('Failed to expire invoice');
    }
  }
}
