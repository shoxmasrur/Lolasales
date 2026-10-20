import { BOSQICH_YORLIGI, XARID_BOSQICHLARI, bosqichOtishi, tolovdanKeyingiBosqich, yakunlanganmi } from '@/domain/entities/Purchase';

/** Qo'lda: npm run test:purchase --workspace=server */
let failed = 0;
const check = (name: string, a: unknown, e: unknown): void => {
  const ok = JSON.stringify(a) === JSON.stringify(e);
  if (!ok) failed += 1;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : ` → ${JSON.stringify(a)} (kutilgan: ${JSON.stringify(e)})`}`);
};
check('agent oldinga', bosqichOtishi('yangi', 'qiziqdi', 'agent'), 'qiziqdi');
check('agent yangi→suhbatda', bosqichOtishi('yangi', 'suhbatda', 'agent'), 'suhbatda');
check('agent suhbatda→qiziqdi', bosqichOtishi('suhbatda', 'qiziqdi', 'agent'), 'qiziqdi');
check('agent orqaga emas', bosqichOtishi('qiziqdi', 'suhbatda', 'agent'), null);
check("agent karta qo'ya olmaydi", bosqichOtishi('qiziqdi', 'karta_yuborildi', 'agent'), null);
check("agent toladi qo'ya olmaydi", bosqichOtishi('chek_keldi', 'toladi', 'agent'), null);
check('agent rad etdi', bosqichOtishi('karta_yuborildi', 'rad_etdi', 'agent'), 'rad_etdi');
check('agent yangi→rad etdi', bosqichOtishi('yangi', 'rad_etdi', 'agent'), 'rad_etdi');
check('agent qiziqdi→rad etdi', bosqichOtishi('qiziqdi', 'rad_etdi', 'agent'), 'rad_etdi');
check('agent chek_keldi dan rad etmaydi', bosqichOtishi('chek_keldi', 'rad_etdi', 'agent'), null);
check('agent qisman_toladi dan rad etmaydi', bosqichOtishi('qisman_toladi', 'rad_etdi', 'agent'), null);
check('menejer qisman_toladi→rad_etdi', bosqichOtishi('qisman_toladi', 'rad_etdi', 'menejer'), 'rad_etdi');
check('agent yakunlangandan rad etmaydi', bosqichOtishi('toladi', 'rad_etdi', 'agent'), null);
check('agent rad_etdidan chiqmaydi', bosqichOtishi('rad_etdi', 'suhbatda', 'agent'), null);
check('chek kartasiz keladi', bosqichOtishi('yangi', 'chek_keldi', 'tizim'), 'chek_keldi');
check('chek rad → karta', bosqichOtishi('chek_keldi', 'karta_yuborildi', 'tizim'), 'karta_yuborildi');
check('qisman_toladi → chek_keldi', bosqichOtishi('qisman_toladi', 'chek_keldi', 'tizim'), 'chek_keldi');
check('tizim qisman', bosqichOtishi('chek_keldi', 'qisman_toladi', 'tizim'), 'qisman_toladi');
check('tizim toladi', bosqichOtishi('chek_keldi', 'toladi', 'tizim'), 'toladi');
check('tizim suhbatda qo\'ya olmaydi', bosqichOtishi('karta_yuborildi', 'suhbatda', 'tizim'), null);
check('tizim rad_etdi qo\'ya olmaydi', bosqichOtishi('yangi', 'rad_etdi', 'tizim'), null);
check('yakunlangandan tizim chiqarmaydi', bosqichOtishi('toladi', 'chek_keldi', 'tizim'), null);
check('menejer istalgan', bosqichOtishi('toladi', 'suhbatda', 'menejer'), 'suhbatda');
check('menejer rad_etdidan', bosqichOtishi('rad_etdi', 'yangi', 'menejer'), 'yangi');
check("o'zgarishsiz", bosqichOtishi('qiziqdi', 'qiziqdi', 'menejer'), null);
check("o'zgarishsiz tizim", bosqichOtishi('chek_keldi', 'chek_keldi', 'tizim'), null);
check('yakunlangan toladi', yakunlanganmi('toladi'), true);
check('yakunlangan rad_etdi', yakunlanganmi('rad_etdi'), true);
check('qisman yakunlanmagan', yakunlanganmi('qisman_toladi'), false);
check('qisman', tolovdanKeyingiBosqich(500_000, 1_500_000), 'qisman_toladi');
check('aniq', tolovdanKeyingiBosqich(1_500_000, 1_500_000), 'toladi');
check('ortiqcha', tolovdanKeyingiBosqich(1_600_000, 1_500_000), 'toladi');
check('yorliqlar', XARID_BOSQICHLARI.map((s) => BOSQICH_YORLIGI[s]),
  ['Yangi', 'Suhbatda', 'Qiziqdi', 'Karta yuborildi', 'Chek keldi', "Qisman to'ladi", "To'ladi", 'Rad etdi']);
console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
