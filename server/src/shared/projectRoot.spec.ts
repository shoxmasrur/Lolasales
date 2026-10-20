import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loyihaIldizi, type IldizFs } from '@/shared/projectRoot';

/**
 * Qo'lda: npm run test:project-root --workspace=server
 *
 * Sof test («Birlik»): `shared/config` ni tortmaydi, fayl tizimi soxta.
 * Asosiysi — produksiya bundle'i (`server/dist/main.js`): eski qat'iy
 * `../../..` u yerda `/opt` ni berardi.
 */
let failed = 0;
const check = (name: string, a: unknown, e: unknown): void => {
  const ok = JSON.stringify(a) === JSON.stringify(e);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${JSON.stringify(a)} (kutilgan: ${JSON.stringify(e)})`}`);
};

const soxtaFs = (fayllar: Record<string, string>): IldizFs => ({
  existsSync: (p) => Object.hasOwn(fayllar, p),
  readFileSync: (p) => {
    if (!Object.hasOwn(fayllar, p)) throw new Error(`ENOENT ${p}`);
    return fayllar[p]!;
  },
});

const ROOT = path.resolve('/opt/lolasales');
const fs = soxtaFs({
  [path.join(ROOT, 'package.json')]: JSON.stringify({ name: 'lolasales', workspaces: ['server', 'web'] }),
  // `server/package.json` — workspace a'zosi, ildiz emas.
  [path.join(ROOT, 'server', 'package.json')]: JSON.stringify({ name: '@lolasales/server' }),
});

check('bundle: server/dist → loyiha ildizi', loyihaIldizi(path.join(ROOT, 'server', 'dist'), '/zaxira', fs), ROOT);
check('tsx: server/src/shared → loyiha ildizi', loyihaIldizi(path.join(ROOT, 'server', 'src', 'shared'), '/zaxira', fs), ROOT);
check('ildizning o\'zi', loyihaIldizi(ROOT, '/zaxira', fs), ROOT);
check('workspaces topilmasa → zaxira', loyihaIldizi('/boshqa/joy/dist', '/zaxira', fs), '/zaxira');
check(
  'buzuq package.json o\'tkazib yuboriladi',
  loyihaIldizi('/a/b/c', '/zaxira', soxtaFs({ '/a/b/package.json': '{buzuq', '/a/package.json': '{"workspaces":["b"]}' })),
  '/a',
);
// Haqiqiy fayl tizimi: shu repo ildizi (server/src/shared → ../../..).
const here = path.dirname(fileURLToPath(import.meta.url));
check('haqiqiy repo: shu fayldan ildiz', loyihaIldizi(here), path.resolve(here, '../../..'));
check('haqiqiy repo: server/dist dan ham', loyihaIldizi(path.resolve(here, '../../dist')), path.resolve(here, '../../..'));

if (failed > 0) {
  console.error(`\n${failed} ta tekshiruv yiqildi`);
  process.exit(1);
}
console.log('\nHammasi o\'tdi');
