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
    /** Full character sheet, JSON-encoded. Schema owned by
     *  `src/@creator/character/schema.ts`. */
    sheet: text('sheet', { mode: 'json' }).notNull(),
    createdAt: text('created_at').default(nowIso).notNull(),
    updatedAt: text('updated_at').default(nowIso).notNull(),
  },
  t => [index('characters_owner_id_idx').on(t.ownerId)]
);

export const homebrew = sqliteTable(
  'homebrew',
  {
    id: uuid(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['class', 'spell', 'item'] }).notNull(),
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
