'use client';

import { Button } from '@heroui/react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Glyph } from '@/@shared/components/ui';

import { getAiSettingsAction } from '../actions';

/**
 * "Draft a hero" beside "Import from D&D Beyond", for a DM who has a key.
 * Absent for everybody else, rather than a link to a page they cannot use.
 */
export function DraftHeroLink() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    getAiSettingsAction().then(res =>
      setShow(
        res.ok && res.data.available && res.data.runsATable && !!res.data.key
      )
    );
  }, []);

  if (!show) return null;
  return (
    <Button
      as={Link}
      href="/characters/draft"
      variant="flat"
      size="sm"
      startContent={<Glyph name="quill" size={14} />}
    >
      Draft a hero
    </Button>
  );
}
