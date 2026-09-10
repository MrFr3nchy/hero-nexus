import type { Control } from 'react-hook-form';

import type { ProvenanceInput } from '../../lib/provenance';
import type { BuildLimits } from '../../lib/validate-build';
import type {
  BuildCatalog,
  ClassDef,
  ContentSource,
} from '../../lib/srd/types';
import type { CharacterBuild, CharacterSheet } from '../../schema';
import type { CustomFieldHandler } from '../sections';

/** Everything a wizard step needs. Steps are otherwise stateless. */
export interface StepProps {
  sheet: CharacterSheet;
  build: CharacterBuild;
  catalog: BuildCatalog;
  /** What the chosen campaign's table rules allow. Steps hide the rest. */
  limits: BuildLimits;
  classDef: ClassDef | null;
  loadingClass: boolean;
  control: Control<CharacterSheet>;
  patchBuild: (mutate: (build: CharacterBuild) => CharacterBuild) => void;
  /** Write a sheet field by hand and mark it as the player's, not the build's. */
  setOverride: (path: string, value: unknown) => void;
  setLevel: (level: number) => void;
  chooseClass: (key: string, name: string, source: ContentSource) => void;
  chooseSpecies: (key: string, name: string) => void;
  chooseBackground: (key: string, name: string) => void;
  log: (input: ProvenanceInput) => void;
  onCustomField: CustomFieldHandler;
  /**
   * Open the Forge over the build. The wizard owns the drawer and the catalog
   * reload behind it, so a step only has to say which kind it wants.
   */
  forge: (kind: ForgeKind) => void;
}

/** The three picks a step can send to the Forge without leaving the build. */
export type ForgeKind = 'class' | 'species' | 'background';

/**
 * A choice carried in on the URL — `/creator/character?class=…` from the
 * "start a hero with this" button on a compendium shelf. The key is a catalog
 * key: an SRD slug, or a homebrew id.
 */
export interface InitialPick {
  kind: ForgeKind;
  key: string;
}
