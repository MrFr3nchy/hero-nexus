/**
 * Session feedback — the pure half.
 *
 * `server/session-feedback.ts` is `server-only`, so anything a client
 * component needs at runtime lives here. Types still come from the server
 * module (`import type` crosses the boundary; a value does not).
 */
import type {
  FeedbackQuestion,
  FeedbackQuestionKind,
} from '@/server/session-feedback';

/** The questions a DM gets offered when the form is blank. */
export const DEFAULT_FEEDBACK_QUESTIONS: Omit<FeedbackQuestion, 'id'>[] = [
  { prompt: 'What was the highlight of the night?', kind: 'text' },
  { prompt: 'Did anything drag?', kind: 'text' },
  { prompt: 'How was the pacing?', kind: 'scale' },
  {
    prompt: 'What do you want more of next time?',
    kind: 'choice',
    options: ['Combat', 'Roleplay', 'Exploration', 'Downtime'],
  },
];

export const QUESTION_KIND_LABEL: Record<FeedbackQuestionKind, string> = {
  text: 'Written answer',
  scale: '1 to 5',
  choice: 'Pick one',
};

/** A fresh, client-side id for a question the DM just added. */
export function newQuestionId(): string {
  return `q-${Math.random().toString(36).slice(2, 10)}`;
}
