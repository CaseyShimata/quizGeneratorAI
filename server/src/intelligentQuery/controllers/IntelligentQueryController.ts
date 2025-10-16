import { Body, Controller, Post } from '@nestjs/common';
import { IntelligentRouterService } from '../services/IntelligentRouterService.js';
import { z } from 'zod';
import {ApiBody, ApiOperation } from "@nestjs/swagger";

/**
 * Intelligent Query Controller
 * Handles natural language queries using RAG and function calling
 */

const QueryInputZ = z.object({
  query: z.string().min(1, 'Query cannot be empty'),
  context: z.record(z.string(), z.any()).optional()
});

@Controller('api')
export class IntelligentQueryController {
  constructor(private readonly intelligentRouterService: IntelligentRouterService) {}

  /**
   * Process a natural language query
   * Example: "I want all quizzes for user with an email containing shimatacb"
   */
  @Post('intelligent-query')
  @ApiOperation({
      summary: 'Perform any query by typing human readable prompt',
      description: 'This will use ai to scan the Swagger docs and determine which endpoint to run. Else it will prompt you what is missing/wrong'
  })
  @ApiBody({
      schema: {
          type: 'object',
          required: ['query', 'context'],
          properties: {
              query: { type: 'string', example: 'Get first quiz for user with email like derp@' },
              context: { type: 'JSON', example: '{}' }
          }
      }
  })
  async processQuery(@Body() body: any) {
    const { query, context } = QueryInputZ.parse(body);
    
    const result = await this.intelligentRouterService.processRequest(query, context);
    
    return {
      query,
      ...result
    };
  }

}
