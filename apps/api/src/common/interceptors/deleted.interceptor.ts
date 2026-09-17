import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class DeletedInterceptor implements NestInterceptor {
  constructor(private cls: ClsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    if (request.query && request.query.deleted === 'true') {
      this.cls.set('onlyDeleted', true);
    }
    return next.handle();
  }
}
