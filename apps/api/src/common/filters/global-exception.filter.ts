import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Error interno del servidor';
    let errors = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const responseBody = exception.getResponse() as any;
      
      message = typeof responseBody === 'string' ? responseBody : responseBody.message || message;
      errors = responseBody.error || null;
    } else if (exception instanceof Error) {
      // Manejar el error estricto de RLS
      if (exception.message.includes('[Seguridad RLS]')) {
        status = HttpStatus.FORBIDDEN;
        message = 'Acceso denegado: Faltan credenciales de inquilino (Tenant).';
      }
      this.logger.error(`Error no controlado: ${exception.message}`, exception.stack);
    }

    response.status(status).json({
      statusCode: status,
      message,
      errors,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
