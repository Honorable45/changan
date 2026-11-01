import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { hashToken } from '../common/password';
import { PrismaService } from '../common/prisma.service';

export const SESSION_COOKIE = 'changan_admin';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) throw new UnauthorizedException();
    const session = await this.prisma.adminSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    if (!session || session.expiresAt < new Date()) throw new UnauthorizedException();
    req.admin = session.user;
    return true;
  }
}
