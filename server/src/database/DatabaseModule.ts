import { Module, Global, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongoose from 'mongoose';

/**
 * Database Module
 * Handles MongoDB connection and configuration
 */
@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: async () => {
        const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/quizdb';
        
        console.log('Connecting to MongoDB at', uri);
        
        // Establish connection before returning config
        try {
          await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 30000,
            maxPoolSize: 10,
            bufferCommands: false
          } as any);
          console.log('MongoDB connected (readyState):', mongoose.connection.readyState);
        } catch (err) {
          console.error('Failed to connect to MongoDB', err);
          throw err;
        }
        
        return {
          uri,
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 30000,
          maxPoolSize: 10,
          bufferCommands: false
        };
      }
    })
  ],
  exports: [MongooseModule]
})
export class DatabaseModule {}
