import { Body, Controller, Post, Delete, Param } from '@nestjs/common';
import { ConversationalRouterService } from '../services/ConversationalRouterService.js';
import { z } from 'zod';
import { ApiBody, ApiOperation, ApiParam } from "@nestjs/swagger";

/**
 * Intelligent Query Controller
 * Handles conversational natural language queries with multi-turn support
 */

const ConversationalQueryInputZ = z.object({
  message: z.string().min(1, 'Message cannot be empty'),
  conversationId: z.string().optional()
});

@Controller('api')
export class IntelligentQueryController {
  constructor(
    private readonly conversationalRouterService: ConversationalRouterService
  ) {}

  /**
   * Process a conversational query
   * Supports multi-turn conversations with parameter collection
   * 
   * Examples:
   * - "What can I do?" → Lists available endpoints
   * - "Generate a quiz" → Asks for topic
   * - "JavaScript" → Creates quiz with topic "JavaScript"
   */
  @Post('intelligent-query')
  @ApiOperation({
    summary: 'Conversational AI query interface',
    description: `Chat with the API using natural language. The AI will:
    - Help you discover what endpoints are available
    - Guide you through providing required parameters
    - Execute API calls when it has all needed information
    - Remember context across multiple messages in the same conversation`
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['message'],
      properties: {
        message: { 
          type: 'string', 
          example: 'What can I do?',
          description: 'Your natural language message or question'
        },
        conversationId: { 
          type: 'string', 
          example: 'uuid-here',
          description: 'Optional: Include this to continue an existing conversation'
        }
      }
    }
  })
  async processConversationalQuery(@Body() body: any) {
    const { message, conversationId } = ConversationalQueryInputZ.parse(body);
    
    const result = await this.conversationalRouterService.processConversationalQuery(
      message,
      conversationId
    );
    
    return result;
  }

  /**
   * Clear a conversation
   */
  @Delete('intelligent-query/:conversationId')
  @ApiOperation({
    summary: 'Clear conversation history',
    description: 'Delete a conversation and its history'
  })
  @ApiParam({
    name: 'conversationId',
    description: 'The conversation ID to clear'
  })
  async clearConversation(@Param('conversationId') conversationId: string) {
    this.conversationalRouterService.clearConversation(conversationId);
    return { message: 'Conversation cleared' };
  }
}
