/**
 * Elektron talabnoma HTML shabloni — tasdiqlangan namunadan
 * (`docs/superpowers/specs/talabnoma-namuna/talabnoma.html`) so'zma-so'z
 * ko'chirilgan. Matn yoki CSS o'lchami o'zgarsa, namuna ham yangilansin:
 * foydalanuvchi aynan o'sha ko'rinishni tasdiqlagan.
 *
 * Sof modul: `shared/config` ni tortmaydi (rasm yo'llari parametr) —
 * «Birlik testlari»da `.env`siz ishlaydi.
 */
import type { TalabnomaMalumot } from '@/domain/services/ITalabnomaPdf';
import {
  sanaQisqa,
  shartnomaSanasi,
  summaRaqamda,
  summaSozBilan,
  talabnomaRaqami,
} from '@/domain/services/talabnomaFormat';

export type { TalabnomaMalumot };

export interface TalabnomaRasmlari {
  fon: string;
  muhr: string;
  imzo: string;
}

/**
 * Har bir o'zgaruvchan qiymat qochiriladi: ism va manzil CRM'dan keladi,
 * `<` yoki `&` belgisi hujjat tuzilishini buzmasligi (yoki skript
 * qo'shmasligi) kerak. Matn ichida qo'shtirnoq qochirilmaydi — bank nomi
 * (`"КАПИТАЛБАНК"`) va shartnoma sanasi (`"12" март`) namunadagidek qoladi.
 */
