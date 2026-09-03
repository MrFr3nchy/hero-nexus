import type { Control } from 'react-hook-form';

import type { ProvenanceInput } from '../../lib/provenance';
import type { BuildCatalog, ClassDef } from '../../lib/srd/types';
import type { CharacterBuild, CharacterSheet } from '../../schema';
import type { CustomFieldHandler } from '../sections';

/** Everything a wizard step needs. Steps are otherwise stateless. */
export interface StepProps {
  sheet: CharacterSheet;
  build: CharacterBuild;
  catalog: BuildCatalog;
  classDef: ClassDef | null;
  loadingClass: boolean;
  control: Control<CharacterSheet>;
  patchBuild: (mutate: (build: CharacterBuild) => CharacterBuild) => void;
  /** Write a sheet field by hand and mark it as the player's, not the build's. */
  setOverride: (path: string, value: unknown) => void;
  setLevel: (level: number) => void;
  chooseClass: (key: string, name: string) => void;
  log: (input: ProvenanceInput) => void;
  onCustomField: CustomFieldHandler;
}
