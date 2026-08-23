import type {
  BurnLogRecord,
  BurnSnapshot,
  BurnSnapshotConfiguration,
  BurnSummary,
  BurnTransaction,
  RawBurnLogs,
  TokenMetadata,
  TransactionHash,
} from '../types/burn.js';

const MAX_TOKEN_DECIMALS = 255;
const MAX_DATE_SECONDS = 8_640_000_000_000;
const ADDRESS_PATTERN = /^0x[\da-f]{40}$/i;
const TRANSACTION_HASH_PATTERN = /^0x[\da-f]{64}$/i;

interface BurnGroup {
  amountBurnedRaw: bigint;
  blockNumber: number;
  logIndex: number;
  timestamp: number;
  transactionHash: TransactionHash;
}

interface CompactScale {
  divisor: bigint;
  suffix: string;
}

const COMPACT_SCALES: readonly CompactScale[] = [
  { divisor: 1n, suffix: '' },
  { divisor: 1_000n, suffix: 'K' },
  { divisor: 1_000_000n, suffix: 'M' },
  { divisor: 1_000_000_000n, suffix: 'B' },
];

export interface BuildBurnTransactionsInput {
  configuration: BurnSnapshotConfiguration;
  logs: readonly BurnLogRecord[];
}

export interface CalculateBurnSummaryInput {
  configuration: BurnSnapshotConfiguration;
  currentTotalSupplyRaw: bigint;
  generatedAt: string;
  indexedFromBlock: number;
  indexedThroughBlock: number;
  lastIndexedBlock: number;
  transactions: readonly BurnTransaction[];
}

export interface CreateBurnSnapshotInput {
  configuration: BurnSnapshotConfiguration;
  generatedAt: string;
  rawLogs: RawBurnLogs;
}

function isTransactionHash(value: string): value is TransactionHash {
  return TRANSACTION_HASH_PATTERN.test(value);
}

function normalizeTransactionHash(value: string): TransactionHash {
  if (typeof value !== 'string') {
    throw new Error('Invalid transaction hash: expected a string.');
  }

  const normalized = value.toLowerCase();
  if (!isTransactionHash(normalized)) {
    throw new Error(`Invalid transaction hash: ${value}`);
  }

  return normalized;
}

function assertSafeInteger(value: number, label: string, minimum = 0): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

function assertNonNegativeBigInt(value: bigint, label: string): void {
  if (typeof value !== 'bigint' || value < 0n) {
    throw new Error(`Invalid ${label}: expected a non-negative bigint.`);
  }
}

function assertTokenMetadata(token: TokenMetadata): void {
  if (typeof token !== 'object' || token === null) {
    throw new Error('Invalid token metadata.');
  }

  if (
    !Number.isSafeInteger(token.decimals) ||
    token.decimals < 0 ||
    token.decimals > MAX_TOKEN_DECIMALS
  ) {
    throw new Error(`Invalid token decimals: ${token.decimals}`);
  }

  if (typeof token.symbol !== 'string' || token.symbol.trim().length === 0) {
    throw new Error('Token symbol cannot be empty.');
  }
}

function assertSnapshotConfiguration(
  configuration: BurnSnapshotConfiguration,
): void {
  if (typeof configuration !== 'object' || configuration === null) {
    throw new Error('Invalid burn snapshot configuration.');
  }

  assertSafeInteger(configuration.chainId, 'chain id', 1);
  assertSafeInteger(configuration.deploymentBlock, 'deployment block');
  assertSafeInteger(configuration.deploymentTimestamp, 'deployment timestamp');
  assertNonNegativeBigInt(configuration.launchSupplyRaw, 'launch supply');
  if (configuration.launchSupplyRaw === 0n) {
    throw new Error('Launch supply must be greater than zero.');
  }

  if (
    typeof configuration.contractAddress !== 'string' ||
    !ADDRESS_PATTERN.test(configuration.contractAddress)
  ) {
    throw new Error('Invalid contract address.');
  }

  if (typeof configuration.transactionUrlForHash !== 'function') {
    throw new Error('A transaction URL formatter is required.');
  }

  assertTokenMetadata(configuration.token);
}

