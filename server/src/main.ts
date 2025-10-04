import { NestFactory } from '@nestjs/core';
import { MainModule } from './MainModule';
import { ConfigService } from '@nestjs/config';
import mongoose from 'mongoose';

async function bootstrap() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/quizdb';
  console.log('Connecting to MongoDB (blocking) at', mongoUri);

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 30000,
      maxPoolSize: 10,
      bufferCommands: false
    } as any);
    console.log('MongoDB connected (readyState):', (mongoose as any).connection?.readyState);
  } catch (err) {
    console.error('Failed to connect to MongoDB before app start', err);
    process.exit(1);
  }

  const app = await NestFactory.create(MainModule);
  const configService = app.get(ConfigService);
  const port = Number(configService.get<number>('PORT') || 3000);
  await app.listen(port);
  console.log(`App listening on ${port}`);
}

bootstrap();
