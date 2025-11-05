import { Injectable } from '@nestjs/common';

/**
 * Conversation Service
 * Manages conversation state and history per email address
 * Auto-truncates when approaching context window limits
 */

interface ConversationState {
  email: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  pendingFunction?: {
    name: string;
    collectedParams: Record<string, any>;
    missingParams: string[];
  };
  pendingOperation?: {
    toolName: string;
    apiName: string;
    operation: any;
    collectedParams: Record<string, any>;
    requiredParams: string[];
    optionalParams: string[];
    schema?: any;
    originalRequest?: string;
  };
  lastUpdate: Date;
}

@Injectable()
export class ConversationService {
  private conversations: Map<string, ConversationState> = new Map();
  private readonly TTL = 30 * 60 * 1000; // 30 minutes
  private readonly MAX_HISTORY_MESSAGES = 20; // Keep last 20 messages (10 turns)
  private readonly APPROXIMATE_TOKENS_PER_MESSAGE = 100; // Rough estimate
  private readonly MAX_CONTEXT_TOKENS = 8000; // Leave room for system prompt + response

  /**
   * Get or create a conversation for an email
   */
  getConversation(email: string): ConversationState {
    this.cleanupExpired();

    if (!this.conversations.has(email)) {
      this.conversations.set(email, {
        email,
        history: [],
        lastUpdate: new Date(),
      });
    }

    const conv = this.conversations.get(email)!;
    conv.lastUpdate = new Date();
    return conv;
  }

  /**
   * Add message to conversation history with auto-truncation
   */
  addMessage(email: string, role: 'user' | 'assistant', content: string): void {
    const conv = this.getConversation(email);
    conv.history.push({ role, content });

    // Auto-truncate if needed
    this.truncateIfNeeded(email);
  }

  /**
   * Truncate conversation history if it's getting too long
   */
  private truncateIfNeeded(email: string): void {
    const conv = this.conversations.get(email);
    if (!conv) return;

    // If history exceeds max messages, keep only the most recent ones
    if (conv.history.length > this.MAX_HISTORY_MESSAGES) {
      // Keep the last MAX_HISTORY_MESSAGES messages
      conv.history = conv.history.slice(-this.MAX_HISTORY_MESSAGES);
    }

    // Estimate token count and truncate if needed
    const estimatedTokens =
      conv.history.length * this.APPROXIMATE_TOKENS_PER_MESSAGE;
    if (estimatedTokens > this.MAX_CONTEXT_TOKENS) {
      // Remove oldest messages until we're under the limit
      const messagesToRemove = Math.ceil(
        (estimatedTokens - this.MAX_CONTEXT_TOKENS) /
          this.APPROXIMATE_TOKENS_PER_MESSAGE,
      );
      conv.history = conv.history.slice(messagesToRemove);
    }
  }

  /**
   * Set pending function state
   */
  setPendingFunction(
    email: string,
    functionName: string,
    collectedParams: Record<string, any>,
    missingParams: string[],
  ): void {
    const conv = this.getConversation(email);
    conv.pendingFunction = {
      name: functionName,
      collectedParams,
      missingParams,
    };
  }

  /**
   * Clear pending function
   */
  clearPendingFunction(email: string): void {
    const conv = this.getConversation(email);
    delete conv.pendingFunction;
  }

  /**
   * Set pending operation for parameter collection
   */
  setPendingOperation(
    email: string,
    operation: {
      toolName: string;
      apiName: string;
      operation: any;
      collectedParams: Record<string, any>;
      requiredParams: string[];
      optionalParams: string[];
      schema?: any;
      originalRequest?: string;
    },
  ): void {
    const conv = this.getConversation(email);
    conv.pendingOperation = operation;
  }

  /**
   * Update pending operation with new collected parameters
   */
  updatePendingOperation(
    email: string,
    updates: Partial<{
      collectedParams: Record<string, any>;
      requiredParams: string[];
      optionalParams: string[];
    }>,
  ): void {
    const conv = this.getConversation(email);
    if (conv.pendingOperation) {
      if (updates.collectedParams) {
        conv.pendingOperation.collectedParams = updates.collectedParams;
      }
      if (updates.requiredParams) {
        conv.pendingOperation.requiredParams = updates.requiredParams;
      }
      if (updates.optionalParams) {
        conv.pendingOperation.optionalParams = updates.optionalParams;
      }
    }
  }

  /**
   * Clear pending operation
   */
  clearPendingOperation(email: string): void {
    const conv = this.getConversation(email);
    delete conv.pendingOperation;
  }

  /**
   * Get pending operation if exists
   */
  getPendingOperation(email: string): ConversationState['pendingOperation'] {
    const conv = this.getConversation(email);
    return conv.pendingOperation;
  }

  /**
   * Get conversation history as messages
   */
  getHistory(
    email: string,
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    return this.getConversation(email).history;
  }

  /**
   * Cleanup expired conversations
   */
  private cleanupExpired(): void {
    const now = new Date();
    for (const [email, conv] of this.conversations.entries()) {
      if (now.getTime() - conv.lastUpdate.getTime() > this.TTL) {
        this.conversations.delete(email);
      }
    }
  }
}
