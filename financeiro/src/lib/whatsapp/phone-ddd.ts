export type BrazilianDddBucket = "ddd11" | "other";

export function brazilianPhoneHasDdd11(phone?: string | null): boolean {
  const digits = String(phone || "").replace(/\D/g, "");
  const nationalNumber = digits.startsWith("55") && [12, 13].includes(digits.length)
    ? digits.slice(2)
    : digits;

  return /^\d{10,11}$/.test(nationalNumber) && nationalNumber.slice(0, 2) === "11";
}

export function matchesBrazilianDddBucket(phone: string | null | undefined, bucket: BrazilianDddBucket): boolean {
  const hasDdd11 = brazilianPhoneHasDdd11(phone);
  return bucket === "ddd11" ? hasDdd11 : !hasDdd11;
}
