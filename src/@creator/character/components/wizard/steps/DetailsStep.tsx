'use client';

import { Input, Textarea } from '@heroui/react';

import { Marginalia } from '@/@shared/components/ui';

import { StepHeading } from '../parts';
import type { StepProps } from '../types';

/** The half of a character no rule decides. */
export function DetailsStep({ sheet, catalog, setOverride }: StepProps) {
  const field = (
    label: string,
    path: string,
    value: string,
    rows: number,
    placeholder: string
  ) => (
    <div>
      <Textarea
        label={label}
        minRows={rows}
        value={value}
        placeholder={placeholder}
        onValueChange={next => setOverride(path, next)}
        classNames={{ inputWrapper: 'bg-surface-2 border-line' }}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <StepHeading
        title="Who are they?"
        lede="None of this is mechanical, and all of it is what the table remembers."
        aside={
          <Marginalia dash>the bit your DM will actually quote back</Marginalia>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Alignment"
          list="alignment-options"
          value={sheet.identity.alignment}
          onValueChange={value => setOverride('identity.alignment', value)}
          classNames={{ inputWrapper: 'bg-surface-2 border-line' }}
        />
        <datalist id="alignment-options">
          {catalog.alignments.map(name => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <Input
          label="Experience points"
          type="number"
          min={0}
          value={String(sheet.identity.xp)}
          onValueChange={value => setOverride('identity.xp', Number(value) || 0)}
          classNames={{ inputWrapper: 'bg-surface-2 border-line' }}
        />
      </div>

      {field(
        'Appearance',
        'details.appearance',
        sheet.details.appearance,
        3,
        'What someone notices first.'
      )}
      {field(
        'Personality',
        'details.personality',
        sheet.details.personality,
        3,
        'Ideals, bonds, flaws — or just how they behave in a tavern.'
      )}
      {field(
        'Backstory',
        'details.backstory',
        sheet.details.backstory,
        6,
        'Where they come from and why they left.'
      )}
    </div>
  );
}
