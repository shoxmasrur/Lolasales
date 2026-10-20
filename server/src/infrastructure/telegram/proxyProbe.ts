import { SocksClient } from 'socks';
import type { TelegramProxyPatch } from '@/domain/entities/telegramProxy';

export type ProxyProbeResult =
  | { ok: true; exitIp: string; latencyMs: number }
  | { ok: false; error: string };

/** Tunnel ochish + javob kutishning umumiy chegarasi. */
const TIMEOUT_MS = 10_000;

const IP_HOST = 'api.ipify.org';
const IP_PORT = 80;

// Buzuq yoki niyati yomon proksi ulanishni yopmasdan (`end` kelmasdan)
// butun muddat davomida oqim yuborishi mumkin — bufer cheksiz o'smasligi
// uchun yuqori chegara. Haqiqiy ipify javobi bir necha o'n baytdan
// oshmaydi, 64 KB katta zaxira bilan.
const MAX_BUF_BYTES = 64 * 1024;

// IPv4: har bir oktet 0–255 oralig'ida bo'lishi shart — aks holda "999.1.2.3"
// kabi haqiqiy IP bo'lmagan, lekin nuqta bilan ajratilgan raqamlar satri ham
// "muvaffaqiyatli" IP deb qabul qilinib, operatorni chalg'itardi.
const IPV4_OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4 = new RegExp(`\\b${IPV4_OCTET}(?:\\.${IPV4_OCTET}){3}\\b`);

// IPv6: to'liq 8 guruh YOKI aniq "::" siqilishi talab qilinadi. To'liq RFC
// grammatikasi emas (shart emas), lekin "10:20:30" kabi vaqt belgisi yoki
// "aa:bb:cc" kabi tasodifiy heks satr endi mos kelmaydi — ularda "::" yo'q.
const IPV6_FULL = /\b(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}\b/i;
const IPV6_COMPRESSED =
  /\b(?:[0-9a-f]{1,4}:(?!:)){0,6}(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4}\b/i;

/**
 * Javobdan IP manzilini ajratadi.
 *
 * NEGA to'liq HTTP tahlilchisi emas: bizga faqat bitta IP satri kerak,
 * ba'zi proksilar esa javobni chunked ko'rinishda qaytaradi. Naqsh
 * bo'yicha qidirish shu ikkala holatni ham qamrab oladi.
 *
 * Faqat TANADAN qidiriladi (sarlavhalar emas) — aks holda sarlavhadagi
 * IP'ga o'xshash matn (masalan, `X-Forwarded-For`) haqiqiy javob kabi
 * qabul qilinib qolardi.
 */
export function parseIpifyResponse(raw: string): string | null {
  const body = raw.includes('\r\n\r\n') ? raw.slice(raw.indexOf('\r\n\r\n') + 4) : raw;
  const ipv4 = IPV4.exec(body);
  if (ipv4) return ipv4[0];
  const ipv6 = IPV6_FULL.exec(body) ?? IPV6_COMPRESSED.exec(body);
  return ipv6 ? ipv6[0] : null;
}

/**
 * SOCKS kutubxonasining inglizcha xabarini operator tushunadigan
 * matnga aylantiradi. Tanilmagan xato o'z matni bilan qaytadi —
 * yashirib qo'yishdan ko'ra ko'rsatgan yaxshi.
 */
export function socksErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const text = raw.toLowerCase();
  if (text.includes('auth')) return 'Proksi logini yoki paroli noto\'g\'ri';
  if (text.includes('econnrefused')) return 'Proksi ulanishni rad etdi';
  if (text.includes('econnreset')) return 'Proksi ulanishni kutilmaganda uzdi';
  if (text.includes('enotfound')) return 'Proksi manzili topilmadi';
  if (text.includes('timed out') || text.includes('etimedout')) return 'Proksi javob bermadi';
  return raw;
}

/**
 * Proksi orqali tashqi xizmatga chiqib, ko'rinadigan IP'ni qaytaradi.
 *
 * Aynan CHIQISH IP'si kerak: shunchaki tunnel ochilgani proksi haqiqatan
 * boshqa manzil berayotganini isbotlamaydi.
 *
 * `api.ipify.org` — yagona tashqi bog'liqlik. U ishlamay qolsa faqat
 * shu tekshiruv xato beradi, akkauntlarning ulanishiga aloqasi yo'q.
 */
