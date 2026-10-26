import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { UserRole, ScopeContext } from '../common/scope/scope.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) { }

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user }: { user: ScopeContext } = context.switchToHttp().getRequest();

    if (!user || !user.role) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_SCOPE',
        message_key: 'errors.auth.unauthorized_role',
      });
    }

    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_SCOPE',
        message_key: 'errors.auth.insufficient_permissions',
      });
    }

    return true;
  }
}
