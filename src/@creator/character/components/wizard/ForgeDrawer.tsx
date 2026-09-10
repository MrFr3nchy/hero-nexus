'use client';

import { useEffect, useState } from 'react';
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Textarea,
} from '@heroui/react';

import { saveHomebrewAction } from '@/@creator/homebrew/actions';
import { ContentDataForm } from '@/@creator/homebrew/components/forms/ContentDataForm';
import { StatBlock } from '@/@shared/components/StatBlock';
import { Glyph } from '@/@shared/components/ui';
import {
  contentMeta,
  emptyContentData,
  type ContentEntry,
  type ContentType,
} from '@/@shared/content';

/**
 * The Forge, over the build, without leaving it.
 *
 * "A class of your own" used to be a text box. It wrote a bare name onto the
 * sheet — `build.classKey` empty, `build.className` a string — and on save
 * `syncCharacterHomebrew` minted a `homebrew` row whose `data` was
 * `{source: 'character-creator', kind, field, traits}`: not the shape
 * `CONTENT_SCHEMAS` defines for a class, so the thing had no hit die, no
 * caster type and no features, and opening it in the Forge afterwards showed
 * an empty typed form. It also inverted content-model rule 1 — the sheet held
 * a name instead of a reference.
 *
 * This is the real form instead. `ContentDataForm` is the Forge's own switch,
 * `StatBlock` is the one renderer, and what comes back is a genuine homebrew
 * row that the catalog can offer like any other option — so the wizard picks
 * it by `ContentRef` exactly as it picks a Fighter.
 *
 * A modal rather than a link to `/creator/homebrew`: forging a species is a
 * detour inside building a hero, not a different errand, and the player's
 * half-made character should still be behind it when they look up.
 */
export function ForgeDrawer({
  type,
  isOpen,
  onClose,
  onForged,
  /** Prefills the name when the player already typed one on the step. */
  initialName = '',
}: {
  type: ContentType;
  isOpen: boolean;
  onClose: () => void;
  /** The saved row, as the wizard needs it: a key and a name to select. */
  onForged: (forged: { id: string; name: string }) => void;
  initialName?: string;
}) {
  const meta = contentMeta(type);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState('');
  const [data, setData] = useState<unknown>(() => emptyContentData(type));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reopening for a different kind — or after a save — starts clean rather
  // than showing the last thing forged.
  useEffect(() => {
    if (!isOpen) return;
    setName(initialName);
    setDescription('');
    setData(emptyContentData(type));
    setError(null);
  }, [isOpen, type, initialName]);

  /** The draft as the thing it will become, so the preview is never a mock-up. */
  const preview: ContentEntry = {
    ref: { source: 'homebrew', type, key: 'draft' },
    type,
    name: name.trim() || `Unnamed ${meta.label.toLowerCase()}`,
    description,
    data,
  };

  const save = async () => {
    if (!name.trim()) {
      setError(`Give the ${meta.label.toLowerCase()} a name first.`);
      return;
    }
    setSaving(true);
    setError(null);
    const result = await saveHomebrewAction({
      type,
      name: name.trim(),
      description,
      data,
      visibility: 'private',
    });
    setSaving(false);
    if (!result.ok || !result.id) {
      setError(result.error ?? 'Failed to save.');
      return;
    }
    onForged({ id: result.id, name: name.trim() });
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={open => !open && onClose()}
      size="5xl"
      scrollBehavior="inside"
    >
      <ModalContent className="border border-line bg-bg">
        <ModalHeader className="flex-col items-start gap-0.5">
          <span className="flex items-center gap-2 font-display text-lg text-ink">
            <Glyph name={meta.glyph} size={18} className="text-gold" />
            Forge a {meta.label.toLowerCase()}
          </span>
          <span className="font-sans text-sm font-normal text-ink-muted">
            {meta.description} It joins your forge, and this hero picks it up
            straight away.
          </span>
        </ModalHeader>

        <ModalBody>
          {error && (
            <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0 space-y-4">
              <Input
                label="Name"
                autoFocus
                value={name}
                onValueChange={setName}
                isRequired
                classNames={{ inputWrapper: 'bg-surface border-line' }}
              />
              <Textarea
                label="Description"
                value={description}
                onValueChange={setDescription}
                minRows={2}
                classNames={{ inputWrapper: 'bg-surface border-line' }}
              />
              <ContentDataForm type={type} value={data} onChange={setData} />
            </div>

            {/* The object, beside the form that makes it (design rule 1). */}
            <aside className="lg:sticky lg:top-0 lg:self-start">
              <div className="rounded-[var(--radius-card)] border border-arcane/40 bg-surface p-4">
                <StatBlock entry={preview} />
              </div>
            </aside>
          </div>
        </ModalBody>

        <ModalFooter>
          <Button
            variant="bordered"
            className="border-line text-ink"
            onPress={onClose}
          >
            Cancel
          </Button>
          <Button
            color="primary"
            isLoading={saving}
            onPress={() => void save()}
          >
            Forge it and use it
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
