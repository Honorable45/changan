import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

/**
 * Durée de conservation des demandes commerciales (nom, téléphone, e-mail) : supprimées après RETENTION_DEMANDES_MOIS mois
 * (24 par défaut ; 0 désactive la suppression). Vérifié au démarrage puis chaque jour.
 * Les données personnelles ne sont gardées que le temps utile au suivi commercial.
 */
@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Conservation');
  private timer?: NodeJS.Timeout;
  constructor(private readonly prisma: PrismaService) {}

  get mois() {
    const v = Number(process.env.RETENTION_DEMANDES_MOIS ?? 24);
    return Number.isFinite(v) && v >= 0 ? v : 24;
  }

  onModuleInit() {
    if (!this.mois) return;
    void this.purger();
    this.timer = setInterval(() => void this.purger(), 24 * 3600_000);
    this.timer.unref();
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async purger() {
    const limite = new Date();
    limite.setMonth(limite.getMonth() - this.mois);
    try {
      const { count } = await this.prisma.contactRequest.deleteMany({ where: { createdAt: { lt: limite } } });
      if (count) this.logger.log(`${count} demande(s) de plus de ${this.mois} mois supprimée(s)`);
      return count;
    } catch (e) {
      this.logger.error(`Suppression des anciennes demandes impossible : ${(e as Error).message}`);
      return 0;
    }
  }
}
