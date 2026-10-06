'use client';

import { Button } from '@heroui/react';
import { useState } from 'react';

import { Glyph, useConfirm } from '@/@shared/components/ui';
import { tapXCardAction } from '../safety-actions';

/**
 * The X-card: any player can tap it, and the DM is told to pause and check
 * in — not who asked. The confirm says plainly what anonymity covers and
 * what it does not, rather than promising more than it can.
 */
export function XCardButton({
  campaignId,
  size = 'sm',
}: {
  campaignId: string;
  size?: 'sm' | 'md';
}) {
  const { confirm, dialog } = useConfirm();
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const tap = async () => {
    const ok = await confirm({
      title: 'Tap the X-card?',
      body: 'The DM is told someone wants to pause and check in, and any running countdowns are held. We don’t record who tapped it — though with only a few people online, the timing may say.',
      confirmLabel: 'Tap it',
    });
    if (!ok) return;
    setState('busy');
    setError(null);
    const res = await tapXCardAction(campaignId);
    if (!res.ok) {
      setState('idle');
      setError(res.error);
      return;
    }
    setState('sent');
    setTimeout(() => setState('idle'), 8000);
  };

  return (
    <>
      {dialog}
      <Button
        size={size}
        variant="flat"
        startContent={<Glyph name="x" size={14} />}
        isLoading={state === 'busy'}
        onPress={tap}
        aria-describedby={error ? 'xcard-error' : undefined}
      >
        {state === 'sent' ? 'The DM has been told' : 'X-card'}
      </Button>
      {error && (
        <span id="xcard-error" role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </>
  );
}
