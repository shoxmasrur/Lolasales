import type { ChannelComment } from '@/domain/services/ITelegramGateway';

/**
 * Kanal izohlarini kalit so'zlar bo'yicha saralash — sof funksiyalar.
 *
 * O'zbek lotin yozuvida tutuq belgisi uch xil yoziladi (`'`, `‘`, `ʻ`;
 * telefon klaviaturasi `’` va `ʼ` ham beradi) — hammasi bitta belgiga
 * keltiriladi, aks holda "ma'lumot" va "ma‘lumot" har xil so'z bo'lib qolardi.
 */
function normal(s: string): string {
  return s.toLowerCase().replace(/[‘’ʻʼ`]/g, "'");
}

/**
 * Izoh kalit so'zga mos keladimi.
 *
 * `+` alohida: u faqat butun izoh (bo'sh joylarsiz) `+` bo'lsa mos keladi —
 * "2+2" yoki "C++" qiziqish belgisi emas.
 */
export function kalitSozMos(text: string, keywords: string[]): boolean {
  const matn = normal(text);
  const qisqa = matn.trim();
  for (const kw of keywords) {
    const k = normal(kw).trim();
    if (!k) continue;
    if (k === '+') {
      if (qisqa === '+') return true;
      continue;
    }
    if (matn.includes(k)) return true;
  }
  return false;
}

export type AjratilganIzoh = ChannelComment & { tanlasaBoladi: boolean; mavjudMijoz: boolean };

/**
 * Izohlarni filtrlab, har birini belgilaydi.
 *
 * - `keywords === null` — filtrsiz (hammasi).
 * - Bir odamning bir nechta izohidan faqat eng oxirgisi qoladi: unga bitta
 *   xabar yoziladi va u eng so'nggi gapiga tayanadi.
 * - `anonim` muallif (kanal nomidan) va access_hash'i yo'q odam
 *   tanlanmaydi — ularga shaxsiy xabar yozib bo'lmaydi.
 * - `mavjudMijoz` — muallif bazada allaqachon mijoz.
 *
 * Natija eng yangisidan eskisiga tartiblanadi.
 */
export function izohlarniAjrat(
  comments: ChannelComment[],
  keywords: string[] | null,
  existingTelegramIds: Set<string>,
): AjratilganIzoh[] {
  const mos = keywords === null ? comments : comments.filter((c) => kalitSozMos(c.text, keywords));

  const yangiroq = (a: ChannelComment, b: ChannelComment): boolean =>
    a.date.getTime() > b.date.getTime() || (a.date.getTime() === b.date.getTime() && a.id > b.id);

  const odamlar = new Map<string, ChannelComment>();
  const anonimlar: ChannelComment[] = [];
  for (const c of mos) {
    if (c.author.kind !== 'user') {
      anonimlar.push(c);
      continue;
    }
    const id = c.author.peer.telegramUserId;
    const oldingi = odamlar.get(id);
    if (!oldingi || yangiroq(c, oldingi)) odamlar.set(id, c);
  }

  return [...odamlar.values(), ...anonimlar]
    .sort((a, b) => (yangiroq(a, b) ? -1 : yangiroq(b, a) ? 1 : 0))
    .map((c) => {
      const user = c.author.kind === 'user' ? c.author : null;
      return {
        ...c,
        tanlasaBoladi: Boolean(user?.peer.accessHash),
        mavjudMijoz: user ? existingTelegramIds.has(user.peer.telegramUserId) : false,
      };
    });
}
