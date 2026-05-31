import { describe, it, expect } from 'vitest';
import { buildSegmentPrompt, parseSegments } from './segment.js';

describe('buildSegmentPrompt', () => {
  it('embeds the trimmed prose and asks for one-per-line output', () => {
    const p = buildSegmentPrompt('  hello world  ');
    expect(p).toContain('one thought per line');
    expect(p).toContain('hello world');
    expect(p).not.toContain('  hello world  ');
  });
});

describe('parseSegments', () => {
  it('splits lines and drops blanks', () => {
    expect(parseSegments('a\n\nb\n  \nc')).toEqual(['a', 'b', 'c']);
  });

  it('strips leading bullets and numbering the model may add', () => {
    expect(parseSegments('1. first\n2) second\n- third\n• fourth')).toEqual([
      'first',
      'second',
      'third',
      'fourth',
    ]);
  });

  it('returns an empty list for empty output', () => {
    expect(parseSegments('   \n  ')).toEqual([]);
  });
});
