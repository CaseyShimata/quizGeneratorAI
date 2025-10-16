import { Module } from '@nestjs/common';
import { ConfigModule } from './config/ConfigModule.js';
import { DatabaseModule } from './database/DatabaseModule.js';
import { SwaggerModule } from './swagger/SwaggerModule.js';
import { OpenAIModule } from './openai/OpenAIModule.js';
import { IntelligentQueryModule } from './intelligentQuery/IntelligentQueryModule.js';
import { QuizModule } from './quiz/QuizModule.js';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    SwaggerModule,
    OpenAIModule,
    IntelligentQueryModule,
    QuizModule
  ],
})
export class MainModule {}
