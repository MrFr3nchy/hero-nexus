'use client';

/**
 * The workshop's front page: the shelf of boards, and a new one. A
 * collection page — the boards are the objects, so they lead. The shelf
 * itself is `BoardShelf`, shared with the campaign page's Boards tab.
 */
import Link from 'next/link';

import { Glyph, PageHeader, PageShell } from '@/@shared/components/ui';
import { BoardShelf, type BoardRow } from './BoardShelf';

export function WorkshopShelf({
  campaignId,
  campaignName,
  boards,
}: {
  campaignId: string;
  campaignName: string;
  boards: BoardRow[];
}) {
  return (
    <PageShell>
      <PageHeader
        title="The workshop"
        description={`${campaignName} — the boards on the shelf, and a new one.`}
        rule={false}
        actions={
          <>
            <Link
              href={`/campaigns/${campaignId}`}
              className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
            >
              <Glyph name="back" size={14} />
              The campaign
            </Link>
            <Link
              href={`/campaigns/${campaignId}/screen`}
              className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
            >
              <Glyph name="sword" size={14} />
              The table
            </Link>
          </>
        }
      />
      <BoardShelf campaignId={campaignId} initial={boards} />
    </PageShell>
  );
}
