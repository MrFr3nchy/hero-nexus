'use client';

import { Button, Link } from '@heroui/react';

import {
  EmptyState,
  PageHeader,
  PageShell,
  SealedLetterScene,
} from '@/@shared/components/ui';

/**
 * Phase 2: browse public homebrew shared by other players. Private homebrew
 * you've created lives at /creator/homebrew today; `homebrew.visibility` is
 * already in the schema for when this marketplace ships.
 */
export function PublicHomebrewMarketplace() {
  return (
    <PageShell width="wide">
      <PageHeader
        rule={false}
        title="The Market"
        description="Homebrew other tables have shared."
      />
      <EmptyState
        scene={<SealedLetterScene />}
        title="The stalls aren't up yet"
        description="Sharing homebrew between tables lands in Phase 2. Until then, your own drafts live in the Forge."
        action={
          <Button as={Link} href="/creator/homebrew" color="primary">
            Go to the Forge
          </Button>
        }
      />
    </PageShell>
  );
}
