import type { RawBurnLogs } from '../types/burn.js';

/**
 * Source-neutral ingestion port. A GraphQL, JSON-RPC, REST, or fixture-backed
 * implementation can provide the same canonical event data to the pipeline.
 */
export interface BurnLogProvider {
  fetchRawLogs(): Promise<RawBurnLogs>;
}
