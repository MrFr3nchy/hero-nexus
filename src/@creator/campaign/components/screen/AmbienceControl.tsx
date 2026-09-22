'use client';

import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Slider,
  Switch,
  Tooltip,
} from '@heroui/react';
import { useEffect, useRef, useState } from 'react';

import { Glyph } from '@/@shared/components/ui';
import { useTable } from '@/@shared/table';
import type { Ambience, CampaignAudioRow } from '@/server/audio';
import {
  deleteCampaignAudioAction,
  listCampaignAudioAction,
  playSoundEffectAction,
  setAmbienceAction,
} from '../../audio-actions';

/**
 * Ambient sound (12), on the mode bar.
 *
 * One `<audio>` per screen, seeking to `now − startedAt` (modulo the track
 * when it loops) so a browser joining ten seconds late is within a second
 * of the room. Playing is the reader's own choice — the `ambience`
 * preference, off by default — and their own volume sits on top of the
 * DM's; the speaker glyph is lit whenever something is playing so they
 * know there is something to turn on. The first play needs a gesture, and
 * the glyph is it.
 *
 * Staff get the same glyph with the table's tracks behind it: play one,
 * loop it, set the room's level, stop, upload, remove.
 */
export function AmbienceControl({
  campaignId,
  ambience,
  isStaff,
  refresh,
  onError,
}: {
  campaignId: string;
  ambience: Ambience | null;
  isStaff: boolean;
  refresh: () => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const { preferences, setPreferences, history } = useTable();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // A second element, so a sound effect lands *over* the music rather than
  // interrupting it: the door bangs while the rain keeps falling.
  const effectRef = useRef<HTMLAudioElement | null>(null);
  const lastEffect = useRef<string | null>(null);
  const [open, setOpen] = useState(false);
  const [tracks, setTracks] = useState<CampaignAudioRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const listening = preferences.ambience;
  const src = ambience
    ? `/api/campaigns/${campaignId}/audio/${ambience.audioId}`
    : null;

  // Keep the element on what the room is playing, where the room is.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (!src || !listening) {
      el.pause();
      el.removeAttribute('src');
      el.load();
      return;
    }
    if (el.dataset.src !== src) {
      el.dataset.src = src;
      el.src = src;
      el.loop = ambience?.loop ?? true;
      el.load();
    }
    el.loop = ambience?.loop ?? true;
    el.volume = Math.max(
      0,
      Math.min(1, (ambience?.volume ?? 0.6) * preferences.ambienceVolume)
    );
    const seek = () => {
      if (!ambience) return;
      const elapsed =
        (Date.now() - new Date(ambience.startedAt).getTime()) / 1000;
      const duration = Number.isFinite(el.duration) ? el.duration : 0;
      let at = Math.max(0, elapsed);
      if (duration > 0) {
        if (el.loop) at = at % duration;
        else if (at >= duration) at = duration;
      }
      if (Math.abs(el.currentTime - at) > 1) el.currentTime = at;
    };
    const start = () => {
      seek();
      el.play()
        .then(() => setBlocked(false))
        .catch(() => setBlocked(true));
    };
    if (el.readyState >= 1) start();
    else el.addEventListener('loadedmetadata', start, { once: true });
    return () => el.removeEventListener('loadedmetadata', start);
  }, [src, listening, ambience, preferences.ambienceVolume]);

  /*
   * The soundboard's other half: whatever the DM last pressed.
   *
   * A one-shot is a moment on the events channel, not a state, so this
   * watches the table's history for the newest `sound` and plays it once.
   * The reader's own `ambience` preference governs it — one switch for "I
   * want to hear this table", not two — and their volume sits on top, at
   * the DM's level for effects, which is full.
   */
  useEffect(() => {
    const el = effectRef.current;
    if (!el || !listening) return;
    const newest = history.find(a => a.event.kind === 'sound');
    if (!newest) return;
    if (lastEffect.current === newest.id) return;
    lastEffect.current = newest.id;
    // Older than the hold: this is history being read on mount, not a press
    // that just happened, and playing it would be a sound from ten minutes
    // ago arriving now.
    if (Date.now() - newest.at > 15_000) return;
    const event = newest.event as Extract<
      typeof newest.event,
      { kind: 'sound' }
    >;
    el.src = `/api/campaigns/${campaignId}/audio/${event.audioId}`;
    el.volume = Math.max(0, Math.min(1, preferences.ambienceVolume));
    el.currentTime = 0;
    el.play().catch(() => {
      // The browser wants a gesture first. The music control is the gesture.
    });
  }, [history, listening, campaignId, preferences.ambienceVolume]);

  const loadTracks = async () => {
    setTracks(await listCampaignAudioAction(campaignId));
  };
  useEffect(() => {
    if (open && isStaff && tracks === null) void loadTracks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isStaff]);

  const act = async (p: Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    const res = await p;
    setBusy(false);
    if (!res.ok) onError(res.error ?? 'That did not take.');
    await refresh();
  };

  const upload = async (file: File, kind: 'ambience' | 'effect') => {
    setBusy(true);
    const form = new FormData();
    form.append('file', file);
    form.append('kind', kind);
    form.append('title', file.name.replace(/\.[^.]+$/, ''));
    const res = await fetch(`/api/campaigns/${campaignId}/audio`, {
      method: 'POST',
      body: form,
    });
    setBusy(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      onError(body.error ?? 'Upload failed.');
      return;
    }
    await loadTracks();
  };

  const music = (tracks ?? []).filter(t => t.kind !== 'effect');
  const effects = (tracks ?? []).filter(t => t.kind === 'effect');

  const playingTitle = ambience
    ? (tracks?.find(t => t.id === ambience.audioId)?.title ?? 'something')
    : null;
  const lit = !!ambience;

  // A player with nothing playing has nothing to turn on; the glyph waits.
  if (!isStaff && !ambience) return null;

  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} preload="auto" className="hidden" />
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={effectRef} preload="auto" className="hidden" />
      <Popover placement="bottom-start" isOpen={open} onOpenChange={setOpen}>
        <PopoverTrigger>
          <button
            type="button"
            aria-label={
              lit
                ? listening
                  ? 'Music is playing and you are hearing it'
                  : 'Music is playing — tap to hear it'
                : 'Music'
            }
            className={`inline-flex items-center gap-1 rounded-[5px] border px-2 py-1 text-[0.6rem] uppercase tracking-[0.12em] transition-colors ${
              lit
                ? listening
                  ? 'border-gold/60 text-gold-strong dark:text-gold'
                  : 'border-gold/40 text-ink-subtle hover:text-ink'
                : 'border-line text-ink-subtle hover:text-ink'
            }`}
          >
            <Glyph
              name={lit && listening ? 'speaker' : 'speaker-off'}
              size={11}
            />
            {lit ? (listening ? 'Playing' : 'Music on') : 'Quiet'}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 border border-line bg-surface p-3">
          <div className="w-full space-y-3">
            <div className="space-y-1.5">
              <Tooltip content="Whether you hear it on this device. Off unless you ask.">
                <div className="inline-block">
                  <Switch
                    size="sm"
                    isSelected={listening}
                    onValueChange={v =>
                      setPreferences({ ...preferences, ambience: v })
                    }
                  >
                    <span className="text-xs text-ink-muted">
                      {lit
                        ? `Hear ${playingTitle ?? 'it'}`
                        : 'Hear the room when something plays'}
                    </span>
                  </Switch>
                </div>
              </Tooltip>
              {blocked && listening && lit && (
                <p className="text-xs text-warning">
                  The browser wants a press first.{' '}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => audioRef.current?.play().catch(() => {})}
                  >
                    Play
                  </button>
                </p>
              )}
              <Slider
                size="sm"
                aria-label="Your volume"
                label="Your volume"
                minValue={0}
                maxValue={1}
                step={0.05}
                value={preferences.ambienceVolume}
                onChange={v =>
                  setPreferences({
                    ...preferences,
                    ambienceVolume: Array.isArray(v) ? v[0] : v,
                  })
                }
                className="max-w-full"
              />
            </div>

            {isStaff && (
              <div className="space-y-2 border-t border-line pt-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[0.65rem] uppercase tracking-[0.1em] text-ink-subtle">
                    The table’s tracks
                  </p>
                  {ambience && (
                    <Button
                      size="sm"
                      variant="light"
                      className="h-6 min-w-0 px-1.5 text-xs text-ink-subtle"
                      isDisabled={busy}
                      onPress={() => act(setAmbienceAction(campaignId, null))}
                    >
                      Stop
                    </Button>
                  )}
                </div>
                {tracks === null ? (
                  <p className="text-xs text-ink-subtle">Fetching…</p>
                ) : music.length === 0 ? (
                  <p className="text-xs text-ink-subtle">
                    Nothing uploaded yet. MP3, OGG or WAV, 20 MB or less.
                  </p>
                ) : (
                  <ul className="max-h-48 space-y-0.5 overflow-y-auto">
                    {music.map(t => {
                      const on = ambience?.audioId === t.id;
                      return (
                        <li key={t.id} className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              act(
                                setAmbienceAction(campaignId, {
                                  audioId: t.id,
                                  loop: true,
                                })
                              )
                            }
                            className={`min-w-0 flex-1 truncate rounded px-1.5 py-1 text-left text-sm hover:bg-surface-2 ${
                              on
                                ? 'text-gold-strong dark:text-gold'
                                : 'text-ink'
                            }`}
                          >
                            {on && (
                              <Glyph
                                name="speaker"
                                size={11}
                                className="mr-1 inline"
                              />
                            )}
                            {t.title}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            aria-label={`Remove ${t.title}`}
                            onClick={async () => {
                              await act(deleteCampaignAudioAction(t.id));
                              await loadTracks();
                            }}
                            className="rounded px-1 text-xs text-ink-subtle hover:text-danger"
                          >
                            ×
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {ambience && (
                  <Slider
                    size="sm"
                    aria-label="The room's level"
                    label="The room's level"
                    minValue={0}
                    maxValue={1}
                    step={0.05}
                    defaultValue={ambience.volume}
                    onChangeEnd={v =>
                      act(
                        setAmbienceAction(campaignId, {
                          audioId: ambience.audioId,
                          loop: ambience.loop,
                          volume: Array.isArray(v) ? v[0] : v,
                        })
                      )
                    }
                    className="max-w-full"
                  />
                )}
                <label className="block">
                  <span className="sr-only">Upload a track</span>
                  <input
                    type="file"
                    accept="audio/mpeg,audio/ogg,audio/wav"
                    disabled={busy}
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) void upload(f, 'ambience');
                      e.target.value = '';
                    }}
                    className="block w-full text-xs text-ink-subtle file:mr-2 file:rounded file:border file:border-line file:bg-surface-2 file:px-2 file:py-1 file:text-xs file:text-ink"
                  />
                </label>
              </div>
            )}

            {/*
              The soundboard. A grid rather than a list, because these are
              pressed mid-sentence and a DM reaching for the horn should not
              have to read a column to find it.
            */}
            {isStaff && (
              <div className="space-y-2 border-t border-line pt-2">
                <p className="text-[0.65rem] uppercase tracking-[0.1em] text-ink-subtle">
                  Sound effects
                </p>
                {effects.length === 0 ? (
                  <p className="text-xs text-ink-subtle">
                    A door, a horn, a scream. Played once, over the music.
                  </p>
                ) : (
                  <ul className="grid max-h-40 grid-cols-2 gap-1 overflow-y-auto">
                    {effects.map(t => (
                      <li key={t.id} className="flex items-stretch gap-0.5">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            act(playSoundEffectAction(campaignId, t.id))
                          }
                          className="min-w-0 flex-1 truncate rounded border border-line bg-surface-2 px-1.5 py-1.5 text-left text-xs text-ink hover:border-gold/50 hover:text-gold-strong dark:hover:text-gold"
                        >
                          {t.title}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          aria-label={`Remove ${t.title}`}
                          onClick={async () => {
                            await act(deleteCampaignAudioAction(t.id));
                            await loadTracks();
                          }}
                          className="rounded px-1 text-xs text-ink-subtle hover:text-danger"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <label className="block">
                  <span className="sr-only">Upload a sound effect</span>
                  <input
                    type="file"
                    accept="audio/mpeg,audio/ogg,audio/wav"
                    disabled={busy}
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) void upload(f, 'effect');
                      e.target.value = '';
                    }}
                    className="block w-full text-xs text-ink-subtle file:mr-2 file:rounded file:border file:border-line file:bg-surface-2 file:px-2 file:py-1 file:text-xs file:text-ink"
                  />
                </label>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
