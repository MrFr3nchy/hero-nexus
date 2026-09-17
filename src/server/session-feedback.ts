import 'server-only';

import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import {
  campaignSessions,
  sessionFeedbackForms,
  sessionFeedbackResponses,
  users,
} from '@/db/schema';
import { requireCampaignRole, type CampaignRole } from './campaigns';

/*
 * How did it go?
 *
 * A DM writes a few questions for a sitting, the players answer if they feel
 * like it, and the answers are filed under the session for the DM to read
 * back. A player sees their own answers and nobody else's; a form with no
 * questions cannot be opened, because an empty page asks nothing.
 */

export type FeedbackQuestionKind = 'text' | 'scale' | 'choice';

export interface FeedbackQuestion {
  id: string;
  prompt: string;
  kind: FeedbackQuestionKind;
  /** For `choice` only. */
  options?: string[];
}

export type FeedbackAnswers = Record<string, string | number>;

export interface FeedbackResponseRow {
  userId: string;
  name: string | null;
  answers: FeedbackAnswers;
  submittedAt: string;
  updatedAt: string;
}

export interface FeedbackFormRow {
  id: string;
  sessionId: string;
  questions: FeedbackQuestion[];
  status: 'open' | 'closed';
  createdAt: string;
  /** Staff: everyone's. A player: their own, or empty. */
  responses: FeedbackResponseRow[];
  /** How many have answered — a player may see the count, not the answers. */
  answered: number;
}

const KINDS: FeedbackQuestionKind[] = ['text', 'scale', 'choice'];

function isStaffRole(role: CampaignRole): boolean {
  return role === 'gm' || role === 'co-gm';
}

/**
 * Tidy a question list from the client: trim, drop blanks, cap lengths, mint
 * ids for new questions. Ids are kept when given so an answer already filed
 * under a question survives the DM rewording it.
 */
export function normaliseQuestions(input: unknown): FeedbackQuestion[] {
  if (!Array.isArray(input)) return [];
  const out: FeedbackQuestion[] = [];
  for (const raw of input.slice(0, 20)) {
    if (!raw || typeof raw !== 'object') continue;
    const q = raw as Record<string, unknown>;
    const prompt = typeof q.prompt === 'string' ? q.prompt.trim() : '';
    if (!prompt) continue;
    const kind = KINDS.includes(q.kind as FeedbackQuestionKind)
      ? (q.kind as FeedbackQuestionKind)
      : 'text';
    const id =
      typeof q.id === 'string' && /^[\w-]{1,40}$/.test(q.id)
        ? q.id
        : crypto.randomUUID();
    const options =
      kind === 'choice' && Array.isArray(q.options)
        ? q.options
            .filter((o): o is string => typeof o === 'string')
            .map(o => o.trim().slice(0, 80))
            .filter(Boolean)
            .slice(0, 12)
        : undefined;
    if (kind === 'choice' && (!options || options.length < 2)) continue;
    out.push({
      id,
      prompt: prompt.slice(0, 240),
      kind,
      ...(options ? { options } : {}),
    });
  }
  return out;
}

function readQuestions(value: unknown): FeedbackQuestion[] {
  return normaliseQuestions(value);
}

/**
 * Every form for a campaign's sittings, with the responses the reader is
 * allowed to see. The filtering lives here, not in the component, so a
 * player's answers never travel to another player's browser.
 */
export async function listFeedbackForms(
  campaignId: string
): Promise<FeedbackFormRow[]> {
  const { userId, role } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const isStaff = isStaffRole(role);

  const forms = await db
    .select()
    .from(sessionFeedbackForms)
    .where(eq(sessionFeedbackForms.campaignId, campaignId))
    .orderBy(asc(sessionFeedbackForms.createdAt));
  if (forms.length === 0) return [];

  const responses = await db
    .select({
      formId: sessionFeedbackResponses.formId,
      userId: sessionFeedbackResponses.userId,
      name: users.name,
      answers: sessionFeedbackResponses.answers,
      submittedAt: sessionFeedbackResponses.submittedAt,
      updatedAt: sessionFeedbackResponses.updatedAt,
    })
    .from(sessionFeedbackResponses)
    .leftJoin(users, eq(users.id, sessionFeedbackResponses.userId))
    .where(
      inArray(
        sessionFeedbackResponses.formId,
        forms.map(f => f.id)
      )
    )
    .orderBy(asc(sessionFeedbackResponses.submittedAt));

  return forms.map(f => {
    const all = responses.filter(r => r.formId === f.id);
    const visible = isStaff ? all : all.filter(r => r.userId === userId);
    return {
      id: f.id,
      sessionId: f.sessionId,
      questions: readQuestions(f.questions),
      status: f.status,
      createdAt: f.createdAt,
      responses: visible.map(r => ({
        userId: r.userId,
        name: r.name,
        answers: (r.answers as FeedbackAnswers) ?? {},
        submittedAt: r.submittedAt,
        updatedAt: r.updatedAt,
      })),
      answered: all.length,
    };
  });
}