export async function probeProxy(proxy: TelegramProxyPatch): Promise<ProxyProbeResult> {
  const started = Date.now();
  // Yagona umumiy muddat: tunnel ochish VA javob kutish shu chegaraga
  // birga sig'ishi kerak. Ikkalasiga alohida TIMEOUT_MS berilsa, sekin
  // javob beradigan proksi umumiy vaqtni ikki baravar oshirib yuborardi.
  const deadline = started + TIMEOUT_MS;
  let socket: import('node:net').Socket | undefined;

  try {
    const { socket: s } = await SocksClient.createConnection({
      proxy: {
        host: proxy.host,
        port: proxy.port,
        type: 5,
        ...(proxy.username ? { userId: proxy.username } : {}),
        ...(proxy.password ? { password: proxy.password } : {}),
      },
      command: 'connect',
      destination: { host: IP_HOST, port: IP_PORT },
      timeout: Math.max(1, deadline - Date.now()),
    });
    socket = s;

    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      // Tunnel budjetning oxirgi zumida ochildi — javob kutishga vaqt
      // qolmadi. Yangi hisob bilan qayta kutish o'rniga darhol taslim
      // bo'lamiz, aks holda umumiy chegara yana buzilib qoladi.
      throw new Error('Proxy connection timed out');
    }

    const raw = await new Promise<string>((resolve, reject) => {
      let buf = '';
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(buf);
      };
      // Muddat tugashi VA socket xatosi (masalan SOCKS relay orqali odatiy
      // `ECONNRESET`) ikkalasi ham "javob yo'q" degani emas — javob allaqachon
      // to'liq kelib, keyin ulanish kutilmaganda uzilgan bo'lishi mumkin
      // (ba'zi proksilar `Connection: close`ni hurmat qilmasdan socketni
      // ushlab turadi yoki RST yuboradi). Shuning uchun rad etishdan oldin
      // to'plangan buferni tekshiramiz: undan foydali IP chiqarilsa, xato
      // o'rniga muvaffaqiyat bilan yakunlaymiz — aks holda haqiqatan
      // ishlaydigan proksi soxta "javob bermadi" xatosini ko'rsatardi.
      const failUnlessUsable = (err: Error): void => {
        if (settled) return;
        if (parseIpifyResponse(buf)) {
          finish();
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(err);
      };
      const timer = setTimeout(
        () => failUnlessUsable(new Error('Proxy connection timed out')),
        remaining,
      );
      s.on('data', (chunk: Buffer) => {
        buf += chunk.toString('utf8');
        // Buzuq yoki niyati yomon proksi ulanishni yopmasdan (`end`
        // kelmasdan) butun muddat davomida oqim yuborishi mumkin. Chegaradan
        // oshsa, qolganini kutmasdan hozirgi holat bilan baholaymiz — xato
        // qaytarish o'rniga, chunki javobning boshlanishi allaqachon qo'lda.
        if (buf.length >= MAX_BUF_BYTES) finish();
      });
      // Sarlavha va tana alohida TCP segmentlarida kelishi — relaydan
      // o'tuvchi proksi uchun oddiy holat. Shu sababli sarlavha chegarasi
      // (`\r\n\r\n`) ko'rinishi bilan to'xtash xato: tana hali yetib
      // kelmagan bo'lishi mumkin. So'rov `Connection: close` yuboradi,
      // shuning uchun proksi ulanishni yopganda (`end`) javob to'liq
      // deb hisoblanadi — buni umumiy muddat (`timer`) chegaralaydi.
      s.on('end', finish);
      s.on('error', (err: Error) => failUnlessUsable(err));
      s.write(`GET / HTTP/1.1\r\nHost: ${IP_HOST}\r\nConnection: close\r\n\r\n`);
    });

    const exitIp = parseIpifyResponse(raw);
    if (!exitIp) return { ok: false, error: 'Chiqish IP\'sini aniqlab bo\'lmadi' };
    return { ok: true, exitIp, latencyMs: Date.now() - started };
  } catch (err) {
    return { ok: false, error: socksErrorMessage(err) };
  } finally {
    socket?.destroy();
  }
}
