export const PAYMENT_METHODS = [
  'Cash',
  'Credit Card',
  'Debit Card',
  'Membership',
  'e-Wallet',
  'QR Payment',
  'Ali Pay',
  'WeChat Pay',
  'Shopee Pay',
  'Others'
] as const;

export type PaymentMethodType = typeof PAYMENT_METHODS[number];
