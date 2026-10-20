import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import type { ITalabnomaPdf, TalabnomaMalumot, TalabnomaRenderOpts } from '@/domain/services/ITalabnomaPdf';
import { talabnomaHtml } from '@/infrastructure/talabnoma/talabnomaHtml';

const execFileP = promisify(execFile);

/**
 * PDF'dagi sahifalar soni (`/Type /Pages` obyektining `/Count` i). Chrome
 * bu obyektni siqmasdan yozadi; topilmasa null — tekshiruv o'tkazib
 * yuboriladi (HTML ichidagi shrift moslashuvi asosiy himoya).
 */
export function sahifalarSoni(pdf: Buffer): number | null {
  const sonlar = [...pdf.toString('latin1').matchAll(/\/Count (\d+)/g)].map((x) => Number(x[1]));
  return sonlar.length ? Math.max(...sonlar) : null;
}

/** Rasm fayllari `TALABNOMA_ASSETS_DIR` ichida aynan shu nomlar bilan turadi. */
const RASMLAR = { fon: 'fon.png', muhr: 'muhr.png', imzo: 'imzo.png' } as const;

/**
 * Talabnoma PDF'i headless Chrome/Chromium'ning `--print-to-pdf` rejimi
 * bilan yasaladi: tasdiqlangan namuna HTML'da, brauzer uni aynan o'sha
 * ko'rinishda (fon, muhr, imzo joylashuvi) chop etadi.
 *
 * Har render alohida vaqtinchalik papkada (profil ham) — parallel yoki
 * oldingi ishga tushirishdan qolgan qulf fayllari xalaqit bermasin.
 */
export class ChromiumTalabnomaPdf implements ITalabnomaPdf {
  /**
   * Bir vaqtda bitta render: server 2 CPU / 3.9 GB, har Chrome nusxasi
   * yuzlab MB oladi — ketma-ket bajarish asosiy jarayonni bo'g'maydi.
   */
  private navbat: Promise<unknown> = Promise.resolve();
  private brauzerBor: Promise<boolean> | null = null;

  constructor(
    private readonly assetsDir: string,
    private readonly chromePath: string,
  ) {}

  async tayyormi(): Promise<boolean> {
    // Rasmlar har safar tekshiriladi: admin ularni server ishlab turganda
    // qo'yishi (yoki olib tashlashi) mumkin, tekshiruv arzon.
    try {
      await Promise.all(Object.values(RASMLAR).map((f) => access(path.join(this.assetsDir, f))));
    } catch {
      return false;
    }
    // Brauzer topilgach o'zgarmaydi — `--version` bir marta. "Yo'q" javobi
    // esa keshlanmaydi: admin Chrome'ni server ishlab turganda o'rnatsa,
    // funksiya qayta ishga tushirishsiz yoqilsin.
    this.brauzerBor ??= execFileP(this.chromePath, ['--version'], { timeout: 15_000, killSignal: 'SIGKILL' }).then(
      () => true,
      () => {
        this.brauzerBor = null;
        return false;
      },
    );
    return this.brauzerBor;
  }

  render(m: TalabnomaMalumot, opts: TalabnomaRenderOpts = {}): Promise<Buffer> {
    const ish = this.navbat.then(() => this.yasash(m, opts));
    // Bitta render xatosi navbatni to'xtatib qo'ymasin.
    this.navbat = ish.catch(() => undefined);
    return ish;
  }

  private async yasash(m: TalabnomaMalumot, opts: TalabnomaRenderOpts): Promise<Buffer> {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'talabnoma-'));
    try {
      const rasm = (f: string): string => pathToFileURL(path.join(this.assetsDir, f)).href;
      const htmlYoli = path.join(tmp, 'talabnoma.html');
      const pdfYoli = path.join(tmp, 'out.pdf');
      await writeFile(
        htmlYoli,
        talabnomaHtml(
          m,
          { fon: rasm(RASMLAR.fon), muhr: rasm(RASMLAR.muhr), imzo: rasm(RASMLAR.imzo) },
          { muhrsiz: opts.muhrsiz === true },
        ),
        'utf8',
      );
      await execFileP(
        this.chromePath,
        [
          '--headless=new',
          '--disable-gpu',
          '--no-pdf-header-footer',
          `--user-data-dir=${path.join(tmp, 'profil')}`,
          `--print-to-pdf=${pdfYoli}`,
          pathToFileURL(htmlYoli).href,
        ],
        // HOME almashtirilmaydi: Mac'da Chrome PDF'ni yozib bo'lib, chiqishda
        // 2-kod bilan yiqiladi. Profil (va crashpad) `--user-data-dir` da.
        // SIGKILL: osilgan Chrome SIGTERM'ni e'tiborsiz qoldirsa, navbat
        // (bir vaqtda bitta render) abadiy tiqilib qolardi.
        { timeout: 60_000, killSignal: 'SIGKILL' },
      );
      const pdf = await readFile(pdfYoli);
      const sahifa = sahifalarSoni(pdf);
      if (sahifa != null && sahifa > 1) {
        // Ikki sahifali rasmiy xat (muhr birinchisida, matn davomi
        // ikkinchisida) yuborilmaydi — operator sababini ko'radi.
        throw new Error(`Talabnoma bir sahifaga sig'madi (${sahifa} sahifa)`);
      }
      return pdf;
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }
}