function assertGeneratedAt(generatedAt: string): void {
  if (typeof generatedAt !== 'string') {
    throw new Error('Invalid generatedAt timestamp: expected an ISO string.');
  }

  const milliseconds = Date.parse(generatedAt);
  if (!Number.isFinite(milliseconds)) {
    throw new Error(`Invalid generatedAt timestamp: ${generatedAt}`);
  }
}

function compareBurnLogs(left: BurnLogRecord, right: BurnLogRecord): number {
  if (left.blockNumber !== right.blockNumber) {
    return left.blockNumber - right.blockNumber;
  }

  if (left.logIndex !== right.logIndex) {
    return left.logIndex - right.logIndex;
  }

  return left.transactionHash.localeCompare(right.transactionHash);
}

function compareBurnGroups(left: BurnGroup, right: BurnGroup): number {
  if (left.blockNumber !== right.blockNumber) {
    return left.blockNumber - right.blockNumber;
  }

  if (left.logIndex !== right.logIndex) {
    return left.logIndex - right.logIndex;
  }

  return left.transactionHash.localeCompare(right.transactionHash);
}

function normalizeBurnLog(log: BurnLogRecord): BurnLogRecord {
  if (typeof log !== 'object' || log === null) {
    throw new Error('Invalid burn log record.');
  }

  if (typeof log.amountBurnedRaw !== 'bigint') {
    throw new Error('Invalid burn amount: expected bigint.');
  }

  assertNonNegativeBigInt(log.amountBurnedRaw, 'burn amount');
  if (log.amountBurnedRaw === 0n) {
    throw new Error(
      'Invalid burn amount: zero-value burn logs are not allowed.',
    );
  }

  assertSafeInteger(log.blockNumber, 'burn block number');
  assertSafeInteger(log.logIndex, 'burn log index');
  assertSafeInteger(log.timestamp, 'burn timestamp');
  if (log.timestamp > MAX_DATE_SECONDS) {
    throw new Error(`Invalid burn timestamp: ${log.timestamp}`);
  }

  return {
    amountBurnedRaw: log.amountBurnedRaw,
    blockNumber: log.blockNumber,
    logIndex: log.logIndex,
    timestamp: log.timestamp,
    transactionHash: normalizeTransactionHash(log.transactionHash),
  };
}

function normalizeRawBurnLogs(rawLogs: RawBurnLogs): RawBurnLogs {
  if (typeof rawLogs !== 'object' || rawLogs === null) {
    throw new Error('Invalid raw burn logs.');
  }

  if (typeof rawLogs.executionId !== 'string' || !rawLogs.executionId.trim()) {
    throw new Error('Raw burn logs require a non-empty execution id.');
  }

  if (typeof rawLogs.source !== 'string' || !rawLogs.source.trim()) {
    throw new Error('Raw burn logs require a non-empty source.');
  }

  if (!Array.isArray(rawLogs.logs)) {
    throw new Error('Raw burn logs must contain an array of logs.');
  }

  if (typeof rawLogs.currentTotalSupplyRaw !== 'bigint') {
    throw new Error('Raw burn logs require bigint current total supply.');
  }

  assertNonNegativeBigInt(
    rawLogs.currentTotalSupplyRaw,
    'current total supply',
  );
  assertSafeInteger(rawLogs.headBlock, 'source head block');
  assertSafeInteger(rawLogs.indexedFromBlock, 'indexed-from block');
  assertSafeInteger(rawLogs.indexedThroughBlock, 'indexed-through block');
  if (rawLogs.indexedFromBlock > rawLogs.indexedThroughBlock) {
    throw new Error(
      'Indexed-from block cannot exceed the indexed-through block.',
    );
  }
  if (rawLogs.indexedThroughBlock > rawLogs.headBlock) {
    throw new Error(
      'Indexed-through block cannot exceed the source head block.',
    );
  }

  return {
    currentTotalSupplyRaw: rawLogs.currentTotalSupplyRaw,
    executionId: rawLogs.executionId.trim(),
    headBlock: rawLogs.headBlock,
    indexedFromBlock: rawLogs.indexedFromBlock,
    indexedThroughBlock: rawLogs.indexedThroughBlock,
    logs: rawLogs.logs.map(normalizeBurnLog),
    source: rawLogs.source.trim(),
  };
}

