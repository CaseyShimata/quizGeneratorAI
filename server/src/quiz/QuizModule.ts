import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QuizService } from './QuizService';
import { QuizController } from './QuizController';

@Module({
  imports: [ConfigModule],
  controllers: [QuizController],
  providers: [QuizService],
  exports: [QuizService]
})
class QuizModule {}

export { QuizModule };
