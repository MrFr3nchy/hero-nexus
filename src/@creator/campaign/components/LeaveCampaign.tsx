'use client';

import { Button } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useConfirm } from '@/@shared/components/ui';
import { leaveCampaignAction } from '../actions';

/**
 * A member's way out of a campaign. The DM has no member row to leave — a
 * table without its DM is not a table — so the campaign page shows this to
 * players and co-DMs only.
 */
export function LeaveCampaign({
  campaignId,
  campaignName,
}: {
  campaignId: string;
  campaignName: string;
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leave = async () => {
    const ok = await confirm({
      title: `Leave ${campaignName}?`,
      body: 'Your hero stays yours and stops being seated here. The DM can let you back in with the join code.',
      confirmLabel: 'Leave the campaign',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    const res = await leaveCampaignAction(campaignId);
    if (!res.ok) {
      setBusy(false);
      setError(res.error ?? 'Failed to leave the campaign.');
      return;
    }
    router.push('/campaigns');
  };

  return (
    <>
      {dialog}
      <Button
        size="sm"
        variant="light"
        color="danger"
        isLoading={busy}
        onPress={leave}
      >
        Leave the campaign
      </Button>
      {error && (
        <span role="alert" className="text-sm text-danger">
          {error}
        </span>
      )}
    </>
  );
}
