import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/DatabaseModule';
import { OpenAPIModule } from './openapi/OpenAPIModule';
import { OpenAIModule } from './openai/OpenAIModule';
import { IntelligentQueryModule } from './intelligentQuery/IntelligentQueryModule';
import { QuizModule } from './quiz/QuizModule';

@Module({
  imports: [
    DatabaseModule,
    OpenAPIModule,
    OpenAIModule,
    IntelligentQueryModule,
    QuizModule,
  ],
})
export class MainModule {}
