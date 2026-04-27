import { customAlphabet } from 'nanoid';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const ID_LENGTH = 21;
const nano = customAlphabet(ALPHABET, ID_LENGTH);

/**
 * Generates an application-level public ID of the form `${prefix}_${nanoid21}`
 * using a lowercase alphanumeric alphabet. Suitable for DNS-safe contexts.
 *
 * Prefix registry lives in managed/docs/llm-context/CONVENTIONS.md (ID Prefix
 * Registry section). Callers must pass an explicit prefix (e.g. 'ten', 'usr').
 */
export function generateId(prefix: string): string {
  if (!prefix) {
    throw new Error('generateId: prefix is required');
  }
  return `${prefix}_${nano()}`;
}
