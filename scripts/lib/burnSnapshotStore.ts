import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BurnSummary, BurnTransaction } from '../../src/types/burn.js';

export interface BurnSnapshotPayload {
  summary: BurnSummary;
  burns: BurnTransaction[];
}

const dataDir = join(process.cwd(), 'data');
const summaryPath = join(dataDir, 'summary.json');
const burnsPath = join(dataDir, 'burns.json');

export async function writeBurnSnapshotToDisk(
  snapshot: BurnSnapshotPayload,
): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await Promise.all([
    writeFile(
      summaryPath,
      `${JSON.stringify(snapshot.summary, null, 2)}\n`,
      'utf8',
    ),
    writeFile(
      burnsPath,
      `${JSON.stringify(snapshot.burns, null, 2)}\n`,
      'utf8',
    ),
  ]);
}
