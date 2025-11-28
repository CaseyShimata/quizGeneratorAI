/**
 * Prompt Builder Utility
 * Helper functions for constructing AI prompts
 */

export class PromptBuilder {
  /**
   * Build a system prompt for structured output
   */
  static buildSystemPrompt(instruction: string, schema?: any): string {
    let prompt = instruction;
    if (schema) {
      prompt += ' Return only valid JSON matching the provided schema.';
    }
    return prompt;
  }

  /**
   * Build a user prompt with context
   */
  static buildUserPrompt(
    request: string,
    context?: Record<string, any>,
  ): string {
    if (!context || Object.keys(context).length === 0) {
      return request;
    }

    const contextStr = Object.entries(context)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join('\n');

    return `Context:\n${contextStr}\n\nRequest: ${request}`;
  }

  /**
   * Build messages array for chat completion
   */
  static buildMessages(
    systemPrompt: string,
    userPrompt: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const messages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }> = [{ role: 'system', content: systemPrompt }];

    if (history && history.length > 0) {
      messages.push(...history);
    }

    messages.push({ role: 'user', content: userPrompt });

    return messages;
  }
}
