import {
  faqatYoziladiganlar,
  holatKorinishi,
  kalitgaMosXomlar,
  holatniAniqla,
  holatQiymatlari,
  holatSqlQiymatlari,
  SHARTNOMA_HOLATLARI,
  agentUchunHolat,
  yoziladimi,
  YOZILADIGAN_SQL_QIYMATLARI,
} from '@/domain/entities/shartnomaHolati';

/**
 * Qo'lda ishga tushiriladi: npm run test:shartnoma-holati --workspace=server
 *
 * Eng qimmat xato — filtrni TESHIB o'tkazish: bekor qilinayotgan mijozdan
 * pul talab qilish. Shuning uchun "yozilmaydi" holatlari alohida sanaladi.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : `  ${izoh}`}`);
};

// ─── Yoziladi ────────────────────────────────────────────────────────────
check('CRM kaliti: sold', yoziladimi('sold'));
check('Excel nomi: Сотилди', yoziladimi('Сотилди'));
check('katta-kichik harf va bo\'sh joy ahamiyatsiz', yoziladimi('  SOLD '));
check('lotincha yozilishi', yoziladimi('Sotildi'));

// 2026-10-13 dan (rahbariyat qarori) "К оплате" va "Проц. отказ" ham
// yoziladi. Ikki yozilishi ham (CRM kaliti va Excel nomi) qabul qilinadi.
check('К оплате (kalit)', yoziladimi('for_payment'));
check('К оплате (nomi bilan)', yoziladimi('К оплате'));
check('Проц. отказ (kalit)', yoziladimi('cancellation_process'));
check('Проц. отказ (nomi bilan)', yoziladimi('Проц. отказ'));
check('Проц. отказ (bo\'sh joysiz yozilishi)', yoziladimi('Проц.отказ'));

// ─── Yozilmaydi ──────────────────────────────────────────────────────────
check('В ожидании', !yoziladimi('waiting'));
check('К возврату — puli qaytarilyapti', !yoziladimi('for_return'));
check('К возврату (nomi bilan)', !yoziladimi('К возврату'));

// SQL filtrlari ham AYNAN shu to'plamdan yuradi — ikkalasi ajralib ketsa,
// ro'yxatda ko'ringan mijozga xabar ketmaydi yoki aksincha.
check('SQL: sold kiradi', YOZILADIGAN_SQL_QIYMATLARI.includes('sold'));
check('SQL: Сотилди (Excel yozilishi) kiradi', YOZILADIGAN_SQL_QIYMATLARI.includes('Сотилди'));
check('SQL: for_payment kiradi', YOZILADIGAN_SQL_QIYMATLARI.includes('for_payment'));
check('SQL: К оплате kiradi', YOZILADIGAN_SQL_QIYMATLARI.includes('К оплате'));
check('SQL: cancellation_process kiradi', YOZILADIGAN_SQL_QIYMATLARI.includes('cancellation_process'));
check('SQL: Проц. отказ kiradi', YOZILADIGAN_SQL_QIYMATLARI.includes('Проц. отказ'));
check('SQL: for_return kirmaydi', !YOZILADIGAN_SQL_QIYMATLARI.includes('for_return'));
check('SQL: waiting kirmaydi', !YOZILADIGAN_SQL_QIYMATLARI.includes('waiting'));

// Agentga ko'rsatiladigan holat: Сотилди — odatdagi holat, qator chiqmaydi.
check('agent uchun: sold — qator yo\'q', agentUchunHolat('sold') === null);
check('agent uchun: Сотилди — qator yo\'q', agentUchunHolat('Сотилди') === null);
check('agent uchun: Проц. отказ', agentUchunHolat('cancellation_process') === 'Проц. отказ');
check('agent uchun: К оплате (Excel nomi)', agentUchunHolat('к оплате') === 'К оплате');
check('agent uchun: noma\'lum — qator yo\'q', agentUchunHolat(null) === null);

// Holat noma'lum bo'lsa YOZILMAYDI: bekor qilinayotgan mijozdan pul talab
// qilishdan ko'ra jim turish arzonroq.
check('null — yozilmaydi', !yoziladimi(null));
check('undefined — yozilmaydi', !yoziladimi(undefined));
check('bo\'sh satr — yozilmaydi', !yoziladimi('   '));

// "Продан" — bu `status` ustunining nomi va u bekor qilinayotgan
// shartnomada ham `sold` bo'lib qolaveradi (6816MSO26HE aynan shunday edi).
// Uni qabul qilish filtrni teshib qo'yardi.
check('Продан — yoziladigan deb hisoblanmaydi', !yoziladimi('Продан'));

// ─── Ro'yxatni filtrlash ─────────────────────────────────────────────────
const contracts = [
  { contractNo: '5582MSO25F3', virtualStatus: 'sold' },
  { contractNo: '6816MSO26HE', virtualStatus: 'cancellation_process' },
  { contractNo: '1700AFS26M3', virtualStatus: null },
  { contractNo: '3090MSO25A5', virtualStatus: 'Сотилди' },
  { contractNo: '2370ORZ26KE', virtualStatus: 'for_return' },
  { contractNo: '4410VTN26B2', virtualStatus: 'К оплате' },
];
const kept = faqatYoziladiganlar(contracts).map((c) => c.contractNo);
check(
  'aralash ro\'yxatdan faqat yoziladiganlar qoladi',
  JSON.stringify(kept) === JSON.stringify(['5582MSO25F3', '6816MSO26HE', '3090MSO25A5', '4410VTN26B2']),
);
check('bo\'sh ro\'yxat buzilmaydi', faqatYoziladiganlar([]).length === 0);

// ─── Filtr lug'ati ───────────────────────────────────────────────────────
// Prodda bir xil holat IKKI XIL yozilgan (2026-08-11: `cancellation_process`
// 80 ta va "Проц. отказ" 2 ta). Filtrda ular bitta variant bo'lishi kerak,
// aks holda operator bir holatni ikki marta tanlashga majbur bo'lardi.
check('kalit tanildi', holatniAniqla('cancellation_process')?.key === 'cancellation_process');
check('nomi ham o\'sha kalitga tushdi', holatniAniqla('Проц. отказ')?.key === 'cancellation_process');
check('katta-kichik harf ahamiyatsiz', holatniAniqla('  SOLD ')?.key === 'sold');
check('nomi ko\'rinadigan holda', holatniAniqla('sold')?.label === 'Сотилди');
check('tanilmagan qiymat', holatniAniqla('нечто') === null);
check('bo\'sh qiymat', holatniAniqla(null) === null);

// Filtr kalitni barcha yozilishlariga yoyadi — SQL solishtiruvi shunga
// tayanadi.
{
  const v = holatQiymatlari('cancellation_process');
  check('kalit ham, nomi ham qamraldi',
    v.includes('cancellation_process') && v.includes('проц. отказ'), v.join(','));
}
// CRM yangi holat qo'shsa, u xom nomi bilan ishlashi kerak — filtr
// "hech narsa topilmadi" deb qotib qolmasin.
check('tanilmagan kalit o\'zini qaytaradi',
  holatQiymatlari('Yangi_Holat').join() === 'yangi_holat');

// Har bir holatning qiymatlari FAQAT o'ziga tegishli bo'lishi shart:
// bitta qiymat ikki holatga tushsa, filtr aralashib ketardi.
{
  const korilgan = new Map<string, string>();
  let toqnashuv = '';
  for (const h of SHARTNOMA_HOLATLARI) {
    for (const v of h.values) {
      if (korilgan.has(v)) toqnashuv = `${v}: ${korilgan.get(v)} va ${h.key}`;
      korilgan.set(v, h.key);
    }
  }
  check('qiymatlar to\'qnashmaydi', toqnashuv === '', toqnashuv);
}

// ─── SQL solishtiruvi uchun harf variantlari ─────────────────────────────
// Baza `lc_collate = C` bilan yaratilgan va Postgres'ning `lower()` KIRILL
// harflarni tushirmaydi. Shu sabab variantlar JS'da yasaladi — u yerda
// `toLowerCase()` kirill bilan to'g'ri ishlaydi.
{
  const v = holatSqlQiymatlari('sold');
  check('kirillcha "Сотилди" qamraldi', v.includes('Сотилди'), v.join(','));
  check('kichik harfdagisi ham', v.includes('сотилди'));
  check('katta harfdagisi ham', v.includes('СОТИЛДИ'));
  check('lotincha kalit ham', v.includes('sold') && v.includes('SOLD'));
  check('takror yo\'q', v.length === new Set(v).size);
}
{
  const v = holatSqlQiymatlari('cancellation_process');
  check('"Проц. отказ" barcha holatda', v.includes('Проц. отказ') && v.includes('проц. отказ'));
}

{
  // Talabnoma sahifasidagi «Holat» ustuni: kalit + CRM'dagi nom.
  const k = (v: string | null) => JSON.stringify(holatKorinishi(v));
  check('korinish: kalit → nom', k('cancellation_process') === JSON.stringify({ kalit: 'cancellation_process', nomi: 'Проц. отказ' }), k('cancellation_process'));
  check('korinish: Excel nomi → kanonik kalit', k(' Проц. отказ ') === JSON.stringify({ kalit: 'cancellation_process', nomi: 'Проц. отказ' }), k(' Проц. отказ '));
  check('korinish: СОТИЛДИ → sold', k('СОТИЛДИ') === JSON.stringify({ kalit: 'sold', nomi: 'Сотилди' }), k('СОТИЛДИ'));
  check('korinish: tanilmagan → xom qiymat', k(' Новый ') === JSON.stringify({ kalit: 'Новый', nomi: 'Новый' }), k(' Новый '));
  check('korinish: bo\'sh/null → null', holatKorinishi('  ') === null && holatKorinishi(null) === null);
  const v = holatSqlQiymatlari(holatKorinishi(' Новый ')!.kalit);
  check('tanilmagan kalitning SQL qiymatlari xomni qamraydi', v.includes('Новый'), v.join(','));
}

{
  // Server filtri ko'rinish bilan BIR XIL: xom qiymat qaysi kalitga
  // ko'rinsa, o'sha kalit bo'yicha filtr uni aynan o'zi bilan qidiradi.
  const xomlar = ['Проц. Отказ', 'cancellation_process', 'sold', 'Новый', 'ПРОЦ.ОТКАЗ'];
  const m = kalitgaMosXomlar(xomlar, 'cancellation_process');
  check('aralash harfli "Проц. Отказ" qamraldi', m.includes('Проц. Отказ'), m.join(','));
  check('faqat shu kalitga ko\'rinadiganlar', JSON.stringify(m) === JSON.stringify(['Проц. Отказ', 'cancellation_process', 'ПРОЦ.ОТКАЗ']), m.join(','));
  check('tanilmagan xom — o\'zi', JSON.stringify(kalitgaMosXomlar(xomlar, 'Новый')) === JSON.stringify(['Новый']));
  check('aralash harfli qiymat holatSqlQiymatlari da YO\'Q (shuning uchun kerak)', !holatSqlQiymatlari('cancellation_process').includes('Проц. Отказ'));
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
