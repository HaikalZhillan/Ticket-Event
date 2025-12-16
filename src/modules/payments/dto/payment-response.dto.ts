export class PaymentResponseDto {
  id: string;
  referenceId: string;
  provider: string;
  paymentMethod: string;
  amount: number;
  status: string;
  paymentUrl: string;
  paidAt?: Date;
  createdAt: Date;
  isMock: boolean;
  metadata?: Record<string, any>;
}