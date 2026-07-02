export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchScore(target: string, candidate: string): number {
  const targetWords = new Set(normalize(target).split(' ').filter(Boolean));
  const candidateWords = new Set(normalize(candidate).split(' ').filter(Boolean));
  if (targetWords.size === 0 || candidateWords.size === 0) return 0;
  let overlap = 0;
  for (const word of targetWords) {
    if (candidateWords.has(word)) overlap += 1;
  }
  return overlap / targetWords.size;
}

const MATCH_THRESHOLD = 0.3;

export function bestMatch<T>(target: string, options: T[], label: (option: T) => string): T | undefined {
  let best: T | undefined;
  let bestScore = 0;
  let bestWordCount = Number.POSITIVE_INFINITY;
  for (const option of options) {
    const words = normalize(label(option)).split(' ').filter(Boolean).length;
    const score = matchScore(target, label(option));
    if (score > bestScore || (score === bestScore && score > 0 && words < bestWordCount)) {
      best = option;
      bestScore = score;
      bestWordCount = words;
    }
  }
  return bestScore >= MATCH_THRESHOLD ? best : undefined;
}

export function parseMoneyToCents(text: string): number | null {
  const match = text.replace(/,/g, '').match(/\$?\s*(\d+)(?:\.(\d{1,2}))?/);
  if (!match) return null;
  const dollars = Number(match[1]);
  const cents = Number((match[2] ?? '0').padEnd(2, '0'));
  return dollars * 100 + cents;
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
