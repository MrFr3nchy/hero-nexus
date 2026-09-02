/**
 * Filesystem location for handout uploads.
 *
 * Defaults to `data/uploads` under the project, matching the historical path.
 * Override with `HERO_NEXUS_UPLOADS_DIR` in production to point at the mounted
 * data volume — same pattern as `HERO_NEXUS_DB_PATH`. These files are not in
 * the database and need their own backup (see `docs/ops/restore.md`).
 */
import 'server-only';

import { join } from 'node:path';

export const UPLOADS_DIR =
  process.env.HERO_NEXUS_UPLOADS_DIR ?? join(process.cwd(), 'data', 'uploads');
