/**
 * Session zero and the safety tools — the pure half.
 *
 * `server/safety.ts` is `server-only`; what a client component needs at
 * runtime (the words, the limits, the questionnaire) lives here.
 */
import type { FeedbackQuestion } from '@/server/session-feedback';

export type SafetyKind = 'line' | 'veil';

/**
 * One line or veil as every member reads it. There is no author field
 * because there is no author column: `source` is all that is stored.
 */
export interface SafetyRow {
  id: string;
  kind: SafetyKind;
  text: string;
  source: 'staff' | 'player';
  createdAt: string;
}

export const SAFETY_TEXT_MAX = 200;

export const SAFETY_KIND_LABEL: Record<SafetyKind, string> = {
  line: 'Line',
  veil: 'Veil',
};

/** What each one means, for the hint under the field. */
export const SAFETY_KIND_HINT: Record<SafetyKind, string> = {
  line: 'Not in this game at all.',
  veil: 'Can happen, but off-screen — fade to black.',
};

/** Session zero is an ordinary session, numbered 0, with this title. */
export const SESSION_ZERO_TITLE = 'Session zero';

/**
 * The session-zero questionnaire. Expectations, not boundaries: answers
 * here carry the player's name, so lines and veils are asked for in Rules,
 * where they are anonymous.
 */
export const SESSION_ZERO_QUESTIONS: Omit<FeedbackQuestion, 'id'>[] = [
  { prompt: 'What drew you to this campaign?', kind: 'text' },
  {
    prompt: 'What do you most enjoy at the table?',
    kind: 'choice',
    options: ['Combat', 'Roleplay', 'Exploration', 'Puzzles', 'Downtime'],
  },
  {
    prompt: 'How dark should the tone go? (1 is cosy, 5 is grim)',
    kind: 'scale',
  },
  {
    prompt:
      'How much of your character’s backstory do you want woven in? (1 is none, 5 is lots)',
    kind: 'scale',
  },
  { prompt: 'How often can you play, and when suits you?', kind: 'text' },
  {
    prompt:
      'Anything else the DM should know — house rules you love or hate, how you like to be asked for a roll?',
    kind: 'text',
  },
];
