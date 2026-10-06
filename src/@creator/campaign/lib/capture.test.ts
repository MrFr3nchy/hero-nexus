import { describe, expect, it } from 'vitest';

import {
  CAPTURE_SPECS,
  captureWords,
  describeCapture,
  parseCapture,
  specFor,
} from './capture';

describe('parseCapture', () => {
  it('ignores anything that does not begin with +', () => {
    expect(parseCapture('quest The miller')).toBeNull();
    expect(parseCapture('')).toBeNull();
    expect(parseCapture('+')).toBeNull();
    expect(parseCapture('+ quest')).toBeNull();
    expect(parseCapture('+ dragon Smaug')).toBeNull();
  });

  it('reads a kind and a title', () => {
    const c = parseCapture("+ quest The miller's daughter");
    expect(c?.spec.kind).toBe('quest');
    expect(c?.title).toBe("The miller's daughter");
    expect(c?.tail).toBe('');
    expect(c?.number).toBeNull();
  });

  it('accepts every word for a kind, in any case', () => {
    expect(parseCapture('+ Thread a')?.spec.kind).toBe('quest');
    expect(parseCapture('+NPC Quill')?.spec.kind).toBe('npc');
    expect(parseCapture('+ monster Ghoul')?.spec.kind).toBe('creature');
    expect(parseCapture('+ item Rope')?.spec.kind).toBe('loot');
    expect(parseCapture('+ relic Crown')?.spec.kind).toBe('item');
  });

  it('splits the tail at the first comma', () => {
    const c = parseCapture('+ npc Quill, keeper, of the chapel');
    expect(c?.title).toBe('Quill');
    expect(c?.tail).toBe('keeper, of the chapel');
  });

  it('reads a number only for the kinds that want one', () => {
    expect(parseCapture('+ clock The tide takes the crypt, 6')?.number).toBe(6);
    expect(parseCapture('+ loot Rope, 3')?.number).toBe(3);
    const npc = parseCapture('+ npc Ambrose Quill, 3rd of his name');
    expect(npc?.number).toBeNull();
    expect(npc?.tail).toBe('3rd of his name');
  });

  it('keeps a leading comma in the title rather than losing the title', () => {
    const c = parseCapture('+ quest , nothing before');
    expect(c?.title).toBe(', nothing before');
    expect(c?.tail).toBe('');
  });
});

describe('describeCapture', () => {
  const read = (line: string) => describeCapture(parseCapture(line)!);

  it('says what each tail means', () => {
    expect(read('+ clock The tide, 4')).toBe('a clock — The tide, 4 segments');
    expect(read('+ clock The tide, soon')).toBe(
      'a clock — The tide, 6 segments'
    );
    expect(read('+ loot Rope, 2')).toBe('a piece of loot — Rope, 2 of them');
    expect(read('+ session Bells, 2026-10-02')).toBe(
      'a session — Bells, on 2026-10-02'
    );
    expect(read('+ npc Quill, keeper')).toBe('an NPC — Quill — keeper');
    expect(read('+ quest The mill')).toBe('a quest — The mill');
  });
});

describe('specFor / captureWords', () => {
  it('finds a spec by any of its words', () => {
    expect(specFor('+Place')?.kind).toBe('location');
    expect(specFor('nothing')).toBeNull();
  });

  it('lists one canonical word per kind, and no word reaches two kinds', () => {
    expect(captureWords()).toEqual(CAPTURE_SPECS.map(s => s.words[0]));
    const words = CAPTURE_SPECS.flatMap(s => s.words);
    expect(new Set(words).size).toBe(words.length);
  });
});
