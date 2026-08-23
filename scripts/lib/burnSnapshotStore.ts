import { randomUUID } from 'node:crypto';
import { access, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { BurnSnapshot } from '../../src/types/burn.js';

export interface BurnSnapshotFileSystem {
  access(path: string): Promise<void>;
  mkdir(
    path: string,
    options: { recursive: true },
  ): Promise<string | undefined>;
  rename(oldPath: string, newPath: string): Promise<void>;
  rm(path: string, options: { force: true }): Promise<void>;
  writeFile(path: string, data: string, encoding: 'utf8'): Promise<void>;
}

export interface BurnSnapshotWriteOptions {
  fileSystem?: BurnSnapshotFileSystem;
  outputDirectory: string;
  snapshot: Pick<BurnSnapshot, 'burns' | 'summary'>;
  transactionId?: string;
}

export interface SerializedBurnSnapshot {
  burns: string;
  summary: string;
}

interface SnapshotArtifactPaths {
  burnsBackup: string;
  burnsTarget: string;
  burnsTemporary: string;
  summaryBackup: string;
  summaryTarget: string;
  summaryTemporary: string;
}

interface PublicationState {
  burnsBackedUp: boolean;
  burnsPublished: boolean;
  summaryBackedUp: boolean;
  summaryPublished: boolean;
}

const nodeFileSystem: BurnSnapshotFileSystem = {
  access,
  mkdir,
  rename,
  rm,
  writeFile,
};

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (typeof error.code === 'string' || error.code === undefined)
  );
}

function validateOutputDirectory(outputDirectory: string): void {
  if (outputDirectory.trim().length === 0) {
    throw new Error('A non-empty snapshot output directory is required.');
  }
}

function validateTransactionId(transactionId: string): void {
  if (!/^[\da-z-]+$/i.test(transactionId)) {
    throw new Error(
      'Snapshot transaction ids may only contain letters, digits, and hyphens.',
    );
  }
}

function createArtifactPaths(
  outputDirectory: string,
  transactionId: string,
): SnapshotArtifactPaths {
  return {
    burnsBackup: join(outputDirectory, `.burns.${transactionId}.backup.json`),
    burnsTarget: join(outputDirectory, 'burns.json'),
    burnsTemporary: join(outputDirectory, `.burns.${transactionId}.tmp.json`),
    summaryBackup: join(
      outputDirectory,
      `.summary.${transactionId}.backup.json`,
    ),
    summaryTarget: join(outputDirectory, 'summary.json'),
    summaryTemporary: join(
      outputDirectory,
      `.summary.${transactionId}.tmp.json`,
    ),
  };
}

async function pathExists(
  fileSystem: BurnSnapshotFileSystem,
  path: string,
): Promise<boolean> {
  try {
    await fileSystem.access(path);
    return true;
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

async function removeIfPresent(
  fileSystem: BurnSnapshotFileSystem,
  path: string,
): Promise<void> {
  await fileSystem.rm(path, { force: true });
}

async function cleanupTemporaryArtifacts(
  fileSystem: BurnSnapshotFileSystem,
  paths: SnapshotArtifactPaths,
): Promise<void> {
  await Promise.all([
    removeIfPresent(fileSystem, paths.summaryTemporary),
    removeIfPresent(fileSystem, paths.burnsTemporary),
  ]);
}

async function cleanupBackupArtifacts(
  fileSystem: BurnSnapshotFileSystem,
  paths: SnapshotArtifactPaths,
): Promise<void> {
  await Promise.all([
    removeIfPresent(fileSystem, paths.summaryBackup),
    removeIfPresent(fileSystem, paths.burnsBackup),
  ]);
}

async function rollbackPublication(
  fileSystem: BurnSnapshotFileSystem,
  paths: SnapshotArtifactPaths,
  state: PublicationState,
): Promise<void> {
  if (state.summaryPublished) {
    await removeIfPresent(fileSystem, paths.summaryTarget);
  }
  if (state.burnsPublished) {
    await removeIfPresent(fileSystem, paths.burnsTarget);
  }
  if (state.summaryBackedUp) {
    await fileSystem.rename(paths.summaryBackup, paths.summaryTarget);
  }
  if (state.burnsBackedUp) {
    await fileSystem.rename(paths.burnsBackup, paths.burnsTarget);
  }
}

async function publishArtifacts(
  fileSystem: BurnSnapshotFileSystem,
  paths: SnapshotArtifactPaths,
): Promise<void> {
  const state: PublicationState = {
    burnsBackedUp: false,
    burnsPublished: false,
    summaryBackedUp: false,
    summaryPublished: false,
  };

  try {
    if (await pathExists(fileSystem, paths.summaryTarget)) {
      await fileSystem.rename(paths.summaryTarget, paths.summaryBackup);
      state.summaryBackedUp = true;
    }
    if (await pathExists(fileSystem, paths.burnsTarget)) {
      await fileSystem.rename(paths.burnsTarget, paths.burnsBackup);
      state.burnsBackedUp = true;
    }

    await fileSystem.rename(paths.summaryTemporary, paths.summaryTarget);
    state.summaryPublished = true;
    await fileSystem.rename(paths.burnsTemporary, paths.burnsTarget);
    state.burnsPublished = true;
  } catch (error) {
    try {
      await rollbackPublication(fileSystem, paths, state);
    } catch (rollbackError) {
      const rollbackMessage =
        rollbackError instanceof Error
          ? rollbackError.message
          : 'unknown rollback failure';
      throw new Error(
        `Unable to publish burn snapshot and rollback failed: ${rollbackMessage}`,
        { cause: error },
      );
    }

    throw new Error('Unable to publish burn snapshot.', { cause: error });
  }

  await cleanupBackupArtifacts(fileSystem, paths);
}

/**
 * Produces the exact static artifacts without depending on a working directory.
 */
export function serializeBurnSnapshot(
  snapshot: Pick<BurnSnapshot, 'burns' | 'summary'>,
): SerializedBurnSnapshot {
  return {
    burns: `${JSON.stringify(snapshot.burns, null, 2)}\n`,
    summary: `${JSON.stringify(snapshot.summary, null, 2)}\n`,
  };
}

/**
 * Stages both files before publishing either. Each rename is atomic; backups
 * restore the previous pair when the second promotion fails. A Git commit is
 * still the outer atomic boundary for the two public JSON paths.
 */
export async function writeBurnSnapshotToDisk({
  fileSystem = nodeFileSystem,
  outputDirectory,
  snapshot,
  transactionId = randomUUID(),
}: BurnSnapshotWriteOptions): Promise<void> {
  validateOutputDirectory(outputDirectory);
  validateTransactionId(transactionId);

  const serialized = serializeBurnSnapshot(snapshot);
  const paths = createArtifactPaths(outputDirectory, transactionId);

  await fileSystem.mkdir(outputDirectory, { recursive: true });

  try {
    await fileSystem.writeFile(
      paths.summaryTemporary,
      serialized.summary,
      'utf8',
    );
    await fileSystem.writeFile(paths.burnsTemporary, serialized.burns, 'utf8');
    await publishArtifacts(fileSystem, paths);
  } catch (error) {
    try {
      await cleanupTemporaryArtifacts(fileSystem, paths);
    } catch {
      // Preserve the original staging or publication failure for the caller.
    }
    throw error;
  }

  await cleanupTemporaryArtifacts(fileSystem, paths);
}
