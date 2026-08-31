import { Fragment, type ReactNode } from 'react';
import { bridge } from './bridge';

/**
 * Renders a message body as React elements.
 *
 * Deliberately *not* HTML-with-dangerouslySetInnerHTML. Message bodies are
 * author-supplied, and producing real React nodes means there is no path from
 * a message to injected markup at all — escaping is not something that can be
 * forgotten, because no string is ever interpreted as HTML.
 *
 * The supported syntax is the subset people actually type in chat:
 *
 *   ```fenced code```   `inline code`   **bold**   *italic*   ~~strike~~
 *   > quoted line       @mention        bare http(s) URLs
 */

export interface MarkupContext {
  /** The viewer's username, so mentions of them can be highlighted. */
  selfUsername: string;
  /** Resolves a username to a display name; unknown handles stay literal. */
  resolveMention?: (username: string) => string | null;
  onMentionClick?: (username: string) => void;
}

/* ──────────────────────────────────────────────────────────── block level ──*/

const FENCE = /```(?:[a-zA-Z0-9+#-]*)\n?([\s\S]*?)```/g;

export function renderMessageBody(body: string, context: MarkupContext): ReactNode {
  if (body.length === 0) return null;

  const blocks: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  // Fenced code is extracted first: everything inside it must survive
  // verbatim, including characters that would otherwise be inline syntax.
  for (const match of body.matchAll(FENCE)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      blocks.push(
        <Fragment key={`t${key++}`}>
          {renderPlainBlocks(body.slice(cursor, start), context)}
        </Fragment>,
      );
    }
    blocks.push(
      <pre key={`c${key++}`}>
        <code>{match[1] ?? ''}</code>
      </pre>,
    );
    cursor = start + match[0].length;
  }

  if (cursor < body.length) {
    blocks.push(
      <Fragment key={`t${key++}`}>{renderPlainBlocks(body.slice(cursor), context)}</Fragment>,
    );
  }

  return blocks;
}
