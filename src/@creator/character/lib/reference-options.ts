import 'server-only';

import { getReference } from '@/server/reference';
import type { ReferenceOptions } from '../components/sections';

function toOptions(entries: { name: string }[]) {
  return entries
    .map(e => ({ value: e.name, label: e.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export async function loadReferenceOptions(): Promise<ReferenceOptions> {
  const [classes, species, backgrounds, alignments] = await Promise.all([
    getReference('class'),
    getReference('species'),
    getReference('background'),
    getReference('alignment'),
  ]);

  // Open5e's class/species lists mix base entries with subclasses/subspecies
  // (`data.subclass_of` / `data.is_subspecies`) — only show the base entries
  // in these top-level dropdowns.
  const baseClasses = classes.filter(
    c => !(c.data as { subclass_of?: unknown })?.subclass_of
  );
  const baseSpecies = species.filter(
    s => !(s.data as { is_subspecies?: boolean })?.is_subspecies
  );

  return {
    classes: toOptions(baseClasses),
    species: toOptions(baseSpecies),
    backgrounds: toOptions(backgrounds),
    alignments: toOptions(alignments),
  };
}
