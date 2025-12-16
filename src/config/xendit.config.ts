import { registerAs } from '@nestjs/config';

export default registerAs('xendit', () => ({
  secretKey: process.env.XENDIT_SECRET_KEY || '',
  publicKey: process.env.XENDIT_PUBLIC_KEY || '',
  webhookToken: process.env.XENDIT_WEBHOOK_TOKEN || '',
  
  isProduction: process.env.NODE_ENV === 'production',
  
  callbackUrl: process.env.XENDIT_CALLBACK_URL || 'http://localhost:3000/payments/webhook',
  successRedirectUrl: process.env.XENDIT_SUCCESS_URL || 'http://localhost:3001/orders/success',
  failureRedirectUrl: process.env.XENDIT_FAILURE_URL || 'http://localhost:3001/orders/failed',
  
  invoiceDuration: parseInt(process.env.XENDIT_INVOICE_DURATION || '86400', 10),
  currency: process.env.XENDIT_CURRENCY || 'IDR',
  
  adminFee: parseInt(process.env.XENDIT_ADMIN_FEE || '5000', 10),
  shouldSendEmail: process.env.XENDIT_SEND_EMAIL === 'true',
  
  enabledMethods: (process.env.XENDIT_ENABLED_METHODS || 'all')
    .split(',')
    .map(m => m.trim()),
  
  externalIdPrefix: process.env.XENDIT_EXTERNAL_ID_PREFIX || 'ORDER',
}));