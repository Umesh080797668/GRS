import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ScopeContext } from '../common/scope/scope.types';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): ScopeContext => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
