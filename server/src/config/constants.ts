import 'dotenv/config';

/**
 * Configuration Constants
 * Single source of truth for ALL environment variables and their fallback values
 * Import and use these constants directly throughout the application
 * 
 * Usage:
 *   import { PORT, MONGO_URI, OPENAI_API_KEY } from '@/config/config/constants';
 */

export const PORT = Number(process.env.PORT || '3000');
export const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/quizdb';
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
export const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// Log to verify (remove after testing)
console.log('Loading constants - OPENAI_API_KEY exists:', !!OPENAI_API_KEY);
