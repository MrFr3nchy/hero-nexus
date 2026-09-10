'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Select, SelectItem, Tab, Tabs } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch, type Resolver } from 'react-hook-form';

import { setMemberCharacterAction } from '@/@creator/campaign/actions';
import { describeRules } from '@/@creator/campaign/lib/rules';
import type { BuilderCampaignRow } from '@/server/campaigns';

import type { CharacterStatus } from '@/server/characters';
import type { PortraitRow } from '@/server/character-portraits';

import {
  getBuildCatalogAction,
  getPortraitAction,
  saveCharacterAction,
} from '../actions';
import {
  characterSheetSchema,
  makeEmptySheet,
  type CharacterSheet,
  type HomebrewKind,
} from '../schema';
import type { BuildCatalog } from '../lib/srd/types';
import { OPEN_LIMITS, type BuildLimits } from '../lib/validate-build';
import { useResolvedContent } from './useResolvedContent';
import {
  genUid,
  makeProvenanceLogger,
  reconcileProvenance,
  type ProvenanceInput,
} from '../lib/provenance';
import {
  AbilityScoresSection,
  ChangeLogSection,
  CombatSection,
  CurrencySection,
  DetailsSection,
  EquipmentSection,
  HomebrewSection,
  InventorySection,
  IdentitySection,
  ProficienciesSection,
  type ReferenceOptions,
  SkillsSection,
  SpellcastingSection,
  SpellListSection,
} from './sections';
import { SectionCard } from '@/@shared/components/ui';
import { PortraitControl } from './PortraitControl';
import { CharacterWizard } from './wizard/CharacterWizard';
import type { InitialPick } from './wizard/types';

interface CharacterFormProps {
  reference: ReferenceOptions;
  /** SRD and homebrew build data the guided builder runs on. */
  catalog: BuildCatalog;
  /** The table `catalog` was loaded for. Changing tables refetches it. */
  catalogCampaignId?: string;
  characterId?: string;
  initialSheet?: CharacterSheet;
  /** Campaigns the player belongs to and can attach this character to. */
  campaigns: BuilderCampaignRow[];
  /** Campaign selected up front — the `?campaign=` link, or the current link. */
  initialCampaignId?: string;
  /**
   * A class, species or background chosen before the builder opened, from the
   * "start a hero with this" button on a compendium shelf. Only meaningful for
   * a new character; the guided builder ignores it once a sheet is reopened.
   */
  initialPick?: InitialPick;
  /** Whether the character being reopened is a finished hero or a draft. */
  initialStatus?: CharacterStatus;
}

type View = 'guided' | 'sheet';

/**
 * A brand-new character opens in the guided builder, so its build has to say
 * so from the first render. `makeEmptySheet` defaults to `manual` — the right
 * default for the schema, wrong for this form — and `composeSheet` returns the
 * sheet untouched for a manual build, so leaving it would mean nothing a class,
 * species or background grants ever reaches the sheet.
 */
function newGuidedSheet(): CharacterSheet {
  const sheet = makeEmptySheet();
  return { ...sheet, build: { ...sheet.build, mode: 'guided' } };
}

const SHEET_TABS = [
  { key: 'core', label: 'Identity & combat' },
  { key: 'abilities', label: 'Abilities & skills' },
  { key: 'magic', label: 'Magic & training' },
  { key: 'story', label: 'Story & gear' },
] as const;

type SheetTab = (typeof SHEET_TABS)[number]['key'];

