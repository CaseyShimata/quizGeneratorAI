import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ALL_QUIZ_SCHEMAS } from './entities/index';

// Services
import { GenerateQuizService } from './services/GenerateQuizService';
import { GradeQuizService } from './services/GradeQuizService';
import { ListQuizzesService } from './services/ListQuizzesService';

// Controllers
import { GenerateQuizController } from './controllers/GenerateQuizController';
import { GradeQuizController } from './controllers/GradeQuizController';
import { ListQuizzesController } from './controllers/ListQuizzesController';

@Module({
  imports: [MongooseModule.forFeature(ALL_QUIZ_SCHEMAS)],
  controllers: [
    GenerateQuizController,
    GradeQuizController,
    ListQuizzesController,
  ],
  providers: [GenerateQuizService, GradeQuizService, ListQuizzesService],
  exports: [GenerateQuizService, GradeQuizService, ListQuizzesService],
})
class QuizModule {}

export { QuizModule };
