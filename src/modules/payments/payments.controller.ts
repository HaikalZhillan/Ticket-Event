import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  Logger,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ParseUUIDPipe,
  ForbiddenException,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentWebhookDto } from './dto/payment-webhook.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  async create(@Body() createPaymentDto: CreatePaymentDto, @CurrentUser() user: any) {
    this.logger.log(`User ${user.id} creating payment for order ${createPaymentDto.orderId}`);

    try {
      const result = await this.paymentsService.create(createPaymentDto, user.id);

      return {
        success: true,
        message: result.message,
        data: result.payment,
      };
    } catch (error) {
      this.logger.error(`Failed to create payment: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ User-scoped lookup by orderId
   * - Admin can access any
   * - User only if order belongs to them
   */
  @Get('order/:orderId')
  async findByOrderId(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`Fetching payment for order ${orderId}`);

    // NOTE: best practice: enforce ownership in service
    // For now, controller enforces it by calling findByReferenceId afterwards OR
    // your service can return order.userId to validate here.
    const payment = await this.paymentsService.findByOrderId(orderId);

    // ✅ IMPORTANT: your current findByOrderId() returns "order" but not "order.userId"
    // So to enforce properly, we re-fetch by referenceId (which returns relations order.userId).
    if (user.roleName !== 'admin') {
      const paymentEntity = await this.paymentsService.findByReferenceId(payment.referenceId);
      if (!paymentEntity.order || paymentEntity.order.userId !== user.id) {
        throw new ForbiddenException('You do not have permission to view this payment');
      }
    }

    return {
      success: true,
      data: payment,
    };
  }

  /**
   * ✅ User-scoped lookup by referenceId
   */
  @Get('reference/:referenceId')
  async findByReferenceId(@Param('referenceId') referenceId: string, @CurrentUser() user: any) {
    this.logger.log(`Fetching payment with reference ${referenceId}`);

    const payment = await this.paymentsService.findByReferenceId(referenceId);

    if (user.roleName !== 'admin') {
      if (!payment.order || payment.order.userId !== user.id) {
        throw new ForbiddenException('You do not have permission to view this payment');
      }
    }

    return {
      success: true,
      data: {
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
        order: payment.order
          ? {
              id: payment.order.id,
              orderNumber: payment.order.orderNumber,
              status: payment.order.status,
            }
          : null,
      },
    };
  }

  /**
   * ✅ Check payment status to Xendit (user-scoped)
   */
  @Get(':referenceId/check')
  async checkPaymentStatus(@Param('referenceId') referenceId: string, @CurrentUser() user: any) {
    this.logger.log(`Checking payment status for ${referenceId}`);

    try {
      const payment = await this.paymentsService.findByReferenceId(referenceId);

      if (user.roleName !== 'admin') {
        if (!payment.order || payment.order.userId !== user.id) {
          throw new ForbiddenException('You do not have permission to check this payment');
        }
      }

      const result = await this.paymentsService.checkPaymentStatus(referenceId);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.logger.error(`Failed to check payment status: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ Webhook must be public
   */
  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() webhookDto: PaymentWebhookDto,
    @Headers('x-callback-token') callbackToken: string,
  ) {
    this.logger.log('📨 Webhook received from Xendit');
    this.logger.debug(`Webhook data: ${JSON.stringify(webhookDto)}`);

    try {
      const result = await this.paymentsService.handleWebhook(webhookDto, callbackToken);

      return {
        success: true,
        message: 'Webhook processed successfully',
        data: result,
      };
    } catch (error) {
      // ✅ return 200 to avoid Xendit retry storms (your strategy)
      this.logger.error(`Webhook processing failed: ${error.message}`);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  @Roles('admin')
  @Post('simulate/:referenceId')
  @HttpCode(HttpStatus.OK)
  async simulatePayment(
    @Param('referenceId') referenceId: string,
    @Query('status') status: 'PAID' | 'FAILED' | 'EXPIRED' = 'PAID',
  ) {
    if (!['PAID', 'FAILED', 'EXPIRED'].includes(status)) {
      throw new BadRequestException('Invalid status. Must be PAID, FAILED, or EXPIRED');
    }

    this.logger.log(`🎭 Simulating payment: ${referenceId} - Status: ${status}`);

    try {
      const result = await this.paymentsService.simulatePayment(referenceId, status);
      return {
        success: true,
        message: `Payment ${status.toLowerCase()} simulated successfully`,
        data: result,
      };
    } catch (error) {
      this.logger.error(`Failed to simulate payment: ${error.message}`);
      throw error;
    }
  }

  @Get('methods')
  async getPaymentMethods() {
    return {
      success: true,
      data: {
        methods: [
          { code: 'CREDIT_CARD', name: 'Credit Card', description: 'Visa, Mastercard, JCB', fee: 'Fee applies' },
          { code: 'BCA', name: 'BCA Virtual Account', description: 'Transfer via BCA', fee: 'Free' },
          { code: 'BNI', name: 'BNI Virtual Account', description: 'Transfer via BNI', fee: 'Free' },
          { code: 'BRI', name: 'BRI Virtual Account', description: 'Transfer via BRI', fee: 'Free' },
          { code: 'MANDIRI', name: 'Mandiri Virtual Account', description: 'Transfer via Mandiri', fee: 'Free' },
          { code: 'PERMATA', name: 'Permata Virtual Account', description: 'Transfer via Permata', fee: 'Free' },
          { code: 'QRIS', name: 'QRIS', description: 'Scan QR Code to pay', fee: 'Fee applies' },
          { code: 'OVO', name: 'OVO', description: 'Pay with OVO', fee: 'Free' },
          { code: 'DANA', name: 'DANA', description: 'Pay with DANA', fee: 'Free' },
          { code: 'SHOPEEPAY', name: 'ShopeePay', description: 'Pay with ShopeePay', fee: 'Free' },
          { code: 'LINKAJA', name: 'LinkAja', description: 'Pay with LinkAja', fee: 'Free' },
          { code: 'ALFAMART', name: 'Alfamart', description: 'Pay at Alfamart stores', fee: 'Free' },
          { code: 'INDOMARET', name: 'Indomaret', description: 'Pay at Indomaret stores', fee: 'Free' },
        ],
      },
    };
  }

  @Roles('admin')
  @Get('stats')
  async getPaymentStats(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    this.logger.log('Fetching payment statistics');
    return {
      success: true,
      message: 'Payment statistics',
      data: { note: 'Statistics endpoint - implement as needed' },
    };
  }
}
