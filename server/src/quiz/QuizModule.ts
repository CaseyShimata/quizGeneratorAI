import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Services
import { GenerateQuizService } from './services/GenerateQuizService.js';
import { GradeQuizService } from './services/GradeQuizService.js';
import { ListQuizzesService } from './services/ListQuizzesService.js';

// Controllers
import { GenerateQuizController } from './controllers/GenerateQuizController.js';
import { GradeQuizController } from './controllers/GradeQuizController.js';
import { ListQuizzesController } from './controllers/ListQuizzesController.js';

@Module({
  imports: [ConfigModule],
  controllers: [
    GenerateQuizController,
    GradeQuizController,
    ListQuizzesController
  ],
  providers: [
    GenerateQuizService,
    GradeQuizService,
    ListQuizzesService
  ],
  exports: [
    GenerateQuizService,
    GradeQuizService,
    ListQuizzesService
  ]
})
class QuizModule {}

export { QuizModule };
