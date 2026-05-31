import { describe, it, expect } from 'vitest';
import { buildTagPrompt, parseTags } from './tags.js';

describe('buildTagPrompt', () => {
  it('asks for a comma-separated list and embeds the note', () => {
    const p = buildTagPrompt('  about gardening  ');
    expect(p).toContain('comma-separated list');
    expect(p).toContain('about gardening');
  });
});

describe('parseTags', () => {
  it('splits, lowercases, and trims', () => {
    expect(parseTags('Garden, Soil, Water')).toEqual(['garden', 'soil', 'water']);
  });

  it('strips bullets, numbering, hashes and quotes', () => {
    expect(parseTags('1. garden\n- #soil\n• "water"')).toEqual(['garden', 'soil', 'water']);
  });

  it('de-duplicates and caps the count', () => {
    expect(parseTags('a, a, b, c, d, e, f, g', 3)).toEqual(['a', 'b', 'c']);
  });

  it('drops overly long entries and blanks', () => {
    expect(parseTags(`, ok, ${'x'.repeat(40)}`)).toEqual(['ok']);
  });
});
