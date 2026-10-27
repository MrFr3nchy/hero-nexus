import { describe, expect, it } from 'vitest';

import { defaultModel, extractJson } from './providers';

describe('extractJson', () => {
  it('reads bare, fenced and prefaced replies', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('Here:\n```json\n{"a":"}"}\n```')).toEqual({ a: '}' });
  });

  it('takes the corrected object when the model writes two', () => {
    const reply =
      '{"lines":[{"line":4}],"notes":"x"}\n\nWait — corrected:\n\n{"lines":[],"notes":"y {not json}"}';
    expect(extractJson(reply)).toEqual({ lines: [], notes: 'y {not json}' });
  });

  it('refuses a reply with no object in it', () => {
    expect(() => extractJson('sorry, no')).toThrow('AI_BAD_REPLY');
    expect(() => extractJson('{"a": }')).toThrow('AI_BAD_REPLY');
  });
});

describe('defaultModel', () => {
  it('picks the mid-sized model', () => {
    expect(
      defaultModel('anthropic', ['claude-opus-5-5', 'claude-sonnet-5-5'])
    ).toBe('claude-sonnet-5-5');
    expect(
      defaultModel('gemini', ['gemini-x-flash-lite', 'gemini-x-flash'])
    ).toBe('gemini-x-flash');
  });
});
