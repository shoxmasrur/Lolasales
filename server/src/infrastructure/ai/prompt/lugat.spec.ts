import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Qo'lda ishga tushiriladi: npm run test:lugat --workspace=server
 *
 * Agent promptining kodli manbaida qaytib kelmasligi kerak bo'lgan
 * so'z va shakllarni qo'riqlaydi:
 *
 *   • "qarz" — sotuv agenti mijozga qarz demaydi: bo'lib to'lashda ham
 *     "qolgan summa" deyiladi;
 *   • "qachonroq" — o'zbek tilida bunday so'z yo'q, faqat "qachon";
 *   • "-da" zarrachasi — yozma matnda sun'iy eshitiladi (2026-08-12 tuzatishi).
 *   • eskrou yonidagi oy nomi — o'tish muddati tasdiqlanmagan (2026-08-20).
 *   • "ойимча" — mijoz hurmatsizlik deb qabul qilgan (2026-09-14).
 *   • "yaxshi kunlar tilayman" — ruschadan ko'chirma, "kuningiz xayrli
 *     bo'lsin" deyiladi (2026-09-15).
 *   • "ajoyib" — rahmat xabarida ortiqcha (2026-09-15).
 *
 * Kod identifikatorlari (`debtTotal`, `debt_monthly`) tekshirilmaydi —
 * ular ichki nomlar, mijoz ham, xodim ham ko'rmaydi.
 *
 * ISTISNO: satr oxirida `lugat-ruxsat` izohi bo'lsa, o'sha satr tekshirilmaydi.
 * U FAQAT bitta narsa uchun: taqiqning O'ZINI yozish. Agentga "bu so'zni
 * ishlatma" deb aytish uchun so'zni nomlash shart, aks holda promptda taqiq
 * umuman paydo bo'lolmaydi — 043-migratsiya so'zni matndan olib tashlagan,
 * lekin taqiqlamagani uchun agent uni qaytadan yozaverardi (2026-08-13).
 */
const here = path.dirname(fileURLToPath(import.meta.url));

/** Mijozga ketadigan matn faqat shu papkadagi fayllardan chiqadi. */
const FILES = readdirSync(here).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'));

interface Tekshiruv {
  nom: string;
  /** Satrni tekshirishdan oldin olib tashlanadigan begona so'zlar. */
  shovqin?: RegExp;
  qoida: RegExp;
  maslahat: string;
}

const TEKSHIRUVLAR: Tekshiruv[] = [
  {
    nom: 'qarz',
    /** "arzon", "farzand" — boshqa so'zlar, ular tegishli emas. */
    shovqin: /arzon|farzand/gi,
    qoida: /qarz/i,
    maslahat: '"to\'lov" yoki "kechikkan to\'lov" deb yozing',
  },
  {
    nom: 'qachonroq',
    qoida: /qachonroq/i,
    maslahat: '"qachon" deb yozing — "qachonroq" o\'zbek tilida yo\'q',
  },
  {
    // Agent mijozning "ayolim" so'zini "ойимча" ga almashtirdi, mijoz buni
    // hurmatsizlik deb qabul qildi (2026-08-26). So'z umuman taqiqlangan.
    nom: '"ойимча"',
    qoida: /oyimcha|ойимча/i,
    maslahat: 'so\'zni olib tashlang — mijoz yaqinini o\'zi qanday atagan bo\'lsa, shunday yozing',
  },
  {
    // Agent xayrlashuvni "Yaxshi kunlar tilayman" deb yozardi (98 xabar,
    // 2026-09-15) — ruschadan ko'chirma. To'g'risi: "Kuningiz xayrli bo'lsin".
    nom: '"yaxshi kunlar tilayman"',
    qoida: /(?:yaxshi|яхши)\s+(?:kun|кун)\S*\s+(?:tilay|тилай)/i,
    maslahat: '"Kuningiz xayrli bo\'lsin" deb yozing',
  },
  {
    // Agent rahmatga "Ajoyib, baraka toping!" deb qo'shardi (2026-09-15) —
    // so'z kerak emas, rahmatning o'zi yetadi.
    nom: '"ajoyib"',
    qoida: /ajoyib|ажойиб/i,
    maslahat: 'so\'zni olib tashlang — "Rahmat" / "Baraka toping" yetadi',
  },
  {
    // Eskrou tizimiga o'tish MUDDATI tasdiqlanmagan (2026-08-20, Xurshid aka).
    // Manba faylining oldingi versiyasida "Сентябрь ойидан бошлаб" bor edi va
    // u ataylab olib tashlangan: agent mijozga aniq oy aytsa, biz tasdiqlamagan
    // faktni va'da qilgan bo'lamiz. Argumentning o'zi qoladi, faqat "yaqinda".
    //
    // Bir SATRDA ikkalasi ham bo'lsa yiqiladi — qoidalar bir qatorli satrlar,
    // shuning uchun shu tekshiruv yetarli.
    nom: 'eskrou yonida oy nomi',
    // `\b` bu yerda ishlamaydi: JS da kirill harfi `\w` emas, ya'ni "сентябр"
    // oldida chegara umuman topilmaydi. Shuning uchun o'zak bo'yicha qidiramiz
    // va qo'shimchali shakllar ham tushadi ("sentyabrdan", "сентябрдан").
    // Faqat ikkitasi boshqa so'z ichida yashiringan: "marta", "mayli" —
    // ular ataylab istisno qilingan.
    qoida: /(?=.*(?:eskro|эскро))(?=.*(?:yanvar|fevral|aprel|iyun|iyul|avgust|sentyabr|oktyabr|noyabr|dekabr|январ|феврал|апрел|июн|июл|август|сентябр|октябр|ноябр|декабр|mart(?!a)|март(?!а)|may(?![a-z])|май(?![а-яё])))/i,
    maslahat: 'oy nomini olib tashlang — eskrou faqat "yaqinda" deb aytiladi',
  },
  {
    // Oldida HARF turishi shart: "11-da" (sana) va qoidalarning o'zida
    // tirnoq ichida turgan "-da" (taqiqni tushuntiruvchi matn) tegilmaydi.
    nom: '"-da" zarrachasi',
    qoida: /[a-z'‘’ʻ]-da\b/i,
    maslahat: 'zarrachani olib tashlang: "bo\'ladi-da" → "bo\'ladi"',
  },
];

/** Satr oxiridagi ataylab qo'yilgan istisno belgisi. */
const RUXSAT = /\/\/\s*lugat-ruxsat\b/;

let failed = 0;

for (const file of FILES) {
  const lines = readFileSync(path.join(here, file), 'utf8').split('\n');
  let fileClean = true;

  for (const t of TEKSHIRUVLAR) {
    const hits: string[] = [];

    lines.forEach((line, i) => {
      if (RUXSAT.test(line)) return;
      const tozalangan = t.shovqin ? line.replace(t.shovqin, '') : line;
      if (t.qoida.test(tozalangan)) hits.push(`${i + 1}: ${line.trim().slice(0, 90)}`);
    });

    if (hits.length) {
      fileClean = false;
      failed += 1;
      console.log(`✗ ${file} — ${hits.length} ta joyda ${t.nom} bor (${t.maslahat}):`);
      for (const h of hits) console.log(`    ${h}`);
    }
  }

  if (fileClean) console.log(`✓ ${file}`);
}

console.log(failed ? `\n${failed} ta tekshiruv yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
