import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class PaymentWebhookDto {

  @IsString()
  @IsOptional()
  externalId?: string; 

  @IsString()
  @IsOptional()
  external_id?: string; 

  @IsString()
  status: string; 

  @IsNumber()
  @IsOptional()
  amount?: number;

  @IsNumber()
  @IsOptional()
  paid_amount?: number;

  @IsString()
  @IsOptional()
  paymentMethod?: string; 

  @IsString()
  @IsOptional()
  payment_method?: string; 

  @IsString()
  @IsOptional()
  payment_channel?: string;

  @IsString()
  @IsOptional()
  payment_destination?: string;

  @IsString()
  @IsOptional()
  id?: string; 

  @IsString()
  @IsOptional()
  user_id?: string;

  @IsString()
  @IsOptional()
  merchant_name?: string;

  @IsString()
  @IsOptional()
  bank_code?: string;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsNumber()
  @IsOptional()
  adjusted_received_amount?: number;

  @IsNumber()
  @IsOptional()
  fees_paid_amount?: number;

  @IsBoolean()
  @IsOptional()
  is_high?: boolean;

  @IsString()
  @IsOptional()
  payer_email?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  paid_at?: string;

  @IsString()
  @IsOptional()
  created?: string;

  @IsString()
  @IsOptional()
  updated?: string;

  @IsString()
  @IsOptional()
  expiry_date?: string;

  [key: string]: any;
}
