'use client';

import {
  Checkbox,
  CheckboxGroup,
  Input,
  NumberInput,
  Select,
  SelectItem,
  Switch,
  Textarea,
} from '@heroui/react';

import { ABILITY_METHODS } from '@/@creator/character/schema';
import {
  GREGORIAN_LIKE,
  type CalendarDef,
} from '@/@creator/campaign/lib/calendar';
import { DEFAULT_CAMPAIGN_RULES } from '@/@creator/campaign/lib/rules';
import {
  DEFAULT_TABLE_RULES,
  TABLE_RULE_FIELDS,
  TABLE_RULE_GROUPS,
  type TableRuleGroup,
  type TableRules,
} from '@/@creator/campaign/lib/table-rules';
import { SectionCard } from '@/@shared/components/ui';
import type { CampaignSettings } from '@/server/campaigns';
import { CalendarEditor } from './CalendarEditor';

/**
 * Everything a DM can decide about a table that is not its name.
 *
 * Shared by the creation form and the manage page, because it used to be
 * on the manage page alone: a campaign was made with a name, a blurb and a
 * player count, and every rule — ability score methods, multiclassing, what
 * the app enforces at the table, the world's calendar, whether homebrew is
 * allowed — waited behind "Manage" for a DM who might not know it was
 * there. One component, so the two pages cannot drift on what a table is.
 *
 * Holds a *draft*: the list fields are comma-separated strings while they
 * are being typed, and become arrays on the way out (`settingsFromDraft`).
 */

const METHOD_LABELS: Record<(typeof ABILITY_METHODS)[number], string> = {
  manual: 'Manual',
  pointbuy: 'Point Buy',
  standard: 'Standard Array',
  roll: 'Roll',
};

const parseList = (raw: string): string[] =>
  raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

export interface CampaignSettingsDraft {
  sessionNotes: string;
  customRules: string;
  allowHomebrew: boolean;
  requireHomebrewApproval: boolean;
  allowPublicHomebrew: boolean;
  abilityMethods: string[];
  allowMulticlass: boolean;
  maxStartingLevel: number;
  requireBackstory: boolean;
  allowedSources: string;
  bannedSpecies: string;
  bannedClasses: string;
  table: TableRules;
  calendar: CalendarDef;
}

/** The form's shape of a settings row — or of the defaults, for a new table. */
export function draftFromSettings(
  settings: CampaignSettings
): CampaignSettingsDraft {
  return {
    sessionNotes: settings.sessionNotes,
    customRules: settings.customRules,
    allowHomebrew: settings.allowHomebrew,
    requireHomebrewApproval: settings.requireHomebrewApproval,
    allowPublicHomebrew: settings.allowPublicHomebrew,
    abilityMethods: settings.rules.abilityMethods as string[],
    allowMulticlass: settings.rules.allowMulticlass,
    maxStartingLevel: settings.rules.maxStartingLevel,
    requireBackstory: settings.rules.requireBackstory,
    allowedSources: settings.rules.allowedSources.join(', '),
    bannedSpecies: settings.rules.bannedSpecies.join(', '),
    bannedClasses: settings.rules.bannedClasses.join(', '),
    table: settings.table,
    calendar: settings.calendar,
  };
}

/**
 * A new table's draft: the book, as `DEFAULT_CAMPAIGN_SETTINGS` has it.
 * Built here from the client-safe pieces rather than imported from the
 * server module, which would drag the database into the bundle.
 */
export function defaultSettingsDraft(): CampaignSettingsDraft {
  return {
    sessionNotes: '',
    customRules: '',
    allowHomebrew: true,
    requireHomebrewApproval: true,
    allowPublicHomebrew: true,
    abilityMethods: [...DEFAULT_CAMPAIGN_RULES.abilityMethods],
    allowMulticlass: DEFAULT_CAMPAIGN_RULES.allowMulticlass,
    maxStartingLevel: DEFAULT_CAMPAIGN_RULES.maxStartingLevel,
    requireBackstory: DEFAULT_CAMPAIGN_RULES.requireBackstory,
    allowedSources: '',
    bannedSpecies: '',
    bannedClasses: '',
    table: DEFAULT_TABLE_RULES,
    calendar: GREGORIAN_LIKE,
  };
}

/** The part of the action's `settings` payload these fields own. */
export function settingsFromDraft(draft: CampaignSettingsDraft) {
  return {
    sessionNotes: draft.sessionNotes,
    customRules: draft.customRules,
    allowHomebrew: draft.allowHomebrew,
    requireHomebrewApproval: draft.requireHomebrewApproval,
    allowPublicHomebrew: draft.allowPublicHomebrew,
    rules: {
      abilityMethods: draft.abilityMethods.filter(
        (m): m is (typeof ABILITY_METHODS)[number] =>
          (ABILITY_METHODS as readonly string[]).includes(m)
      ),
      allowMulticlass: draft.allowMulticlass,
      maxStartingLevel: draft.maxStartingLevel,
      requireBackstory: draft.requireBackstory,
      allowedSources: parseList(draft.allowedSources),
      bannedSpecies: parseList(draft.bannedSpecies),
      bannedClasses: parseList(draft.bannedClasses),
    },
    table: draft.table,
    calendar: draft.calendar,
  };
}

