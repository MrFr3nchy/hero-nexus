/**
 * Drizzle schema — query-time source of truth.
 *
 * IMPORTANT: this file and `src/db/migrations/*.sql` are edited together in the
 * same change. Drizzle is used only for the ORM/query builder here; migrations
 * are hand-written SQL applied by our own runner (`src/db/migrate.ts`). See
 * `src/db/README.md`.
 */
import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

const uuid = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const nowIso = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

/* ------------------------------------------------------------------ */
/* Auth.js (Drizzle adapter) tables — SQL table names kept singular   */
/* to match the adapter's expectations.                               */
/* ------------------------------------------------------------------ */

export const users = sqliteTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: integer('emailVerified', { mode: 'timestamp_ms' }),
  image: text('image'),
  // Local extensions:
  passwordHash: text('password_hash'),
  createdAt: text('created_at').default(nowIso).notNull(),
});

export const accounts = sqliteTable(
  'account',
  {
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  account => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ]
);

export const sessions = sqliteTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: integer('expires', { mode: 'timestamp_ms' }).notNull(),
});

export const verificationTokens = sqliteTable(
  'verificationToken',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: integer('expires', { mode: 'timestamp_ms' }).notNull(),
  },
  vt => [primaryKey({ columns: [vt.identifier, vt.token] })]
);

/* ------------------------------------------------------------------ */
/* App tables                                                          */
/* ------------------------------------------------------------------ */

