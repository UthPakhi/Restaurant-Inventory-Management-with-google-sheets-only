/**
 * Utility functions for string normalization and fuzzy matching.
 */

/**
 * Standard normalization: lowercase, trim, collapse multiple spaces into one.
 */
export const normalize = (s: string) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Aggressive normalization: alphanumeric only, lowercase.
 * Useful for matching when punctuation or spacing varies significantly.
 */
export const superNormalize = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Checks if two strings match using both standard and aggressive normalization.
 */
export const fuzzyMatch = (s1: string, s2: string): boolean => {
    if (normalize(s1) === normalize(s2)) return true;
    if (superNormalize(s1) === superNormalize(s2)) return true;
    return false;
};
