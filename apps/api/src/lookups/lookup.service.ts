import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CANONICAL_LOOKUPS, LookupItem } from './lookup.data';
import * as crypto from 'crypto';

export interface CategorizedLookups {
  version: string;
  count: number;
  categories: Record<string, LookupItem[]>;
}

@Injectable()
export class LookupService implements OnModuleInit {
  private cachedVersion: string = '';

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    this.cachedVersion = this.computeStaticVersion(CANONICAL_LOOKUPS);
  }

  /**
   * Returns all active lookup values grouped by category.
   */
  async getCategorizedLookups(category?: string): Promise<CategorizedLookups> {
    const where: any = { isActive: true };
    if (category) {
      where.category = category;
    }

    let items: LookupItem[];
    try {
      const dbItems = await this.prisma.lookupValue.findMany({
        where,
        orderBy: [{ category: 'asc' }, { sort: 'asc' }],
        select: {
          category: true,
          code: true,
          labelEn: true,
          labelSi: true,
          labelTa: true,
          sort: true,
          isActive: true,
        },
      });

      if (dbItems.length > 0) {
        items = dbItems;
      } else {
        items = category
          ? CANONICAL_LOOKUPS.filter((l) => l.category === category)
          : CANONICAL_LOOKUPS;
      }
    } catch {
      items = category
        ? CANONICAL_LOOKUPS.filter((l) => l.category === category)
        : CANONICAL_LOOKUPS;
    }

    const categories: Record<string, LookupItem[]> = {};
    for (const item of items) {
      if (!categories[item.category]) {
        categories[item.category] = [];
      }
      categories[item.category].push(item);
    }

    const version = this.computeStaticVersion(items);

    return {
      version,
      count: items.length,
      categories,
    };
  }

  /**
   * Returns current lookup version string and total lookup count.
   */
  async getVersion(): Promise<{ version: string; count: number }> {
    const result = await this.getCategorizedLookups();
    return {
      version: result.version,
      count: result.count,
    };
  }

  /**
   * Seeds database with canonical lookups if not present.
   */
  async seed(): Promise<number> {
    let seeded = 0;
    for (const item of CANONICAL_LOOKUPS) {
      await this.prisma.lookupValue.upsert({
        where: { code: item.code },
        update: {
          category: item.category,
          labelEn: item.labelEn,
          labelSi: item.labelSi,
          labelTa: item.labelTa,
          sort: item.sort,
          isActive: true,
        },
        create: {
          category: item.category,
          code: item.code,
          labelEn: item.labelEn,
          labelSi: item.labelSi,
          labelTa: item.labelTa,
          sort: item.sort,
          isActive: true,
        },
      });
      seeded++;
    }
    return seeded;
  }

  private computeStaticVersion(items: LookupItem[]): string {
    const sorted = [...items].sort((a, b) => a.code.localeCompare(b.code));
    const fingerprint = sorted
      .map((i) => `${i.code}:${i.sort}:${i.labelEn}:${i.labelSi}:${i.labelTa}`)
      .join('|');
    return crypto
      .createHash('sha256')
      .update(fingerprint)
      .digest('hex')
      .slice(0, 16);
  }
}
