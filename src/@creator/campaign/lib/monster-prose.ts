/**
 * What a monster's action says it does, read off its prose.
 *
 * Stat blocks are written for people: "Melee Attack Roll: +9, reach 10 ft.
 * Hit: 12 (2d6 + 5) Bludgeoning damage." The bonus and the dice are in there
 * and this pulls them out — the 2024 and 2014 phrasings both — so a DM has a
 * button rather than a calculator. When a line has neither, it is prose and
 * stays prose.
 */
export function rollsIn(desc: string): {
  hit: string | null;
  damage: string[];
} {
  const hitMatch =
    /(?:Attack Roll|to hit)[^+\-\d]*([+\-]\s?\d+)/i.exec(desc) ??
    /([+\-]\s?\d+)\s+to hit/i.exec(desc);
  const hit = hitMatch ? `1d20${hitMatch[1].replace(/\s/g, '')}` : null;
  const damage: string[] = [];
  const re = /\((\d+d\d+(?:\s?[+\-]\s?\d+)?)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(desc))) damage.push(m[1].replace(/\s/g, ''));
  return { hit, damage };
}
