import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

export interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
  stack?: string;
  details?: Record<string, unknown>;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const errorResponse = this.getErrorResponse(exception, request);

    const logMessage = Array.isArray(errorResponse.message)
      ? errorResponse.message.join(', ')
      : errorResponse.message;

    // Log the error
    this.logger.error(
      `${errorResponse.error}: ${logMessage}`,
      exception instanceof Error ? exception.stack : 'No stack trace',
      `Path: ${request.method} ${request.url}`,
    );

    response.status(errorResponse.statusCode).json(errorResponse);
  }

  private getErrorResponse(
    exception: unknown,
    request: Request,
  ): ErrorResponse {
    const timestamp = new Date().toISOString();
    const path = `${request.method} ${request.url}`;

    // Handle HTTP exceptions (NestJS built-in exceptions)
    if (exception instanceof HttpException) {
      const status = exception.getStatus() as HttpStatus;
      const exceptionResponse = exception.getResponse();

      let message: string | string[];
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null &&
        'message' in exceptionResponse
      ) {
        const msg = (exceptionResponse as Record<string, unknown>).message;
        if (typeof msg === 'string' || Array.isArray(msg)) {
          message = msg;
        } else {
          message = exception.message;
        }
      } else {
        message = exception.message;
      }

      return {
        statusCode: status,
        message,
        error: this.getErrorType(status),
        timestamp,
        path,
        stack: this.shouldIncludeStack(status) ? exception.stack : undefined,
      };
    }

    // Handle custom application errors
    if (exception instanceof Error) {
      // Check for specific error types we defined
      if (exception.name === 'QuizItemNotFoundError') {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: exception.message,
          error: 'Quiz Item Not Found',
          timestamp,
          path,
          stack: this.shouldIncludeStack(HttpStatus.BAD_REQUEST)
            ? exception.stack
            : undefined,
          details: { questionId: exception.message.match(/ID ([^ ]+)/)?.[1] },
        };
      }

      // Handle validation errors
      if (exception.name === 'ValidationError') {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: exception.message,
          error: 'Validation Error',
          timestamp,
          path,
          stack: this.shouldIncludeStack(HttpStatus.BAD_REQUEST)
            ? exception.stack
            : undefined,
        };
      }

      // Handle generic application errors
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        error: 'Internal Server Error',
        timestamp,
        path,
        stack: this.shouldIncludeStack(HttpStatus.INTERNAL_SERVER_ERROR)
          ? exception.stack
          : undefined,
      };
    }

    // Handle unknown error types
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred',
      error: 'Internal Server Error',
      timestamp,
      path,
    };
  }

  private getErrorType(status: HttpStatus): string {
    if (status === HttpStatus.BAD_REQUEST) return 'Bad Request';
    if (status === HttpStatus.UNAUTHORIZED) return 'Unauthorized';
    if (status === HttpStatus.FORBIDDEN) return 'Forbidden';
    if (status === HttpStatus.NOT_FOUND) return 'Not Found';
    if (status === HttpStatus.CONFLICT) return 'Conflict';
    if (status === HttpStatus.UNPROCESSABLE_ENTITY)
      return 'Unprocessable Entity';
    if (status === HttpStatus.INTERNAL_SERVER_ERROR)
      return 'Internal Server Error';
    if (status === HttpStatus.BAD_GATEWAY) return 'Bad Gateway';
    if (status === HttpStatus.SERVICE_UNAVAILABLE) return 'Service Unavailable';
    return 'Error';
  }

  private shouldIncludeStack(status: HttpStatus): boolean {
    // Include stack traces for server errors and bad requests in development
    const isDevelopment = process.env.NODE_ENV !== 'production';
    return (
      isDevelopment &&
      (status >= HttpStatus.INTERNAL_SERVER_ERROR ||
        status === HttpStatus.BAD_REQUEST)
    );
  }
}
