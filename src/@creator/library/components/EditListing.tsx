'use client';

import { Button, Input, Select, SelectItem, Textarea } from '@heroui/react';
import { useState } from 'react';

import { updatePublicationAction } from '../actions';
import { normaliseTags, type PublicationCard } from '../lib/publication';

const VISIBILITY_OPTIONS = [
  { key: 'public', label: 'In the library for everyone' },
  { key: 'unlisted', label: 'Only for people with the link' },
] as const;

/**
 * The author's edit of a listing's card — its title, line, tags and who finds
 * it. Not its content: a homebrew listing is live-linked and changes in the
 * Forge; the other kinds are frozen copies (sharing-model rule 1), and a new
 * copy is a new listing.
 */
export function EditListing({
  card,
  onSaved,
}: {
  card: PublicationCard;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(card.title);
  const [summary, setSummary] = useState(card.summary);
  const [tags, setTags] = useState(card.tags.join(', '));
  const [visibility, setVisibility] = useState(card.visibility);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    const result = await updatePublicationAction(card.id, {
      title: title.trim() || card.title,
      summary,
      tags: normaliseTags(tags),
      visibility,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'That did not work.');
      return;
    }
    setOpen(false);
    onSaved();
  };

  if (!open) {
    return (
      <Button variant="bordered" onPress={() => setOpen(true)}>
        Edit the listing
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface-2 p-3">
      <Input
        label="Title in the library"
        labelPlacement="outside"
        value={title}
        onValueChange={setTitle}
      />
      <Textarea
        minRows={2}
        label="What it is, in a line"
        labelPlacement="outside"
        value={summary}
        onValueChange={setSummary}
      />
      <Input
        label="Tags"
        labelPlacement="outside"
        placeholder="undead, gothic, tier 3"
        description="Up to eight, comma separated."
        value={tags}
        onValueChange={setTags}
      />
      <Select
        label="Who finds it"
        labelPlacement="outside"
        selectedKeys={[visibility]}
        onSelectionChange={keys => {
          const picked = Array.from(keys)[0];
          if (picked === 'public' || picked === 'unlisted') {
            setVisibility(picked);
          }
        }}
      >
        {VISIBILITY_OPTIONS.map(option => (
          <SelectItem key={option.key} textValue={option.label}>
            {option.label}
          </SelectItem>
        ))}
      </Select>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button color="primary" isLoading={busy} onPress={save}>
          Save the listing
        </Button>
        <Button variant="light" onPress={() => setOpen(false)}>
          Not now
        </Button>
      </div>
    </div>
  );
}
