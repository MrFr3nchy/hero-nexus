import { describe, expect, it } from 'vitest';

import {
  CAPTURE_SPECS,
  captureWords,
  describeCapture,
  parseCapture,
  parseRollCapture,
  resolveCapturePlace,
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

describe('random tables in the box', () => {
  it('reads the two-word kind whole, and keeps commas in the title', () => {
    const c = parseCapture('+ random table Tavern names, coastal');
    expect(c?.spec.kind).toBe('random-table');
    expect(c?.title).toBe('Tavern names, coastal');
    expect(parseCapture('+ Random-Table Weather')?.title).toBe('Weather');
  });

  it('never reads "table" or "random" alone as a kind', () => {
    expect(parseCapture('+ table Tavern names')).toBeNull();
    expect(parseCapture('+ random Tavern names')).toBeNull();
    expect(parseCapture('+ random table')).toBeNull();
  });

  it('rolls with "roll <name>" and leaves everything else to search', () => {
    expect(parseRollCapture('roll Tavern names')).toBe('Tavern names');
    expect(parseRollCapture('  ROLL   Weather ')).toBe('Weather');
    expect(parseRollCapture('rolling hills')).toBeNull();
    expect(parseRollCapture('roll')).toBeNull();
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

describe('where a capture lands', () => {
  it('reads a trailing @Place before the comma tail', () => {
    const c = parseCapture('+ clock The tide, 6 @Gullrow Docks');
    expect(c).toMatchObject({
      title: 'The tide',
      number: 6,
      at: 'Gullrow Docks',
    });
    expect(
      parseCapture('+ quest Find the bell @Old Chapel Hill')
    ).toMatchObject({
      title: 'Find the bell',
      at: 'Old Chapel Hill',
      tail: '',
    });
    expect(
      parseCapture('+ npc Quill, keeper of lamps @ Lantern Ward')
    ).toMatchObject({
      title: 'Quill',
      tail: 'keeper of lamps',
      at: 'Lantern Ward',
    });
  });

  it('keeps an @ inside a word, or with nothing after the title, as no place', () => {
    expect(parseCapture('+ quest Write to bob@inn')).toMatchObject({
      title: 'Write to bob@inn',
      at: null,
    });
    expect(parseCapture('+ quest Meet her')?.at).toBeNull();
  });

  it('reads a bare trailing @ as "somewhere, not named"', () => {
    expect(parseCapture('+ quest The bell @')).toMatchObject({
      title: 'The bell',
      at: '',
    });
  });

  it('leaves the @ in the title for a kind that cannot be somewhere', () => {
    expect(parseCapture('+ random table Names @Saltmarrow')).toMatchObject({
      title: 'Names @Saltmarrow',
      at: null,
    });
    expect(parseCapture('+ session Night one @Inn')?.at).toBeNull();
  });

  it('finds the one place by that name, and never guesses between two', () => {
    const entries = [
      { id: 'a', kind: 'location', title: 'Gullrow Docks' },
      { id: 'b', kind: 'location', title: 'The Well' },
      { id: 'c', kind: 'location', title: 'the well' },
      { id: 'd', kind: 'npc', title: 'Gullrow Docks' },
    ];
    expect(resolveCapturePlace('gullrow docks', entries).place?.id).toBe('a');
    const two = resolveCapturePlace('The Well', entries);
    expect(two.place).toBeNull();
    expect(two.candidates.map(c => c.id)).toEqual(['b', 'c']);
    expect(resolveCapturePlace('Nowhere', entries)).toEqual({
      place: null,
      candidates: [],
    });
  });
});
