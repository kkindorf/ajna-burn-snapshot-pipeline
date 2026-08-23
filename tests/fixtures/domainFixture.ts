import type {
  BurnLogRecord,
  RawBurnLogs,
  TransactionHash,
} from '../../src/types/burn.js';
import {
  requireArray,
  requireInteger,
  requireProperty,
  requireRecord,
  requireString,
} from './loadJsonFixture.js';

const TRANSACTION_HASH_PATTERN = /^0x[\da-f]{64}$/i;

function isTransactionHash(value: string): value is TransactionHash {
  return TRANSACTION_HASH_PATTERN.test(value);
}

function requireTransactionHash(
  value: unknown,
  label: string,
): TransactionHash {
  const transactionHash = requireString(value, label).toLowerCase();
  if (!isTransactionHash(transactionHash)) {
    throw new Error(`Fixture ${label} must be a transaction hash.`);
  }

  return transactionHash;
}

function parseBurnLogFixture(value: unknown, label: string): BurnLogRecord {
  const record = requireRecord(value, label);
  const amountBurnedRaw = BigInt(
    requireString(
      requireProperty(record, 'amountBurnedRaw', label),
      `${label}.amountBurnedRaw`,
    ),
  );

  return {
    amountBurnedRaw,
    blockNumber: requireInteger(
      requireProperty(record, 'blockNumber', label),
      `${label}.blockNumber`,
    ),
    logIndex: requireInteger(
      requireProperty(record, 'logIndex', label),
      `${label}.logIndex`,
    ),
    timestamp: requireInteger(
      requireProperty(record, 'timestamp', label),
      `${label}.timestamp`,
    ),
    transactionHash: requireTransactionHash(
      requireProperty(record, 'transactionHash', label),
      `${label}.transactionHash`,
    ),
  };
}

/** Converts JSON-safe fixture values into the bigint domain contract. */
export function parseRawBurnLogsFixture(value: unknown): RawBurnLogs {
  const record = requireRecord(value, 'raw burn logs');
  const logs = requireArray(
    requireProperty(record, 'logs', 'raw burn logs'),
    'raw burn logs.logs',
  ).map((log, index) =>
    parseBurnLogFixture(log, `raw burn logs.logs[${index}]`),
  );

  return {
    currentTotalSupplyRaw: BigInt(
      requireString(
        requireProperty(record, 'currentTotalSupplyRaw', 'raw burn logs'),
        'raw burn logs.currentTotalSupplyRaw',
      ),
    ),
    executionId: requireString(
      requireProperty(record, 'executionId', 'raw burn logs'),
      'raw burn logs.executionId',
    ),
    headBlock: requireInteger(
      requireProperty(record, 'headBlock', 'raw burn logs'),
      'raw burn logs.headBlock',
    ),
    indexedThroughBlock: requireInteger(
      requireProperty(record, 'indexedThroughBlock', 'raw burn logs'),
      'raw burn logs.indexedThroughBlock',
    ),
    logs,
    source: requireString(
      requireProperty(record, 'source', 'raw burn logs'),
      'raw burn logs.source',
    ),
  };
}
