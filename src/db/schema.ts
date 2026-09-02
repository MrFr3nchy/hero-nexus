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
    conditions: text('conditions').notNull().default(''),
    sort: integer('sort').notNull().default(0),
  },
  t => [index('initiative_entries_encounter_idx').on(t.encounterId)]
);

/* ------------------------------------------------------------------ */
/* Party canon — a campaign wiki with a DM view and a party view.     */
/* ------------------------------------------------------------------ */

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
      enum: ['npc', 'location', 'item', 'faction', 'lore'],
    }).notNull(),
    title: text('title').notNull().default(''),
    dmBody: text('dm_body').notNull().default(''),
    partyBody: text('party_body').notNull().default(''),
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
