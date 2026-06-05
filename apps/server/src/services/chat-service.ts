import {
  LIMITS,
  PROTOCOL_VERSION,
  TIMINGS,
  type AdvanceReadInput,
  type Conversation,
  type CreateChannelInput,
  type DeleteMessageInput,
  type EditMessageInput,
  type FetchHistoryInput,
  type HistoryPage,
  type Message,
  type ReactInput,
  type ReadReceipt,
  type SearchHit,
  type SearchInput,
  type SendMessageInput,
  type SessionReady,
  type ToggleConversationFlagInput,
} from '@pachat/shared';
import { conflict, forbidden, notFound, validationFailed } from '../lib/errors.js';
import { createLogger } from '../lib/logger.js';
import * as conversations from '../repositories/conversations.js';
import * as messages from '../repositories/messages.js';
import * as users from '../repositories/users.js';
import { selfFor } from './auth-service.js';

const log = createLogger('chat');

export interface Viewer {
  id: string;
  username: string;
}

/* ───────────────────────────────────────────────────────── authorisation ───*/

/**
 * The single membership gate. Every handler that touches a conversation goes
 * through here, so "can this member see this?" is answered in exactly one
 * place rather than re-derived per endpoint.
 */
function assertMember(conversationId: string, viewer: Viewer): void {
  if (!conversations.findConversationRow(conversationId)) {
    throw notFound('That conversation does not exist');
  }
  if (!conversations.isMember(conversationId, viewer.id)) {
    throw forbidden('You are not a member of that conversation');
  }
}

function requireConversation(conversationId: string, viewer: Viewer): Conversation {
  const conversation = conversations.getForViewer(conversationId, viewer);
  if (!conversation) throw notFound('That conversation does not exist');
  return conversation;
}
