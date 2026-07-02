import { describe, expect, test } from 'vitest';
import { bestMatch, formatCents, matchScore, normalize, parseMoneyToCents } from './text.js';

describe('normalize', () => {
  test('lowercases and strips punctuation', () => {
    expect(normalize("McChicken® — Hot 'n Spicy!")).toBe('mcchicken hot n spicy');
  });
});

describe('matchScore / bestMatch', () => {
  test('exact name scores 1', () => {
    expect(matchScore('mcchicken', 'McChicken')).toBe(1);
  });

  test('picks the closest menu item', () => {
    const options = ['McChicken', "Hot 'n Spicy McChicken", 'McDouble', 'Big Mac'];
    expect(bestMatch('spicy mcchicken', options, (o) => o)).toBe("Hot 'n Spicy McChicken");
  });

  test('returns undefined when nothing is close', () => {
    expect(bestMatch('pad thai', ['Big Mac', 'McFlurry'], (o) => o)).toBeUndefined();
  });

  test('prefers the exact item over a longer superset on tie', () => {
    const options = ["Hot 'n Spicy McChicken", 'McChicken'];
    expect(bestMatch('mcchicken', options, (o) => o)).toBe('McChicken');
  });
});

describe('parseMoneyToCents', () => {
  test('parses "$8.42"', () => expect(parseMoneyToCents('$8.42')).toBe(842));
  test('parses "Subtotal: $12.00"', () => expect(parseMoneyToCents('Subtotal: $12.00')).toBe(1200));
  test('parses "$1,024.5" with comma and one decimal', () => expect(parseMoneyToCents('$1,024.5')).toBe(102450));
  test('returns null for no number', () => expect(parseMoneyToCents('Free')).toBeNull());
});

describe('formatCents', () => {
  test('formats 842 as $8.42', () => expect(formatCents(842)).toBe('$8.42'));
});
