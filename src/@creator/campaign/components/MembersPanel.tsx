'use client';

import {
  Avatar,
  Button,
  Input,
  Link,
  Select,
  SelectItem,
  Snippet,
} from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

import { listCharactersAction } from '@/@creator/character/actions';
import {
  DiceSpinner,
  Marginalia,
  Ribbon,
  SectionCard,
  useConfirm,
} from '@/@shared/components/ui';
import type { CharacterRow } from '@/server/characters';
import type {
  CampaignInviteRow,
  CampaignMemberRow,
  CampaignRole,
} from '@/server/campaigns';
import {
  inviteUserAction,
  listInvitesAction,
  listMembersAction,
  removeMemberAction,
  unlinkMemberCharacterAction,
  revokeInviteAction,
  setMemberCharacterAction,
  setMemberRoleAction,
} from '../actions';

const roleLabel: Record<CampaignRole, string> = {
  gm: 'DM',
  'co-gm': 'Co-DM',
  player: 'Player',
};

/**
 * Who is at the table, and the one card that fills the empty chairs.
 *
 * Seating used to be three cards — the join code, the invite field and the
 * per-row character select — on one tab, and a DM could not see at a glance
 * who was coming, who had sat and who had no hero. It is one card now: the
 * code big enough to read out, the invite under it, and the pending invites
 * and the empty chairs listed together.
 */
