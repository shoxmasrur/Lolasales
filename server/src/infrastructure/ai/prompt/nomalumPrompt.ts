/**
 * Noma'lum mijoz agentining promptlari.
 *
 * ATAYLAB `shared/config` import qilinmaydi: fayl sof, shu sabab spec
 * «Birlik testlari»da `.env`siz ishlaydi.
 *
 * Kirishda mijoz/shartnoma/summa maydoni YO'Q — agent bu odam haqida hech
 * narsa bilmasligi kerak, bilmagan narsani aytib ham bera olmaydi.
 */
export interface NomalumPromptKirish {
  personaName: string;
  sotuvRaqami: string;
  urinishlar: number;
  tarix: Array<{ direction: 'in' | 'out'; text: string }>;
}

export type NomalumMaqsad = 'tolov' | 'xarid' | 'boshqa' | 'nomalum';

export interface NomalumJavob {
  reply: string | null;
  shartnomaRaqami: string | null;
  maqsad: NomalumMaqsad;
  operatorga: boolean;
}

export function nomalumSystemPrompt(k: NomalumPromptKirish): string {
  return [
    `Siz — ${k.personaName}, Xon Saroy Group mijozlar bilan ishlash bo'limi xodimisiz. Telegramda sizga notanish odam yozdi.`,
    `Siz bu odam haqida HECH NARSA bilmaysiz: na ismini, na shartnomasini, na to'lovlarini. Hech qachon summa, muddat, to'lov holati yoki shartnoma tafsilotini aytmang va taxmin qilmang.`,
    `Vazifangiz:`,
    `1. Xushmuomala salomlashing va shartnoma raqamini so'rang (masalan "1234ABC56DE" ko'rinishida).`,
    `2. Odam kvartira sotib olmoqchi yoki narx, uy haqida so'rasa — sotuv bo'limi raqamini bering: ${k.sotuvRaqami}. maqsad = "xarid".`,
    `3. Shartnoma raqamini yozsa — uni shartnomaRaqami maydoniga aynan yozing, javobda "Rahmat, tekshiryapman" mazmunida qisqa yozing.`,
    `4. Ikki marta so'raganingizda ham raqam bermasa yoki savoli boshqa mavzuda bo'lsa — operatorga = true, javobda mutaxassisimiz javob berishini ayting.`,
    `Qoidalar: qisqa yozing (1–3 gap), o'zbek tilida (odam ruscha yozsa — ruscha). Pul haqida faqat "to'lov" so'zini ishlating.`,
  ].join('\n');
}

export function nomalumUserPrompt(k: NomalumPromptKirish): string {
  const qatorlar = k.tarix.map((t) => `${t.direction === 'in' ? 'Mijoz' : 'Siz'}: ${t.text}`);
  return [
    `Hozirgacha so'raldi: ${k.urinishlar} marta.`,
    'Suhbat:',
    ...qatorlar,
    'Javobni tuzilgan formatda bering.',
  ].join('\n');
}

export const NOMALUM_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    reply: { type: ['string', 'null'] },
    shartnomaRaqami: { type: ['string', 'null'] },
    maqsad: { type: 'string', enum: ['tolov', 'xarid', 'boshqa', 'nomalum'] },
    operatorga: { type: 'boolean' },
  },
  required: ['reply', 'shartnomaRaqami', 'maqsad', 'operatorga'],
  additionalProperties: false,
};

const MAQSADLAR: ReadonlySet<string> = new Set(['tolov', 'xarid', 'boshqa', 'nomalum']);

function matn(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

/** Model javobini tekshiradi; obyekt bo'lmasa `null` (chaqiruvchi operatorga topshiradi). */
export function nomalumJavobniOqi(raw: unknown): NomalumJavob | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  return {
    reply: matn(o.reply),
    shartnomaRaqami: matn(o.shartnomaRaqami),
    maqsad: typeof o.maqsad === 'string' && MAQSADLAR.has(o.maqsad) ? (o.maqsad as NomalumMaqsad) : 'nomalum',
    operatorga: o.operatorga === true,
  };
}
