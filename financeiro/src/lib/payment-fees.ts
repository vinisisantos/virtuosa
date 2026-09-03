export const PAYMENT_FEE_METHODS = ['credito', 'debito', 'link'] as const;
export const PAYMENT_FEE_PAYERS = ['clinic', 'client'] as const;

export type PaymentFeeMethod = (typeof PAYMENT_FEE_METHODS)[number];
export type PaymentFeePayer = (typeof PAYMENT_FEE_PAYERS)[number];

export interface PaymentFeeCalculationInput {
  baseAmount: number;
  installments: number;
  fixedFee: number;
  fixedRate: number;
  installmentRate: number;
  feePayer: PaymentFeePayer;
}

export interface PaymentFeeCalculation {
  baseAmount: number;
  chargedAmount: number;
  feeAmount: number;
  netAmount: number;
  totalRate: number;
  installmentValues: number[];
}

export class PaymentFeeValidationError extends Error {}

function toCents(value: number) {
  return Math.round((value + Number.EPSILON) * 100);
}

function fromCents(value: number) {
  return value / 100;
}

function assertNonNegativeFinite(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new PaymentFeeValidationError(`${label} inválido.`);
  }
}

function feeInCents(chargedCents: number, fixedFeeCents: number, totalRate: number) {
  return fixedFeeCents + Math.round(chargedCents * totalRate / 100);
}

function grossUpToPreserveNet(baseCents: number, fixedFeeCents: number, totalRate: number) {
  const rate = totalRate / 100;
  let chargedCents = Math.ceil((baseCents + fixedFeeCents) / (1 - rate));

  while (chargedCents - feeInCents(chargedCents, fixedFeeCents, totalRate) < baseCents) {
    chargedCents += 1;
  }
  while (
    chargedCents > 0
    && chargedCents - 1 - feeInCents(chargedCents - 1, fixedFeeCents, totalRate) >= baseCents
  ) {
    chargedCents -= 1;
  }

  return chargedCents;
}

export function splitAmountIntoInstallments(amount: number, installments: number) {
  if (!Number.isInteger(installments) || installments < 1 || installments > 18) {
    throw new PaymentFeeValidationError('Quantidade de parcelas deve estar entre 1 e 18.');
  }
  assertNonNegativeFinite(amount, 'Valor total');

  const totalCents = toCents(amount);
  const baseInstallment = Math.floor(totalCents / installments);
  const remainder = totalCents % installments;

  return Array.from(
    { length: installments },
    (_, index) => fromCents(baseInstallment + (index < remainder ? 1 : 0)),
  );
}

export function normalizeInstallmentRates(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};

  const result: Record<string, number> = {};
  for (const [key, rawValue] of Object.entries(input)) {
    const installment = Number(key);
    const value = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    if (!Number.isInteger(installment) || installment < 1 || installment > 18) continue;
    if (!Number.isFinite(value) || value < 0 || value >= 100) continue;
    result[String(installment)] = Math.round((value + Number.EPSILON) * 10_000) / 10_000;
  }
  return result;
}

export function calculatePaymentFee(input: PaymentFeeCalculationInput): PaymentFeeCalculation {
  assertNonNegativeFinite(input.baseAmount, 'Valor da venda');
  assertNonNegativeFinite(input.fixedFee, 'Taxa fixa em reais');
  assertNonNegativeFinite(input.fixedRate, 'Taxa fixa percentual');
  assertNonNegativeFinite(input.installmentRate, 'Taxa do parcelamento');

  if (!PAYMENT_FEE_PAYERS.includes(input.feePayer)) {
    throw new PaymentFeeValidationError('Responsável pela taxa inválido.');
  }
  if (!Number.isInteger(input.installments) || input.installments < 1 || input.installments > 18) {
    throw new PaymentFeeValidationError('Quantidade de parcelas deve estar entre 1 e 18.');
  }

  const totalRate = input.fixedRate + input.installmentRate;
  if (totalRate >= 100) {
    throw new PaymentFeeValidationError('A soma das taxas percentuais deve ser menor que 100%.');
  }

  const baseCents = toCents(input.baseAmount);
  const fixedFeeCents = toCents(input.fixedFee);
  const chargedCents = input.feePayer === 'client'
    ? grossUpToPreserveNet(baseCents, fixedFeeCents, totalRate)
    : baseCents;
  const calculatedFeeCents = feeInCents(chargedCents, fixedFeeCents, totalRate);
  if (input.feePayer === 'clinic' && calculatedFeeCents > chargedCents) {
    throw new PaymentFeeValidationError('A taxa da operação não pode superar o valor da venda.');
  }
  const feeCents = calculatedFeeCents;
  const netCents = chargedCents - feeCents;

  return {
    baseAmount: fromCents(baseCents),
    chargedAmount: fromCents(chargedCents),
    feeAmount: fromCents(feeCents),
    netAmount: fromCents(netCents),
    totalRate: Math.round((totalRate + Number.EPSILON) * 10_000) / 10_000,
    installmentValues: splitAmountIntoInstallments(fromCents(chargedCents), input.installments),
  };
}
