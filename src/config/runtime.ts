import type { EtherscanBurnSourceConfiguration } from './ajna.js';

export interface BurnPipelineRuntimeConfiguration {
  etherscanApiBaseUrl: string;
  etherscanApiKey: string;
}

function requiredEnvironmentValue(
  environment: NodeJS.ProcessEnv,
  name: string,
): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}.`);
  }

  return value;
}

function optionalEnvironmentValue(
  environment: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  const value = environment[name]?.trim();
  return value || undefined;
}

function validateEtherscanApiBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('ETHERSCAN_API_BASE_URL must be a valid HTTPS URL.');
  }

  if (url.protocol !== 'https:') {
    throw new Error('ETHERSCAN_API_BASE_URL must use HTTPS.');
  }

  if (url.username || url.password) {
    throw new Error(
      'ETHERSCAN_API_BASE_URL must not contain embedded credentials.',
    );
  }

  if (url.searchParams.has('apikey')) {
    throw new Error(
      'ETHERSCAN_API_BASE_URL must not include an apikey query parameter.',
    );
  }

  if (
    url.hostname !== 'api.etherscan.io' ||
    url.port ||
    url.pathname !== '/v2/api' ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'ETHERSCAN_API_BASE_URL must be the canonical Etherscan V2 API endpoint.',
    );
  }

  return url.toString();
}

/**
 * Validates runtime-only configuration at the CLI boundary. Static protocol
 * configuration remains separate so the module can be embedded in a monorepo.
 */
export function createBurnPipelineRuntimeConfiguration(
  environment: NodeJS.ProcessEnv,
  source: EtherscanBurnSourceConfiguration,
): BurnPipelineRuntimeConfiguration {
  const etherscanApiBaseUrl = validateEtherscanApiBaseUrl(
    optionalEnvironmentValue(environment, 'ETHERSCAN_API_BASE_URL') ??
      source.defaultApiBaseUrl,
  );

  return {
    etherscanApiBaseUrl,
    etherscanApiKey: requiredEnvironmentValue(environment, 'ETHERSCAN_API_KEY'),
  };
}
