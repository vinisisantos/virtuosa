export const PAYROLL_PAYMENT_STATUSES = ['paid', 'unpaid', 'review'] as const;

export type PayrollPaymentStatus = (typeof PAYROLL_PAYMENT_STATUSES)[number];

export function isPayrollPaymentStatus(value: unknown): value is PayrollPaymentStatus {
  return typeof value === 'string'
    && PAYROLL_PAYMENT_STATUSES.includes(value as PayrollPaymentStatus);
}

export function resolvePayrollPaymentMutation(params: {
  currentStatus: string;
  currentPaymentDate: Date | null;
  requestedStatus: PayrollPaymentStatus;
  now: Date;
}): {
  changed: boolean;
  data: { paymentStatus: PayrollPaymentStatus; paymentDate: Date | null };
} {
  const paymentDate = params.requestedStatus === 'paid'
    ? params.currentStatus === 'paid' && params.currentPaymentDate
      ? params.currentPaymentDate
      : params.now
    : null;

  return {
    changed: params.currentStatus !== params.requestedStatus
      || params.currentPaymentDate?.getTime() !== paymentDate?.getTime(),
    data: {
      paymentStatus: params.requestedStatus,
      paymentDate,
    },
  };
}
