'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';

import { saveCharacterAction } from '../actions';
import {
  characterSheetSchema,
  makeEmptySheet,
  type CharacterSheet,
} from '../schema';
import {
  AbilityScoresSection,
  CombatSection,
  CurrencySection,
  DetailsSection,
  EquipmentSection,
  IdentitySection,
  ProficienciesSection,
  type ReferenceOptions,
  SkillsSection,
  SpellcastingSection,
} from './sections';

interface CharacterFormProps {
  reference: ReferenceOptions;
  characterId?: string;
  initialSheet?: CharacterSheet;
}

export function CharacterForm({
  reference,
  characterId,
  initialSheet,
}: CharacterFormProps) {
  const router = useRouter();
  const [banner, setBanner] = useState<{
    kind: 'error' | 'success';
    text: string;
  } | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting, isDirty },
  } = useForm<CharacterSheet>({
    resolver: zodResolver(characterSheetSchema) as Resolver<CharacterSheet>,
    defaultValues: initialSheet ?? makeEmptySheet(),
  });

  const onSubmit = handleSubmit(
    async values => {
      setBanner(null);
      const result = await saveCharacterAction(values, characterId);
      if (result.ok) {
        setBanner({ kind: 'success', text: 'Character saved.' });
        router.push('/characters');
        router.refresh();
      } else {
        setBanner({
          kind: 'error',
          text: result.error ?? 'Failed to save character.',
        });
      }
    },
    () => {
      setBanner({
        kind: 'error',
        text: 'Some fields need attention — check the highlighted inputs.',
      });
    }
  );

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {banner && (
        <div
          className={`rounded-lg border p-3 text-center text-sm ${
            banner.kind === 'error'
              ? 'border-red-600 bg-red-900/20 text-red-300'
              : 'border-green-600 bg-green-900/20 text-green-300'
          }`}
        >
          {banner.text}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <IdentitySection control={control} reference={reference} />
          <AbilityScoresSection control={control} />
          <CombatSection control={control} />
          <SkillsSection control={control} />
        </div>
        <div className="space-y-6">
          <SpellcastingSection control={control} />
          <ProficienciesSection control={control} />
          <DetailsSection control={control} />
          <EquipmentSection control={control} />
          <CurrencySection control={control} />
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-4">
        <Button
          type="button"
          variant="bordered"
          className="border-amber-600 text-amber-300"
          isDisabled={isSubmitting || !isDirty}
          onPress={() => reset(initialSheet ?? makeEmptySheet())}
        >
          Reset
        </Button>
        <Button
          type="submit"
          size="lg"
          isLoading={isSubmitting}
          className="bg-gradient-to-r from-amber-600 to-orange-600 px-8 hover:from-amber-500 hover:to-orange-500"
        >
          {characterId ? 'Save Changes' : 'Create Character'}
        </Button>
      </div>
    </form>
  );
}