function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Atribut (`src="…"`) qiymati — qo'shtirnoq ham qochiriladi. */
function escAttr(v: string): string {
  return esc(v).replace(/"/g, '&quot;');
}

/**
 * CSS `url('…')` ichidagi yo'l. `<style>` ichida HTML-qochirish ishlamaydi,
 * shuning uchun tirnoq/teskari chiziq/qator/`<` foiz-kodlanadi (URL uchun
 * bu ma'nosini o'zgartirmaydi).
 */
function cssUrl(v: string): string {
  return v.replace(/['"\\\n\r<>()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
}

export interface TalabnomaHtmlVariant {
  /**
   * Chop etish uchun nusxa: muhr va imzo rasmlari chiqmaydi, operator
   * qog'ozga qo'lda qo'yadi. Ikkala rasm ham `position: absolute` — ularsiz
   * imzo qatori va matn joyidan siljimaydi, muhr/imzo joyi bo'sh qoladi.
   * Fon (blank) qoladi.
   */
  muhrsiz?: boolean;
}

export function talabnomaHtml(
  m: TalabnomaMalumot,
  rasmlar: TalabnomaRasmlari,
  variant: TalabnomaHtmlVariant = {},
): string {
  const k = m.rekvizit;
  const kompaniya = esc(k.kompaniya);
  const turi = esc(k.turi);
  const sana = shartnomaSanasi(m.contractDate);
  // Sana CRM'da bo'lmasa bo'sh qalin teg qoldirmaymiz — matn shu joyda
  // tabiiy ravishda «ўртасида №… сонли» bo'lib davom etadi.
  const shartnomaSanasiHtml = sana ? `<b>${esc(sana)}</b> ` : '';
  const muhrImzoHtml = variant.muhrsiz
    ? ''
    : `\n    <img class="muhr" src="${escAttr(rasmlar.muhr)}" alt=""><img class="imzo" src="${escAttr(rasmlar.imzo)}" alt="">`;

  return `<!doctype html>
<html lang="uz-Cyrl"><head><meta charset="utf-8"><title>Талабнома ${esc(talabnomaRaqami(m.raqam))}</title>
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; }
  /* Fon va jadval kulrang katagi «fon grafikasini chop etish»siz ham chiqsin. */
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sahifa {
    width: 210mm; height: 297mm; position: relative; box-sizing: border-box;
    padding: 24mm 15mm 14mm 22mm;
    background: url('${cssUrl(rasmlar.fon)}') no-repeat top left / 210mm 297mm;
    font-family: 'Times New Roman', 'Liberation Serif', 'PT Serif', 'DejaVu Serif', serif; font-size: 10.6pt; line-height: 1.2; color: #000;
  }
  .rekv { font-size: 10pt; line-height: 1.25; }
  .raqam { margin-top: 5mm; font-weight: bold; font-size: 11pt; }
  h1 { text-align: center; font-size: 20pt; margin: 1mm 0 3mm; }
  .murojaat { text-align: center; font-size: 14pt; font-weight: bold; margin-bottom: 4mm; }
  p { margin: 0 0 1.6mm; text-align: justify; }
  .xat { text-indent: 12mm; }
  table { border-collapse: collapse; margin: 1mm 0 2mm; width: 120mm; }
  td { border: 1.2px solid #000; padding: 1mm 2mm; vertical-align: top; }
  td.l { width: 38mm; background: #f2f2f2; }
  .summa { font-weight: bold; font-size: 13pt; }
  /* Qora: qizil so'z bilan summa xatni shablondan chiqqandek ko'rsatardi. */
  .soz { color: #000; font-size: 12pt; }
  .imzo-qator { position: relative; margin-top: 16mm; font-weight: bold; display: flex; justify-content: space-between; padding-right: 20mm; }
  .muhr { position: absolute; left: 62mm; top: -17mm; width: 40mm; }
  .imzo { position: absolute; left: 100mm; top: -10mm; width: 24mm; }
  .izoh { margin-top: 20mm; text-indent: 12mm; font-size: 10.5pt; }
</style></head>
<body><div class="sahifa">
  <div class="rekv"><b>МЧЖ «XONSAROY GROUP»</b><br>Адрес: г. Ташкент, Юнусабадский р-н,<br>13 квартал, махалля Ахилобод, д.72<br>Тел/факс: (998 71) 200-74-00</div>
  <div class="raqam">№ ${esc(talabnomaRaqami(m.raqam))}<br>${esc(sanaQisqa(m.sanaIso))}</div>
  <h1>Талабнома</h1>
  <div class="murojaat">Хурматли ${esc(m.fullName)}!</div>
  <p>Сиз ва «${kompaniya}» ${turi}нинг қонуний тижорат вакили ҳисобланган «XONSAROY GROUP» МЧЖ ўртасида ${shartnomaSanasiHtml}№${esc(m.contractNo)}- сонли шартнома тузилган бўлиб, унга асосан <b>${esc(m.objectAddress)} манзилида</b> қурилаётган <b>«${esc(m.objectName.toUpperCase())}»</b> турар-жой мажмуасидан хонадон сотиб олиш мажбуриятини олгансиз.</p>
  <p class="xat">Шартноманинг шартларига ва унинг ажралмас қисми бўлган Тўлов жадвалига (1-илова) мувофиқ, ойлик тўловларни белгиланган муддатларда амалга ошириш кўзда тутилган.</p>
  <p class="xat">Афсуски, бугунги кунда мазкур шартнома бўйича қарздорлик юзага келганини маълум қиламиз:</p>
  <table><tr><td class="l">Қарздорлик суммаси</td><td class="summa">${esc(summaRaqamda(m.summa))} сўм</td></tr>
         <tr><td class="l">Сўз билан</td><td class="soz">${esc(summaSozBilan(m.summa))}</td></tr></table>
  <p class="xat">Турар-жой мажмуасининг қурилиши инвесторларнинг ўз вақтида киритилган маблағлари ҳисобидан амалга оширилади. Тўловларнинг кечикиши қурилиш жараёнларига ва хонадонларни топшириш муддатларига бевосита таъсир қилади — шу боис ҳар бир инвесторнинг жадвалга риоя қилиши барчамиз учун муҳим.</p>
  <p class="xat">Шу муносабат билан, <b>ушбу талабнома кучга киргандан кейин 5 (беш) банк иш куни ичида</b> мазкур қарздорликни тўлиқ тўлашингизни сўраймиз.</p>
  <p class="xat">Тўлов реквизитлари: <b><u>ҚУРУВЧИ: ${turi} “${kompaniya}”</u>, ${esc(k.bank)}, Ҳ.р.: ${esc(k.hisob)}, МФО: ${esc(k.mfo)}, ОКЭД: ${esc(k.oked)}, СТИР: ${esc(k.inn)}</b></p>
  <p class="xat">Эътиборингизни қаратамизки, шартнома шартларига мувофиқ, тўловлар узоқ муддат амалга оширилмаган тақдирда Қурувчи шартномани бир тарафлама бекор қилиш ва хонадонни қайта сотувга қўйиш ҳуқуқига эга. Бу ҳолда киритилган маблағлар шартномада белгиланган муддат ва тартибда қайтарилади. Бироқ биз бундай чорани қўллашни истамаймиз ва масалани ўзаро келишув йўли билан ҳал қилишни афзал кўрамиз.</p>
  <p class="xat">Агар тўлов Сиз томондан аллақачон амалга оширилган бўлса ёки тўлов тафсилотларида хатолик бўлган бўлса, илтимос, тўловни тасдиқловчи ҳужжатни қуйидаги рақамга юборинг — маълумотлар дарҳол текширилади.</p>
  <p class="xat">Ушбу талабнома Инвесторга дастлаб TELEGRAM мобил иловаси ва СМС-хабарнома орқали юборилади ва жўнатилган кундан бошлаб 3 (уч) иш куни ўтгач кучга киради. Бу усул Инвесторни тезкор хабардор қилишнинг қулай ва самарали усули ҳисобланади.</p>
  <p class="xat">Ҳамкорлигингиз учун олдиндан раҳмат.</p>
  <div class="imzo-qator"><span>«XONSAROY GROUP» раҳбари</span><span>И.К. Носиров</span>${muhrImzoHtml}</div>
  <div class="izoh">Батафсил маълумот учун ушбу рақамга мурожат қилишингиз мумкин тел: 90 003-14-00</div>
</div>
<script>
  // Talabnoma bitta sahifa bo'lishi shart. Odatdagi ma'lumot namunadagi
  // o'lchamga sig'adi; juda uzun manzil/ism/bank nomida asosiy matn shrifti
  // sig'guncha bosqichma-bosqich kichraytiriladi (sarlavha, jadval, muhr
  // joyi o'zgarmaydi). Shunda ham sig'masa — renderer PDF'ni rad etadi.
  (function () {
    var s = document.querySelector('.sahifa');
    var pt = 10.6;
    while (s.scrollHeight > s.clientHeight && pt > 9) {
      pt = Math.round((pt - 0.2) * 10) / 10;
      s.style.fontSize = pt + 'pt';
    }
  })();
</script>
</body></html>
`;
}
