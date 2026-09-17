'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import {
  listAvailability,
  listPolls,
  openPoll,
  setAvailability,
  settlePoll,
  votePoll,
  withdrawPoll,
  type AvailabilityWindow,
  type PollRow,
  type PollVote,
} from '@/server/scheduling';
import {
  deleteFeedbackForm,
  lastFeedbackQuestions,
  listFeedbackForms,
  saveFeedbackForm,
  setFeedbackFormStatus,
  submitFeedback,
  type FeedbackFormRow,
  type FeedbackQuestion,
} from '@/server/session-feedback';

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  const code = err instanceof Error ? err.message : '';
  const messages: Record<string, string> = {
    NOT_AUTHENTICATED: 'You are not signed in.',
    SESSION_STALE: 'Your session is out of date. Sign in again.',
    NOT_FOUND: 'That no longer exists.',
    FORBIDDEN: 'You do not have permission to do that.',
    BAD_RANGE: 'That is not a span of days.',
    BAD_DAY: 'That is not a calendar day.',
    BAD_TIME: 'That is not a time of day.',
    NO_OPTIONS: 'Offer at least one date.',
    POLL_OPEN: 'This sitting already has a poll open.',
    POLL_CLOSED: 'That poll is closed.',
    SESSION_NOT_PLANNED: 'Only a sitting still ahead can be put to a vote.',
    NO_QUESTIONS: 'Write at least one question.',
    NO_ANSWERS: 'Answer at least one question.',
    FORM_CLOSED: 'The DM has closed this form.',
  };
  if (!messages[code]) console.error('[action]', fallback, err);
  return { ok: false, error: messages[code] ?? fallback };
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Not a calendar day.');
const time = z
  .string()
  .regex(/^(([01]\d|2[0-3]):[0-5]\d)?$/, 'Not a time of day.');

const availabilitySchema = z
  .array(
    z.object({
      day,
      status: z.enum(['yes', 'maybe', 'no']).nullable(),
      note: z.string().max(80).optional(),
    })
  )
  .min(1)
  .max(62);

const pollSchema = z
  .array(z.object({ day, time: time.optional() }))
  .min(1)
  .max(12);

/* --- availability ------------------------------------------------------ */

export async function listAvailabilityAction(
  campaignId: string,
  from: string,
  to: string
): Promise<Result<AvailabilityWindow>> {
  try {
    return { ok: true, data: await listAvailability(campaignId, from, to) };
  } catch (err) {
    return fail(err, 'Failed to read the calendar.');
  }
}

export async function setAvailabilityAction(
  campaignId: string,
  input: unknown
): Promise<Result> {
  const parsed = availabilitySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid.' };
  }
  try {
    await setAvailability(campaignId, parsed.data);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to save your days.');
  }
}

/* --- polls ------------------------------------------------------------- */

export async function listPollsAction(campaignId: string): Promise<PollRow[]> {
  try {
    return await listPolls(campaignId);
  } catch {
    return [];
  }
}

export async function openPollAction(
  campaignId: string,
  sessionId: string,
  input: unknown
): Promise<Result<{ id: string }>> {
  const parsed = pollSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid.' };
  }
  try {
    const id = await openPoll(sessionId, parsed.data);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err, 'Failed to open the poll.');
  }
}

export async function votePollAction(
  optionId: string,
  vote: PollVote | null
): Promise<Result> {
  try {
    await votePoll(optionId, vote);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to record your vote.');
  }
}

export async function settlePollAction(
  campaignId: string,
  pollId: string,
  optionId: string
): Promise<Result> {
  try {
    await settlePoll(pollId, optionId);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to settle on that night.');
  }
}

export async function withdrawPollAction(
  campaignId: string,
  pollId: string
): Promise<Result> {
  try {
    await withdrawPoll(pollId);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to take the poll down.');
  }
}

/* --- feedback ---------------------------------------------------------- */

export async function listFeedbackFormsAction(
  campaignId: string
): Promise<FeedbackFormRow[]> {
  try {
    return await listFeedbackForms(campaignId);
  } catch {
    return [];
  }
}

export async function lastFeedbackQuestionsAction(
  campaignId: string
): Promise<FeedbackQuestion[] | null> {
  try {
    return await lastFeedbackQuestions(campaignId);
  } catch {
    return null;
  }
}

export async function saveFeedbackFormAction(
  campaignId: string,
  sessionId: string,
  questions: unknown
): Promise<Result<{ id: string }>> {
  try {
    const id = await saveFeedbackForm(sessionId, questions);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err, 'Failed to save the form.');
  }
}

export async function setFeedbackFormStatusAction(
  campaignId: string,
  formId: string,
  status: 'open' | 'closed'
): Promise<Result> {
  try {
    await setFeedbackFormStatus(formId, status);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to change the form.');
  }
}

export async function deleteFeedbackFormAction(
  campaignId: string,
  formId: string
): Promise<Result> {
  try {
    await deleteFeedbackForm(formId);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to remove the form.');
  }
}

export async function submitFeedbackAction(
  formId: string,
  answers: unknown
): Promise<Result> {
  try {
    await submitFeedback(formId, answers);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to send your answers.');
  }
}
