import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    console.log('🔐 JWT AUTH GUARD CALLED');

    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    console.log('Is public route?', isPublic);

    if (isPublic) {
      console.log('✅ Public route, skipping JWT validation');
      return true;
    }

    console.log('🔒 Protected route, validating JWT...');
    return super.canActivate(context);
  }
}
