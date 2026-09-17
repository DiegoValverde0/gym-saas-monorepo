import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaClientExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Error interno en la base de datos';

    switch (exception.code) {
      case 'P2002': {
        status = HttpStatus.CONFLICT;
        message = 'Ya existe un registro con esos datos únicos en el sistema.';
        break;
      }
      case 'P2025': {
        status = HttpStatus.NOT_FOUND;
        message = 'El registro solicitado no fue encontrado.';
        break;
      }
      case 'P2003': {
        status = HttpStatus.BAD_REQUEST;
        message = 'Error de referencia: El registro relacionado no existe.';
        break;
      }
      case 'P2014':
      case 'P2015': {
        status = HttpStatus.BAD_REQUEST;
        message = 'Violación de relación en la base de datos.';
        break;
      }
      default:
        console.error('[Prisma Error]:', exception.message);
        break;
    }

    response.status(status).json({
      statusCode: status,
      message: message,
      error: HttpStatus[status],
    });
  }
}
