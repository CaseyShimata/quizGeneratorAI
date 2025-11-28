import mongoose from 'mongoose';
import { Logger } from '@nestjs/common';
import { MONGO_URI } from '../../config/constants';

/**
 * Mongoose Configuration
 * Provides connection configuration for MongoDB
 */
export const mongooseConfig = {
  useFactory: async () => {
    const logger = new Logger('MongoDB');
    logger.log(`Connecting to MongoDB at ${MONGO_URI}`);

    // Establish connection before returning config
    try {
      await mongoose.connect(MONGO_URI, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 30000,
        maxPoolSize: 10,
        bufferCommands: false,
      } as any);
      logger.log(`MongoDB connected (readyState): ${mongoose.connection.readyState}`);
    } catch (err) {
      logger.error('Failed to connect to MongoDB', err);
      throw err;
    }

    return {
      uri: MONGO_URI,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 30000,
      maxPoolSize: 10,
      bufferCommands: false,
    };
  },
};
