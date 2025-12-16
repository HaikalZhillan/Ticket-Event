import { IsOptional, IsEnum, IsUUID } from 'class-validator';
import { PaymentChannelCode } from 'src/common/enums/payment.enums';

export class CreatePaymentDto {
  @IsUUID()
  orderId: string;

  @IsOptional()
  @IsEnum(PaymentChannelCode)
  paymentMethod?: PaymentChannelCode = PaymentChannelCode.VARIOUS;
}
