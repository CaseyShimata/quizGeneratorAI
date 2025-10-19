import { Injectable } from '@nestjs/common';
import { IntelligentRouterService } from './IntelligentRouterService.js';
import { ConversationService } from './ConversationService.js';
import { SwaggerDocsService } from '../../swagger/services/SwaggerDocsService.js';
import { OpenAIService } from '../../openai/services/OpenAIService.js';

/**
 * Conversational Router Service
 * Handles multi-turn conversations with parameter collection
 * Uses email as conversation identifier with auto-truncation
 */
@Injectable()
export class ConversationalRouterService {
    constructor(
        private readonly intelligentRouterService: IntelligentRouterService,
        private readonly conversationService: ConversationService,
        private readonly swaggerDocsService: SwaggerDocsService,
        private readonly openAIService: OpenAIService
    ) {}

    /**
     * Process a conversational query
     */
    async processConversationalQuery(
        email: string,
        userMessage: string
    ): Promise<any> {
        const conversation = this.conversationService.getConversation(email);

        // Add user message to history (auto-truncates if needed)
        this.conversationService.addMessage(email, 'user', userMessage);

        // Check if we have a pending function awaiting parameters
        if (conversation.pendingFunction) {
            return await this.handlePendingFunction(email, userMessage);
        }

        // Check for help/general queries
        if (this.isHelpQuery(userMessage)) {
            return this.handleHelpQuery(email);
        }

        // Try to route the request
        return await this.routeWithParameterCollection(email, userMessage);
    }

    /**
     * Check if query is asking for help
     */
    private isHelpQuery(message: string): boolean {
        const helpKeywords = ['help', 'what can', 'how do', 'available', 'options'];
        const lowerMessage = message.toLowerCase();
        return helpKeywords.some(keyword => lowerMessage.includes(keyword));
    }

    /**
     * Handle help queries
     */
    private handleHelpQuery(email: string): any {
        const endpoints = this.swaggerDocsService.getEndpointsDescription();
        const response = `I can help you with the following:\n\n${endpoints}\n\nWhat would you like to do?`;

        this.conversationService.addMessage(email, 'assistant', response);

        return {
            email,
            message: response,
            needsMoreInfo: false
        };
    }

    /**
     * Route request with parameter collection
     */
    private async routeWithParameterCollection(
        email: string,
        userMessage: string
    ): Promise<any> {
        const history = this.conversationService.getHistory(email);

        // Build system prompt for conversational AI
        const systemPrompt = `You are a helpful AI assistant for a Quiz Generator API.

**Your Role:**
- Help users interact with the API through natural conversation
- If a user wants to perform an action but hasn't provided all required parameters, ask them for the missing information ONE parameter at a time
- Be friendly and conversational
- When you have all required parameters, call the appropriate function

**Available Endpoints:**
${this.swaggerDocsService.getEndpointsDescription()}

**Important:**
- Always be helpful and guide users through what they need
- If user asks what they can do, list the available endpoints in a friendly way
- Only call functions when you have ALL required parameters`;

        const messages = [
            { role: 'system' as const, content: systemPrompt },
            ...history
        ];

        // Get tools from Swagger
        const tools = this.swaggerDocsService.getToolsFromSwagger();

        // Get AI response
        const response = await this.openAIService.createFunctionCallingCompletion(
            messages,
            tools,
            { temperature: 0.7 }
        );

        // Check if AI wants to call a function
        if (response.tool_calls && response.tool_calls.length > 0) {
            const toolCall = response.tool_calls[0];

            if ('function' in toolCall) {
                const functionName = toolCall.function.name;
                const functionArgs = JSON.parse(toolCall.function.arguments);

                // Check if all required parameters are present
                const endpointInfo = this.swaggerDocsService.getEndpointInfo(functionName);
                const missingParams = this.getMissingParams(functionName, functionArgs);

                if (missingParams.length > 0) {
                    // Save pending function state
                    this.conversationService.setPendingFunction(
                        email,
                        functionName,
                        functionArgs,
                        missingParams
                    );

                    const promptMessage = `To ${this.getFriendlyFunctionName(functionName)}, I need: ${missingParams.join(', ')}. Please provide the ${missingParams[0]}.`;
                    this.conversationService.addMessage(email, 'assistant', promptMessage);

                    return {
                        email,
                        message: promptMessage,
                        needsMoreInfo: true,
                        pendingFunction: functionName,
                        missingParams
                    };
                }

                // Execute the function
                try {
                    const result = await this.intelligentRouterService['executeHttpRequest'](
                        endpointInfo!.method,
                        endpointInfo!.path,
                        functionArgs
                    );

                    const successMessage = `Done! Here's the result:`;
                    this.conversationService.addMessage(email, 'assistant', successMessage);
                    this.conversationService.clearPendingFunction(email);

                    return {
                        email,
                        message: successMessage,
                        result,
                        needsMoreInfo: false
                    };
                } catch (error: any) {
                    const errorMessage = `Sorry, I encountered an error: ${error.message}`;
                    this.conversationService.addMessage(email, 'assistant', errorMessage);

                    return {
                        email,
                        message: errorMessage,
                        error: error.message,
                        needsMoreInfo: false
                    };
                }
            }
        }

        // No function call - just return the message
        const message = response.content || 'How can I help you?';
        this.conversationService.addMessage(email, 'assistant', message);

        return {
            email,
            message,
            needsMoreInfo: false
        };
    }

