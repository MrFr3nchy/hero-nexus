import Database from 'better-sqlite3';
import { join } from 'node:path';
import {
  parseClass,
  parseSpecies,
  parseBackground,
  toClassSummary,
  type RawClass,
} from './src/@creator/character/lib/srd/parse';

const db = new Database(join(process.cwd(), 'data', 'hero-nexus.db'));
const rows = db
  .prepare("select category, slug, name, data from reference_data where category in ('class','species','background')")
  .all() as { category: string; slug: string; name: string; data: string }[];

const classes = rows.filter(r => r.category === 'class').map(r => JSON.parse(r.data) as RawClass);
const bases = classes.filter(c => !c.subclass_of);

for (const base of bases) {
  const subs = classes.filter(c => c.subclass_of?.key === base.key);
  const def = parseClass(base, subs);
  const ct = def.coreTraits;
  console.log(
    `${def.name.padEnd(10)} d${def.hitDie} ${def.casterType.padEnd(5)} ` +
      `save=${ct.savingThrows.join('/')} prim=${ct.primaryAbilities.join('/')} ` +
      `skills=${ct.skillChoice?.count}of${ct.skillChoice?.options.length} ` +
      `equip=${ct.equipment.map(e => `${e.label}:${e.gp}gp`).join(',')} ` +
      `sub@${def.subclassLevel}[${def.subclasses.map(s => s.name).join('|')}] ` +
      `asi=${def.asiLevels.join(',')} slots=${Object.keys(def.spellSlots).length} cols=${def.tableColumns.map(c => c.name).join('/')}`
  );
  if (def.name === 'Wizard') {
    console.log('  wizard L5 slots:', Object.entries(def.spellSlots).map(([lvl, by]) => `${lvl}:${by[5] ?? 0}`).join(' '));
    console.log('  summary blurb:', JSON.stringify(toClassSummary(def).blurb).slice(0, 120));
    console.log('  L1-3 features:', def.features.filter(f => f.levels.some(l => l <= 3)).map(f => `${f.levels.join('/')}=${f.name}`).join(', '));
  }
}

console.log('\n--- species ---');
for (const r of rows.filter(r => r.category === 'species')) {
  const s = parseSpecies(JSON.parse(r.data));
  console.log(
    `${s.name.padEnd(11)} sizes=${s.sizes.join('/')} speed=${s.speed} skillChoice=${s.grantsSkillChoice} traits=${s.traits.length}`
  );
  for (const t of s.traits.filter(t => t.options.length)) {
    console.log(`    choice ${t.name}: ${t.options.map(o => o.label).join(', ')}`);
  }
}

console.log('\n--- backgrounds ---');
for (const r of rows.filter(r => r.category === 'background')) {
  const b = parseBackground(JSON.parse(r.data));
  console.log(
    `${b.name.padEnd(9)} abil=${b.abilityOptions.join('/')} skills=${b.skills.join('/')} tool="${b.tool}" feat="${b.feat}" equip=${b.equipment.map(e => `${e.label}(${e.gp}gp)`).join(',')}`
  );
}
