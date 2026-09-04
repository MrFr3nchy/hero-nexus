'use client';

import { Button, Input, Select, SelectItem } from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

import { listCharactersAction } from '@/@creator/character/actions';
import { DiceSpinner, SectionCard } from '@/@shared/components/ui';
import { useCampaignLive } from '@/@shared/hooks/useCampaignLive';
import type { SessionRow } from '@/server/campaign-sessions';
import type { CharacterRow } from '@/server/characters';
import { createEncounterAction } from '../../actions';
import {
  fileUnderSessionAction,
  listSessionsAction,
} from '../../chronicle-actions';
import { PartyPlayPanel } from '../PartyPlayPanel';
import { HandoutsPanel } from './HandoutsPanel';
import { InitiativeTracker } from './InitiativeTracker';
import { RollPanel } from './RollPanel';

/**
 * The at-the-table surface: initiative, the shared dice, and the handouts the
 * DM pushes across. Everything here is live — the poller in `useCampaignLive`
 * keeps every browser at the table on the same round.
 */
export function SessionPanel({ campaignId }: { campaignId: string }) {
  const { state, error: liveError, refresh } = useCampaignLive(campaignId);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [myCharacters, setMyCharacters] = useState<CharacterRow[]>([]);

  const loadSide = useCallback(async () => {
    const [list, chars] = await Promise.all([
      listSessionsAction(campaignId).catch(() => [] as SessionRow[]),
      listCharactersAction().catch(() => [] as CharacterRow[]),
    ]);
    setSessions(list);
    setMyCharacters(chars);
  }, [campaignId]);

  useEffect(() => {
    loadSide();
  }, [loadSide]);

  if (!state) {
    return (
      <div className="flex justify-center py-12">
        <DiceSpinner label="Rolling initiative…" />
      </div>
    );
  }

  const isStaff = state.role === 'gm' || state.role === 'co-gm';

  const start = async () => {
    const res = await createEncounterAction(campaignId, name);
    if (!res.ok) {
      setError(res.error ?? 'Failed to start the encounter.');
      return;
    }
    setName('');
    if (sessionId) {
      await fileUnderSessionAction(
        campaignId,
        'encounter',
        res.data.id,
        sessionId
      );
    }
    await Promise.all([refresh(), loadSide()]);
  };

  return (
    <div className="space-y-5">
      {(error || liveError) && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error || liveError}
        </p>
      )}

      {isStaff && !state.encounter && (
        <SectionCard
          title="Call for initiative"
          description="Name the fight, then add the party."
        >
          <div className="flex flex-wrap gap-2">
            <Input
              size="sm"
              placeholder="The bridge at Duskwater"
              value={name}
              onValueChange={setName}
              className="min-w-40 flex-1"
            />
            {sessions.length > 0 && (
              <Select
                aria-label="File under a session"
                size="sm"
                className="w-44"
                placeholder="Unfiled"
                selectedKeys={sessionId ? [sessionId] : []}
                onSelectionChange={keys => {
                  const key = Array.from(keys)[0];
                  setSessionId(key ? String(key) : '');
                }}
              >
                {sessions.map(s => (
                  <SelectItem key={s.id} textValue={`Session ${s.number}`}>
                    Session {s.number}
                    {s.title ? ` · ${s.title}` : ''}
                  </SelectItem>
                ))}
              </Select>
            )}
            <Button size="sm" color="primary" onPress={start}>
              Start
            </Button>
          </div>
        </SectionCard>
      )}

      {isStaff && state.encounter && sessions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          <span>File this fight under</span>
          <Select
            aria-label="File this fight under a session"
            size="sm"
            className="w-48"
            placeholder="Unfiled"
            onSelectionChange={async keys => {
              const key = Array.from(keys)[0];
              const res = await fileUnderSessionAction(
                campaignId,
                'encounter',
                state.encounter!.id,
                key ? String(key) : null
              );
              if (!res.ok) setError(res.error ?? 'Failed to file it.');
              await loadSide();
            }}
          >
            {sessions.map(s => (
              <SelectItem key={s.id} textValue={`Session ${s.number}`}>
                Session {s.number}
                {s.title ? ` · ${s.title}` : ''}
              </SelectItem>
            ))}
          </Select>
        </div>
      )}

      <PartyPlayPanel
        campaignId={campaignId}
        isStaff={isStaff}
        onError={setError}
      />

      <InitiativeTracker
        state={state}
        isStaff={isStaff}
        refresh={refresh}
        onError={setError}
      />

      <RollPanel
        campaignId={campaignId}
        state={state}
        isStaff={isStaff}
        myCharacters={myCharacters}
        refresh={refresh}
        onError={setError}
      />

      <HandoutsPanel
        campaignId={campaignId}
        state={state}
        isStaff={isStaff}
        sessions={sessions}
        refresh={refresh}
        onError={setError}
      />
    </div>
  );
}
