/**
 * Conservative prefix policy for safe partial-prefix acceptance.
 *
 * This module encodes the rules for when a partial token (e.g., "wor")
 * can be safely treated as an alias for a folder (e.g., "work").
 */

/**
 * Minimum length for a partial prefix to be considered for routing.
 * Below this length, we reject to avoid accidental matches with common short words.
 */
const MIN_PARTIAL_LENGTH = 3;

/**
 * Determines if a partial prefix is safe to resolve to a unique alias.
 *
 * Conservative routing rules:
 * 1. Minimum Length: Prefix must be at least 3 characters.
 * 2. Unambiguity: Prefix must match exactly one alias from the provided set.
 * 3. Case-Insensitive: Matching is performed case-insensitively.
 *
 * @param prefix The potential partial prefix (e.g., "wor")
 * @param aliases List of all available full aliases (e.g., ["work", "personal"])
 * @param _separator Separator character (e.g., ":") - currently unused but kept for interface consistency
 * @returns true if the prefix is safe to use for routing
 */
export function isSafePartialPrefix(
  prefix: string,
  aliases: string[],
  _separator?: string,
): boolean {
  const normalizedPrefix = prefix.trim().toLowerCase();

  // Rule 1: Minimum length requirement
  if (normalizedPrefix.length < MIN_PARTIAL_LENGTH) {
    return false;
  }

  // Rule 2: Unambiguity requirement
  const matches = aliases.filter((alias) =>
    alias.toLowerCase().startsWith(normalizedPrefix),
  );

  return matches.length === 1;
}
