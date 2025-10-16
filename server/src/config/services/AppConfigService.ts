import { Injectable, INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Application Configuration Service
 * Provides centralized access to application configuration
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Get the application port
   */
  getPort(): number {
    return Number(this.configService.get<number>('PORT') || 3000);
  }

  /**
   * Get CORS configuration
   */
  getCorsOptions() {
    return {
      origin: true, // Allow all origins in development
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    };
  }

  /**
   * Apply CORS configuration to the application
   */
  applyCors(app: INestApplication): void {
    app.enableCors(this.getCorsOptions());
  }
}
