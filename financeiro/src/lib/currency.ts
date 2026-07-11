const currencyFormatters = new Map<string, Intl.NumberFormat>();

export function formatCurrency(value: number, currency = "BRL") {
  let formatter = currencyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency });
    currencyFormatters.set(currency, formatter);
  }
  return formatter.format(value);
}
