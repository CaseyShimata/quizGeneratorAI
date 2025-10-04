import { ConfigService } from '@nestjs/config';

const mainConfig = () => ({
  PORT: process.env.PORT || '3000',
  MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/quizdb',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
});

export { mainConfig };