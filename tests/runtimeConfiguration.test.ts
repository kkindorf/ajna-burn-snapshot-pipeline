import { createAjnaBurnPipelineConfiguration } from '../src/config/ajna.js';
import { createBurnPipelineRuntimeConfiguration } from '../src/config/runtime.js';

const PIPELINE_CONFIGURATION = createAjnaBurnPipelineConfiguration();
const SOURCE_CONFIGURATION = PIPELINE_CONFIGURATION.etherscan;

describe('burn pipeline runtime configuration', () => {
  it('uses the supply-reduction burn-series baseline rather than deployment', () => {
    expect(SOURCE_CONFIGURATION.historyStartBlock).toBe(18_078_582);
    expect(SOURCE_CONFIGURATION.historyStartBlock).toBeGreaterThan(
      PIPELINE_CONFIGURATION.snapshot.deploymentBlock,
    );
  });

  it('fails immediately when the Etherscan API key is missing or blank', () => {
    const missingKey: NodeJS.ProcessEnv = {};
    const blankKey: NodeJS.ProcessEnv = { ETHERSCAN_API_KEY: '   ' };

    expect(() =>
      createBurnPipelineRuntimeConfiguration(missingKey, SOURCE_CONFIGURATION),
    ).toThrow('Missing required environment variable: ETHERSCAN_API_KEY');
    expect(() =>
      createBurnPipelineRuntimeConfiguration(blankKey, SOURCE_CONFIGURATION),
    ).toThrow('Missing required environment variable: ETHERSCAN_API_KEY');
  });

  for (const endpoint of [
    'http://etherscan.fixture.test/v2/api',
    'https://user:password@etherscan.fixture.test/v2/api',
    'https://etherscan.fixture.test/v2/api?apikey=leaked',
  ]) {
    it(`rejects an unsafe Etherscan endpoint: ${endpoint}`, () => {
      const environment: NodeJS.ProcessEnv = {
        ETHERSCAN_API_BASE_URL: endpoint,
        ETHERSCAN_API_KEY: 'fixture-api-key',
      };

      expect(() =>
        createBurnPipelineRuntimeConfiguration(
          environment,
          SOURCE_CONFIGURATION,
        ),
      ).toThrow('ETHERSCAN_API_BASE_URL');
    });
  }

  it('accepts and normalizes a valid explicit HTTPS endpoint override', () => {
    const runtime = createBurnPipelineRuntimeConfiguration(
      {
        ETHERSCAN_API_BASE_URL: 'https://api.etherscan.io/v2/api',
        ETHERSCAN_API_KEY: '  fixture-api-key  ',
      },
      SOURCE_CONFIGURATION,
    );

    expect(runtime).toEqual({
      etherscanApiBaseUrl: 'https://api.etherscan.io/v2/api',
      etherscanApiKey: 'fixture-api-key',
    });
  });
});
