function normalizeKeyword(input: string): string {
  return input
    .toLowerCase()
    .replace(/geforce|radeon|intel|amd|nvidia|apple/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getSearchScore(query: string, tokens: string[]): number {
  if (!query) {
    return 0;
  }

  let score = 0;
  for (const token of tokens) {
    if (token === query) {
      score += 100;
    } else if (token.startsWith(query)) {
      score += 60;
    } else if (token.includes(query)) {
      score += 30;
    }
  }

  return score;
}

export function searchByKeyword<T extends { model: string; aliases: string[] }>(
  items: T[],
  input: string,
  limit = 6,
): T[] {
  const query = normalizeKeyword(input);
  if (!query) {
    return items.slice(0, limit);
  }

  return [...items]
    .map((item) => {
      const tokens = [item.model, ...item.aliases].map(normalizeKeyword);
      return {
        item,
        score: getSearchScore(query, tokens),
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((entry) => entry.item);
}
