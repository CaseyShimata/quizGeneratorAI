/**
 * CORS Configuration
 * Cross-Origin Resource Sharing settings
 */
export const CORS_OPTIONS = {
  origin: true, // Allow all origins in development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
