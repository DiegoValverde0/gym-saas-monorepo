import { Injectable, NestInterceptor, ExecutionContext, CallHandler, StreamableFile } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  statusCode: number;
  message: string;
  data: T;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, Response<T> | StreamableFile> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T> | StreamableFile> {
    return next.handle().pipe(
      // Los archivos (exportaciones de la reportería) salen tal cual.
      map(data =>
        data instanceof StreamableFile
          ? data
          : {
              statusCode: context.switchToHttp().getResponse().statusCode,
              message: 'Operación exitosa',
              data: data || null,
            },
      ),
    );
  }
}
