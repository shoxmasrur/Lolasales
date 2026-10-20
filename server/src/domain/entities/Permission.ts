/**
 * Ruxsatlar katalogi — tizimdagi yagona haqiqat manbai.
 *
 * Har bir ruxsat `bo'lim.amal` ko'rinishida. Yangi imkoniyat qo'shilganda
 * shu yerga qo'shiladi va avtomatik rol tahrirlash oynasida paydo bo'ladi.
 */

export const PERMISSIONS = [
  // Boshqaruv paneli
  'dashboard.view',

  // Suhbatlar
  'conversations.view',
  'conversations.send',
  'conversations.manage',
  'conversations.agent_toggle',
  'conversations.edit_message',
  'conversations.delete_message',
  'conversations.reset',
  'receipts.confirm',

  // Mijozlar
  'clients.view',
  'clients.create',
  'clients.edit',
  'clients.telegram_lookup',
  'clients.start_conversation',
  'clients.delete',
  'clients.export',

  // Kurslar
  'courses.view',
  'courses.edit',

  // Kanal izohlari (Guruhlar)
  'comments.view',
  'comments.import',

  // Kampaniyalar
  'campaigns.view',
  'campaigns.create',
  'campaigns.control',

  // Import
  'import.view',
  'import.run',
  'import.undo',

  // Telegram akkauntlar
  'telegram.view',
  'telegram.manage',
  'telegram.inbox',

  // Sozlamalar
  'settings.view',
  'settings.edit',
  'settings.kill_switch',

  // Agent qoidalari va xotirasi
  'agent.view',
  'agent.edit',
  'agent.propose',

  // Foydalanuvchilar va rollar
  'users.view',
  'users.manage',
  'roles.manage',

  // Audit
  'audit.view',
  'logs.view',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const PERMISSION_SET: ReadonlySet<string> = new Set(PERMISSIONS);

export function isPermission(value: string): value is Permission {
  return PERMISSION_SET.has(value);
}

export interface PermissionInfo {
  readonly key: Permission;
  readonly label: string;
  readonly hint: string;
}

export interface PermissionGroup {
  readonly section: string;
  readonly label: string;
  readonly items: PermissionInfo[];
}

/** Rol tahrirlash oynasi shu tuzilma bo'yicha chiziladi. */
export const PERMISSION_GROUPS: readonly PermissionGroup[] = [
  {
    section: 'dashboard',
    label: 'Boshqaruv paneli',
    items: [
      { key: 'dashboard.view', label: 'Panelni ko\'rish', hint: 'Umumiy statistika va grafiklar' },
    ],
  },
  {
    section: 'conversations',
    label: 'Suhbatlar',
    items: [
      { key: 'conversations.view', label: 'Ko\'rish', hint: 'Yozishmalarni o\'qish' },
      { key: 'conversations.send', label: 'Xabar yuborish', hint: 'Matn, rasm va fayl yuborish' },
      { key: 'conversations.manage', label: 'Holatni boshqarish', hint: 'Suhbat holatini o\'zgartirish, yopish' },
      { key: 'conversations.agent_toggle', label: 'Agentni yoqish/o\'chirish', hint: 'Suhbat bo\'yicha agentni to\'xtatish' },
      {
        key: 'conversations.edit_message',
        label: 'Xabarni tahrirlash',
        hint: 'Yuborilgan xabar matnini o\'zgartirish. Telegramda 48 soat ichida',
      },
      {
        key: 'conversations.delete_message',
        label: 'Xabarni o\'chirish',
        hint: 'Xabarni mijozning Telegramidan ham o\'chirish. Qaytarib bo\'lmaydi',
      },
      {
        key: 'conversations.reset',
        label: 'Yozishmalarni tozalash',
        hint: 'BARCHA suhbatlarni o\'chirib, sinovni noldan boshlash. Qaytarib bo\'lmaydi',
      },
      {
        key: 'receipts.confirm',
        label: 'Chekni tasdiqlash/rad etish',
        hint: 'Mijoz chekidagi summani kiritib tasdiqlash yoki sababini yozib rad etish. Tasdiqda guruh havolasi ketishi mumkin',
      },
    ],
  },
  {
    section: 'clients',
    label: 'Mijozlar',
    items: [
      { key: 'clients.view', label: 'Ko\'rish', hint: 'Mijozlar ro\'yxati, xarid bosqichi va manbasi' },
      {
        key: 'clients.create',
        label: 'Qo\'shish',
        hint: 'Ism va telefon bo\'yicha yangi mijoz (lead) qo\'shish',
      },
      { key: 'clients.edit', label: 'Tahrirlash', hint: 'Ism, telefon, izoh o\'zgartirish' },
      { key: 'clients.telegram_lookup', label: 'Telegramdan qidirish', hint: 'Raqam bo\'yicha profil topish' },
      { key: 'clients.start_conversation', label: 'Suhbat boshlash', hint: 'Mijozga birinchi xabarni yuborish' },
      {
        key: 'clients.delete',
        label: 'O\'chirish va tiklash',
        hint: 'Mijozni ro\'yxatdan olib tashlash. Ma\'lumot bazada qoladi va qaytarish mumkin',
      },
      {
        key: 'clients.export',
        label: 'Ro\'yxatni yuklab olish',
        hint: 'Mijozlar ro\'yxatini Excel qilib kompyuterga saqlash. Faylda telefon raqamlari va to\'langan summalar bo\'ladi',
      },
    ],
  },
  {
    section: 'courses',
    label: 'Kurslar',
    items: [
      { key: 'courses.view', label: 'Ko\'rish', hint: 'Kurslar va ularning ma\'lumotlar bazasi yozuvlari' },
      {
        key: 'courses.edit',
        label: 'Tahrirlash',
        hint: 'Kurs yaratish, narx va sotuv davrini o\'zgartirish, ma\'lumot yozuvlari. Agent shu ma\'lumotdan javob beradi',
      },
    ],
  },
  {
    section: 'comments',
    label: 'Kanal izohlari',
    items: [
      {
        key: 'comments.view',
        label: 'Ko\'rish',
        hint: 'Akkaunt a\'zo kanallardagi postlar va izohlarni o\'qish. Kanalga hech narsa yozilmaydi',
      },
      {
        key: 'comments.import',
        label: 'Mijoz qilish',
        hint: 'Izoh yozganlarni lead qilib, ularga birinchi shaxsiy xabar kampaniyasini boshlash',
      },
    ],
  },
  {
    section: 'campaigns',
    label: 'Kampaniyalar',
    items: [
      { key: 'campaigns.view', label: 'Ko\'rish', hint: 'Kampaniyalar va ularning progressi' },
      { key: 'campaigns.create', label: 'Yaratish', hint: 'Yangi kampaniya va nishonlar ro\'yxati' },
      { key: 'campaigns.control', label: 'Boshqarish', hint: 'Ishga tushirish, pauza, bekor qilish' },
    ],
  },
  {
    section: 'import',
    label: 'Import',
    items: [
      { key: 'import.view', label: 'Tarixni ko\'rish', hint: 'Oldingi importlar ro\'yxati' },
      { key: 'import.run', label: 'Fayl yuklash', hint: 'Mijozlar (ism, telefon, kurs) faylini import qilish' },
      {
        key: 'import.undo',
        label: 'Importni qaytarish',
        hint: 'Noto\'g\'ri yuklangan faylni bekor qilish — u yaratgan mijozlar ro\'yxatdan chiqadi',
      },
    ],
  },
  {
    section: 'telegram',
    label: 'Telegram akkauntlar',
    items: [
      { key: 'telegram.view', label: 'Ko\'rish', hint: 'Akkauntlar holati va kunlik limit' },
      { key: 'telegram.manage', label: 'Boshqarish', hint: 'Akkaunt qo\'shish, kirish, chiqish, o\'chirish' },
      {
        key: 'telegram.inbox',
        label: 'Akkaunt yozishmalarini o\'qish',
        hint: 'Akkauntning Telegramdagi BARCHA suhbatlarini ko\'rish — shaxsiy yozishmalar ham',
      },
    ],
  },
  {
    section: 'settings',
    label: 'Sozlamalar',
    items: [
      { key: 'settings.view', label: 'Ko\'rish', hint: 'Yuborish tezligi va ish vaqti' },
      { key: 'settings.edit', label: 'O\'zgartirish', hint: 'Limitlar, ish vaqti, agent rejimi' },
      { key: 'settings.kill_switch', label: 'Yuborishni to\'xtatish', hint: 'Favqulodda to\'xtatish tugmasi' },
    ],
  },
  {
    section: 'agent',
    label: 'Agent qoidalari va xotirasi',
    items: [
      { key: 'agent.view', label: 'Ko\'rish', hint: 'Agentning qoidalari, saboqlari va prompti' },
      { key: 'agent.edit', label: 'Tahrirlash', hint: 'Qoida qo\'shish/o\'chirish, saboqni tasdiqlash' },
      { key: 'agent.propose', label: 'Saboq taklif qilish', hint: 'Tasdiqlamaydi \u2014 faqat taklif qiladi (MCP agentlar uchun)' },
    ],
  },
  {
    section: 'users',
    label: 'Foydalanuvchilar',
    items: [
      { key: 'users.view', label: 'Ko\'rish', hint: 'Foydalanuvchilar ro\'yxati' },
      { key: 'users.manage', label: 'Boshqarish', hint: 'Qo\'shish, tahrirlash, parol tiklash, o\'chirish' },
      { key: 'roles.manage', label: 'Rollarni boshqarish', hint: 'Rol yaratish va ruxsatlarni belgilash' },
      { key: 'audit.view', label: 'Amallar jurnali', hint: 'Kim nima qilgani tarixi' },
      {
        key: 'logs.view',
        label: 'Tizim jurnali',
        hint: 'Xatolar va ogohlantirishlar. Mijoz ismi va telefon raqami ko\'rinadi',
      },
    ],
  },
];
