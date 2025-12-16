export enum PaymentProvider {
  XENDIT = 'xendit',
}

export enum PaymentType {
  INVOICE = 'invoice', 
  DIRECT = 'direct',
  REFUND = 'refund',
}

export enum PaymentChannel {
  VIRTUAL_ACCOUNT = 'virtual_account',
  E_WALLET = 'e_wallet',
  QRIS = 'qris',
  CREDIT_CARD = 'credit_card',
  RETAIL_OUTLET = 'retail_outlet',
}

export enum PaymentChannelCode {
  VARIOUS = 'various',

  CREDIT_CARD = 'CREDIT_CARD',

  BCA = 'BCA',
  BNI = 'BNI',
  BRI = 'BRI',
  MANDIRI = 'MANDIRI',
  PERMATA = 'PERMATA',

  OVO = 'OVO',
  DANA = 'DANA',
  SHOPEEPAY = 'SHOPEEPAY',
  LINKAJA = 'LINKAJA',


  ALFAMART = 'ALFAMART',
  INDOMARET = 'INDOMARET',

  QRIS = 'QRIS',
}

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  EXPIRED = 'expired',
  FAILED = 'failed',
}

export enum XenditInvoiceStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  EXPIRED = 'EXPIRED',
  FAILED = 'FAILED',
}