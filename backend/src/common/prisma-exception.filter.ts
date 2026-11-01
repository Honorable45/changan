import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/** Traduit les erreurs Prisma attendues sans divulguer de détail interne. */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(error: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (error.code === 'P2025') return res.status(404).json({ statusCode: 404, message: 'Élément introuvable' });
    if (error.code === 'P2002') return res.status(409).json({ statusCode: 409, message: 'Cette valeur est déjà utilisée' });
    if (error.code === 'P2003') return res.status(400).json({ statusCode: 400, message: 'Référence invalide' });
    return res.status(500).json({ statusCode: 500, message: 'Erreur interne' });
  }
}
