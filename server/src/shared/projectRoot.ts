import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Fayl tizimiga murojaat — testda soxtasi beriladi. */
export interface IldizFs {
  existsSync(p: string): boolean;
  readFileSync(p: string, enc: 'utf8'): string;
}

const haqiqiyFs: IldizFs = { existsSync, readFileSync };

/** `package.json` npm workspaces ildizimi (`"workspaces"` maydoni bor). */
function workspacesIldizimi(dir: string, fs: IldizFs): boolean {
  const fayl = path.join(dir, 'package.json');
  if (!fs.existsSync(fayl)) return false;
  try {
    const pkg = JSON.parse(fs.readFileSync(fayl, 'utf8')) as { workspaces?: unknown };
    return pkg.workspaces !== undefined && pkg.workspaces !== null;
  } catch {
    return false;
  }
}

/**
 * Loyiha ildizi: `boshlanish` dan yuqoriga qarab birinchi npm workspaces
 * ildizi (`package.json` da `"workspaces"`). Topilmasa — `zaxira` (odatda
 * `process.cwd()`).
 *
 * NEGA QIDIRUV: `config.ts` dev'da (tsx) `server/src/shared` da, produksiya
 * bundle'ida esa `server/dist/main.js` ichida turadi. Qat'iy `../../..`
 * bundle'da `/opt/debitor-agent/server/dist` → `/opt` ni berardi va nisbiy
 * `MEDIA_DIR` loyihadan tashqariga ketardi.
 * `server/package.json` da `workspaces` yo'q — u ildiz deb olinmaydi.
 */
export function loyihaIldizi(boshlanish: string, zaxira: string = process.cwd(), fs: IldizFs = haqiqiyFs): string {
  let dir = path.resolve(boshlanish);
  for (;;) {
    if (workspacesIldizimi(dir, fs)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return zaxira;
    dir = parent;
  }
}
