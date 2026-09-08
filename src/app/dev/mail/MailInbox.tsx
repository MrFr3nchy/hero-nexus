'use client';

import { Button, Chip } from '@heroui/react';
import { useRouter } from 'next/navigation';
import {
  Fragment,
  type ReactNode,
  useEffect,
  useState,
  useTransition,
} from 'react';

import {
  EmptyState,
  Glyph,
  SealedLetterScene,
  SectionCard,
  useConfirm,
} from '@/@shared/components/ui';
import type { OutboxMessage } from '@/server/mail-outbox';

import { clearOutboxAction } from './actions';

const POLL_MS = 4000;

/** Absolute http(s) URLs — the reset and verification links are the point. */
const URL_PATTERN = /https?:\/\/[^\s<>"')]+/g;

/** Renders the plain-text body with its links clickable. */
function Body({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index;
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <a
        key={start}
        href={match[0]}
        className="break-all text-gold underline underline-offset-2 hover:text-ink"
      >
        {match[0]}
      </a>
    );
    cursor = start + match[0].length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));

  return (
    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink-muted">
      {parts.map((part, i) => (
        <Fragment key={i}>{part}</Fragment>
      ))}
    </pre>
  );
}

function Letter({ message }: { message: OutboxMessage }) {
  const sentAt = new Date(message.sentAt);
  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <Glyph name="letter" className="text-gold" />
          {message.subject}
        </span>
      }
      description={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>To {message.to}</span>
          <time dateTime={message.sentAt}>{sentAt.toLocaleString()}</time>
        </span>
      }
    >
      <Body text={message.text} />
    </SectionCard>
  );
}

export function MailInbox({ messages }: { messages: OutboxMessage[] }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [clearing, startClearing] = useTransition();
  const [live, setLive] = useState(true);

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [live, router]);

  async function onClear() {
    const ok = await confirm({
      title: 'Empty the outbox?',
      body: `This deletes all ${messages.length} captured message${
        messages.length === 1 ? '' : 's'
      }. They are only on disk here, so nothing else is affected.`,
      confirmLabel: 'Empty it',
      destructive: true,
    });
    if (!ok) return;
    startClearing(async () => {
      await clearOutboxAction();
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Chip
          size="sm"
          variant="flat"
          className={live ? 'text-ink-muted' : 'text-ink-muted/60'}
        >
          {live ? `Watching — refreshes every ${POLL_MS / 1000}s` : 'Paused'}
        </Chip>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="flat" onPress={() => setLive(v => !v)}>
            {live ? 'Pause' : 'Resume'}
          </Button>
          <Button size="sm" variant="flat" onPress={() => router.refresh()}>
            Refresh
          </Button>
          <Button
            size="sm"
            variant="flat"
            color="danger"
            isDisabled={messages.length === 0}
            isLoading={clearing}
            onPress={onClear}
          >
            Empty outbox
          </Button>
        </div>
      </div>

      {messages.length === 0 ? (
        <EmptyState
          scene={<SealedLetterScene />}
          title="No mail yet"
          description="Register an account, or ask for a password reset, and the message the app would have sent lands here."
        />
      ) : (
        <div className="space-y-4">
          {messages.map(message => (
            <Letter key={message.id} message={message} />
          ))}
        </div>
      )}
    </div>
  );
}
