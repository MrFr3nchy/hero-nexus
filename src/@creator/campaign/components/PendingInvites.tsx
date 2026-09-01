'use client';

import { Button } from '@heroui/react';
import { useEffect, useState } from 'react';

import { SectionCard } from '@/@shared/components/ui';
import type { CampaignInviteRow } from '@/server/campaigns';
import {
  acceptInviteAction,
  declineInviteAction,
  listMyInvitesAction,
} from '../actions';

export function PendingInvites() {
  const [invites, setInvites] = useState<CampaignInviteRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = () =>
    listMyInvitesAction()
      .then(setInvites)
      .catch(() => setInvites([]))
      .finally(() => setLoaded(true));

  useEffect(() => {
    refresh();
  }, []);

  if (!loaded || invites.length === 0) return null;

  return (
    <div className="mb-6">
      <SectionCard title="Campaign invites">
        <ul className="divide-y divide-line">
          {invites.map(inv => (
            <li
              key={inv.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div>
                <p className="text-sm font-medium text-ink">
                  {inv.campaignName}
                </p>
                <p className="text-xs text-ink-muted">
                  Invited by {inv.invitedByName ?? 'the DM'}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  color="primary"
                  onPress={async () => {
                    await acceptInviteAction(inv.id);
                    refresh();
                  }}
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="light"
                  className="text-ink-muted"
                  onPress={async () => {
                    await declineInviteAction(inv.id);
                    refresh();
                  }}
                >
                  Decline
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
