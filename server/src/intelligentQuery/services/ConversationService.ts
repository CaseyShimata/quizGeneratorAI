import { Injectable } from '@nestjs/common';

/**
 * Conversation Service
 * Manages conversation state and history for multi-turn interactions
 */

interface ConversationState {
  conversationId: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  pendingFunction?: {
    name: string;
    collectedParams: Record<string, any>;
    missingParams: string[];
  };
  lastUpdate: Date;
}

@Injectable()
export class ConversationService {
  private conversations: Map<string, ConversationState> = new Map();
  private readonly TTL = 30 * 60 * 1000; // 30 minutes

  /**
   * Get or create a conversation
   */
  getConversation(conversationId: string): ConversationState {
    this.cleanupExpired();
    
    if (!this.conversations.has(conversationId)) {
      this.conversations.set(conversationId, {
        conversationId,
        history: [],
        lastUpdate: new Date()
      });
    }
    
    const conv = this.conversations.get(conversationId)!;
    conv.lastUpdate = new Date();
    return conv;
  }

  /**
   * Add message to conversation history
   */
  addMessage(conversationId: string, role: 'user' | 'assistant', content: string): void {
    const conv = this.getConversation(conversationId);
    conv.history.push({ role, content });
  }

  /**
   * Set pending function state
   */
  setPendingFunction(
    conversationId: string,
    functionName: string,
    collectedParams: Record<string, any>,
    missingParams: string[]
  ): void {
    const conv = this.getConversation(conversationId);
    conv.pendingFunction = { name: functionName, collectedParams, missingParams };
  }

  /**
   * Clear pending function
   */
  clearPendingFunction(conversationId: string): void {
    const conv = this.getConversation(conversationId);
    delete conv.pendingFunction;
  }

  /**
   * Get conversation history as messages
   */
  getHistory(conversationId: string): Array<{ role: 'user' | 'assistant'; content: string }> {
    return this.getConversation(conversationId).history;
  }

  /**
   * Clear a conversation
   */
  clearConversation(conversationId: string): void {
    this.conversations.delete(conversationId);
  }

  /**
   * Cleanup expired conversations
   */
  private cleanupExpired(): void {
    const now = new Date();
    for (const [id, conv] of this.conversations.entries()) {
      if (now.getTime() - conv.lastUpdate.getTime() > this.TTL) {
        this.conversations.delete(id);
      }
    }
  }
}
