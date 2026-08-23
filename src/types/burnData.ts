/** One normalized AJNA burn event returned by the source provider. */
export interface BurnLog {
  amountBurnedRaw: bigint;
  blockNumber: number;
  logIndex: number;
  timestamp: number;
  transactionHash: string;
}

/** Everything the snapshot transformation needs from its source provider. */
export interface BurnData {
  currentTotalSupplyRaw: bigint;
  indexedThroughBlock: number;
  logs: readonly BurnLog[];
}