export function CharacterForm({
  reference,
  catalog: initialCatalog,
  catalogCampaignId,
  characterId: openedWith,
  initialSheet,
  campaigns,
  initialCampaignId,
  initialPick,
  initialStatus = 'ready',
}: CharacterFormProps) {
  const router = useRouter();
  const [banner, setBanner] = useState<{
    kind: 'error' | 'success';
    text: string;
  } | null>(null);
  /**
   * The row this form is writing to.
   *
   * Seeded from the URL, and set once the first "Save draft" mints a row. It
   * is state rather than a navigation because saving a draft must not move the
   * player: `router.replace('?id=…')` would remount the whole form and drop
   * the wizard back to step one, which is a strange thing for "save my
   * progress" to do on step six. Subsequent saves update this id instead of
   * minting a second character.
   */
  const [characterId, setCharacterId] = useState(openedWith);
  // Fetched rather than passed in: the form is opened from several places and
  // only one of them is a server component that could have loaded it.
  const [portrait, setPortrait] = useState<PortraitRow | null>(null);
  useEffect(() => {
    if (!characterId) {
      setPortrait(null);
      return;
    }
    let live = true;
    getPortraitAction(characterId).then(p => {
      if (live) setPortrait(p);
    });
    return () => {
      live = false;
    };
  }, [characterId]);

  /**
   * Whether the row is a draft *now*, not at page load — the first draft save
   * turns a brand-new character into one without a reload.
   */
  const [status, setStatus] = useState<CharacterStatus>(initialStatus);

  const [campaignId, setCampaignId] = useState(
    campaigns.some(c => c.id === initialCampaignId) ? initialCampaignId! : ''
  );

  /**
   * The wizard's options. Server-rendered for the table the page opened with,
   * refetched when the player switches tables — a campaign's homebrew library
   * is part of the catalog, so the options change with the table.
   */
  const [catalog, setCatalog] = useState(initialCatalog);
  const catalogFor = useRef(catalogCampaignId ?? '');
  useEffect(() => {
    if (catalogFor.current === campaignId) return;
    let live = true;
    catalogFor.current = campaignId;
    void getBuildCatalogAction(campaignId || undefined).then(next => {
      if (live) setCatalog(next);
    });
    return () => {
      live = false;
    };
  }, [campaignId]);

  /**
   * Reload the options for the table currently chosen, and hand the result
   * back rather than only storing it.
   *
   * The wizard awaits this after forging something mid-build: its `choose*`
   * handlers read the catalog to decide whether a pick is SRD or homebrew, so
   * a pick applied against the old list would file a brand-new homebrew class
   * as `srd` — and the sheet would then claim SRD provenance for content no
   * DM has ever seen.
   */
  const refreshCatalog = useCallback(async () => {
    const next = await getBuildCatalogAction(campaignId || undefined);
    setCatalog(next);
    return next;
  }, [campaignId]);

  const campaign = campaigns.find(c => c.id === campaignId) ?? null;
  /** The table this character already sits at, if it is a saved one. */
  const linkedCampaignId = characterId
    ? (campaigns.find(c => c.linkedCharacterId === characterId)?.id ?? null)
    : null;

  /**
   * The table's rules, turned into what the builder may still offer. The
   * builder hides everything outside this, so a legal build is the only one
   * that can be assembled — the save-time check behind it is a backstop.
   */
  const limits: BuildLimits = useMemo(() => {
    if (!campaign) return OPEN_LIMITS;
    return {
      maxLevel: campaign.rules.maxStartingLevel,
      allowedMethods: campaign.rules.abilityMethods,
      bannedSpecies: campaign.rules.bannedSpecies,
      bannedClasses: campaign.rules.bannedClasses,
      allowHomebrew: campaign.allowHomebrew,
      requireBackstory: campaign.rules.requireBackstory,
    };
  }, [campaign]);

  const {
    control,
    handleSubmit,
    reset,
    getValues,
    setValue,
    formState: { isSubmitting, isDirty },
  } = useForm<CharacterSheet>({
    resolver: zodResolver(characterSheetSchema) as Resolver<CharacterSheet>,
    defaultValues: initialSheet ?? newGuidedSheet(),
  });

  // A brand-new character starts in the guided builder; a sheet saved before
  // the builder existed opens on the sheet it was written as.
  const [view, setView] = useState<View>(() =>
    !initialSheet || initialSheet.build.mode === 'guided' ? 'guided' : 'sheet'
  );
  const [sheetTab, setSheetTab] = useState<SheetTab>('core');

  // Stats for the content the sheet points at — the inventory and spell list
  // hold references, so their numbers are fetched rather than stored.
  const watchedInventory = useWatch({ control, name: 'inventory' });
  const watchedSpells = useWatch({ control, name: 'spellcasting.spells' });
  // A draft still needs a word to be listed under; `identity.name` is the one
  // field the sheet schema genuinely requires.
  const watchedName = useWatch({ control, name: 'identity.name' });
  const resolved = useResolvedContent({
    inventory: watchedInventory ?? [],
    spellcasting: {
      spells: watchedSpells ?? [],
    } as CharacterSheet['spellcasting'],
  });

  const log = useCallback(
    (input: ProvenanceInput) =>
      makeProvenanceLogger(
        () => getValues('provenance') ?? [],
        next => setValue('provenance', next, { shouldDirty: true })
      )(input),
    [getValues, setValue]
  );

  const dropHomebrewLog = useCallback(
    (field: string) => {
      const list = getValues('provenance') ?? [];
      const next = list.filter(
        p => !(p.kind === 'homebrew' && p.label === field)
      );
      if (next.length !== list.length)
        setValue('provenance', next, { shouldDirty: true });
    },
    [getValues, setValue]
  );

  const handleCustomField = useCallback(
    (field: string, kind: HomebrewKind, value: string, isCustom: boolean) => {
      const entries = getValues('homebrew.entries') ?? [];
      const idx = entries.findIndex(e => e.field === field);
      const trimmed = value.trim();

      if (isCustom && trimmed) {
        let next = entries;
        if (idx < 0) {
          next = [
            ...entries,
            { id: genUid(), kind, name: trimmed, field, traits: [] },
          ];
        } else if (entries[idx].name !== trimmed) {
          next = entries.map((e, i) =>
            i === idx ? { ...e, name: trimmed } : e
          );
        }
        if (next !== entries) {
          setValue('homebrew.entries', next, {
            shouldDirty: true,
            shouldValidate: true,
          });
        }
        setValue('homebrew.isHomebrew', true, { shouldDirty: true });
        log({
          kind: 'homebrew',
          label: field,
          detail: `Custom ${kind}: "${trimmed}"`,
        });
      } else if (idx >= 0) {
        const next = entries.filter((_, i) => i !== idx);
        setValue('homebrew.entries', next, {
          shouldDirty: true,
          shouldValidate: true,
        });
        setValue('homebrew.isHomebrew', next.length > 0, { shouldDirty: true });
        dropHomebrewLog(field);
      }
    },
    [getValues, setValue, log, dropHomebrewLog]
  );

  /**
   * One save, two meanings.
   *
   * `draft` is a hero still being decided: it is written, listed and reopened
   * like any other, and the two things it may not do — sit at a table, go on
   * the Library's shelf — are refused by the server, not merely hidden here.
   * So a draft never runs `linkToCampaign`, and the table the player picked is
   * held on the form until they finish.
   */
  const save = (next: CharacterStatus) =>
    handleSubmit(
      async values => {
        setBanner(null);
        const payload: CharacterSheet = {
          ...values,
          homebrew: {
            ...values.homebrew,
            isHomebrew:
              values.homebrew.isHomebrew || values.homebrew.entries.length > 0,
          },
          provenance: reconcileProvenance(values),
        };

        const result = await saveCharacterAction(payload, characterId, next);
        if (!result.ok) {
          setBanner({
            kind: 'error',
            text: result.error ?? 'Failed to save character.',
          });
          return;
        }

        // Whatever happened, this form now owns a row.
        if (result.id) setCharacterId(result.id);
        setStatus(next);

        if (next === 'draft') {
          setBanner({
            kind: 'success',
            text: 'Draft saved. Pick them back up whenever you like.',
          });
          // Stay put, on the step they were on. A draft is saved mid-thought.
          router.refresh();
          return;
        }

        // The table this character plays at is a campaign-membership fact, not
        // part of the sheet, so it is written after the sheet is safely saved.
        const link = await linkToCampaign(result.id);
        if (link) {
          setBanner({ kind: 'error', text: link });
          return;
        }

        setBanner({ kind: 'success', text: 'Inscribed.' });
        router.push('/characters');
        router.refresh();
      },
      () => {
        setBanner({
          kind: 'error',
          text: 'Some fields need attention — check the highlighted inputs.',
        });
      }
    )();

  /**
   * Attach the saved character to the chosen table, or detach it from the one
   * it used to sit at. Returns a message when the link failed; the sheet
   * itself is already saved either way.
   */
  const linkToCampaign = async (savedId?: string): Promise<string | null> => {
    if (campaignId === (linkedCampaignId ?? '')) return null;

    if (linkedCampaignId && campaignId !== linkedCampaignId) {
      const off = await setMemberCharacterAction(linkedCampaignId, null);
      if (!off.ok) return off.error ?? 'Failed to leave the previous table.';
    }
    if (!campaignId || !savedId) return null;

    const on = await setMemberCharacterAction(campaignId, savedId);
    if (!on.ok) return on.error ?? 'Failed to attach the character.';
    return null;
  };

  /** Turn the guided builder on, taking ownership of the derived fields. */
  const enterGuided = () => {
    if (getValues('build.mode') !== 'guided') {
      setValue('build.mode', 'guided', { shouldDirty: true });
      log({
        kind: 'method',
        label: 'Builder',
        detail: 'Switched to the guided builder.',
      });
    }
    setView('guided');
  };

  const enterSheet = () => {
    setView('sheet');
  };

  const ruleLines = campaign
    ? describeRules(campaign.rules, { allowHomebrew: campaign.allowHomebrew })
    : [];

  /**
   * The builder's save controls.
   *
   * There used to be one button here — "Create character" — disabled for the
   * whole build and enabled at the end. A permanently dead primary action is
   * the worst possible progress indicator: it tells you that you are not
   * finished without telling you what is missing, and it makes the only way
   * out of the builder an all-or-nothing one.
   *
   * So the two things a player might want are two controls, and neither is
   * ever a dead end:
   *
   *  - **Save draft** is always live (a name is all it needs — the roster has
   *    to call the row something). Their work is never trapped in a tab.
   *  - **Finish** *appears* when the build owes nothing. It is not a disabled
   *    button most of the time; it is the reward for the last decision, and
   *    until then its place is taken by a sentence saying what is left and
   *    where.
   *
   * `build` is absent on the hand-built sheet view, which has no guided build
   * to be incomplete and so simply saves.
   */
  const actions = (build?: { complete: boolean; remaining: number }) => {
    const named = Boolean(watchedName?.trim());
    const complete = build ? build.complete : true;
    const isDraft = status === 'draft';

    return (
      <>
        <Button
          type="button"
          variant="bordered"
          className="border-line text-ink"
          isDisabled={isSubmitting || !isDirty}
          onPress={() => reset(initialSheet ?? newGuidedSheet())}
        >
          Reset
        </Button>

        {/*
          Offered while anything is outstanding, and while an already-saved
          draft is being worked on. A finished hero being edited has nothing to
          gain from being pushed back into the drafts pile.
        */}
        {(!complete || isDraft || !characterId) && (
          <Button
            type="button"
            variant="bordered"
            className="border-line text-ink"
            isLoading={isSubmitting}
            isDisabled={!named}
            title={named ? undefined : 'Give your hero a name first.'}
            onPress={() => void save('draft')}
          >
            Save draft
          </Button>
        )}

        {complete ? (
          <Button
            type="button"
            size="lg"
            isLoading={isSubmitting}
            color="primary"
            className="px-8"
            onPress={() => void save('ready')}
          >
            {characterId && !isDraft ? 'Save changes' : 'Finish this hero'}
          </Button>
        ) : (
          <p className="max-w-xs text-sm text-ink-muted">
            {build!.remaining} decision
            {build!.remaining === 1 ? '' : 's'} left before this hero can join a
            party or go on the shelf.
          </p>
        )}
      </>
    );
  };

  const campaignPicker = campaigns.length > 0 && (
    <div className="rounded-lg border border-line bg-surface p-3">
      <Select
        label="Play this character at"
        placeholder="No campaign — a character of your own"
        selectedKeys={campaignId ? [campaignId] : []}
        onSelectionChange={keys =>
          setCampaignId((Array.from(keys)[0] as string) ?? '')
        }
        classNames={{ trigger: 'bg-surface-2 border-line' }}
      >
        {campaigns.map(c => (
          <SelectItem key={c.id}>{c.name}</SelectItem>
        ))}
      </Select>
      {campaign?.linkedCharacterId &&
        campaign.linkedCharacterId !== characterId && (
          <p className="mt-2 text-sm text-warning">
            {campaign.linkedCharacterName ?? 'Another character'} is your
            character at that table right now — saving replaces them.
          </p>
        )}
      {ruleLines.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-ink-muted">
          {ruleLines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
      {campaign && ruleLines.length === 0 && (
        <p className="mt-2 text-sm text-ink-muted">
          This table uses the standard rules.
        </p>
      )}
      {/*
        The table is chosen now and honoured at the end. Saying so is the point
        of the line: the picker narrows the options from this moment, so it has
        to be answerable before the hero is finished, and a player who saves a
        draft should know the seat is not taken yet.
      */}
      {campaign && (
        <p className="mt-2 text-sm text-ink-subtle">
          The options below are already narrowed to this table. Your hero takes
          their seat when the build is finished — a draft holds no chair.
        </p>
      )}
    </div>
  );

  return (
    <form onSubmit={e => e.preventDefault()} className="space-y-6">
      {banner && (
        <div
          className={`rounded-lg border p-3 text-center text-sm ${
            banner.kind === 'error'
              ? 'border-danger/40 bg-danger/10 text-danger'
              : 'border-success/40 bg-success/10 text-success'
          }`}
        >
          {banner.text}
        </div>
      )}

      {view === 'guided' ? (
        <CharacterWizard
          control={control}
          setValue={setValue}
          getValues={getValues}
          catalog={catalog}
          log={log}
          onCustomField={handleCustomField}
          limits={limits}
          campaignId={campaignId || undefined}
          content={resolved}
          initialPick={openedWith ? undefined : initialPick}
          onRefreshCatalog={refreshCatalog}
          campaignName={campaign?.name}
          header={campaignPicker}
          footer={actions}
          onSwitchToSheet={enterSheet}
        />
      ) : (
        <div className="space-y-5">
          {campaignPicker}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs
              aria-label="Sheet sections"
              selectedKey={sheetTab}
              onSelectionChange={key => setSheetTab(key as SheetTab)}
              classNames={{ tabList: 'bg-surface-2' }}
            >
              {SHEET_TABS.map(tab => (
                <Tab key={tab.key} title={tab.label} />
              ))}
            </Tabs>
            <button
              type="button"
              onClick={enterGuided}
              className="text-sm text-ink-muted underline-offset-2 hover:text-ink hover:underline"
            >
              Use the guided builder
            </button>
          </div>

          {sheetTab === 'core' && (
            <div className="grid gap-5 lg:grid-cols-2">
              <IdentitySection
                control={control}
                reference={reference}
                onCustomField={handleCustomField}
              />
              <CombatSection control={control} />
            </div>
          )}

          {sheetTab === 'abilities' && (
            <div className="grid gap-5 lg:grid-cols-2">
              <AbilityScoresSection
                control={control}
                setValue={setValue}
                log={log}
                allowedMethods={limits.allowedMethods}
              />
              <SkillsSection control={control} />
            </div>
          )}

          {sheetTab === 'magic' && (
            <div className="space-y-5">
              <SpellListSection
                control={control}
                setValue={setValue}
                campaignId={campaignId || undefined}
                resolved={resolved}
              />
              <div className="grid gap-5 lg:grid-cols-2">
                <SpellcastingSection control={control} />
                <ProficienciesSection control={control} />
              </div>
            </div>
          )}

          {sheetTab === 'story' && (
            <div className="space-y-5">
              <InventorySection
                control={control}
                setValue={setValue}
                campaignId={campaignId || undefined}
                resolved={resolved}
              />
              <div className="grid gap-5 lg:grid-cols-2">
                <DetailsSection control={control} />
                <div className="space-y-5">
                  {/*
                    Only once the hero exists: a portrait is stored against a
                    character id, and there is nothing to hang it on until the
                    first save. A brand-new sheet gets the control the moment
                    it is saved and reopened.
                  */}
                  {characterId && (
                    <SectionCard
                      title="Portrait"
                      description="A face for the party cards and the initiative list."
                    >
                      <PortraitControl
                        characterId={characterId}
                        initial={portrait}
                        onChange={setPortrait}
                      />
                    </SectionCard>
                  )}
                  <EquipmentSection control={control} />
                  <CurrencySection control={control} />
                  {limits.allowHomebrew && (
                    <HomebrewSection control={control} setValue={setValue} />
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-4 border-t border-line pt-5">
            {actions()}
          </div>
        </div>
      )}

      {/* A brand-new hero has no history yet; an empty log is furniture. */}
      {characterId && <ChangeLogSection control={control} />}
    </form>
  );
}
