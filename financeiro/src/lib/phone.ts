export function digitsOnly(value?: string | null): string {
  return (value || '').replace(/\D/g, '');
}

export function phoneLookupKey(value?: string | null): string | null {
  const digits = digitsOnly(value);
  if (!digits) return null;

  const nationalDigits = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
  return nationalDigits.length >= 10 ? nationalDigits.slice(-11) : nationalDigits;
}

export function formatBrazilianPhone(value?: string | null): string {
  const key = phoneLookupKey(value);
  if (!key) return value || '';

  if (key.length === 11) {
    return `(${key.slice(0, 2)}) ${key.slice(2, 7)}-${key.slice(7)}`;
  }

  if (key.length === 10) {
    return `(${key.slice(0, 2)}) ${key.slice(2, 6)}-${key.slice(6)}`;
  }

  return key;
}
