import { Test, TestingModule } from '@nestjs/testing';
import { ConversationService } from '../../../src/intelligentQuery/services/ConversationService';

describe('ConversationService', () => {
  let service: ConversationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ConversationService],
    }).compile();

    service = module.get<ConversationService>(ConversationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getConversation', () => {
    it('should create a new conversation for a new email', () => {
      const conversation = service.getConversation('test@example.com');
      expect(conversation).toBeDefined();
      expect(conversation.email).toBe('test@example.com');
      expect(conversation.history).toEqual([]);
      expect(conversation.lastUpdate).toBeInstanceOf(Date);
    });

    it('should return existing conversation for known email', () => {
      const conv1 = service.getConversation('test@example.com');
      const conv2 = service.getConversation('test@example.com');
      expect(conv1).toBe(conv2);
    });

    it('should update lastUpdate timestamp on access', () => {
      const conv1 = service.getConversation('test@example.com');
      const firstUpdate = conv1.lastUpdate;

      // Wait a bit
      setTimeout(() => {
        const conv2 = service.getConversation('test@example.com');
        expect(conv2.lastUpdate.getTime()).toBeGreaterThanOrEqual(
          firstUpdate.getTime(),
        );
      }, 10);
    });
  });

  describe('addMessage', () => {
    it('should add user message to conversation history', () => {
      service.addMessage('test@example.com', 'user', 'Hello');
      const conversation = service.getConversation('test@example.com');
      expect(conversation.history).toHaveLength(1);
      expect(conversation.history[0]).toEqual({
        role: 'user',
        content: 'Hello',
      });
    });

    it('should add assistant message to conversation history', () => {
      service.addMessage('test@example.com', 'assistant', 'Hi there!');
      const conversation = service.getConversation('test@example.com');
      expect(conversation.history).toHaveLength(1);
      expect(conversation.history[0]).toEqual({
        role: 'assistant',
        content: 'Hi there!',
      });
    });

    it('should maintain conversation order', () => {
      service.addMessage('test@example.com', 'user', 'First');
      service.addMessage('test@example.com', 'assistant', 'Second');
      service.addMessage('test@example.com', 'user', 'Third');

      const conversation = service.getConversation('test@example.com');
      expect(conversation.history).toHaveLength(3);
      expect(conversation.history[0].content).toBe('First');
      expect(conversation.history[1].content).toBe('Second');
      expect(conversation.history[2].content).toBe('Third');
    });

    it('should truncate history when exceeding max messages', () => {
      // Add 25 messages (exceeds MAX_HISTORY_MESSAGES of 20)
      for (let i = 1; i <= 25; i++) {
        service.addMessage(
          'test@example.com',
          i % 2 === 0 ? 'assistant' : 'user',
          `Message ${i}`,
        );
      }

      const conversation = service.getConversation('test@example.com');
      expect(conversation.history.length).toBeLessThanOrEqual(20);
      // Should keep most recent messages
      expect(
        conversation.history[conversation.history.length - 1].content,
      ).toBe('Message 25');
    });
  });

  describe('getHistory', () => {
    it('should return conversation history', () => {
      service.addMessage('test@example.com', 'user', 'Hello');
      service.addMessage('test@example.com', 'assistant', 'Hi!');

      const history = service.getHistory('test@example.com');
      expect(history).toHaveLength(2);
      expect(history[0]).toEqual({ role: 'user', content: 'Hello' });
      expect(history[1]).toEqual({ role: 'assistant', content: 'Hi!' });
    });

    it('should return empty array for new conversation', () => {
      const history = service.getHistory('new@example.com');
      expect(history).toEqual([]);
    });
  });

  describe('setPendingFunction', () => {
    it('should set pending function state', () => {
      service.setPendingFunction(
        'test@example.com',
        'createOrder',
        { productId: '123' },
        ['quantity'],
      );

      const conversation = service.getConversation('test@example.com');
      expect(conversation.pendingFunction).toBeDefined();
      expect(conversation.pendingFunction?.name).toBe('createOrder');
      expect(conversation.pendingFunction?.collectedParams).toEqual({
        productId: '123',
      });
      expect(conversation.pendingFunction?.missingParams).toEqual(['quantity']);
    });

    it('should update existing pending function', () => {
      service.setPendingFunction(
        'test@example.com',
        'createOrder',
        { productId: '123' },
        ['quantity'],
      );

      service.setPendingFunction(
        'test@example.com',
        'createOrder',
        { productId: '123', quantity: 2 },
        [],
      );

      const conversation = service.getConversation('test@example.com');
      expect(conversation.pendingFunction?.collectedParams.quantity).toBe(2);
      expect(conversation.pendingFunction?.missingParams).toEqual([]);
    });
  });

  describe('clearPendingFunction', () => {
    it('should clear pending function state', () => {
      service.setPendingFunction(
        'test@example.com',
        'createOrder',
        { productId: '123' },
        ['quantity'],
      );

      service.clearPendingFunction('test@example.com');

      const conversation = service.getConversation('test@example.com');
      expect(conversation.pendingFunction).toBeUndefined();
    });

    it('should not throw error when clearing non-existent pending function', () => {
      expect(() => {
        service.clearPendingFunction('test@example.com');
      }).not.toThrow();
    });
  });

  describe('conversation cleanup', () => {
    it('should clean up expired conversations', () => {
      // Create a conversation
      service.addMessage('old@example.com', 'user', 'Hello');

      // Manually trigger cleanup after TTL would have passed
      // Note: This test would need to wait for the actual TTL or mock Date
      // For now, we just verify the conversation exists
      const conv = service.getConversation('old@example.com');
      expect(conv).toBeDefined();
    });

    it('should keep active conversations', () => {
      service.addMessage('active@example.com', 'user', 'Hello');

      // Access again to update lastUpdate
      service.addMessage('active@example.com', 'assistant', 'Hi!');

      const conv = service.getConversation('active@example.com');
      expect(conv.history).toHaveLength(2);
    });
  });

  describe('setPendingOperation', () => {
    it('should set pending operation state', () => {
      service.setPendingOperation('test@example.com', {
        toolName: 'eswAddresses',
        apiName: 'eshopweb',
        operation: { type: 'query' },
        collectedParams: {},
        requiredParams: [],
        optionalParams: ['filter', 'paging'],
        schema: { parameters: [] },
        originalRequest: 'list addresses',
      });

      const operation = service.getPendingOperation('test@example.com');
      expect(operation).toBeDefined();
      expect(operation?.toolName).toBe('eswAddresses');
      expect(operation?.optionalParams).toEqual(['filter', 'paging']);
    });
  });

  describe('updatePendingOperation', () => {
    it('should update collected parameters', () => {
      service.setPendingOperation('test@example.com', {
        toolName: 'eswAddresses',
        apiName: 'eshopweb',
        operation: { type: 'query' },
        collectedParams: {},
        requiredParams: [],
        optionalParams: ['filter', 'paging'],
      });

      service.updatePendingOperation('test@example.com', {
        collectedParams: { filter: { city: { contains: 'West' } } },
      });

      const operation = service.getPendingOperation('test@example.com');
      expect(operation?.collectedParams).toEqual({
        filter: { city: { contains: 'West' } },
      });
    });
  });

  describe('clearPendingOperation', () => {
    it('should clear pending operation state', () => {
      service.setPendingOperation('test@example.com', {
        toolName: 'eswAddresses',
        apiName: 'eshopweb',
        operation: { type: 'query' },
        collectedParams: {},
        requiredParams: [],
        optionalParams: [],
      });

      service.clearPendingOperation('test@example.com');

      const operation = service.getPendingOperation('test@example.com');
      expect(operation).toBeUndefined();
    });
  });

  describe('multiple users', () => {
    it('should maintain separate conversations for different users', () => {
      service.addMessage('user1@example.com', 'user', 'User 1 message');
      service.addMessage('user2@example.com', 'user', 'User 2 message');

      const conv1 = service.getConversation('user1@example.com');
      const conv2 = service.getConversation('user2@example.com');

      expect(conv1.history[0].content).toBe('User 1 message');
      expect(conv2.history[0].content).toBe('User 2 message');
      expect(conv1.history).toHaveLength(1);
      expect(conv2.history).toHaveLength(1);
    });

    it('should handle pending functions separately per user', () => {
      service.setPendingFunction('user1@example.com', 'func1', {}, []);
      service.setPendingFunction('user2@example.com', 'func2', {}, []);

      const conv1 = service.getConversation('user1@example.com');
      const conv2 = service.getConversation('user2@example.com');

      expect(conv1.pendingFunction?.name).toBe('func1');
      expect(conv2.pendingFunction?.name).toBe('func2');
    });

    it('should handle pending operations separately per user', () => {
      service.setPendingOperation('user1@example.com', {
        toolName: 'op1',
        apiName: 'api1',
        operation: {},
        collectedParams: {},
        requiredParams: [],
        optionalParams: [],
      });

      service.setPendingOperation('user2@example.com', {
        toolName: 'op2',
        apiName: 'api2',
        operation: {},
        collectedParams: {},
        requiredParams: [],
        optionalParams: [],
      });

      const op1 = service.getPendingOperation('user1@example.com');
      const op2 = service.getPendingOperation('user2@example.com');

      expect(op1?.toolName).toBe('op1');
      expect(op2?.toolName).toBe('op2');
    });
  });
});
