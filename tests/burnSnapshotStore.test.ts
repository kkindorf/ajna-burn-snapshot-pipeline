import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  writeBurnSnapshotToDisk,
  type BurnSnapshotFileSystem,
} from '../scripts/lib/burnSnapshotStore.js';
import { createAjnaBurnPipelineConfiguration } from '../src/config/ajna.js';
import { createBurnSnapshot } from '../src/lib/format.js';
import type { BurnSnapshotConfiguration } from '../src/types/burn.js';
import { parseRawBurnLogsFixture } from './fixtures/domainFixture.js';
import { loadJsonFixture } from './fixtures/loadJsonFixture.js';

class MissingFixtureFileError extends Error {
  public readonly code = 'ENOENT';
}

async function createFixtureSnapshot() {
  const baseConfiguration = createAjnaBurnPipelineConfiguration().snapshot;
  const configuration: BurnSnapshotConfiguration = {
    ...baseConfiguration,
    deploymentBlock: 1,
    deploymentTimestamp: 1,
    launchSupplyRaw: 10n * 10n ** 18n,
  };

  return createBurnSnapshot({
    configuration,
    generatedAt: '2026-08-02T12:00:00.000Z',
    rawLogs: parseRawBurnLogsFixture(
      await loadJsonFixture('./domain/raw-burn-logs.json'),
    ),
  });
}

describe('burn snapshot store', () => {
  it('writes fixture-backed artifacts to the explicit output directory', async () => {
    const snapshot = await createFixtureSnapshot();
    const outputDirectory = await mkdtemp(
      join(tmpdir(), 'ajna-burn-snapshot-'),
    );

    try {
      await writeBurnSnapshotToDisk({
        outputDirectory,
        snapshot,
      });

      const [summary, burns] = await Promise.all([
        readFile(join(outputDirectory, 'summary.json'), 'utf8'),
        readFile(join(outputDirectory, 'burns.json'), 'utf8'),
      ]);

      expect(summary).toBe(`${JSON.stringify(snapshot.summary, null, 2)}\n`);
      expect(burns).toBe(`${JSON.stringify(snapshot.burns, null, 2)}\n`);
    } finally {
      await rm(outputDirectory, { force: true, recursive: true });
    }
  });

  it('restores both previous artifacts when the second staged promotion fails', async () => {
    const snapshot = await createFixtureSnapshot();
    const outputDirectory = '/fixture-output';
    const transactionId = 'rollback-1';
    const burnsTemporary = join(
      outputDirectory,
      `.burns.${transactionId}.tmp.json`,
    );
    const files = new Map<string, string>([
      [join(outputDirectory, 'burns.json'), 'previous burns\n'],
      [join(outputDirectory, 'summary.json'), 'previous summary\n'],
    ]);
    const fileSystem: BurnSnapshotFileSystem = {
      async access(path: string): Promise<void> {
        if (!files.has(path)) {
          throw new MissingFixtureFileError(path);
        }
      },
      async mkdir(): Promise<undefined> {
        return undefined;
      },
      async rename(oldPath: string, newPath: string): Promise<void> {
        if (oldPath === burnsTemporary) {
          throw new Error('fixture burns promotion failure');
        }

        const contents = files.get(oldPath);
        if (contents === undefined) {
          throw new MissingFixtureFileError(oldPath);
        }
        files.delete(oldPath);
        files.set(newPath, contents);
      },
      async rm(path: string): Promise<void> {
        files.delete(path);
      },
      async writeFile(path: string, data: string): Promise<void> {
        files.set(path, data);
      },
    };

    await expect(
      writeBurnSnapshotToDisk({
        fileSystem,
        outputDirectory,
        snapshot,
        transactionId,
      }),
    ).rejects.toThrow('Unable to publish burn snapshot');
    expect(files).toHaveLength(2);
    expect(files.get(join(outputDirectory, 'burns.json'))).toBe(
      'previous burns\n',
    );
    expect(files.get(join(outputDirectory, 'summary.json'))).toBe(
      'previous summary\n',
    );
  });
});