export function MembersPanel({
  campaignId,
  viewerId,
  viewerRole,
  joinCode,
}: {
  campaignId: string;
  viewerId: string;
  viewerRole: CampaignRole;
  /** Staff only: the code a player types to seat themselves. */
  joinCode?: string | null;
}) {
  const isStaff = viewerRole === 'gm' || viewerRole === 'co-gm';

  const [members, setMembers] = useState<CampaignMemberRow[]>([]);
  const [invites, setInvites] = useState<CampaignInviteRow[]>([]);
  const [myCharacters, setMyCharacters] = useState<CharacterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const [m, chars] = await Promise.all([
        listMembersAction(campaignId),
        listCharactersAction(),
      ]);
      setMembers(m);
      setMyCharacters(chars);
      if (isStaff) setInvites(await listInvitesAction(campaignId));
    } catch {
      setError('Failed to load members.');
    } finally {
      setLoading(false);
    }
  }, [campaignId, isStaff]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const { confirm, dialog } = useConfirm();

  /** Ask first, then run — both of these take something away. */
  const confirmThen = async ({
    title,
    body,
    confirmLabel,
    destructive = false,
    run: fn,
  }: {
    title: string;
    body: string;
    confirmLabel: string;
    destructive?: boolean;
    run: () => Promise<{ ok: boolean; error?: string }>;
  }) => {
    const ok = await confirm({ title, body, confirmLabel, destructive });
    if (!ok) return;
    await run(fn);
  };

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    const res = await fn();
    if (!res.ok) setError(res.error ?? 'Something went wrong.');
    await refresh();
  };

  const linkCharacter = async (characterId: string | null) => {
    setError(null);
    setNotice(null);
    const res = await setMemberCharacterAction(campaignId, characterId);
    if (!res.ok) {
      setError(res.error ?? 'Failed to link character.');
    } else if (res.data.warnings.length) {
      setNotice(
        `Linked, but this character breaks the table's rules: ${res.data.warnings.join(
          ' '
        )} The DM can see this on the member list.`
      );
    }
    await refresh();
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const res = await inviteUserAction(campaignId, inviteEmail);
      if (!res.ok) {
        setError(res.error);
      } else {
        setInviteEmail('');
        await refresh();
      }
    } finally {
      setInviting(false);
    }
  };

  /** Players sitting with nobody's hero in the chair. */
  const emptyChairs = members.filter(
    m => m.role === 'player' && !m.characterId
  );

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <DiceSpinner label="Assembling the party…" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {dialog}
      {error && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {notice && (
        <p className="rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-ink-muted">
          {notice}
        </p>
      )}

      <SectionCard title={`At the table (${members.length})`}>
        <ul className="divide-y divide-line">
          {members.map(m => {
            const isMe = m.userId === viewerId;
            return (
              <li
                key={m.userId}
                className="flex flex-wrap items-center gap-3 py-3"
              >
                <Avatar
                  size="sm"
                  src={m.image || undefined}
                  name={m.name || m.email || 'User'}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {m.name || m.email || 'User'}
                    {isMe && (
                      <span className="ml-1 text-ink-subtle">(you)</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-ink-muted">
                    {m.characterName
                      ? `Playing ${m.characterName}`
                      : m.role === 'gm'
                        ? 'Runs the game'
                        : 'No character linked'}
                  </p>
                  {isStaff && m.ruleIssues.length > 0 && (
                    <p className="mt-0.5 text-xs text-danger">
                      Breaks table rules: {m.ruleIssues.join(' ')}
                    </p>
                  )}
                </div>

                <Ribbon
                  tone={
                    m.role === 'gm'
                      ? 'gold'
                      : m.role === 'co-gm'
                        ? 'arcane'
                        : 'neutral'
                  }
                >
                  {roleLabel[m.role]}
                </Ribbon>

                {isStaff && m.characterId && (
                  <Button
                    as={Link}
                    href={`/campaigns/${campaignId}/players/${m.characterId}`}
                    size="sm"
                    variant="flat"
                  >
                    View sheet
                  </Button>
                )}

                {isMe && m.role !== 'gm' && (
                  <div className="flex items-center gap-2">
                    <Select
                      aria-label="Your character"
                      size="sm"
                      className="w-44"
                      placeholder="Link a character"
                      /*
                        The *hero* is what is picked, not the copy. The seated
                        row is a copy, so it maps back to the blueprint it came
                        from — otherwise the select shows nothing selected
                        while the member list right beside it says who is
                        playing.
                      */
                      selectedKeys={(() => {
                        if (!m.characterId) return [];
                        const seated = myCharacters.find(
                          c => c.id === m.characterId
                        );
                        return [seated?.forkedFrom ?? m.characterId];
                      })()}
                      onSelectionChange={keys => {
                        const id = Array.from(keys)[0];
                        linkCharacter(id ? String(id) : null);
                      }}
                    >
                      {/*
                        Heroes, not copies. A row with a `forkedFrom` is one
                        table's copy of somebody already in this list, and
                        showing both puts two identical names in the menu.
                        A hero committed to another table is left out too:
                        picking one is refused server-side, and an option that
                        cannot be chosen is worse than an absent one.

                        A hero seated before instancing existed has no
                        blueprint above them, so they stand for themselves —
                        which is why this tests `forkedFrom` rather than
                        `campaignId` alone.
                      */}
                      {myCharacters
                        .filter(
                          c =>
                            !c.forkedFrom &&
                            (!c.campaignId || c.campaignId === campaignId)
                        )
                        .map(c => (
                          <SelectItem key={c.id}>
                            {c.name || 'Unnamed'}
                          </SelectItem>
                        ))}
                    </Select>
                    <Button
                      as={Link}
                      href={`/creator/character?campaign=${campaignId}`}
                      size="sm"
                      variant="light"
                    >
                      Build for this table
                    </Button>
                  </div>
                )}
                {/*
                  Said before the seat, not after the refusal: a hero can sit
                  at one table, and seating one here makes this table's copy.
                  A hero already seated elsewhere is simply not in the menu,
                  which reads as "where did Gon go?" unless something says.
                */}
                {isMe && m.role !== 'gm' && !m.characterId && (
                  <p className="basis-full text-xs text-ink-subtle">
                    Seating a hero makes this table&apos;s copy of them; the
                    original stays on your heroes page for the next table.
                    {(() => {
                      const elsewhere = myCharacters.filter(
                        c =>
                          !c.forkedFrom &&
                          c.campaignId &&
                          c.campaignId !== campaignId
                      ).length;
                      return elsewhere > 0
                        ? ` ${elsewhere === 1 ? 'One hero is' : `${elsewhere} heroes are`} already seated at another table and not offered here.`
                        : '';
                    })()}
                  </p>
                )}

                {viewerRole === 'gm' && m.role !== 'gm' && (
                  <>
                    <Button
                      size="sm"
                      variant="light"
                      onPress={() =>
                        run(() =>
                          setMemberRoleAction(
                            campaignId,
                            m.userId,
                            m.role === 'co-gm' ? 'player' : 'co-gm'
                          )
                        )
                      }
                    >
                      {m.role === 'co-gm' ? 'Demote' : 'Make Co-DM'}
                    </Button>
                    {/*
                      Two verbs, never one. Retiring a character and dismissing
                      a person are different sentences at a table, and the
                      common case by far is the first — a hero dies and their
                      player brings somebody else. Folding it into "Remove"
                      would make grief cost a membership.
                    */}
                    {m.characterId && (
                      <Button
                        size="sm"
                        variant="light"
                        className="text-ink-muted data-[hover=true]:text-ink"
                        onPress={() =>
                          confirmThen({
                            title: `Retire ${m.characterName || 'this character'}?`,
                            body: `${m.name ?? 'This player'} keeps their seat and can bring someone new. The sheet is kept exactly as it was left — the record of who played here.`,
                            confirmLabel: 'Retire the character',
                            run: () =>
                              unlinkMemberCharacterAction(campaignId, m.userId),
                          })
                        }
                      >
                        Retire character
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="light"
                      className="text-ink-muted data-[hover=true]:text-danger"
                      onPress={() =>
                        confirmThen({
                          title: `Remove ${m.name ?? 'this player'} from the table?`,
                          body: 'They lose their seat entirely. Their character is kept, and is theirs.',
                          confirmLabel: 'Remove them',
                          destructive: true,
                          run: () => removeMemberAction(campaignId, m.userId),
                        })
                      }
                    >
                      Remove player
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </SectionCard>

      {isStaff && (
        <SectionCard
          title="Seat the party"
          description="Two ways in: hand out the code, or send an invitation by email."
        >
          <div className="flex flex-col gap-4">
            {joinCode && (
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-display-alt text-[0.6rem] uppercase tracking-[0.16em] text-ink-subtle">
                  Join code
                </span>
                <Snippet
                  symbol=""
                  variant="flat"
                  className="bg-surface-2 font-mono text-lg tracking-[0.2em]"
                >
                  {joinCode}
                </Snippet>
                <Marginalia dash>they type this at /campaigns/join</Marginalia>
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                type="email"
                size="sm"
                aria-label="Invite a player by email"
                placeholder="player@example.com"
                value={inviteEmail}
                onValueChange={setInviteEmail}
                className="flex-1"
              />
              <Button
                size="sm"
                color="primary"
                isLoading={inviting}
                onPress={handleInvite}
              >
                Send invite
              </Button>
            </div>

            {/* Who is coming, who has sat, who has no hero — one list, so
                the answer is not spread over three cards. */}
            {(invites.length > 0 || emptyChairs.length > 0) && (
              <ul className="divide-y divide-line border-t border-line">
                {invites.map(inv => (
                  <li
                    key={inv.id}
                    className="flex items-center justify-between gap-2 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate text-ink-muted">
                      <span className="text-ink">
                        {inv.invitedName || inv.invitedEmail}
                      </span>{' '}
                      — invited, not yet sitting
                    </span>
                    <Button
                      size="sm"
                      variant="light"
                      className="text-ink-muted data-[hover=true]:text-danger"
                      onPress={() =>
                        run(() => revokeInviteAction(campaignId, inv.id))
                      }
                    >
                      Revoke
                    </Button>
                  </li>
                ))}
                {emptyChairs.map(m => (
                  <li
                    key={m.userId}
                    className="flex items-center justify-between gap-2 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate text-ink-muted">
                      <span className="text-ink">
                        {m.name || m.email || 'A player'}
                      </span>{' '}
                      — sitting, no hero yet
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
