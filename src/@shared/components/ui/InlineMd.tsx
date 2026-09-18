import { Fragment, type ReactNode } from 'react';

/**
 * The little markdown the SRD text carries, rendered instead of shown.
 *
 * Open5e's feature and trait prose bolds its run-in headings — `**Rage
 * Damage.** When you make an attack…` — and italicises option names with
 * `*stars*` or `_underscores_`. Rendered as plain text, every class feature
 * on the compendium read `**Duration.**` with the asterisks in. This handles
 * exactly those three marks and nothing else: no links, no headings, no
 * lists, no HTML — none of which the data uses, and each of which would be
 * a new way for a homebrew description to put something on the page it
 * should not. Paragraph breaks are the caller's `whitespace-pre-wrap`.
 */

const MARK =
  /(\*\*[^*\n]+?\*\*|(?<![\w*])\*[^*\n]+?\*(?![\w*])|(?<!\w)_[^_\n]+?_(?!\w))/g;

export function renderInlineMd(text: string): ReactNode {
  if (!text || !/[*_]/.test(text)) return text;
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(MARK)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const tok = m[0];
    if (tok.startsWith('**')) {
      out.push(
        <strong key={i++} className="font-medium text-ink">
          {tok.slice(2, -2)}
        </strong>
      );
    } else {
      out.push(<em key={i++}>{tok.slice(1, -1)}</em>);
    }
    last = at + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.map((n, k) => <Fragment key={k}>{n}</Fragment>);
}

/** `renderInlineMd` as an element, for JSX that only has a string. */
export function InlineMd({ children }: { children: string }) {
  return <>{renderInlineMd(children)}</>;
}
