import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    console.log('👮 ROLES GUARD CALLED');

    const roles = this.reflector.get<string[]>('roles', context.getHandler());

    console.log('Required roles:', roles);

    if (!roles) {
      console.log('✅ No roles required, allowing access');
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    console.log('=== ROLES GUARD DEBUG ===');
    console.log('User exists?', !!user);
    console.log('User.role exists?', !!user?.role);
    console.log('User.role value:', user?.role);
    console.log('User.role type:', typeof user?.role);

    if (user?.role && typeof user.role === 'object') {
      console.log('User.role.name:', user.role.name);
    }
    console.log('========================');

    if (!user) {
      console.log('❌ DENIED: No user in request');
      return false;
    }

    if (!user.role) {
      console.log('❌ DENIED: User has no role');
      return false;
    }

    let roleName: string;
    if (typeof user.role === 'string') {
      roleName = user.role;
      console.log('Role is string:', roleName);
    } else if (typeof user.role === 'object' && user.role.name) {
      roleName = user.role.name;
      console.log('Role is object, name:', roleName);
    } else {
      console.log('❌ DENIED: Invalid role format');
      return false;
    }

    const hasRole = roles.includes(roleName);
    console.log(`Checking "${roleName}" in [${roles.join(', ')}] = ${hasRole}`);
    console.log(hasRole ? '✅ ACCESS GRANTED' : '❌ ACCESS DENIED');

    return hasRole;
  }
}
