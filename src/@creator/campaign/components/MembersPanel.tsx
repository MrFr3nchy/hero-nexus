'use client';

import { Avatar, Button, Input, Link, Select, SelectItem } from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

import { listCharactersAction } from '@/@creator/character/actions';
import { DiceSpinner, Ribbon, SectionCard } from '@/@shared/components/ui';
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
  revokeInviteAction,
  setMemberCharacterAction,
  setMemberRoleAction,
} from '../actions';

const roleLabel: Record<CampaignRole, string> = {
  gm: 'DM',
  'co-gm': 'Co-DM',
  player: 'Player',
};

export function MembersPanel({
  campaignId,
  viewerId,
  viewerRole,
}: {
  campaignId: string;
  viewerId: string;
  viewerRole: CampaignRole;
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

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <DiceSpinner label="Assembling the party…" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
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

      <SectionCard title={`Members (${members.length})`}>
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
                      selectedKeys={m.characterId ? [m.characterId] : []}
                      onSelectionChange={keys => {
                        const id = Array.from(keys)[0];
                        linkCharacter(id ? String(id) : null);
                      }}
                    >
                      {myCharacters.map(c => (
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
                    <Button
                      size="sm"
                      variant="light"
                      className="text-ink-muted data-[hover=true]:text-danger"
                      onPress={() =>
                        run(() => removeMemberAction(campaignId, m.userId))
                      }
                    >
                      Remove
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </SectionCard>

      {isStaff && (
        <SectionCard title="Invite a player">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              type="email"
              size="sm"
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
          <p className="mt-2 text-xs text-ink-muted">
            They must already have an account on this instance. Or share the
            join code from the campaign header.
          </p>

          {invites.length > 0 && (
            <ul className="mt-4 divide-y divide-line border-t border-line">
              {invites.map(inv => (
                <li
                  key={inv.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span className="text-ink-muted">
                    {inv.invitedName || inv.invitedEmail} — pending
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
            </ul>
          )}
        </SectionCard>
      )}
    </div>
  );
}
