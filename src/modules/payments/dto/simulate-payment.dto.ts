import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum PaymentStatus {
  PAID = 'PAID',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
}

export class SimulatePaymentDto {
  @IsEnum(PaymentStatus)
  status: PaymentStatus;

  @IsOptional()
  @IsString()
  referenceId?: string;
}