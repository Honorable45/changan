import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Logger, Post, Req, Res, UnauthorizedException, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import * as nodemailer from 'nodemailer';
import { hashPassword, hashToken, newToken, verifyPassword } from '../common/password';
import { PrismaService } from '../common/prisma.service';
import { AdminGuard, SESSION_COOKIE } from './auth.guard';

class LoginDto {
  @IsEmail() email: string;
  @IsString() @MaxLength(200) password: string;
}
class ForgotDto {
  @IsEmail() email: string;
}
class ResetDto {
  @IsString() @MaxLength(200) token: string;
  @IsString() @MinLength(12) @MaxLength(200) password: string;
}

const SESSION_MS = 1000 * 60 * 60 * 8;
const RESET_MS = 1000 * 60 * 30;
// Coût équivalent à une vérification réelle : la réponse ne révèle pas si le compte existe.
const DUMMY_HASH = hashPassword(newToken());

/*
 * Verrouillage par compte, en plus de la limite par adresse : 10 échecs en 15 minutes sur une même adresse e-mail
 * bloquent ce compte 15 minutes, d'où que viennent les essais (attaque répartie sur beaucoup d'adresses IP).
 * En mémoire : une seule instance de l'API ; un redémarrage remet les compteurs à zéro.
 */
const ECHECS_MAX = 10, FENETRE_MS = 15 * 60_000;
const echecs = new Map<string, { n: number; depuis: number; bloqueJusqua: number }>();
const etatCompte = (email: string) => {
  const now = Date.now();
  let e = echecs.get(email);
  if (!e || (now - e.depuis > FENETRE_MS && now > e.bloqueJusqua)) { e = { n: 0, depuis: now, bloqueJusqua: 0 }; echecs.set(email, e); }
  return e;
};
setInterval(() => { const now = Date.now(); for (const [k, e] of echecs) if (now - e.depuis > FENETRE_MS && now > e.bloqueJusqua) echecs.delete(k); }, FENETRE_MS).unref();

@ApiTags('admin / authentification')
@Controller('admin/auth')
export class AuthController {
  private readonly logger = new Logger('Auth');
  constructor(private readonly prisma: PrismaService) {}

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @ApiOperation({ summary: 'Ouvre une session (cookie httpOnly)' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const email = dto.email.toLowerCase();
    const compte = etatCompte(email);
    if (compte.bloqueJusqua > Date.now()) throw new HttpException('Trop d’essais : ce compte est bloqué 15 minutes.', HttpStatus.TOO_MANY_REQUESTS);
    const user = await this.prisma.adminUser.findUnique({ where: { email } });
    const ok = await verifyPassword(dto.password, user?.passwordHash ?? (await DUMMY_HASH));
    if (!user || !ok) {
      if (++compte.n >= ECHECS_MAX) { compte.bloqueJusqua = Date.now() + FENETRE_MS; this.logger.warn(`Connexion bloquée 15 min après ${compte.n} échecs pour un compte`); }
      throw new UnauthorizedException('Identifiants incorrects');
    }
    echecs.delete(email);
    const token = newToken();
    await this.prisma.adminSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await this.prisma.adminSession.create({
      data: { tokenHash: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + SESSION_MS) },
    });
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE === 'true',
      path: '/',
      maxAge: SESSION_MS,
    });
    return { email: user.email, name: user.name };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) await this.prisma.adminSession.deleteMany({ where: { tokenHash: hashToken(token) } });
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Get('me')
  @UseGuards(AdminGuard)
  me(@Req() req: Request & { admin?: unknown }) {
    return req.admin;
  }

  @Post('forgot')
  @HttpCode(204)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Envoie un lien de réinitialisation à usage unique, valable 30 minutes' })
  forgot(@Body() dto: ForgotDto) {
    // Réponse immédiate et identique, que le compte existe ou non : ni le contenu ni la durée ne le révèlent.
    void this.sendReset(dto.email.toLowerCase()).catch((e) => this.logger.error(`Réinitialisation non envoyée : ${(e as Error).message}`));
  }

  private async sendReset(email: string) {
    const user = await this.prisma.adminUser.findUnique({ where: { email } });
    if (!user) return;
    // Un seul lien valable à la fois : les précédents, non utilisés, sont annulés.
    await this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    const token = newToken();
    await this.prisma.passwordResetToken.create({
      data: { tokenHash: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + RESET_MS) },
    });
    const link = `${process.env.ADMIN_URL ?? 'http://localhost:3002'}/reinitialiser?token=${token}`;
    if (process.env.SMTP_URL) {
      await nodemailer.createTransport(process.env.SMTP_URL).sendMail({
        from: process.env.SMTP_FROM,
        to: user.email,
        subject: 'Réinitialisation de votre mot de passe',
        text: `Ce lien est valable 30 minutes :\n${link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
      });
    } else if (process.env.NODE_ENV !== 'production') {
      this.logger.warn(`SMTP non configuré. Lien de développement : ${link}`);
    } else {
      this.logger.error('SMTP_URL absent : impossible d’envoyer le lien de réinitialisation.');
    }
  }

  @Post('reset')
  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async reset(@Body() dto: ResetDto) {
    const row = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(dto.token) } });
    if (!row || row.usedAt || row.expiresAt < new Date()) throw new BadRequestException('Lien invalide ou expiré');
    const passwordHash = await hashPassword(dto.password);
    await this.prisma.$transaction([
      this.prisma.adminUser.update({ where: { id: row.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { tokenHash: row.tokenHash }, data: { usedAt: new Date() } }),
      this.prisma.adminSession.deleteMany({ where: { userId: row.userId } }),
    ]);
  }
}
