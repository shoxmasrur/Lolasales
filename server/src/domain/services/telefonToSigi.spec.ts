import {
  raqamniUz,
  tosilganlarniTashla,
  type RaqamlarHolati,
} from '@/domain/services/telefonToSigi';

/**
 * Qo'lda ishga tushiriladi: npm run test:telefon-tosigi --workspace=server
 *
 * Begona odamga "boshqa yozilmaydi" deb va'da beramiz. Bu funksiyalar aynan
 * shu va'dani bajaradi: `raqamniUz` raqamni mijozdan uzadi, `tosilganlarniTashla`
 * esa sinxronizatsiya va importda uning qaytib kelishini to'sadi.
 *
 * Eng xavfli xato — uzilgan raqamning jimgina qaytib kelishi: mijoz hech
 * narsa sezmaydi, begona odam esa yana xabar oladi.
 */
let failed = 0;
const check = (name: string, ok: boolean, hint = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${hint}`}`);
};

const holat = (over: Partial<RaqamlarHolati> = {}): RaqamlarHolati => ({
  phone: '+998901112233',
  extraPhones: ['+998901112244', '+998901112255'],
  ...over,
});

// ─── raqamniUz ───────────────────────────────────────────────────────────

// Asosiy raqam undiruvda ishlatiladigan raqam: u uzilganda mijoz raqamsiz
// qolmasligi kerak, agar boshqa raqami bo'lsa.
const asosiy = raqamniUz(holat(), '+998901112233');
check(
  'asosiy raqam uzilganda keyingisi asosiy bo\'ladi',
  asosiy.phone === '+998901112244' && asosiy.extraPhones.join() === '+998901112255',
  JSON.stringify(asosiy),
);

const qoshimcha = raqamniUz(holat(), '+998901112244');
check(
  'qo\'shimcha raqam uzilganda asosiyga tegilmaydi',
  qoshimcha.phone === '+998901112233' && qoshimcha.extraPhones.join() === '+998901112255',
  JSON.stringify(qoshimcha),
);

// Mijozning yagona raqami uzilishi normal holat — Igamberdiyevga o'xshab
// bitta raqamli mijozlar ko'p. U "raqam yo'q" filtriga tushishi kerak.
const yolgiz = raqamniUz({ phone: '+998901112233', extraPhones: [] }, '+998901112233');
check(
  'oxirgi raqam uzilganda mijoz raqamsiz qoladi',
  yolgiz.phone === null && yolgiz.extraPhones.length === 0,
  JSON.stringify(yolgiz),
);

// Operator tugmani ikki marta bosishi mumkin — ikkinchisida raqam
// allaqachon yo'q bo'ladi.
const yoq = raqamniUz(holat(), '+998909999999');
check(
  'ro\'yxatda yo\'q raqam uzilsa hech nima o\'zgarmaydi',
  yoq.phone === '+998901112233' && yoq.extraPhones.length === 2,
  JSON.stringify(yoq),
);

// Bitta raqam ham asosiy, ham qo'shimcha bo'lib yozilib qolgan holat:
// import xatolari tufayli bazada uchraydi. Ikkalasidan ham chiqishi kerak.
const takror = raqamniUz(
  { phone: '+998901112233', extraPhones: ['+998901112233', '+998901112244'] },
  '+998901112233',
);
check(
  'takrorlangan raqam hamma joydan uziladi',
  takror.phone === '+998901112244' && takror.extraPhones.length === 0,
  JSON.stringify(takror),
);

// ─── tosilganlarniTashla ─────────────────────────────────────────────────

check(
  'to\'silgan raqam kiruvchi ro\'yxatdan tashlanadi',
  tosilganlarniTashla(
    ['+998901112233', '+998901112244'],
    new Set(['+998901112233']),
  ).join() === '+998901112244',
);

check(
  'to\'siq bo\'sh bo\'lsa hamma raqam qoladi',
  tosilganlarniTashla(['+998901112233', '+998901112244'], new Set()).length === 2,
);

check(
  'hammasi to\'silgan bo\'lsa bo\'sh ro\'yxat qaytadi',
  tosilganlarniTashla(['+998901112233'], new Set(['+998901112233'])).length === 0,
);

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
