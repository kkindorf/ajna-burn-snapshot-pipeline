export type HexAddress = `0x${string}`;
export type TransactionHash = `0x${string}`;

export interface TokenMetadata {
  decimals: number;
  symbol: string;
}

export interface BurnSnapshotConfiguration {
  chainId: number;
  contractAddress: HexAddress;
  deploymentBlock: number;
  deploymentTimestamp: number;
  launchSupplyRaw: bigint;
  token: TokenMetadata;
  transactionUrlForHash: (transactionHash: TransactionHash) => string;
}

/**
 * Canonical, source-neutral burn event data returned by a provider.
 * Amounts remain bigint until the snapshot formatter creates JSON values.
 */
export interface BurnLogRecord {
  transactionHash: TransactionHash;
  logIndex: number;
  blockNumber: number;
  timestamp: number;
  amountBurnedRaw: bigint;
}

/**
 * The boundary between an ingestion provider and the snapshot formatter.
 */
export interface RawBurnLogs {
  currentTotalSupplyRaw: bigint;
  executionId: string;
  headBlock: number;
  indexedFromBlock: number;
  indexedThroughBlock: number;
  logs: readonly BurnLogRecord[];
  source: string;
}

export interface BurnTransaction {
  transactionHash: TransactionHash;
  blockNumber: number;
  timestamp: number;
  date: string;
  amountBurnedRaw: string;
  amountBurnedFormatted: string;
  cumulativeBurnedRaw: string;
  cumulativeBurnedFormatted: string;
  remainingSupplyRaw: string;
  remainingSupplyFormatted: string;
  etherscanUrl: string;
}

export interface BurnSummary {
  chainId: number;
  contractAddress: HexAddress;
  originalSupplyRaw: string;
  originalSupplyFormatted: string;
  currentTotalSupplyRaw: string;
  currentTotalSupplyFormatted: string;
  indexedBurnTotalRaw: string;
  indexedBurnTotalFormatted: string;
  calculatedBurnTotalRaw: string;
  calculatedBurnTotalFormatted: string;
  percentSupplyBurned: string;
  burnTransactionCount: number;
  latestBurnTimestamp: number | null;
  latestBurnAmountFormatted: string | null;
  lastIndexedBlock: number;
  generatedAt: string;
  indexedFromBlock: number;
  indexedThroughBlock: number;
  dataConsistent: boolean;
  discrepancyRaw: string;
  deploymentBlock: number;
  deploymentTimestamp: number;
}

export interface BurnSnapshot {
  burns: BurnTransaction[];
  executionId: string;
  generatedAt: string;
  summary: BurnSummary;
}