    /**
     * Handle responses to pending function
     */
    private async handlePendingFunction(
        email: string,
        userMessage: string
    ): Promise<any> {
        const conversation = this.conversationService.getConversation(email);
        const pending = conversation.pendingFunction!;

        // Try to extract the missing parameter from user's response
        const paramName = pending.missingParams[0];
        pending.collectedParams[paramName] = userMessage;
        pending.missingParams.shift();

        // Check if we still need more params
        if (pending.missingParams.length > 0) {
            const promptMessage = `Got it! Now I need the ${pending.missingParams[0]}.`;
            this.conversationService.addMessage(email, 'assistant', promptMessage);

            this.conversationService.setPendingFunction(
                email,
                pending.name,
                pending.collectedParams,
                pending.missingParams
            );

            return {
                email,
                message: promptMessage,
                needsMoreInfo: true,
                pendingFunction: pending.name,
                missingParams: pending.missingParams
            };
        }

        // We have all params - execute!
        const endpointInfo = this.swaggerDocsService.getEndpointInfo(pending.name);

        try {
            const result = await this.intelligentRouterService['executeHttpRequest'](
                endpointInfo!.method,
                endpointInfo!.path,
                pending.collectedParams
            );

            const successMessage = `Perfect! Here's what I found:`;
            this.conversationService.addMessage(email, 'assistant', successMessage);
            this.conversationService.clearPendingFunction(email);

            return {
                email,
                message: successMessage,
                result,
                needsMoreInfo: false
            };
        } catch (error: any) {
            const errorMessage = `Sorry, I encountered an error: ${error.message}`;
            this.conversationService.addMessage(email, 'assistant', errorMessage);
            this.conversationService.clearPendingFunction(email);

            return {
                email,
                message: errorMessage,
                error: error.message,
                needsMoreInfo: false
            };
        }
    }

    /**
     * Get missing required parameters for a function
     */
    private getMissingParams(functionName: string, providedParams: Record<string, any>): string[] {
        const tools = this.swaggerDocsService.getToolsFromSwagger();
        const tool = tools.find(t => t.function.name === functionName);

        if (!tool) return [];

        const required = tool.function.parameters.required || [];
        return required.filter((param: string) => !providedParams[param]);
    }

    /**
     * Get friendly name for function
     */
    private getFriendlyFunctionName(functionName: string): string {
        return functionName
            .replace(/_/g, ' ')
            .replace(/^(GET|POST|PUT|DELETE|PATCH) /, '')
            .toLowerCase();
    }
}
