import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { mongooseConfig } from './config/mongooseConfig.js';

/**
 * Database Module
 * Handles MongoDB connection and configuration
 */
@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync(mongooseConfig)
  ],
  exports: [MongooseModule]
})
export class DatabaseModule {}
