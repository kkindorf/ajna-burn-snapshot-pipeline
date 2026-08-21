import { AJNA_CONFIG } from './ajnaConfig.js';

function formatUnits(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value)
    .toString()
    .padStart(decimals + 1, '0');

  if (decimals === 0) {
    return `${negative ? '-' : ''}${digits}`;
  }

  const integer = digits.slice(0, -decimals);
  const fraction = digits.slice(-decimals).replace(/0+$/, '');
  return `${negative ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`;
}

function compactNumberFromUnits(units: string): string {
  const parsed = Number(units);
  if (!Number.isFinite(parsed)) {
    return units;
  }

  const formatter = new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: parsed >= 100 ? 1 : 2,
  });
  return formatter.format(parsed);
}

export function formatCompactTokenAmount(
  raw: bigint | string,
  decimals = AJNA_CONFIG.tokenDecimals,
  symbol = AJNA_CONFIG.tokenSymbol,
): string {
  const value = typeof raw === 'bigint' ? raw : BigInt(raw);
  return `${compactNumberFromUnits(formatUnits(value, decimals))} ${symbol}`;
}

export function formatUtcDate(timestampSeconds: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(timestampSeconds * 1000));
}

export function formatPercentBurned(
  indexedBurnRaw: bigint,
  originalSupplyRaw: bigint,
): string {
  if (originalSupplyRaw === 0n) {
    return '0.000%';
  }

  const cappedBurnRaw =
    indexedBurnRaw > originalSupplyRaw ? originalSupplyRaw : indexedBurnRaw;
  const scaled =
    (cappedBurnRaw * 100_000n + originalSupplyRaw / 2n) / originalSupplyRaw;
  const whole = scaled / 1_000n;
  const fraction = (scaled % 1_000n).toString().padStart(3, '0');
  return `${whole.toString()}.${fraction}%`;
}
