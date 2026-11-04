import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '@prisma/client';

@Catch()
export class PrismaClientExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // 1. Prisma P2023 or invalid UUID representation error (PG code 22P02)
    const isInvalidUuid =
      exception?.code === 'P2023' ||
      (typeof exception?.message === 'string' &&
        (exception.message.includes('invalid input syntax for type uuid') ||
          exception.message.includes('Inconsistent column data') ||
          exception.message.includes('Malformed ObjectID') ||
          exception.message.includes('Conversion failed when converting from a character string to uniqueidentifier')));

    if (isInvalidUuid) {
      return response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid UUID format in parameter or query',
        error: 'Bad Request',
      });
    }

    // 2. Prisma P2025: Record not found
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2025') {
        return response.status(HttpStatus.NOT_FOUND).json({
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Requested record not found',
          error: 'Not Found',
        });
      }
    }

    // 3. If standard Nest HttpException, delegate status and response
    if (typeof exception?.getStatus === 'function') {
      const status = exception.getStatus();
      const res = exception.getResponse();
      return response.status(status).json(
        typeof res === 'object' ? res : { statusCode: status, message: res },
      );
    }

    // 4. Default unhandled fallback 500
    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    response.status(status).json({
      statusCode: status,
      message: 'Internal server error',
    });
  }
}