function sameBurnLog(left: BurnLogRecord, right: BurnLogRecord): boolean {
  return (
    left.amountBurnedRaw === right.amountBurnedRaw &&
    left.blockNumber === right.blockNumber &&
    left.logIndex === right.logIndex &&
    left.timestamp === right.timestamp &&
    left.transactionHash === right.transactionHash
  );
}

function groupBurnLogsByTransaction(
  logs: readonly BurnLogRecord[],
): BurnGroup[] {
  const grouped = new Map<TransactionHash, BurnGroup>();

  for (const log of dedupeAndSortBurnLogs(logs)) {
    const existing = grouped.get(log.transactionHash);
    if (!existing) {
      grouped.set(log.transactionHash, {
        amountBurnedRaw: log.amountBurnedRaw,
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
        timestamp: log.timestamp,
        transactionHash: log.transactionHash,
      });
      continue;
    }

    if (
      existing.blockNumber !== log.blockNumber ||
      existing.timestamp !== log.timestamp
    ) {
      throw new Error(
        `Transaction ${log.transactionHash} has inconsistent block metadata.`,
      );
    }

    existing.amountBurnedRaw += log.amountBurnedRaw;
  }

  return [...grouped.values()].sort(compareBurnGroups);
}

function roundedDecimalString(
  numerator: bigint,
  denominator: bigint,
  fractionDigits: number,
): string {
  const multiplier = 10n ** BigInt(fractionDigits);
  const rounded = (numerator * multiplier + denominator / 2n) / denominator;
  const integer = rounded / multiplier;
  if (fractionDigits === 0) {
    return integer.toString();
  }

  const fraction = (rounded % multiplier)
    .toString()
    .padStart(fractionDigits, '0')
    .replace(/0+$/, '');
  return fraction ? `${integer}.${fraction}` : integer.toString();
}

function readBurnTransactionAmount(
  transaction: BurnTransaction,
  index: number,
): bigint {
  if (typeof transaction !== 'object' || transaction === null) {
    throw new Error(`Invalid burn transaction at index ${index}.`);
  }

  if (
    typeof transaction.amountBurnedRaw !== 'string' ||
    !/^\d+$/.test(transaction.amountBurnedRaw)
  ) {
    throw new Error(`Invalid burn amount at transaction index ${index}.`);
  }

  const amountBurnedRaw = BigInt(transaction.amountBurnedRaw);
  if (amountBurnedRaw === 0n) {
    throw new Error(`Invalid zero burn amount at transaction index ${index}.`);
  }

  return amountBurnedRaw;
}

function compactNumberFromRaw(value: bigint, decimals: number): string {
  const absoluteValue = value < 0n ? -value : value;
  const unit = 10n ** BigInt(decimals);
  const fractionDigits = absoluteValue >= unit * 100n ? 1 : 2;
  let scaleIndex = 0;

  for (let index = 1; index < COMPACT_SCALES.length; index += 1) {
    if (absoluteValue >= unit * COMPACT_SCALES[index].divisor) {
      scaleIndex = index;
    }
  }

  while (true) {
    const scale = COMPACT_SCALES[scaleIndex];
    const denominator = unit * scale.divisor;
    const rendered = roundedDecimalString(
      absoluteValue,
      denominator,
      fractionDigits,
    );
    const roundedAtScale =
      (absoluteValue * 10n ** BigInt(fractionDigits) + denominator / 2n) /
      denominator;

    if (
      scaleIndex < COMPACT_SCALES.length - 1 &&
      roundedAtScale >= 1_000n * 10n ** BigInt(fractionDigits)
    ) {
      scaleIndex += 1;
      continue;
    }

    const sign = value < 0n && roundedAtScale !== 0n ? '-' : '';
    return `${sign}${rendered}${scale.suffix}`;
  }
}