export function CampaignSettingsFields({
  draft,
  onChange,
}: {
  draft: CampaignSettingsDraft;
  onChange: (next: CampaignSettingsDraft) => void;
}) {
  const set = <K extends keyof CampaignSettingsDraft>(
    key: K,
    value: CampaignSettingsDraft[K]
  ) => onChange({ ...draft, [key]: value });

  return (
    <>
      <SectionCard
        title="Notes for the table"
        description="Free text the whole table can read: how this table runs, and any house rules in your own words."
      >
        <div className="flex flex-col gap-5">
          <Textarea
            label="Table notes"
            placeholder="When you play, how long a sitting runs, what to bring…"
            value={draft.sessionNotes}
            onValueChange={v => set('sessionNotes', v)}
            minRows={3}
          />
          <Textarea
            label="House rules"
            placeholder="Anything the book does not cover, or that this table does differently."
            value={draft.customRules}
            onValueChange={v => set('customRules', v)}
            minRows={3}
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Building a hero"
        description="Enforced in the character builder for anyone sitting at this table."
      >
        <div className="flex flex-col gap-5">
          <CheckboxGroup
            label="Ability score methods players may use"
            orientation="horizontal"
            value={draft.abilityMethods}
            onValueChange={v => set('abilityMethods', v)}
          >
            {ABILITY_METHODS.map(m => (
              <Checkbox key={m} value={m}>
                {METHOD_LABELS[m]}
              </Checkbox>
            ))}
          </CheckboxGroup>
          {draft.abilityMethods.length === 0 && (
            <p className="text-xs text-danger">
              Pick at least one — an empty list would leave players no way to
              set ability scores.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <NumberInput
              label="Highest starting level"
              minValue={1}
              maxValue={20}
              value={draft.maxStartingLevel}
              onValueChange={v => set('maxStartingLevel', Number(v) || 1)}
            />
          </div>

          <div className="flex flex-col gap-3">
            <Switch
              isSelected={draft.allowMulticlass}
              onValueChange={v => set('allowMulticlass', v)}
            >
              Allow multiclassing
            </Switch>
            <Switch
              isSelected={draft.requireBackstory}
              onValueChange={v => set('requireBackstory', v)}
            >
              Require a backstory before joining
            </Switch>
          </div>

          <Input
            label="Species not allowed (comma-separated)"
            value={draft.bannedSpecies}
            onValueChange={v => set('bannedSpecies', v)}
            placeholder="e.g. Custom Lineage, Warforged"
          />
          <Input
            label="Classes not allowed (comma-separated)"
            value={draft.bannedClasses}
            onValueChange={v => set('bannedClasses', v)}
            placeholder="e.g. Artificer"
          />
          <Input
            label="Sources in use (comma-separated — for reference, not enforced)"
            value={draft.allowedSources}
            onValueChange={v => set('allowedSources', v)}
            placeholder="e.g. PHB 2024, Xanathar's"
          />
        </div>
      </SectionCard>

      <SectionCard
        title="At the table"
        description="What the app does about the rules while people are playing. Every line defaults to the 2024 book; the note under each says where the alternative comes from."
      >
        <div className="flex flex-col gap-6">
          {(Object.keys(TABLE_RULE_GROUPS) as TableRuleGroup[]).map(group => {
            const fields = TABLE_RULE_FIELDS.filter(f => f.group === group);
            if (fields.length === 0) return null;
            return (
              <div key={group}>
                <h3 className="font-display-alt text-[0.7rem] uppercase tracking-[0.14em] text-gold/80">
                  {TABLE_RULE_GROUPS[group].label}
                </h3>
                <p className="mt-0.5 text-xs text-ink-subtle">
                  {TABLE_RULE_GROUPS[group].line}
                </p>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  {fields.map(field => {
                    const value = field.read(draft.table);
                    return (
                      <Select
                        key={field.key}
                        label={field.label}
                        description={field.hint}
                        selectedKeys={[value]}
                        onSelectionChange={keys => {
                          const next = String(Array.from(keys)[0] ?? value);
                          set('table', field.write(draft.table, next));
                        }}
                      >
                        {field.options.map(o => (
                          <SelectItem
                            key={o.value}
                            textValue={o.label}
                            description={o.note}
                          >
                            {o.label}
                          </SelectItem>
                        ))}
                      </Select>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard
        title="The world's calendar"
        description="What the clock on the screen counts in. Where it stands is set from the screen; this is the year it stands in."
      >
        <CalendarEditor
          value={draft.calendar}
          onChange={v => set('calendar', v)}
        />
      </SectionCard>

      <SectionCard title="Homebrew">
        <div className="flex flex-col gap-3">
          <Switch
            isSelected={draft.allowHomebrew}
            onValueChange={v => set('allowHomebrew', v)}
          >
            Allow homebrew content on character sheets
          </Switch>
          <Switch
            isSelected={draft.requireHomebrewApproval}
            onValueChange={v => set('requireHomebrewApproval', v)}
            isDisabled={!draft.allowHomebrew}
          >
            Require DM approval for each homebrew entry
          </Switch>
          <Switch
            isSelected={draft.allowPublicHomebrew}
            onValueChange={v => set('allowPublicHomebrew', v)}
            isDisabled={!draft.allowHomebrew}
          >
            Allow players to pull in publicly shared homebrew
          </Switch>
          {!draft.requireHomebrewApproval && draft.allowHomebrew && (
            <p className="text-xs text-ink-subtle">
              With approval off, homebrew entries are recorded as approved
              automatically and the review queue stays empty.
            </p>
          )}
        </div>
      </SectionCard>
    </>
  );
}
