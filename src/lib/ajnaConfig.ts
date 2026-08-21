export const AJNA_CONFIG = {
  chainId: 1,
  tokenSymbol: 'AJNA',
  tokenDecimals: 18,
  contractAddress: '0x9a96ec9b57fb64fbc60b423d1f4da7691bd35079' as const,
  etherscanBaseUrl: 'https://etherscan.io',
  deploymentBlock: 15478977,
  deploymentTimestamp: 1662397146,
  // Start the visible burn series on September 6, 2023.
  chartHistoryStartBlock: 18078582,
  // AJNA protocol-launch / max-supply baseline used for burn math.
  launchSupplyRaw: '1000000000000000000000000000',
} as const;

export const AJNA_ZERO_ADDRESS =
  '0x0000000000000000000000000000000000000000' as const;

export function buildEtherscanTxUrl(transactionHash: string): string {
  return `${AJNA_CONFIG.etherscanBaseUrl}/tx/${transactionHash}`;
}