export const characters = sqliteTable(
  'characters',
  {
    id: uuid(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    class: text('class').notNull().default(''),
    species: text('species').notNull().default(''),
    level: integer('level').notNull().default(1),
    background: text('background').notNull().default(''),
    rpgSystem: text('rpg_system').notNull().default('dnd5e2024'),
    /** True when the sheet carries custom (homebrew) species/class/etc. */
    hasHomebrew: integer('has_homebrew', { mode: 'boolean' })
      .notNull()
      .default(false),
    /** Full character sheet, JSON-encoded. Schema owned by
     *  `src/@creator/character/schema.ts`. */
    sheet: text('sheet', { mode: 'json' }).notNull(),
    createdAt: text('created_at').default(nowIso).notNull(),
    updatedAt: text('updated_at').default(nowIso).notNull(),
  },
  t => [index('characters_owner_id_idx').on(t.ownerId)]
);

/** Homebrew rows spawned by a character's custom identity fields. */
export const characterHomebrew = sqliteTable(
  'character_homebrew',
  {
    id: uuid(),
    characterId: text('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    homebrewId: text('homebrew_id')
      .notNull()
      .references(() => homebrew.id, { onDelete: 'cascade' }),
    entryId: text('entry_id').notNull(),
    createdAt: text('created_at').default(nowIso).notNull(),
  },
  t => [
    uniqueIndex('character_homebrew_char_entry_idx').on(
      t.characterId,
      t.entryId
    ),
    index('character_homebrew_homebrew_idx').on(t.homebrewId),
  ]
);

/** Provenance trail: every custom value / manual stat / dice roll a player made. */
export const characterAuditLog = sqliteTable(
  'character_audit_log',
  {
    id: uuid(),
    characterId: text('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    entryId: text('entry_id').notNull(),
    kind: text('kind', {
      enum: [
        'field',
        'stat-manual',
        'stat-roll',
        'stat-pointbuy',
        'stat-standard',
        'method',
        'homebrew',
      ],
    }).notNull(),
    label: text('label').notNull().default(''),
    detail: text('detail').notNull().default(''),
    rolls: text('rolls'),
    occurredAt: text('occurred_at').notNull(),
    createdAt: text('created_at').default(nowIso).notNull(),
  },
  t => [
    uniqueIndex('character_audit_log_char_entry_idx').on(
      t.characterId,
      t.entryId
    ),
    index('character_audit_log_char_idx').on(t.characterId),
  ]
);

/**
 * Append-only history of server-observed changes to a character since creation.
 *
 * Distinct from `character_audit_log` / `sheet.provenance`, which are a
 * client-supplied mirror of creation-time method & roll data. Rows here are
 * written by the server by diffing the incoming sheet against the stored one,
 * never accepted from the client. No unique index: a field that changes four
 * times is four rows.
 */
export const characterHistory = sqliteTable(
  'character_history',
  {
    id: uuid(),
    characterId: text('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    /** Who saved the change. Null once that user is deleted. */
    actorUserId: text('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    /** identity | level | ability | method | homebrew | other */
    kind: text('kind').notNull(),
    /** dot-path of the changed field, e.g. `identity.subclass` */
    field: text('field').notNull().default(''),
    fromValue: text('from_value'),
    toValue: text('to_value'),
    detail: text('detail').notNull().default(''),
    /** reserved: JSON array of raw dice a diff cannot reconstruct */
    rolls: text('rolls'),
    /** server clock at save time */
    occurredAt: text('occurred_at').notNull(),
    createdAt: text('created_at').default(nowIso).notNull(),
  },
  t => [
    index('character_history_char_idx').on(t.characterId),
    index('character_history_char_time_idx').on(t.characterId, t.occurredAt),
  ]
);

export const homebrew = sqliteTable(
  'homebrew',
  {
    id: uuid(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type', {
      enum: [
        'class',
        'spell',
        'item',
        'species',
        'subclass',
        'background',
        'feat',
        'creature',
      ],
    }).notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    data: text('data', { mode: 'json' })
      .notNull()
      .default(sql`'{}'`),
    visibility: text('visibility', { enum: ['private', 'public'] })
      .notNull()
      .default('private'),
    rpgSystem: text('rpg_system').notNull().default('dnd5e2024'),
    /**
     * The publication this row was forked from, when a reader took somebody
     * else's content as their own copy rather than as a link (0029).
     *
     * No reference, following `campaign_map_pins.canon_entry_id`: SQLite cannot
     * add a foreign key by ALTER, and the listing this points at belongs to
     * another account that may delete it. A dangling provenance line reads as
     * "forked from something that is gone", which is true, rather than
     * breaking the fork.
     */
    forkedFrom: text('forked_from'),
    createdAt: text('created_at').default(nowIso).notNull(),
    updatedAt: text('updated_at').default(nowIso).notNull(),
  },
  t => [
    index('homebrew_owner_id_idx').on(t.ownerId),
    index('homebrew_type_visibility_idx').on(t.type, t.visibility),
  ]
);

export const campaigns = sqliteTable('campaigns', {
  id: uuid(),
  gmId: text('gm_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  /** Short shareable code for joining. Unique. */
  joinCode: text('join_code'),
  /** CampaignSettings, JSON-encoded. */
  settings: text('settings', { mode: 'json' })
    .notNull()
    .default(sql`'{}'`),
  status: text('status', {
    enum: ['active', 'paused', 'completed', 'archived'],
  })
    .notNull()
    .default('active'),
  createdAt: text('created_at').default(nowIso).notNull(),
  updatedAt: text('updated_at').default(nowIso).notNull(),
});

export const campaignMembers = sqliteTable(
  'campaign_members',
  {
    id: uuid(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    characterId: text('character_id').references(() => characters.id, {
      onDelete: 'set null',
    }),
    role: text('role', { enum: ['player', 'co-gm'] })
      .notNull()
      .default('player'),
    status: text('status', { enum: ['active', 'inactive'] })
      .notNull()
      .default('active'),
    joinedAt: text('joined_at').default(nowIso).notNull(),
  },
  t => [
    uniqueIndex('campaign_members_campaign_user_idx').on(
      t.campaignId,
      t.userId
    ),
  ]
);

export const campaignInvites = sqliteTable('campaign_invites', {
  id: uuid(),
  campaignId: text('campaign_id')
    .notNull()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  invitedUserId: text('invited_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  invitedByUserId: text('invited_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  status: text('status', {
    enum: ['pending', 'accepted', 'declined', 'expired'],
  })
    .notNull()
    .default('pending'),
  expiresAt: text('expires_at'),
  createdAt: text('created_at').default(nowIso).notNull(),
});

export const homebrewApprovals = sqliteTable('homebrew_approvals', {
  id: uuid(),
  campaignId: text('campaign_id')
    .notNull()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  homebrewId: text('homebrew_id')
    .notNull()
    .references(() => homebrew.id, { onDelete: 'cascade' }),
  requestedByUserId: text('requested_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['pending', 'approved', 'denied'] })
    .notNull()
    .default('pending'),
  reviewedByUserId: text('reviewed_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  reviewNotes: text('review_notes'),
  createdAt: text('created_at').default(nowIso).notNull(),
  reviewedAt: text('reviewed_at'),
});

/** Vendored SRD 5.1 reference data (see `data/srd/`). Loaded by `db:seed`. */
export const referenceData = sqliteTable(
  'reference_data',
  {
    category: text('category').notNull(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    data: text('data', { mode: 'json' }).notNull(),
  },
  t => [primaryKey({ columns: [t.category, t.slug] })]
);

export const rpgSystems = sqliteTable('rpg_systems', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  version: text('version').notNull().default(''),
  description: text('description').notNull().default(''),
});

/* --- Live session tools (0003) ---------------------------------------- */

export const campaignHandouts = sqliteTable(
  'campaign_handouts',
  {
    id: uuid(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['image', 'note'] }).notNull(),
    title: text('title').notNull().default(''),
    body: text('body'),
    filePath: text('file_path'),
    mime: text('mime'),
    visibility: text('visibility', { enum: ['dm', 'shared'] })
      .notNull()
      .default('dm'),
    /** The sitting this was shown at. Null is unfiled. */
    sessionId: text('session_id'),
    createdBy: text('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: text('created_at').default(nowIso).notNull(),
  },
  t => [index('campaign_handouts_campaign_idx').on(t.campaignId)]
);

export const initiativeEncounters = sqliteTable(
  'initiative_encounters',
  {
    id: uuid(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    name: text('name').notNull().default('Encounter'),
    isActive: integer('is_active', { mode: 'boolean' })
      .notNull()
      .default(false),
    round: integer('round').notNull().default(1),
    turnIndex: integer('turn_index').notNull().default(0),
    /** The sitting this was fought at. Null is unfiled. */
    sessionId: text('session_id'),
    createdAt: text('created_at').default(nowIso).notNull(),
  },
  t => [index('initiative_encounters_campaign_idx').on(t.campaignId)]
);

export const initiativeEntries = sqliteTable(
  'initiative_entries',
  {
    id: uuid(),
    encounterId: text('encounter_id')
      .notNull()
      .references(() => initiativeEncounters.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    characterId: text('character_id').references(() => characters.id, {
      onDelete: 'set null',
    }),
    initiative: integer('initiative').notNull().default(0),
    hpCurrent: integer('hp_current'),
    hpMax: integer('hp_max'),
    /** Temporary hit points: spent first, never healed back. */
    hpTemp: integer('hp_temp').notNull().default(0),
    armorClass: integer('armor_class'),
    /** Free-text note beside the conditions ("prone behind the cart"). */
    conditions: text('conditions').notNull().default(''),
    /** Comma-separated 2024 condition keys — see lib/conditions.ts. */
    conditionKeys: text('condition_keys').notNull().default(''),
    /**
     * Not a condition: concentration survives most of them, ends on its own
     * rules, and the DM needs to see it the moment damage lands.
     */
    concentrating: integer('concentrating', { mode: 'boolean' })
      .notNull()
      .default(false),
    /** Which side of the fight, so foe HP can stay off the players' screens. */
    side: text('side', { enum: ['party', 'foe', 'other'] })
      .notNull()
      .default('foe'),
    sort: integer('sort').notNull().default(0),
  },
  t => [index('initiative_entries_encounter_idx').on(t.encounterId)]
);

/**
 * The table's shared roll log.
 *
 * Rolls are made on the server and every die face is stored, so the log is a
 * record of what was rolled rather than a claim about it. `visibility` is how
 * a DM rolls behind the screen without leaving the app.
 */
export const campaignRolls = sqliteTable(
  'campaign_rolls',
  {
    id: uuid(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    actorUserId: text('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    characterId: text('character_id').references(() => characters.id, {
      onDelete: 'set null',
    }),
    /** Who rolled, kept independent of the account surviving. */
    actorName: text('actor_name').notNull().default(''),
    /** What it was for — "Stealth", "Longsword", "Death save". */
    label: text('label').notNull().default(''),
    notation: text('notation').notNull().default(''),
    /** JSON array of every die face rolled, in roll order. */
    dice: text('dice', { mode: 'json' })
      .notNull()
      .default(sql`'[]'`),
    /** JSON array of indexes into `dice` that did not count. */
    dropped: text('dropped', { mode: 'json' })
      .notNull()
      .default(sql`'[]'`),
    modifier: integer('modifier').notNull().default(0),
    total: integer('total').notNull().default(0),
    visibility: text('visibility', { enum: ['table', 'dm'] })
      .notNull()
      .default('table'),
    createdAt: text('created_at').default(nowIso).notNull(),
  },
  t => [index('campaign_rolls_campaign_idx').on(t.campaignId, t.createdAt)]
);

/* ------------------------------------------------------------------ */
/* Party canon — a campaign wiki with a DM view and a party view.     */
/* ------------------------------------------------------------------ */

/**
 * A shelf in the campaign's archive — the Bestiary, a looted spellbook, the
 * party's own notebook. Purely organisational: a collection has no visibility
 * of its own, because each entry on the shelf is revealed on its own terms,
 * and a half-known bestiary should show a player exactly what they have met.
 */
export const canonCollections = sqliteTable(
  'canon_collections',
  {
    id: uuid(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default(''),
    blurb: text('blurb').notNull().default(''),
    /** A `GlyphName` for the spine — see `ui/Glyph.tsx`. */
    icon: text('icon').notNull().default('books'),
    imageId: text('image_id'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at').default(nowIso).notNull(),
    updatedAt: text('updated_at').default(nowIso).notNull(),
  },
  t => [index('canon_collections_campaign_idx').on(t.campaignId)]
);

/**
 * One canon entry (an NPC, place, item, faction, or piece of lore). Two
 * bodies: `dm_body` is the DM's private notes, `party_body` is what the party
 * has been told. They are different documents that share a subject, never one
 * body with hidden regions.
 */
export const canonEntries = sqliteTable(
  'canon_entries',
  {
    id: uuid(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    kind: text('kind', {
      enum: [
        'npc',
        'creature',
        'location',
        'faction',
        'item',
        'spell',
        'lore',
        'note',
      ],
    }).notNull(),
    title: text('title').notNull().default(''),
    dmBody: text('dm_body').notNull().default(''),
    partyBody: text('party_body').notNull().default(''),
    /** The shelf it is filed on. Null is a loose entry. */
    collectionId: text('collection_id'),
    /** Portrait or sketch, from `campaign_images`. */
    imageId: text('image_id'),
    /** Kind-specific facts as JSON — presentation, never queried on. */
    fields: text('fields', { mode: 'json' })
      .notNull()
      .default(sql`'{}'`),
    /** 'dm' = staff only; 'shared' = every player sees `party_body`. */
    visibility: text('visibility', { enum: ['dm', 'shared'] })
      .notNull()
      .default('dm'),
    createdBy: text('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: text('created_at').default(nowIso).notNull(),
    updatedAt: text('updated_at').default(nowIso).notNull(),
  },
  t => [index('canon_entries_campaign_idx').on(t.campaignId)]
);

/** A directed reference from one canon entry to another. */
export const canonLinks = sqliteTable(
  'canon_links',
  {
    id: uuid(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    fromEntryId: text('from_entry_id')
      .notNull()
      .references(() => canonEntries.id, { onDelete: 'cascade' }),
    toEntryId: text('to_entry_id')
      .notNull()
      .references(() => canonEntries.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').default(nowIso).notNull(),
  },
  t => [
    uniqueIndex('canon_links_pair_idx').on(t.fromEntryId, t.toEntryId),
    index('canon_links_to_idx').on(t.toEntryId),
    index('canon_links_campaign_idx').on(t.campaignId),
  ]
);

/**
 * Per-member reveal: this user sees this entry's `party_body` even while its
 * visibility is still 'dm'. Keyed on `user_id`, NOT `campaign_members` — the
 * GM has no member row, so a table keyed on `campaign_members` would silently
 * exclude them.
 */
export const canonReveals = sqliteTable(
  'canon_reveals',
  {
    id: uuid(),
    entryId: text('entry_id')
      .notNull()
      .references(() => canonEntries.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').default(nowIso).notNull(),
  },
  t => [
    uniqueIndex('canon_reveals_entry_user_idx').on(t.entryId, t.userId),
    index('canon_reveals_user_idx').on(t.userId),
  ]
);

/* ------------------------------------------------------------------ */
/* Between-session downtime — players submit actions, the DM resolves. */
/* ------------------------------------------------------------------ */

/** A window of time between sessions that the DM opens for downtime actions. */
export const downtimePeriods = sqliteTable(
  'downtime_periods',
  {
    id: uuid(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    label: text('label').notNull().default(''),
    opensAt: text('opens_at'),
    closesAt: text('closes_at'),
    /** 'open' accepts new actions; 'closed' does not. */
    status: text('status', { enum: ['open', 'closed'] })
      .notNull()
      .default('open'),
    /** The sitting this window runs up to. Null is unfiled. */
    sessionId: text('session_id'),
    createdBy: text('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: text('created_at').default(nowIso).notNull(),
    updatedAt: text('updated_at').default(nowIso).notNull(),
  },
  t => [index('downtime_periods_campaign_idx').on(t.campaignId)]
);

/**
 * One downtime action a player submitted against a period, and the DM's
 * resolution. Modelled on the homebrew-approval flow: submit → review →
 * respond → resubmit. A rejection needs a written reason.
 */
export const downtimeActions = sqliteTable(
  'downtime_actions',
  {
    id: uuid(),
    periodId: text('period_id')
      .notNull()
      .references(() => downtimePeriods.id, { onDelete: 'cascade' }),
    /** Null once the character is deleted (SET NULL, as campaign_members). */
    characterId: text('character_id').references(() => characters.id, {
      onDelete: 'set null',
    }),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** See DOWNTIME_KINDS — shopping, crafting, scheming, recovery, … */
    kind: text('kind').notNull().default('other'),
    body: text('body').notNull().default(''),
    /** A letter, a sketch, a shopping list — from `campaign_images`. */
    imageId: text('image_id'),
    /**
     * Who reads this action and its resolution. 'party' is the old behaviour
     * and stays the default; 'player' keeps a scheme between its author and
     * the DM until the DM decides the table may know.
     */
    visibility: text('visibility', { enum: ['player', 'party'] })
      .notNull()
      .default('party'),
    dmResponse: text('dm_response'),
    status: text('status', {
      enum: ['submitted', 'resolved', 'rejected'],
    })
      .notNull()
      .default('submitted'),
    resolvedByUserId: text('resolved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    resolvedAt: text('resolved_at'),
    createdAt: text('created_at').default(nowIso).notNull(),
    updatedAt: text('updated_at').default(nowIso).notNull(),
  },
  t => [
    index('downtime_actions_period_idx').on(t.periodId),
    index('downtime_actions_character_idx').on(t.characterId),
  ]
);

/* ------------------------------------------------------------------ */
/* DM annotations on a player's sheet, and the per-player secret log.   */
/* ------------------------------------------------------------------ */

/**
 * A DM comment pinned to one section of a player's character sheet.
 *
 * `visibility` is per comment: 'shared' is written for the player and shows on
 * their own sheet; 'dm' is a private margin note only staff ever receive. The
 * section key is the sheet section it hangs under, not a free-text label, so
 * the same string addresses the DM's read-only view and the player's sheet.
 */
export const sheetNotes = sqliteTable(
  'sheet_notes',
  {
    id: uuid(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    characterId: text('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    /** identity | combat | abilities | skills | spellcasting | proficiencies | details | equipment */
    section: text('section').notNull(),
    body: text('body').notNull().default(''),
    authorUserId: text('author_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    /** 'shared' = the owning player sees it; 'dm' = staff only. */
    visibility: text('visibility', { enum: ['shared', 'dm'] })
      .notNull()
      .default('shared'),
    createdAt: text('created_at').default(nowIso).notNull(),
    updatedAt: text('updated_at').default(nowIso).notNull(),
  },
  t => [
    index('sheet_notes_character_idx').on(t.characterId),
    index('sheet_notes_campaign_idx').on(t.campaignId),
  ]
);

/**
 * The secret log for one character: things this player knows that the rest of
 * the table does not. Either side writes to it — the player records what their
 * character learned, the DM drops in what they were told in private.
 *
 * Three levels rather than a boolean, because the DM needs to widen a secret
 * in two steps: 'dm' (withheld, the player cannot see it yet), 'player' (that
 * player only), 'party' (revealed to everyone at the table).
 *
 * A DM-authored entry is never deletable — it can only be hidden. The log is
 * a record of what was known when, and a DM quietly erasing their own entry
 * would break that; `authorRole` is stored so the rule survives the author's
 * account being deleted.
 */
export const characterSecrets = sqliteTable(
  'character_secrets',
  {
    id: uuid(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    characterId: text('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    authorUserId: text('author_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    /** Who wrote it, kept independent of the author row surviving. */
    authorRole: text('author_role', { enum: ['gm', 'player'] })
      .notNull()
      .default('player'),
    body: text('body').notNull().default(''),
    /** 'dm' = staff only; 'player' = staff + this character's owner; 'party' = the whole table. */
    visibility: text('visibility', { enum: ['dm', 'player', 'party'] })
      .notNull()
      .default('player'),
    createdAt: text('created_at').default(nowIso).notNull(),
    updatedAt: text('updated_at').default(nowIso).notNull(),
  },
  t => [
    index('character_secrets_character_idx').on(t.characterId),
    index('character_secrets_campaign_idx').on(t.campaignId),
  ]
);

/* ------------------------------------------------------------------ */
/* The session chronicle — the campaign's spine.                       */
/* ------------------------------------------------------------------ */

/**
 * One sitting at the table.
 *
 * `prepBody` is the DM's private plan and `recapBody` is the account the party
 * is given — two documents about the same evening, never one body with hidden
 * regions, for the same reason as `canon_entries`. A recap starts private so a
 * DM can draft it during the game and hand it over when it reads right.
 *
 * `number` is the campaign-local session number and is unique per campaign, so
 * "session 12" addresses one row and a player asking about it gets an answer.
 */
export const campaignSessions = sqliteTable(
  'campaign_sessions',
  {
    id: uuid(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    number: integer('number').notNull().default(1),
    title: text('title').notNull().default(''),
    /** ISO date the table plans to meet. */
    scheduledFor: text('scheduled_for'),
    /** ISO date it actually happened. */
    playedOn: text('played_on'),
    status: text('status', { enum: ['planned', 'played', 'cancelled'] })
      .notNull()
      .default('planned'),
    /** The DM's private plan for the evening. */
    prepBody: text('prep_body').notNull().default(''),
    /** What the party is told happened. */
    recapBody: text('recap_body').notNull().default(''),
    /** 'dm' = still a draft; 'shared' = the party can read the recap. */
    recapVisibility: text('recap_visibility', { enum: ['dm', 'shared'] })
      .notNull()
      .default('dm'),
    createdBy: text('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: text('created_at').default(nowIso).notNull(),
    updatedAt: text('updated_at').default(nowIso).notNull(),
  },
  t => [
    index('campaign_sessions_campaign_idx').on(t.campaignId),
    uniqueIndex('campaign_sessions_campaign_number_idx').on(
      t.campaignId,
      t.number
    ),
  ]
);

/**
 * Who was at a given sitting. Keyed on `user_id` rather than
 * `campaign_members`, as `canon_reveals` is: the GM has no member row, and a
 * player who later leaves the table was still at session 9.
 */
export const campaignSessionAttendance = sqliteTable(
  'campaign_session_attendance',
  {
    id: uuid(),
    sessionId: text('session_id')
      .notNull()
      .references(() => campaignSessions.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    characterId: text('character_id').references(() => characters.id, {
      onDelete: 'set null',
    }),
    /**
     * The register, written by the DM after the night. Only meaningful once
     * the sitting has been played — a row created by an RSVP a fortnight
     * early carries this column's default and asserts nothing.
     */
    status: text('status', { enum: ['present', 'absent', 'late'] })
      .notNull()
      .default('present'),
    /**
     * What they said when asked, before the night. 'unknown' is the honest
     * default: silence is not a no, and a DM chasing four maybes needs to see
     * which of them never answered.
     */
    rsvp: text('rsvp', { enum: ['yes', 'no', 'maybe', 'unknown'] })
      .notNull()
      .default('unknown'),
    /** When they said it — a yes from a month ago reads differently. */
    rsvpAt: text('rsvp_at'),
    createdAt: text('created_at').default(nowIso).notNull(),
  },
  t => [
    uniqueIndex('campaign_session_attendance_session_user_idx').on(
      t.sessionId,
      t.userId
    ),
  ]
);

/* ------------------------------------------------------------------ */
/* What the party is doing, and what it is carrying.                   */
/* ------------------------------------------------------------------ */

/**
 * A thread the party is pulling on.
 *
 * Two bodies, as everywhere else in this schema: `summary` is what the party
 * has been told, `dmNotes` is what is actually going on. A quest starts
 * `visibility: 'dm'` because a DM writes down the hook before the party has
 * heard it.
 */
export const campaignQuests = sqliteTable(
  'campaign_quests',
  {
    id: uuid(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default(''),
    /** What the party has been told. */
    summary: text('summary').notNull().default(''),
    /** What is actually going on. */
    dmNotes: text('dm_notes').notNull().default(''),
    /** Who asked — free text, because half of them are not in the canon yet. */
    giver: text('giver').notNull().default(''),
    reward: text('reward').notNull().default(''),
    status: text('status', {
      enum: ['rumour', 'active', 'done', 'failed'],
    })
      .notNull()
      .default('active'),
    visibility: text('visibility', { enum: ['dm', 'shared'] })
      .notNull()
      .default('dm'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdBy: text('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: text('created_at').default(nowIso).notNull(),
    updatedAt: text('updated_at').default(nowIso).notNull(),
  },
  t => [index('campaign_quests_campaign_idx').on(t.campaignId)]
);

/**
 * One ticked line under a quest. Visibility is per objective, because "find
 * the ledger" and "the ledger is a forgery" belong to the same quest and to
 * different audiences.
 */
export const campaignQuestObjectives = sqliteTable(
  'campaign_quest_objectives',
  {
    id: uuid(),
    questId: text('quest_id')
      .notNull()
      .references(() => campaignQuests.id, { onDelete: 'cascade' }),
    body: text('body').notNull().default(''),
    done: integer('done', { mode: 'boolean' }).notNull().default(false),
    visibility: text('visibility', { enum: ['dm', 'shared'] })
      .notNull()
      .default('shared'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at').default(nowIso).notNull(),
  },
  t => [index('campaign_quest_objectives_quest_idx').on(t.questId)]
);

/**
 * The shared haul. `holderCharacterId` answers the question that actually
 * starts arguments at a table: who is carrying it.
 */
export const partyLoot = sqliteTable(
  'party_loot',
  {
    id: uuid(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    name: text('name').notNull().default(''),
    quantity: integer('quantity').notNull().default(1),
    notes: text('notes').notNull().default(''),
    kind: text('kind', {
      enum: ['item', 'consumable', 'treasure', 'magic'],
    })
      .notNull()
      .default('item'),
    holderCharacterId: text('holder_character_id').references(
      () => characters.id,
      { onDelete: 'set null' }
    ),
    /** False for the wand nobody has worked out yet. */
    identified: integer('identified', { mode: 'boolean' })
      .notNull()
      .default(true),
    createdBy: text('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: text('created_at').default(nowIso).notNull(),
    updatedAt: text('updated_at').default(nowIso).notNull(),
  },
  t => [index('party_loot_campaign_idx').on(t.campaignId)]
);

/**
 * The party's common purse. Coins are a running total the whole table edits,
 * not a list of finds, so they are columns on one row rather than rows.
 */
export const partyTreasury = sqliteTable('party_treasury', {
  campaignId: text('campaign_id')
    .primaryKey()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  cp: integer('cp').notNull().default(0),
  sp: integer('sp').notNull().default(0),
  ep: integer('ep').notNull().default(0),
  gp: integer('gp').notNull().default(0),
  pp: integer('pp').notNull().default(0),
  updatedAt: text('updated_at').default(nowIso).notNull(),
});

/* ------------------------------------------------------------------ */
/* Campaign images — portraits and sketches attached to campaign things.*/
/* ------------------------------------------------------------------ */

/**
 * One uploaded image belonging to a campaign, stored on disk beside the
 * handouts (see `src/server/uploads.ts`) rather than as a data URI in the row.
 * A portrait is read every time its entry is listed, and base64 in SQLite
 * would drag that weight through every query and every backup.
 *
 * Rows here are shared plumbing: canon entries, downtime actions and anything
 * else that wants a picture reference one by id. Access is judged by the thing
 * pointing at the image, so the serve route only asks "are you at this table".
 */
export const campaignImages = sqliteTable(
  'campaign_images',
  {
    id: uuid(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    /** Path under UPLOADS_DIR, e.g. "<campaignId>/<uuid>.webp". */
    filePath: text('file_path').notNull(),
    mime: text('mime').notNull(),
    bytes: integer('bytes').notNull().default(0),
    /** Shown when the image cannot load, and read out by screen readers. */
    alt: text('alt').notNull().default(''),
    uploadedBy: text('uploaded_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: text('created_at').default(nowIso).notNull(),
  },
  t => [index('campaign_images_campaign_idx').on(t.campaignId)]
);

/* --- Campaign content library (0016) ---------------------------------- */

/**
 * Homebrew that is actually in play at a table.
 *
 * `homebrew_approvals` records a *decision*; this records the *consequence*.
 * Before it existed, `homebrew_approvals.status` was written by the review
 * panel and read by nothing, so approving an item changed no behaviour
 * anywhere. Every "may this character use that?" question is answered from
 * here.
 *
 * A DM's own content has no submission behind it, which is why `source`
 * distinguishes the two ways a row appears rather than this being a view over
 * approvals.
 */
export const campaignHomebrew = sqliteTable(
  'campaign_homebrew',
  {
    id: uuid(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    homebrewId: text('homebrew_id')
      .notNull()
      .references(() => homebrew.id, { onDelete: 'cascade' }),
    /** Null once that user is deleted, as elsewhere. */
    addedBy: text('added_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    source: text('source', {
      enum: ['gm-authored', 'approved-submission'],
    })
      .notNull()
      .default('gm-authored'),
    /** The DM's line about it. Party-visible — there is no secret half here. */
    note: text('note').notNull().default(''),
    createdAt: text('created_at').default(nowIso).notNull(),
  },
  t => [
    uniqueIndex('campaign_homebrew_campaign_entry_idx').on(
      t.campaignId,
      t.homebrewId
    ),
    index('campaign_homebrew_campaign_idx').on(t.campaignId),
    index('campaign_homebrew_homebrew_idx').on(t.homebrewId),
  ]
);

/* --- The DM's notebook, and reveals (0017) ---------------------------- */

/**
 * A page of the DM's prep.
 *
 * Every other note in this schema is attached to something — a session, a
 * quest, a canon entry. Real prep is not shaped like that, and before this it
 * had one home: `campaigns.settings.sessionNotes`, a single textarea. A page
 * has a title, tags, and its own visibility, and can be filed under a sitting
 * or left standing.
 */
export const campaignNotes = sqliteTable(
  'campaign_notes',
  {
    id: uuid(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default(''),
    body: text('body').notNull().default(''),
    /** Comma-separated and lower-cased; read whole, never joined against. */
    tags: text('tags').notNull().default(''),
    pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
    /** The sitting this page is prep for. Null is a standing note. */
    sessionId: text('session_id').references(() => campaignSessions.id, {
      onDelete: 'set null',
    }),
    visibility: text('visibility', { enum: ['dm', 'shared'] })
      .notNull()
      .default('dm'),
    createdBy: text('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: text('created_at').default(nowIso).notNull(),
    updatedAt: text('updated_at').default(nowIso).notNull(),
  },
  t => [index('campaign_notes_campaign_idx').on(t.campaignId)]
);

/**
 * One thing the party was told.
 *
 * `body` is the excerpt **copied at the moment it was revealed**, not a
 * pointer into the note it came from. Offsets into a living document rewrite
 * themselves the next time the DM edits it, and a record of what the party was
 * told last week cannot be allowed to change this week. `sourceId` is a
 * back-reference only, and is allowed to dangle: the note may be deleted and
 * the reveal still happened.
 *
 * This is the one place in the schema where copying text is right, and it is
 * the mirror of the content model's rule 1 rather than a violation of it —
 * there a copy forks a live thing that must stay in sync, here a copy freezes
 * a dead one that must not move.
 */
export const campaignReveals = sqliteTable(
  'campaign_reveals',
  {
    id: uuid(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    sourceKind: text('source_kind', {
      enum: ['note', 'session', 'quest', 'canon', 'free'],
    })
      .notNull()
      .default('note'),
    /** Deliberately no reference — see the note above. */
    sourceId: text('source_id'),
    body: text('body').notNull().default(''),
    revealedBy: text('revealed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    sessionId: text('session_id').references(() => campaignSessions.id, {
      onDelete: 'set null',
    }),
    /** 'party' reaches the table; 'selected' reaches only the target rows. */
    visibility: text('visibility', { enum: ['party', 'selected'] })
      .notNull()
      .default('party'),
    createdAt: text('created_at').default(nowIso).notNull(),
  },
  t => [index('campaign_reveals_campaign_idx').on(t.campaignId, t.createdAt)]
);

/**
 * Who a 'selected' reveal reached. Keyed on `user_id` for the same reason as
 * `canon_reveals`: the GM has no member row, and a player who later leaves the
 * table was still told.
 */
export const campaignRevealTargets = sqliteTable(
  'campaign_reveal_targets',
  {
    id: uuid(),
    revealId: text('reveal_id')
      .notNull()
      .references(() => campaignReveals.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').default(nowIso).notNull(),
  },
  t => [
    uniqueIndex('campaign_reveal_targets_pair_idx').on(t.revealId, t.userId),
    index('campaign_reveal_targets_user_idx').on(t.userId),
  ]
);

/* --- Fights, built before anyone is at the table (0019) --------------- */

/**
 * A fight the DM is planning.
 *
 * Deliberately not an `initiative_encounters` row with a draft flag. A plan
 * and a fight have different lifetimes: a plan is reusable — the same ambush
 * runs twice, or at two tables — while an encounter is one evening with hit
 * points on it. Folding them together would make a finished fight still a
 * plan, and re-running one would mean resetting every hit point rather than
 * dealing a fresh copy.
 */
export const encounterPlans = sqliteTable(
  'encounter_plans',
  {
    id: uuid(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    name: text('name').notNull().default(''),
    /** How it starts. Prep, so never party-visible — there is no shared half. */
    notes: text('notes').notNull().default(''),
    sessionId: text('session_id').references(() => campaignSessions.id, {
      onDelete: 'set null',
    }),
    createdBy: text('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: text('created_at').default(nowIso).notNull(),
    updatedAt: text('updated_at').default(nowIso).notNull(),
  },
  t => [index('encounter_plans_campaign_idx').on(t.campaignId)]
);

/**
 * "Three goblin warriors" — one row per kind of monster in a plan.
 *
 * `contentSource` + `contentKey` are the two halves of a `ContentRef` whose
 * type is always `creature`, since nothing else goes in a fight. `name` beside
 * them is the denormalisation the content model allows on `inventory[].name`
 * (rule 1): stats are resolved at read time and never copied here, but a
 * homebrew monster its author deleted still has to render as a word.
 */
export const encounterPlanLines = sqliteTable(
  'encounter_plan_lines',
  {
    id: uuid(),
    planId: text('plan_id')
      .notNull()
      .references(() => encounterPlans.id, { onDelete: 'cascade' }),
    contentSource: text('content_source', { enum: ['srd', 'homebrew'] })
      .notNull()
      .default('srd'),
    contentKey: text('content_key').notNull(),
    /** For the deleted-homebrew case only. Never a source of stats. */
    name: text('name').notNull().default(''),
    count: integer('count').notNull().default(1),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at').default(nowIso).notNull(),
  },
  t => [index('encounter_plan_lines_plan_idx').on(t.planId)]
);

/* --- The screen each person built for themselves (0020) --------------- */

/**
 * Which panels one person keeps on their screen at one table.
 *
 * Keyed on `(campaign_id, user_id)` rather than on the member row, for the
 * same reason as `canon_reveals`: the GM has no member row, and the GM is who
 * this exists for.
 *
 * One JSON blob rather than a row per panel. It is read whole, written whole,
 * and never queried by its contents — "which players keep initiative up" is
 * not a question anything asks — so a row per panel would buy joins nobody
 * performs and turn a reorder into a diff.
 */
export const campaignScreenLayouts = sqliteTable(
  'campaign_screen_layouts',
  {
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** `{ main: string[], rail: string[] }` — panel keys, in order. */
    layout: text('layout', { mode: 'json' })
      .notNull()
      .default(sql`'{}'`),
    updatedAt: text('updated_at').default(nowIso).notNull(),
  },
  t => [primaryKey({ columns: [t.campaignId, t.userId] })]
);

/* --- What the party got for the night (0022) -------------------------- */

/**
 * One handout of experience, or one milestone level.
 *
 * The sheets remain the source of truth for a character's experience and
 * level; these rows are the receipt, not the balance. The change itself goes
 * through the character write path and lands in `character_history`, so the
 * player's own log shows it in the DM's wording (content model rule 7).
 */
export const sessionAwards = sqliteTable(
  'session_awards',
  {
    id: uuid(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    /** Null for an award between sittings, or one nobody filed. */
    sessionId: text('session_id').references(() => campaignSessions.id, {
      onDelete: 'set null',
    }),
    kind: text('kind', { enum: ['xp', 'milestone'] })
      .notNull()
      .default('xp'),
    /** Experience each recipient received. Zero for a milestone. */
    xp: integer('xp').notNull().default(0),
    /** Levels each recipient gained. Zero for an experience award. */
    levels: integer('levels').notNull().default(0),
    /** What it was for. Party-visible — nobody is levelled up in secret. */
    note: text('note').notNull().default(''),
    awardedBy: text('awarded_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: text('created_at').default(nowIso).notNull(),
  },
  t => [index('session_awards_campaign_idx').on(t.campaignId, t.createdAt)]
);

/**
 * Who actually took an award.
 *
 * Not derivable from attendance: a player who missed the night sometimes still
 * gets it and a guest sometimes does not, and "did Pip get the XP for session
 * 9?" is a question the record should answer a year later. `characterName` is
 * the denormalisation rule 1 allows on `inventory[].name` — a deleted
 * character still renders as a word, and never as a source of stats.
 */
export const sessionAwardGrants = sqliteTable(
  'session_award_grants',
  {
    id: uuid(),
    awardId: text('award_id')
      .notNull()
      .references(() => sessionAwards.id, { onDelete: 'cascade' }),
    characterId: text('character_id').references(() => characters.id, {
      onDelete: 'set null',
    }),
    characterName: text('character_name').notNull().default(''),
    xp: integer('xp').notNull().default(0),
    levels: integer('levels').notNull().default(0),
    createdAt: text('created_at').default(nowIso).notNull(),
  },
  t => [
    index('session_award_grants_award_idx').on(t.awardId),
    index('session_award_grants_character_idx').on(t.characterId),
  ]
);

/* --- The things happening anyway (0025) ------------------------------- */

/**
 * A countdown with segments: the ritual is five-eighths done, the guard is
 * three-quarters convinced.
 *
 * The two audiences are shaped differently from `canon_entries` here. A clock
 * has one body and a *hidden* half — the party can be shown that something is
 * at 5/8 without being told what happens at 8/8, and that is precisely the
 * pressure a clock exists to create. So the title and the segments are what a
 * shared clock reveals, and `dmNote` never leaves staff.
 */
export const campaignClocks = sqliteTable(
  'campaign_clocks',
  {
    id: uuid(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default(''),
    /** What happens when it fills. Staff only. */
    dmNote: text('dm_note').notNull().default(''),
    /** 4, 6, 8 or 12 — a clock is read as a fraction at a glance. */
    segments: integer('segments').notNull().default(6),
    filled: integer('filled').notNull().default(0),
    visibility: text('visibility', { enum: ['dm', 'shared'] })
      .notNull()
      .default('dm'),
    /** 'done' has gone off, and is kept as a record of that. */
    status: text('status', { enum: ['running', 'done'] })
      .notNull()
      .default('running'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdBy: text('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: text('created_at').default(nowIso).notNull(),
    updatedAt: text('updated_at').default(nowIso).notNull(),
  },
  t => [index('campaign_clocks_campaign_idx').on(t.campaignId)]
);

/* --- The players' own notebook (0026) --------------------------------- */

/**
 * A page a player writes about this campaign.
 *
 * Every other note surface in this app belongs to the DM. A player who wants
 * to write down what they think the reeve is up to has had nowhere to do it,
 * and has been doing it in a text file.
 *
 * Three audiences rather than the usual two, because a player has one the DM
 * does not: `private` means the author alone, and **staff cannot read it**.
 * That is the point of the feature — a notebook a DM can read is not a
 * notebook, and a player who suspects it is will go back to the text file.
 *
 * Campaign-scoped rather than character-scoped on purpose: a player's thinking
 * outlives the character who died in session six.
 */
export const playerJournals = sqliteTable(
  'player_journals',
  {
    id: uuid(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    /** The author. Cascade rather than set-null: an orphan page has no reader. */
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default(''),
    body: text('body').notNull().default(''),
    visibility: text('visibility', { enum: ['private', 'dm', 'party'] })
      .notNull()
      .default('private'),
    /** The sitting it is about. Null is a standing page. */
    sessionId: text('session_id').references(() => campaignSessions.id, {
      onDelete: 'set null',
    }),
    createdAt: text('created_at').default(nowIso).notNull(),
    updatedAt: text('updated_at').default(nowIso).notNull(),
  },
  t => [
    index('player_journals_campaign_idx').on(t.campaignId),
    index('player_journals_author_idx').on(t.campaignId, t.userId),
  ]
);

/* --- Maps, and things marked on them (0028) --------------------------- */

/**
 * A picture the table treats as a map.
 *
 * Deliberately not a battle grid. Tokens that move, fog of war and a square
 * lattice are a different feature with a different failure mode — one that has
 * to stay right while five people drag things at once. This is the other half
 * of what a table uses a map for: knowing where places are, and being told
 * about them one at a time.
 */
export const campaignMaps = sqliteTable(
  'campaign_maps',
  {
    id: uuid(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    /** Cascade: a map with no image is not a map. */
    imageId: text('image_id')
      .notNull()
      .references(() => campaignImages.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default(''),
    visibility: text('visibility', { enum: ['dm', 'shared'] })
      .notNull()
      .default('dm'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdBy: text('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: text('created_at').default(nowIso).notNull(),
    updatedAt: text('updated_at').default(nowIso).notNull(),
  },
  t => [index('campaign_maps_campaign_idx').on(t.campaignId)]
);

/**
 * Something marked on a map.
 *
 * `x` and `y` are **fractions of the image**, 0..1, not pixels. A pin placed
 * on a DM's 2560-wide monitor has to land in the same place on a player's
 * phone, and a pixel coordinate is a promise about a viewport nobody else has.
 *
 * `canonEntryId` is the point of the feature rather than a nicety: a pin that
 * opens the innkeeper's entry makes this a view of the world the campaign
 * already wrote down, instead of a second place to write the same names. No
 * reference, following `canon_entries.image_id` — a dangling link reads as a
 * pin with nothing behind it rather than breaking the map.
 */
export const campaignMapPins = sqliteTable(
  'campaign_map_pins',
  {
    id: uuid(),
    mapId: text('map_id')
      .notNull()
      .references(() => campaignMaps.id, { onDelete: 'cascade' }),
    x: real('x').notNull().default(0.5),
    y: real('y').notNull().default(0.5),
    label: text('label').notNull().default(''),
    /** What the DM knows about it. Never travels to a player. */
    dmNote: text('dm_note').notNull().default(''),
    canonEntryId: text('canon_entry_id'),
    visibility: text('visibility', { enum: ['dm', 'shared'] })
      .notNull()
      .default('dm'),
    createdAt: text('created_at').default(nowIso).notNull(),
    updatedAt: text('updated_at').default(nowIso).notNull(),
  },
  t => [index('campaign_map_pins_map_idx').on(t.mapId)]
);

/* --- The Wandering Library (0029) ------------------------------------- */

/**
 * One listing on the public shelf.
 *
 * The first table in this schema that exists so one account's rows can reach
 * another's. `kind` is load-bearing because it decides how the thing behind a
 * listing is delivered:
 *
 * - `homebrew` is **live-linked**. `homebrewId` points at the author's live row,
 *   so their later correction reaches every table using it — content-model
 *   rule 1 (a copy is a fork) applied across accounts.
 * - `character`, `campaign`, `image` and `bundle` are **snapshots**. Adopting
 *   mints rows the adopter owns outright, because a sheet and a campaign are
 *   mutable play state and nobody wants their prep rewritten under them
 *   mid-session because the author kept editing.
 *
 * `payload` is filled for both. On the live kind it is the fallback, so a
 * withdrawn or deleted homebrew row still renders as what it was rather than as
 * a blank card — the same reason `inventory[].name` is denormalised onto a
 * sheet.
 */
export const publications = sqliteTable(
  'publications',
  {
    id: uuid(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind', {
      enum: ['homebrew', 'character', 'campaign', 'image', 'bundle'],
    }).notNull(),
    /** Set null, not cascade: the listing falls back to its frozen payload. */
    homebrewId: text('homebrew_id').references(() => homebrew.id, {
      onDelete: 'set null',
    }),
    /** The narrow type when the listing is one piece of content. */
    contentType: text('content_type'),
    title: text('title').notNull(),
    summary: text('summary').notNull().default(''),
    /** JSON array of lowercase strings. */
    tags: text('tags', { mode: 'json' })
      .notNull()
      .default(sql`'[]'`),
    /**
     * Who wrote it, as the shelf says it. Frozen at publish time rather than
     * joined on `user.name`, so renaming an account does not rewrite history
     * and a deleted author still gets their credit.
     */
    credit: text('credit').notNull().default(''),
    visibility: text('visibility', { enum: ['public', 'unlisted'] })
      .notNull()
      .default('public'),
    /**
     * `withdrawn` takes it off the shelf and stops new adoptions. It reaches
     * into nobody's existing one — cascading a delete into other users'
     * characters would be worse than saying plainly that this app cannot
     * un-share a thing.
     */
    status: text('status', { enum: ['listed', 'withdrawn'] })
      .notNull()
      .default('listed'),
    payload: text('payload', { mode: 'json' })
      .notNull()
      .default(sql`'{}'`),
    /**
     * The picture drawn on the card. No reference, following
     * `campaign_map_pins.canon_entry_id`: a deleted cover should read as a card
     * with no picture rather than break the listing.
     */
    coverAssetId: text('cover_asset_id'),
    version: integer('version').notNull().default(1),
    createdAt: text('created_at').default(nowIso).notNull(),
    updatedAt: text('updated_at').default(nowIso).notNull(),
  },
  t => [
    index('publications_owner_idx').on(t.ownerId),
    index('publications_shelf_idx').on(t.status, t.visibility, t.kind),
    index('publications_content_type_idx').on(t.contentType),
    uniqueIndex('publications_homebrew_idx').on(t.homebrewId),
  ]
);

/**
 * A piece a listing carries.
 *
 * Items are always snapshots, even inside a live-linked publication: a species
 * bundled with a hero has to keep working when its author reorganises their own
 * forge. `localKey` is how refs between items survive being remapped into an
 * adopter's account — it is unique within the package and means nothing
 * outside it.
 */
export const publicationItems = sqliteTable(
  'publication_items',
  {
    id: uuid(),
    publicationId: text('publication_id')
      .notNull()
      .references(() => publications.id, { onDelete: 'cascade' }),
    kind: text('kind', {
      enum: ['homebrew', 'character', 'canon', 'quest', 'note', 'map', 'image'],
    }).notNull(),
    contentType: text('content_type'),
    name: text('name').notNull().default(''),
    payload: text('payload', { mode: 'json' })
      .notNull()
      .default(sql`'{}'`),
    localKey: text('local_key').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at').default(nowIso).notNull(),
  },
  t => [
    index('publication_items_publication_idx').on(t.publicationId),
    uniqueIndex('publication_items_local_key_idx').on(
      t.publicationId,
      t.localKey
    ),
  ]
);

/**
 * What a reader took off the shelf, and how they took it.
 *
 * Two modes, and the difference is the whole point. `linked` puts the author's
 * live row on the reader's shelf — the author's correction reaches them, and it
 * is not theirs to edit. `forked` gave them their own copy, theirs to edit,
 * after which the two never speak again.
 *
 * Snapshot kinds are always effectively a fork: adopting mints characters,
 * campaigns and images the reader owns. The row survives as provenance and as
 * the count on a listing — counted from here rather than kept as a column on
 * `publications`, because a denormalised counter is a number that can be wrong
 * and this one has no reason to be.
 */
export const adoptions = sqliteTable(
  'adoptions',
  {
    id: uuid(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    publicationId: text('publication_id')
      .notNull()
      .references(() => publications.id, { onDelete: 'cascade' }),
    mode: text('mode', { enum: ['linked', 'forked'] })
      .notNull()
      .default('linked'),
    /**
     * What the adoption resolves to on the reader's shelf: the author's row for
     * a link, the reader's own for a fork. Set null, never cascade — losing the
     * content must not erase the record that it was taken.
     */
    homebrewId: text('homebrew_id').references(() => homebrew.id, {
      onDelete: 'set null',
    }),
    characterId: text('character_id').references(() => characters.id, {
      onDelete: 'set null',
    }),
    campaignId: text('campaign_id').references(() => campaigns.id, {
      onDelete: 'set null',
    }),
    /** The listing's version when it was taken, so a reader can be told they
     *  are behind what is on the shelf now. */
    version: integer('version').notNull().default(1),
    createdAt: text('created_at').default(nowIso).notNull(),
  },
  t => [
    uniqueIndex('adoptions_user_publication_idx').on(t.userId, t.publicationId),
    index('adoptions_publication_idx').on(t.publicationId),
    index('adoptions_user_idx').on(t.userId),
  ]
);

/**
 * A file a listing carries.
 *
 * The bytes are copied on publish rather than pointed at: `campaign_images` is
 * read behind a `requireCampaignRole` check, so a listing pointing at one would
 * be unreadable to everybody not at that table — and bypassing the check on the
 * route that serves campaign files is the last place to put a bypass. Copying
 * also means archiving the campaign a picture came from cannot take the listing's
 * picture with it.
 *
 * Files live under `UPLOADS_DIR/library/<publicationId>/`, so a deleted listing
 * is one directory to remove.
 */
export const publicationAssets = sqliteTable(
  'publication_assets',
  {
    id: uuid(),
    publicationId: text('publication_id')
      .notNull()
      .references(() => publications.id, { onDelete: 'cascade' }),
    /** Path under `UPLOADS_DIR`, e.g. `library/<publicationId>/<uuid>.webp`. */
    filePath: text('file_path').notNull(),
    mime: text('mime').notNull(),
    bytes: integer('bytes').notNull().default(0),
    alt: text('alt').notNull().default(''),
    /**
     * Which piece of the package this picture belongs to. No reference: items
     * are rewritten wholesale when a package is re-frozen, and an asset
     * outliving that beats a re-freeze failing on a constraint.
     */
    itemLocalKey: text('item_local_key').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at').default(nowIso).notNull(),
  },
  t => [index('publication_assets_publication_idx').on(t.publicationId)]
);
