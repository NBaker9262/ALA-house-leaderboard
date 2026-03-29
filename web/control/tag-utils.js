/**
 * Tag Utilities: Fuzzy matching, normalization, suggestion engine
 *
 * Handles:
 * - Normalizing tag names for comparison (lowercase, remove punctuation/spaces)
 * - Fuzzy matching despite typos, capitalization, spacing
 * - Ranking suggestions by similarity + usage
 * - Preventing duplicate tags with different spellings
 */

/**
 * Normalize tag for comparison: lowercase, remove special chars, collapse spaces
 * Example: "Girls Varsity Basketball" → "girlsvaritybasketball"
 */
function normalizeTag(tag) {
  if (!tag) return "";
  return tag
    .toLowerCase()
    .replace(/[^\w\s]/g, "") // Remove special characters
    .replace(/\s+/g, "")     // Remove spaces
    .trim();
}

/**
 * Levenshtein distance: count minimum edits to transform one string to another
 * Used to measure similarity between two normalized tags
 */
function levenshteinDistance(a, b) {
  const matrix = Array(b.length + 1)
    .fill(null)
    .map(() => Array(a.length + 1).fill(0));

  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,      // deletion
        matrix[j - 1][i] + 1,      // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Calculate fuzzy match score (0-100, higher = better match)
 * Considers: normalized string similarity, partial match, prefix match
 */
function fuzzyMatchScore(input, tagName, maxDistance = 3) {
  const normalizedInput = normalizeTag(input);
  const normalizedTag = normalizeTag(tagName);

  // Exact match
  if (normalizedInput === normalizedTag) return 100;

  // Prefix match (e.g., "bask" matches "basketball")
  if (normalizedTag.startsWith(normalizedInput)) {
    return 90 - (normalizedInput.length - normalizedTag.length) * 2;
  }

  // Levenshtein distance
  const distance = levenshteinDistance(normalizedInput, normalizedTag);
  if (distance > maxDistance) return 0;

  // Score based on distance: max distance = 20 points
  return Math.max(0, 70 - distance * 10);
}

/**
 * Find tags matching input query from a list
 * Returns sorted array by match score (best matches first)
 * Also considers usage count (more used = higher rank)
 */
function findMatchingTags(input, tags, options = {}) {
  const { maxResults = 5, minScore = 40, maxDistance = 3 } = options;

  if (!input || input.trim().length === 0) {
    // Return top used tags if no input
    return tags
      .sort((a, b) => (b.usage?.count || 0) - (a.usage?.count || 0))
      .slice(0, maxResults);
  }

  const matches = tags
    .map((tag) => ({
      ...tag,
      score: fuzzyMatchScore(input, tag.name, maxDistance),
      usageBoost: Math.min((tag.usage?.count || 0) * 2, 10), // Max 10 point boost
    }))
    .filter((m) => m.score + m.usageBoost >= minScore)
    .sort((a, b) => {
      const scoreA = a.score + a.usageBoost;
      const scoreB = b.score + b.usageBoost;
      return scoreB - scoreA; // Higher score first
    })
    .slice(0, maxResults);

  return matches;
}

/**
 * Check if new tag is too similar to existing ones
 * Returns { isDuplicate: boolean, similar: Tag | null }
 */
function checkDuplicateTag(newTagName, existingTags, threshold = 80) {
  const normalizedNew = normalizeTag(newTagName);

  for (const tag of existingTags) {
    const score = fuzzyMatchScore(newTagName, tag.name, 5);
    const normalizedMatch = normalizeTag(tag.name);

    // Check both score and exact normalized match
    if (score >= threshold || normalizedNew === normalizedMatch) {
      return {
        isDuplicate: true,
        similar: tag,
        confidence: score,
      };
    }
  }

  return { isDuplicate: false, similar: null };
}

/**
 * Group tags by category for UI display
 */
function groupTagsByCategory(tags) {
  const grouped = {};
  tags.forEach((tag) => {
    const cat = tag.category || "Other";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(tag);
  });
  return grouped;
}

/**
 * Create search index for tags (for efficient filtering)
 */
function createTagSearchIndex(tags) {
  const index = {};
  tags.forEach((tag) => {
    const normalized = normalizeTag(tag.name);
    if (!index[normalized]) {
      index[normalized] = [];
    }
    index[normalized].push(tag);
  });
  return index;
}

/**
 * Extract common tag from existing reasons
 * Used to bootstrap tag catalog from historical reason entries
 */
function extractCommonTags(reasons, minFrequency = 3) {
  const tagFreq = {};
  reasons.forEach((reason) => {
    const words = reason.split(/[\s\-\/,]/);
    words.forEach((word) => {
      if (word.length > 3) {
        const normalized = normalizeTag(word);
        tagFreq[normalized] = (tagFreq[normalized] || 0) + 1;
      }
    });
  });

  return Object.entries(tagFreq)
    .filter(([, count]) => count >= minFrequency)
    .map(([tag, count]) => ({
      name: tag,
      normalized: tag,
      usage: { count },
    }))
    .sort((a, b) => b.usage.count - a.usage.count);
}

// Export for use in control.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    normalizeTag,
    levenshteinDistance,
    fuzzyMatchScore,
    findMatchingTags,
    checkDuplicateTag,
    groupTagsByCategory,
    createTagSearchIndex,
    extractCommonTags,
  };
}
