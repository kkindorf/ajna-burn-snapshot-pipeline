import type {
  BurnSnapshotConfiguration,
  HexAddress,
  TransactionHash,
} from '../types/burn.js';

export interface EtherscanBurnSourceConfiguration {
  confirmationBlocks: number;
  defaultApiBaseUrl: string;
  historyStartBlock: number;
  maxBlockRange: number;
  maxPagesPerRange: number;
  pageSize: number;
  requestPolicy: {
    maxAttempts: number;
    maxRetryDelayMs: number;
    minimumRequestIntervalMs: number;
    requestTimeoutMs: number;
    retryBaseDelayMs: number;
  };
  zeroAddress: HexAddress;
}

export interface AjnaBurnPipelineConfiguration {
  etherscan: EtherscanBurnSourceConfiguration;
  snapshot: BurnSnapshotConfiguration;
}

/**
 * Creates the complete static configuration for this standalone pipeline.
 * Runtime values such as API keys are intentionally supplied by the entrypoint.
 */
export function createAjnaBurnPipelineConfiguration(): AjnaBurnPipelineConfiguration {
  const explorerBaseUrl = 'https://etherscan.io';

  return {
    etherscan: {
      // Index the full token lifetime so totalSupply reconciliation is global.
      confirmationBlocks: 64,
      defaultApiBaseUrl: 'https://api.etherscan.io/v2/api',
      historyStartBlock: 15_478_977,
      // Keep individual getLogs ranges small enough to avoid explorer timeouts.
      maxBlockRange: 250_000,
      maxPagesPerRange: 1_000,
      pageSize: 1_000,
      // Etherscan's Free tier permits three requests per second; stay below it.
      requestPolicy: {
        maxAttempts: 4,
        maxRetryDelayMs: 30_000,
        minimumRequestIntervalMs: 350,
        requestTimeoutMs: 15_000,
        retryBaseDelayMs: 1_000,
      },
      zeroAddress: '0x0000000000000000000000000000000000000000',
    },
    snapshot: {
      chainId: 1,
      contractAddress: '0x9a96ec9b57fb64fbc60b423d1f4da7691bd35079',
      deploymentBlock: 15_478_977,
      deploymentTimestamp: 1_662_397_146,
      launchSupplyRaw: 1_000_000_000n * 10n ** 18n,
      token: {
        decimals: 18,
        symbol: 'AJNA',
      },
      transactionUrlForHash(transactionHash: TransactionHash): string {
        return new URL(`/tx/${transactionHash}`, explorerBaseUrl).toString();
      },
    },
  };
}