/**
 * Deduplicates exact log identities and returns a chronological copy without
 * mutating provider-owned records. Conflicting duplicates fail closed.
 */
export function dedupeAndSortBurnLogs(
  logs: readonly BurnLogRecord[],
): BurnLogRecord[] {
  const seen = new Map<string, BurnLogRecord>();
  const transactionHashesByLogPosition = new Map<string, TransactionHash>();

  for (const sourceLog of logs) {
    const log = normalizeBurnLog(sourceLog);
    const key = `${log.transactionHash}:${log.logIndex}`;
    const logPosition = `${log.blockNumber}:${log.logIndex}`;
    const transactionHashAtPosition =
      transactionHashesByLogPosition.get(logPosition);
    if (
      transactionHashAtPosition !== undefined &&
      transactionHashAtPosition !== log.transactionHash
    ) {
      throw new Error(
        `Conflicting burn logs at block/log position: ${logPosition}`,
      );
    }
    transactionHashesByLogPosition.set(logPosition, log.transactionHash);

    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, log);
      continue;
    }

    if (!sameBurnLog(existing, log)) {
      throw new Error(`Conflicting duplicate burn log: ${key}`);
    }
  }

  return [...seen.values()].sort(compareBurnLogs);
}

export function calculateRemainingSupplyRaw(
  originalSupplyRaw: bigint,
  burnedRaw: bigint,
): bigint {
  assertNonNegativeBigInt(originalSupplyRaw, 'original supply');
  assertNonNegativeBigInt(burnedRaw, 'burned supply');
  if (burnedRaw > originalSupplyRaw) {
    throw new Error('Burned supply cannot exceed original supply.');
  }

  return originalSupplyRaw - burnedRaw;
}

/**
 * Formats raw token quantities entirely with bigint arithmetic, avoiding the
 * precision loss caused by converting large token balances to JavaScript Number.
 */
export function formatCompactTokenAmount(
  raw: bigint | string,
  token: TokenMetadata,
): string {
  assertTokenMetadata(token);

  let value: bigint;
  try {
    if (typeof raw !== 'bigint' && typeof raw !== 'string') {
      throw new Error('Raw token amount must be a bigint or decimal string.');
    }
    value = typeof raw === 'bigint' ? raw : BigInt(raw);
  } catch {
    throw new Error(`Invalid raw token amount: ${raw}`);
  }

  return `${compactNumberFromRaw(value, token.decimals)} ${token.symbol.trim()}`;
}

