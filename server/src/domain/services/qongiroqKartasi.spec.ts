import { kartaQongiroqlari, notogriRaqamlar } from '@/domain/services/qongiroqKartasi';
import type { PhoneCall } from '@/domain/entities/PhoneCall';

/** Qo'lda ishga tushiriladi: npm run test:qongiroq-kartasi --workspace=server */
let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${a} (kutilgan: ${e})`}`);
};

const q = (p: Partial<PhoneCall>): PhoneCall => ({
  id: 'pc1', externalId: 'c1', clientId: 'cl1', contractId: 'ct1', agentKey: 'madina-orzular', agentName: 'Madina',
  phone: '+998901112233', startedAt: new Date('2026-10-14T05:00:00Z'), durationSec: 95, outcome: 'gaplashildi',
  summary: 'Juma to\'laydi', transcript: 'Assalomu alaykum…', promiseDate: '2026-10-17', promiseAmount: 8_339_000,
  promiseId: 'pr1', createdByUserId: 'u1', createdAt: new Date(), updatedAt: new Date(), ...p,
});

check('bo\'sh ro\'yxat', kartaQongiroqlari([]), []);
check('karta qatori', kartaQongiroqlari([q({})]), [{
  id: 'pc1', sana: '2026-10-14T05:00:00.000Z', agentKaliti: 'madina-orzular', agentIsmi: 'Madina',
  telefon: '+998901112233', davomiylikSoniya: 95, natija: 'gaplashildi', xulosa: 'Juma to\'laydi',
  vada: { kun: '2026-10-17', summa: 8_339_000 }, transkript: 'Assalomu alaykum…',
}]);
check('va\'dasiz — null', kartaQongiroqlari([q({ promiseDate: null, promiseAmount: null })])[0]?.vada, null);
// Ichki maydonlar (kim yozgani, promise id, mijoz id) panelga kerak emas.
check('ichki maydonlar yo\'q', Object.keys(kartaQongiroqlari([q({})])[0] ?? {}).includes('createdByUserId'), false);

check('noto\'g\'ri raqam yo\'q', notogriRaqamlar([q({})]), []);
check('noto\'g\'ri raqam', notogriRaqamlar([q({ outcome: 'raqam_notogri' })]), ['+998901112233']);
check('takror — bitta', notogriRaqamlar([q({ outcome: 'raqam_notogri' }), q({ id: 'pc2', outcome: 'raqam_notogri' })]), ['+998901112233']);
// Review Focus 2: platforma raqamni boshqa formatda yuborishi mumkin.
check('format farqi normallashadi', notogriRaqamlar([q({ outcome: 'raqam_notogri', phone: '+998 90 111 22 33' })]), ['+998901112233']);
check('telefonsiz qo\'ng\'iroq e\'tiborsiz', notogriRaqamlar([q({ outcome: 'raqam_notogri', phone: null })]), []);
check('normallashtirib bo\'lmaydigan e\'tiborsiz', notogriRaqamlar([q({ outcome: 'raqam_notogri', phone: 'abc' })]), []);
// Eng yangi natija hal qiladi (kirish: eng yangisi birinchi).
check('keyingi gaplashildi — belgi yo\'q', notogriRaqamlar([q({ id: 'yangi', outcome: 'gaplashildi', phone: '+998 90 111 22 33' }), q({ id: 'eski', outcome: 'raqam_notogri', phone: '+998901112233' })]), []);
check('keyingi raqam_notogri — belgi bor', notogriRaqamlar([q({ id: 'yangi', outcome: 'raqam_notogri', phone: '+998 90 111 22 33' }), q({ id: 'eski', outcome: 'gaplashildi', phone: '+998901112233' })]), ['+998901112233']);

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
