import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { QuizModule } from './quiz/QuizModule';
import { mainConfig } from './mainConfig';

@Module({
  imports: [
    ConfigModule.forRoot({isGlobal: true, load: [mainConfig] }),
    MongooseModule.forRoot(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/quizdb', {
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 30000,
          maxPoolSize: 10,
          bufferCommands: false
    }),
    QuizModule
  ],
})
export class MainModule {}
