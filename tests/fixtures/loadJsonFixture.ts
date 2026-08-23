import { readFile } from 'node:fs/promises';

export interface JsonRecord {
  readonly [key: string]: unknown;
}

export function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function loadJsonFixture(relativePath: string): Promise<unknown> {
  const contents = await readFile(
    new URL(relativePath, import.meta.url),
    'utf8',
  );
  const parsed: unknown = JSON.parse(contents);
  return parsed;
}

export function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Fixture ${label} must be an array.`);
  }

  return value;
}

export function requireInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`Fixture ${label} must be a safe integer.`);
  }

  return value;
}

export function requireProperty(
  record: JsonRecord,
  name: string,
  label: string,
): unknown {
  if (!Object.hasOwn(record, name)) {
    throw new Error(`Fixture ${label} is missing property ${name}.`);
  }

  return record[name];
}

export function requireRecord(value: unknown, label: string): JsonRecord {
  if (!isJsonRecord(value)) {
    throw new Error(`Fixture ${label} must be an object.`);
  }

  return value;
}

export function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Fixture ${label} must be a string.`);
  }

  return value;
}
