/**
 * Converte um valor numérico em reais para texto por extenso.
 * Ex: 2500.00 → "dois mil e quinhentos reais"
 * Ex: 1129.40 → "um mil, cento e vinte e nove reais e quarenta centavos"
 */

const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const ESPECIAIS = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function porExtensoAte999(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cem';

  const partes: string[] = [];
  const c = Math.floor(n / 100);
  const d = Math.floor((n % 100) / 10);
  const u = n % 10;

  if (c > 0) partes.push(CENTENAS[c]);

  if (d === 1) {
    partes.push(ESPECIAIS[u]);
  } else {
    if (d > 1) partes.push(DEZENAS[d]);
    if (u > 0) partes.push(UNIDADES[u]);
  }

  return partes.join(' e ');
}

function porExtensoInteiro(n: number): string {
  if (n === 0) return 'zero';

  const partes: string[] = [];

  // Bilhões
  const bilhoes = Math.floor(n / 1_000_000_000);
  if (bilhoes > 0) {
    partes.push(porExtensoAte999(bilhoes) + (bilhoes === 1 ? ' bilhão' : ' bilhões'));
  }

  // Milhões
  const milhoes = Math.floor((n % 1_000_000_000) / 1_000_000);
  if (milhoes > 0) {
    partes.push(porExtensoAte999(milhoes) + (milhoes === 1 ? ' milhão' : ' milhões'));
  }

  // Milhares
  const milhares = Math.floor((n % 1_000_000) / 1_000);
  if (milhares > 0) {
    if (milhares === 1) {
      partes.push('um mil');
    } else {
      partes.push(porExtensoAte999(milhares) + ' mil');
    }
  }

  // Centenas/Dezenas/Unidades
  const resto = n % 1000;
  if (resto > 0) {
    partes.push(porExtensoAte999(resto));
  }

  if (partes.length <= 2) {
    return partes.join(' e ');
  }
  return partes.slice(0, -1).join(', ') + ' e ' + partes[partes.length - 1];
}

export function valorPorExtenso(valor: string | number): string {
  // Parse: aceita "2.500,00" ou 2500.00
  let num: number;
  if (typeof valor === 'string') {
    const clean = valor.replace(/\./g, '').replace(',', '.');
    num = parseFloat(clean);
  } else {
    num = valor;
  }

  if (isNaN(num) || num < 0) return '';

  const inteiro = Math.floor(num);
  const centavos = Math.round((num - inteiro) * 100);

  const partes: string[] = [];

  if (inteiro > 0) {
    partes.push(porExtensoInteiro(inteiro) + (inteiro === 1 ? ' real' : ' reais'));
  }

  if (centavos > 0) {
    partes.push(porExtensoInteiro(centavos) + (centavos === 1 ? ' centavo' : ' centavos'));
  }

  if (partes.length === 0) return 'zero reais';

  return partes.join(' e ');
}
