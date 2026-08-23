/** One JSON-ready burn transaction in data/burns.json. */
export interface BurnTransaction {
  transactionHash: string;
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

/** The public contents of data/summary.json. */
export interface BurnSummary {
  chainId: number;
  contractAddress: string;
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

/** Both files produced by one successful snapshot run. */
export interface BurnSnapshot {
  burns: BurnTransaction[];
  summary: BurnSummary;
}