export function formatUtcDate(timestampSeconds: number): string {
  assertSafeInteger(timestampSeconds, 'timestamp');
  if (timestampSeconds > MAX_DATE_SECONDS) {
    throw new Error(`Invalid timestamp: ${timestampSeconds}`);
  }

  const date = new Date(timestampSeconds * 1_000);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${timestampSeconds}`);
  }

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(date);
}

export function formatPercentBurned(
  indexedBurnRaw: bigint,
  originalSupplyRaw: bigint,
): string {
  assertNonNegativeBigInt(indexedBurnRaw, 'indexed burn total');
  assertNonNegativeBigInt(originalSupplyRaw, 'original supply');
  if (originalSupplyRaw === 0n || indexedBurnRaw === 0n) {
    return '0.000%';
  }

  if (indexedBurnRaw > originalSupplyRaw) {
    throw new Error('Indexed burn total cannot exceed original supply.');
  }

  const scaled =
    (indexedBurnRaw * 100_000n + originalSupplyRaw / 2n) / originalSupplyRaw;
  const whole = scaled / 1_000n;
  const fraction = (scaled % 1_000n).toString().padStart(3, '0');
  return `${whole.toString()}.${fraction}%`;
}

/**
 * Converts canonical source-neutral events into public transactions in stable
 * block/log order. Cumulative values are never re-sorted after calculation.
 */
export function buildBurnTransactions({
  configuration,
  logs,
}: BuildBurnTransactionsInput): BurnTransaction[] {
  assertSnapshotConfiguration(configuration);
  const burnGroups = groupBurnLogsByTransaction(logs);
  let cumulativeBurnedRaw = 0n;

  return burnGroups.map((burn) => {
    cumulativeBurnedRaw += burn.amountBurnedRaw;
    if (cumulativeBurnedRaw > configuration.launchSupplyRaw) {
      throw new Error(
        `Indexed burns exceed launch supply at transaction ${burn.transactionHash}.`,
      );
    }

    const remainingSupplyRaw = calculateRemainingSupplyRaw(
      configuration.launchSupplyRaw,
      cumulativeBurnedRaw,
    );

    const etherscanUrl = configuration.transactionUrlForHash(
      burn.transactionHash,
    );
    if (typeof etherscanUrl !== 'string' || etherscanUrl.trim().length === 0) {
      throw new Error(`Invalid transaction URL for ${burn.transactionHash}.`);
    }

    return {
      transactionHash: burn.transactionHash,
      blockNumber: burn.blockNumber,
      timestamp: burn.timestamp,
      date: formatUtcDate(burn.timestamp),
      amountBurnedRaw: burn.amountBurnedRaw.toString(),
      amountBurnedFormatted: formatCompactTokenAmount(
        burn.amountBurnedRaw,
        configuration.token,
      ),
      cumulativeBurnedRaw: cumulativeBurnedRaw.toString(),
      cumulativeBurnedFormatted: formatCompactTokenAmount(
        cumulativeBurnedRaw,
        configuration.token,
      ),
      remainingSupplyRaw: remainingSupplyRaw.toString(),
      remainingSupplyFormatted: formatCompactTokenAmount(
        remainingSupplyRaw,
        configuration.token,
      ),
      etherscanUrl,
    };
  });
}

export function calculateBurnSummary({
  configuration,
  currentTotalSupplyRaw,
  generatedAt,
  indexedFromBlock,
  indexedThroughBlock,
  lastIndexedBlock,
  transactions,
}: CalculateBurnSummaryInput): BurnSummary {
  assertSnapshotConfiguration(configuration);
  assertGeneratedAt(generatedAt);
  assertNonNegativeBigInt(currentTotalSupplyRaw, 'current total supply');
  if (currentTotalSupplyRaw > configuration.launchSupplyRaw) {
    throw new Error('Current total supply cannot exceed launch supply.');
  }
  assertSafeInteger(indexedFromBlock, 'indexed-from block');
  assertSafeInteger(indexedThroughBlock, 'indexed-through block');
  if (indexedFromBlock > indexedThroughBlock) {
    throw new Error(
      'Indexed-from block cannot exceed the indexed-through block.',
    );
  }
  assertSafeInteger(lastIndexedBlock, 'last indexed block');
  if (lastIndexedBlock > indexedThroughBlock) {
    throw new Error(
      'Last indexed burn block cannot exceed the indexed-through block.',
    );
  }

  if (!Array.isArray(transactions)) {
    throw new Error('Burn summary requires an array of transactions.');
  }

  const indexedBurnTotalRaw = transactions.reduce(
    (total, transaction, index) => {
      return total + readBurnTransactionAmount(transaction, index);
    },
    0n,
  );
  if (indexedBurnTotalRaw > configuration.launchSupplyRaw) {
    throw new Error('Indexed burn total cannot exceed launch supply.');
  }
  const calculatedBurnTotalRaw =
    configuration.launchSupplyRaw - currentTotalSupplyRaw;
  const discrepancyRaw = calculatedBurnTotalRaw - indexedBurnTotalRaw;
  const latestBurn = transactions.at(-1) ?? null;

  return {
    chainId: configuration.chainId,
    contractAddress: configuration.contractAddress,
    originalSupplyRaw: configuration.launchSupplyRaw.toString(),
    originalSupplyFormatted: formatCompactTokenAmount(
      configuration.launchSupplyRaw,
      configuration.token,
    ),
    currentTotalSupplyRaw: currentTotalSupplyRaw.toString(),
    currentTotalSupplyFormatted: formatCompactTokenAmount(
      currentTotalSupplyRaw,
      configuration.token,
    ),
    indexedBurnTotalRaw: indexedBurnTotalRaw.toString(),
    indexedBurnTotalFormatted: formatCompactTokenAmount(
      indexedBurnTotalRaw,
      configuration.token,
    ),
    calculatedBurnTotalRaw: calculatedBurnTotalRaw.toString(),
    calculatedBurnTotalFormatted: formatCompactTokenAmount(
      calculatedBurnTotalRaw,
      configuration.token,
    ),
    percentSupplyBurned: formatPercentBurned(
      indexedBurnTotalRaw,
      configuration.launchSupplyRaw,
    ),
    burnTransactionCount: transactions.length,
    latestBurnTimestamp: latestBurn?.timestamp ?? null,
    latestBurnAmountFormatted: latestBurn?.amountBurnedFormatted ?? null,
    lastIndexedBlock,
    generatedAt,
    indexedFromBlock,
    indexedThroughBlock,
    dataConsistent: discrepancyRaw === 0n,
    discrepancyRaw: discrepancyRaw.toString(),
    deploymentBlock: configuration.deploymentBlock,
    deploymentTimestamp: configuration.deploymentTimestamp,
  };
}

/**
 * Pure snapshot transformation. Provider output, time, and protocol settings
 * are all explicit inputs, allowing deterministic and fixture-only tests.
 */
export function createBurnSnapshot({
  configuration,
  generatedAt,
  rawLogs,
}: CreateBurnSnapshotInput): BurnSnapshot {
  assertSnapshotConfiguration(configuration);
  assertGeneratedAt(generatedAt);
  const normalizedRawLogs = normalizeRawBurnLogs(rawLogs);
  if (normalizedRawLogs.indexedThroughBlock < configuration.deploymentBlock) {
    throw new Error(
      'Indexed-through block cannot precede the configured deployment block.',
    );
  }
  if (normalizedRawLogs.indexedFromBlock < configuration.deploymentBlock) {
    throw new Error(
      'Indexed-from block cannot precede the configured deployment block.',
    );
  }
  for (const log of normalizedRawLogs.logs) {
    if (
      log.blockNumber < normalizedRawLogs.indexedFromBlock ||
      log.blockNumber > normalizedRawLogs.indexedThroughBlock
    ) {
      throw new Error(
        `Burn log ${log.transactionHash} is outside the configured snapshot range.`,
      );
    }
  }
  const burns = buildBurnTransactions({
    configuration,
    logs: normalizedRawLogs.logs,
  });
  const lastIndexedBlock =
    burns.at(-1)?.blockNumber ?? configuration.deploymentBlock;

  return {
    burns,
    executionId: normalizedRawLogs.executionId,
    generatedAt,
    summary: calculateBurnSummary({
      configuration,
      currentTotalSupplyRaw: normalizedRawLogs.currentTotalSupplyRaw,
      generatedAt,
      indexedFromBlock: normalizedRawLogs.indexedFromBlock,
      indexedThroughBlock: normalizedRawLogs.indexedThroughBlock,
      lastIndexedBlock,
      transactions: burns,
    }),
  };
}
