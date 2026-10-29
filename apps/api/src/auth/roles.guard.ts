import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { UserRole, ScopeContext } from '../common/scope/scope.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    const req = context.switchToHttp().getRequest();
    const user: ScopeContext = req.user;

    if (user && user.scope === 'change-password') {
      const path = req.originalUrl || req.path || req.url || '';
      if (
        !path.includes('/auth/change-password') &&
        !path.endsWith('/change-password')
      ) {
        throw new ForbiddenException({
          code: 'SCOPE_RESTRICTED',
          message_key: 'errors.auth.password_change_required',
          message: 'Token scope is restricted to password change only',
        });
      }
    }

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

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
