'use client';

import { Button } from '@heroui/react';

import { Glyph, Panel } from '@/@shared/components/ui';
import type { KeptLookup } from '../../lib/lookup';
import { LookupView } from './LookupView';

/**
 * What Search opened, beside the panels — never over them. The table keeps
 * running underneath: a DM reading Hold Person mid-turn can still press Next
 * turn. It wears the same chrome as every panel (rule 9) and is reference,
 * so a hollow dot.
 */
export function LookupPeek({
  campaignId,
  item,
  isStaff,
  kept,
  onKeep,
  onClose,
  onError,
  className = '',
}: {
  campaignId: string;
  item: KeptLookup;
  isStaff: boolean;
  /** Already on the Lookups panel. */
  kept: boolean;
  onKeep: () => void;
  onClose: () => void;
  onError: (message: string) => void;
  className?: string;
}) {
  return (
    <Panel
      title={item.name}
      status="reference"
      label={`Looked up: ${item.name}`}
      className={className}
      bodyClassName="flex flex-col"
    >
      <div className="flex-1">
        <LookupView
          campaignId={campaignId}
          lookup={item.ref}
          isStaff={isStaff}
          onError={onError}
        />
      </div>
      <div className="sticky -bottom-2 mt-3 flex gap-2 border-t border-line bg-surface pb-1 pt-2">
        <Button
          size="sm"
          color="primary"
          isDisabled={kept}
          startContent={<Glyph name="magnifier" size={13} />}
          onPress={onKeep}
        >
          {kept ? 'Kept on the screen' : 'Keep it on the screen'}
        </Button>
        <Button size="sm" variant="light" onPress={onClose}>
          Close
        </Button>
      </div>
    </Panel>
  );
}
