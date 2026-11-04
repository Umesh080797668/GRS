import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/node';

@Catch()
export class PrismaClientExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaClientExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // 1. Prisma P2023 or invalid UUID representation error (PG code 22P02)
    const isInvalidUuid =
      exception?.code === 'P2023' ||
      (typeof exception?.message === 'string' &&
        (exception.message.includes('invalid input syntax for type uuid') ||
          exception.message.includes('Malformed ObjectID') ||
          exception.message.includes(
            'Conversion failed when converting from a character string to uniqueidentifier',
          )));

    if (isInvalidUuid) {
      return response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid UUID format in parameter or query',
        error: 'Bad Request',
      });
    }

    // 2. Prisma P2002: Unique constraint violation -> Map to 409 Conflict
    const isUniqueConstraint =
      exception?.code === 'P2002' ||
      (exception instanceof Prisma.PrismaClientKnownRequestError &&
        exception.code === 'P2002');

    if (isUniqueConstraint) {
      const target = exception?.meta?.target;
      const targetStr = Array.isArray(target)
        ? target.join(', ')
        : target
          ? String(target)
          : 'field';
      return response.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        message: `Unique constraint violation on ${targetStr}`,
        error: 'Conflict',
      });
    }

    // 3. Prisma P2025: Record not found
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2025') {
        return response.status(HttpStatus.NOT_FOUND).json({
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Requested record not found',
          error: 'Not Found',
        });
      }
    }

    // 4. If standard Nest HttpException, delegate status and response
    if (typeof exception?.getStatus === 'function') {
      const status = exception.getStatus();
      const res = exception.getResponse();

      // Log and capture 5xx HTTP errors
      if (status >= 500) {
        this.logger.error(
          `HTTP ${status} Server Error: ${exception.message || JSON.stringify(res)}`,
          exception.stack,
        );
        Sentry.captureException(exception);
      }

      return response
        .status(status)
        .json(
          typeof res === 'object' ? res : { statusCode: status, message: res },
        );
    }

    // 5. Default unhandled fallback 500 (Non-HTTP error)
    // Capture and log non-HTTP errors
    this.logger.error(
      `Unhandled Exception: ${exception?.message || exception}`,
      exception?.stack,
    );
    Sentry.captureException(exception);

    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    response.status(status).json({
      statusCode: status,
      message: 'Internal server error',
    });
  }
}
