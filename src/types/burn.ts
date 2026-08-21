export interface BurnTransaction {
  transactionHash: `0x${string}`;
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
  contractAddress: `0x${string}`;
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
  dataConsistent: boolean;
  discrepancyRaw: string;
  deploymentBlock: number;
  deploymentTimestamp: number;
}

export interface BurnLogRecord {
  transactionHash: `0x${string}`;
  logIndex: number;
  blockNumber: number;
  amountBurnedRaw: bigint;
}
