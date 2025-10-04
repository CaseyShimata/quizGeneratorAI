import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QuizService } from './QuizService.js';
import { QuizController } from './QuizController.js';

@Module({
  imports: [ConfigModule],
  controllers: [QuizController],
  providers: [QuizService],
  exports: [QuizService]
})
class QuizModule {}

export { QuizModule };
