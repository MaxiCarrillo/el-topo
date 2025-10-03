import { Injectable } from '@nestjs/common';
import { FAMOUS } from './data/famous.data';
import { FamousPerson } from './interfaces';

@Injectable()
export class FamousService {
  getRandom(excludeIds: Set<string> = new Set()): FamousPerson {
    const pool = FAMOUS.filter((f) => !excludeIds.has(f.id));
    const list = pool.length > 0 ? pool : FAMOUS;
    return list[Math.floor(Math.random() * list.length)];
  }
}