/**
 * The most recent form's questions, so the DM can ask the same things again
 * without retyping them. Null when the campaign has never asked.
 */
export async function lastFeedbackQuestions(
  campaignId: string
): Promise<FeedbackQuestion[] | null> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  const last = await db.query.sessionFeedbackForms.findFirst({
    where: eq(sessionFeedbackForms.campaignId, campaignId),
    orderBy: [desc(sessionFeedbackForms.createdAt)],
  });
  if (!last) return null;
  const questions = readQuestions(last.questions);
  return questions.length > 0 ? questions : null;
}

/**
 * Write (or rewrite) the form for a sitting. One per session: saving again
 * replaces the questions in place, keeping the ids of any that survived so
 * answers already filed still line up.
 */
export async function saveFeedbackForm(
  sessionId: string,
  questions: unknown
): Promise<string> {
  const session = await db.query.campaignSessions.findFirst({
    where: eq(campaignSessions.id, sessionId),
  });
  if (!session) throw new Error('NOT_FOUND');
  const { userId } = await requireCampaignRole(session.campaignId, [
    'gm',
    'co-gm',
  ]);

  const clean = normaliseQuestions(questions);
  if (clean.length === 0) throw new Error('NO_QUESTIONS');

  const now = new Date().toISOString();
  const existing = await db.query.sessionFeedbackForms.findFirst({
    where: eq(sessionFeedbackForms.sessionId, sessionId),
  });
  if (existing) {
    await db
      .update(sessionFeedbackForms)
      .set({ questions: clean, updatedAt: now })
      .where(eq(sessionFeedbackForms.id, existing.id));
    return existing.id;
  }
  const [row] = await db
    .insert(sessionFeedbackForms)
    .values({
      campaignId: session.campaignId,
      sessionId,
      questions: clean,
      createdBy: userId,
    })
    .returning({ id: sessionFeedbackForms.id });
  return row.id;
}

export async function setFeedbackFormStatus(
  formId: string,
  status: 'open' | 'closed'
): Promise<void> {
  const form = await db.query.sessionFeedbackForms.findFirst({
    where: eq(sessionFeedbackForms.id, formId),
  });
  if (!form) throw new Error('NOT_FOUND');
  await requireCampaignRole(form.campaignId, ['gm', 'co-gm']);
  await db
    .update(sessionFeedbackForms)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(sessionFeedbackForms.id, formId));
}

export async function deleteFeedbackForm(formId: string): Promise<void> {
  const form = await db.query.sessionFeedbackForms.findFirst({
    where: eq(sessionFeedbackForms.id, formId),
  });
  if (!form) throw new Error('NOT_FOUND');
  await requireCampaignRole(form.campaignId, ['gm', 'co-gm']);
  await db
    .delete(sessionFeedbackForms)
    .where(eq(sessionFeedbackForms.id, formId));
}

/**
 * Answer the form. Your own answers only, and only while it is open; coming
 * back to change an answer is allowed, which is why this upserts. Answers
 * are kept only for questions the form actually asks, so a stale client
 * cannot file an answer under a question the DM has since removed.
 */
export async function submitFeedback(
  formId: string,
  answers: unknown
): Promise<void> {
  const form = await db.query.sessionFeedbackForms.findFirst({
    where: eq(sessionFeedbackForms.id, formId),
  });
  if (!form) throw new Error('NOT_FOUND');
  const { userId } = await requireCampaignRole(form.campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  if (form.status !== 'open') throw new Error('FORM_CLOSED');

  const questions = readQuestions(form.questions);
  const raw =
    answers && typeof answers === 'object'
      ? (answers as Record<string, unknown>)
      : {};
  const clean: FeedbackAnswers = {};
  for (const q of questions) {
    const v = raw[q.id];
    if (q.kind === 'scale') {
      const n = typeof v === 'number' ? v : Number(v);
      if (Number.isInteger(n) && n >= 1 && n <= 5) clean[q.id] = n;
    } else if (q.kind === 'choice') {
      if (typeof v === 'string' && q.options?.includes(v)) clean[q.id] = v;
    } else if (typeof v === 'string' && v.trim()) {
      clean[q.id] = v.trim().slice(0, 4000);
    }
  }
  if (Object.keys(clean).length === 0) throw new Error('NO_ANSWERS');

  const now = new Date().toISOString();
  const existing = await db.query.sessionFeedbackResponses.findFirst({
    where: and(
      eq(sessionFeedbackResponses.formId, formId),
      eq(sessionFeedbackResponses.userId, userId)
    ),
  });
  if (existing) {
    await db
      .update(sessionFeedbackResponses)
      .set({ answers: clean, updatedAt: now })
      .where(eq(sessionFeedbackResponses.id, existing.id));
    return;
  }
  await db.insert(sessionFeedbackResponses).values({
    formId,
    userId,
    answers: clean,
    submittedAt: now,
    updatedAt: now,
  });
}
