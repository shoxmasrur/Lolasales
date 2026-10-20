# LolaSales Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DebitorAgent02 dan kurs sotuvchi AI agentni yaratish. Agent Telegram shaxsiy
akkauntlaridan sotuvdagi kursni sotadi, karta yuboradi, chekni menejerga tekshirtiradi va
yopiq guruh havolasini beradi.

**Architecture:**
- DebitorAgent02 kodi `LolaSales` ga ko'chiriladi va migratsiyalar bitta `001_init.sql` ga
  yig'iladi.
- Sotuv domeni qo'shiladi: kurslar, xaridlar, kartalar va kanal kommentlari.
- Agent prompti va `AgentRunner` sotuvga qayta yoziladi, qarzga oid modullar o'chiriladi.
- Qatlamli arxitektura (domain → application → infrastructure → presentation) va mavjud
  naqshlar saqlanadi:
  - Pg repozitoriylar `query()` bilan, konstruktorsiz;
  - Express route fayllari, `requirePermission`;
  - react-query va `api.get/post`.

**Tech Stack:** Node 22, TypeScript, Express, zod, PostgreSQL, `teleproto` (GramJS),
`@anthropic-ai/claude-agent-sdk`, exceljs, React + Vite + Tailwind, react-query, zustand.

**Spec:** `docs/superpowers/specs/2026-10-20-lolasales-design.md` — har bir vazifadan oldin
o'qing.

**Manba:** `/Users/ulugbektuxtayev/AI/DebitorAgent02` (commit `b563a61`). Quyida "Debitor" deb
aytiladi. Yo'llar `LolaSales/` ga nisbatan; `server/src/` qisqacha `S/`, `web/src/` esa `W/`
deb yoziladi.

## Global Constraints

- Node 22 (`.nvmrc`), `engines.node >=20.10`.
- Interfeys tili o'zbekcha (lotin). Yangi identifikatorlar atrofidagi kod uslubida bo'ladi:
  o'zbekcha va inglizcha aralash.
- Testlar Debitordagidek **tsx skriptlar** ko'rinishida yoziladi: `check(name, actual,
  expected)` va `process.exitCode`. Har bir yangi spec uchun ikki narsa qo'shiladi:
  `server/package.json` da `"test:<nom>": "tsx src/<yo'l>.spec.ts"` skripti va
  `.github/workflows/ci.yml` ning "Birlik testlari" blokida bitta qator. Testlar bazasiz
  ishlaydi.
- Har bir vazifa oxirida ikkala buyruq ham o'tishi shart: `npm run typecheck` va
  `ci.yml` dagi barcha testlar. Ikkinchisi uchun skript: `bash scripts/run-tests.sh`
  (1-vazifada yaratiladi).
- Portlar: API **4200**, web **5174**. Debitor bilan bir vaqtda ishlashi uchun.
- Baza `lolasales`. `.env` va `ENCRYPTION_KEY` Debitordan **ko'chirilmaydi**.
- Karta raqami va guruh havolasini **LLM yozmaydi**. Ular Sozlamalar yoki bazadagi aniq
  qiymatdan tizim xabari sifatida yuboriladi.
- Menejer tasdiqlamaguncha agent "to'lov qabul qilindi" demaydi va havola bermaydi.
- Agent faqat **shaxsiy chat**larga javob beradi. Guruh yoki kanalga hech narsa yozilmaydi.
- Yuborish limitlari, pauzalar va yuborish oynasi barcha chiquvchi xabarlarga amal qiladi:
  birinchi xabar, eslatma, karta va havola.
- Sana va vaqt `config.TIMEZONE` (Asia/Tashkent) bo'yicha hisoblanadi.
- Xarid bosqichlari (kodda): `yangi`, `suhbatda`, `qiziqdi`, `karta_yuborildi`,
  `chek_keldi`, `qisman_toladi`, `toladi`, `rad_etdi`. UI yorliqlari: "Yangi", "Suhbatda",
  "Qiziqdi", "Karta yuborildi", "Chek keldi", "Qisman to'ladi", "To'ladi", "Rad etdi".
- Mijoz manbalari: `reklama`, `guruh`, `raqam`, `qolda`.

## Review Focus

1. **Chek karta yuborilmasdan keladi.** Mijoz `yangi` yoki `suhbatda` bosqichida o'zi chek
   tashlaydi. Kutilgan natija: tekshiruv ochiladi va bosqich `chek_keldi` bo'ladi. Test 5-
   vazifadagi `bosqichOtishi` da (`tizim` → `chek_keldi`, istalgan yakunlanmagan
   bosqichdan).
2. **Karta yuborilgandan keyin kurs narxi o'zgaradi.** Summa xariddagi `totalAmount` dan
   olinadi, kursning joriy narxidan emas. Test 7-vazifadagi `kartaSummasi` da.
3. **Agent `sendCard: true` qaytaradi, lekin xaridda kurs yo'q yoki faol karta yo'q.** Karta
   yuborilmaydi va suhbat menejerga o'tadi (`needsHuman`). Test 7-vazifada
   (`kartaTayyorligi`).
4. **Bir odam ikki marta komment yozgan yoki u allaqachon mijoz.** Takroriy mijoz
   yaratilmaydi, mavjud mijoz qaytariladi. Test 13-vazifadagi `izohlarniAjrat` da.
5. **Ortiqcha yoki aniq summa to'landi** (`paid >= total`). Bosqich `toladi` bo'ladi,
   havola bir marta ketadi. Test 5-vazifadagi `tolovdanKeyingiBosqich` va 10-vazifadagi
   `havolaYuborilsinmi` da.

---

## A. Asos

### Task 1: Nusxa olish, nomlash, portlar

**Files:**
- Create: butun daraxt `rsync` bilan Debitordan.
- Modify: `package.json`, `server/package.json`, `web/package.json` (nomlar),
  `.env.example`, `web/vite.config.ts`, `.claude/launch.json`, `README.md`.
- Create: `scripts/run-tests.sh`.

**Interfaces:**
- Produces: `bash scripts/run-tests.sh`. U `ci.yml` "Birlik testlari" blokidagi
  `npm run test:*` qatorlarini ketma-ket bajaradi va birinchi xatoda chiqadi. Keyingi
  vazifalar shuni ishlatadi.

- [ ] **Step 1: Kodni ko'chiring**

`docs/` mavjud bo'lgani uchun uning ichidagi spec va reja saqlanishi kerak.

Run: `rsync -a --exclude node_modules --exclude .git --exclude .env --exclude storage --exclude .worktrees --exclude .superpowers --exclude '.DS_Store' --exclude 'docs/superpowers' /Users/ulugbektuxtayev/AI/DebitorAgent02/ /Users/ulugbektuxtayev/AI/LolaSales/`
Expected: `ls` da `server web mcp scripts docs package.json` ko'rinadi, `docs/superpowers/specs`
joyida qoladi.

- [ ] **Step 2: Nom va portlarni o'zgartiring**

- Root `name` → `lolasales`, `description` → "LolaSales — Telegram orqali kurs sotuvchi AI
  agent".
- Workspace nomlari: `@lolasales/server`, `@lolasales/web`.
- `.env.example` da `PORT=4200` va
  `DATABASE_URL=postgres://ulugbektuxtayev@localhost:5432/lolasales`. Admin email misoli
  `admin@lolasales.uz`.
- `web/vite.config.ts` da `server.port: 5174`, proxy esa `http://localhost:4200` ga.
- `.claude/launch.json` portlari 4200 va 5174.
- `README.md` sarlavhasi va birinchi bo'limi LolaSales ga moslanadi. Qolgan qismi keyingi
  vazifalarda yangilanadi.

- [ ] **Step 3: `scripts/run-tests.sh` ni yozing**

`ci.yml` dan `npm run test:` bilan boshlanadigan qatorlarni `grep` qilib, `set -e` bilan
bajaring.

- [ ] **Step 4: Tekshiring**

Run: `npm install && npm run typecheck && bash scripts/run-tests.sh`
Expected: hammasi o'tadi (kod hali Debitor bilan bir xil).

- [ ] **Step 5: Commit**

```bash
git init && git add -A && git commit -m "LolaSales: DebitorAgent02 (b563a61) dan nusxa"
```

### Task 2: Migratsiyalarni `001_init.sql` ga yig'ish

**Files:**
- Delete: `server/migrations/002_*.sql … 134_*.sql`.
- Replace: `server/migrations/001_init.sql`.
- Modify: `S/infrastructure/ai/prompt/seedDefaultRules.ts` (o'zgarmaydi, faqat ishlashi
  tekshiriladi).

**Interfaces:**
- Produces: toza bazada `npm run seed` to'liq sxemani yaratadi. Bu Debitor 134-migratsiyadan
  keyingi sxema bilan bir xil. Qarz jadvallari 14-vazifagacha **qoladi**, chunki kod hali
  ularga murojaat qiladi.

- [ ] **Step 1: Vaqtinchalik bazaga barcha migratsiyalarni qo'llang**

Run: `createdb lolasales_tmp && DATABASE_URL=postgres://ulugbektuxtayev@localhost:5432/lolasales_tmp npm run migrate --workspace=server`
Expected: 134 ta migratsiya qo'llanadi.

- [ ] **Step 2: Sxema va kerakli ma'lumotni oling**

Run: `pg_dump --schema-only --no-owner --no-privileges lolasales_tmp > /tmp/schema.sql` va
`pg_dump --data-only --inserts --table=roles --table=llm_models lolasales_tmp > /tmp/data.sql`.

Yangi `001_init.sql` tarkibi:
- `CREATE EXTENSION IF NOT EXISTS pgcrypto;`
- sxema, ammo `schema_migrations` jadvalisiz;
- `roles` va `llm_models` qatorlari.

`agent_rules` va `agent_rule_sections` qatorlari olinmaydi: bo'limlar ishga tushishda
`syncRuleSections` bilan yaratiladi. `settings` ham olinmaydi.

- [ ] **Step 3: Toza bazada tekshiring**

Run: `dropdb lolasales_tmp; createdb lolasales && npm run seed --workspace=server && npm run dev:server`
Expected:
- server 4200 da ko'tariladi;
- `agent_rule_sections` to'ladi;
- `/api/health` (yoki login) ishlaydi.

Shundan keyin serverni to'xtating.

- [ ] **Step 4: Typecheck va testlar**

Run: `npm run typecheck && bash scripts/run-tests.sh`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Migratsiyalar 001_init.sql ga yig'ildi"
```

### Task 3: Faqat shaxsiy chat va xizmat hisoblari filtri

**Files:**
- Create: `S/infrastructure/telegram/kiruvchiFiltr.ts`,
  `S/infrastructure/telegram/kiruvchiFiltr.spec.ts`.
- Modify: `S/infrastructure/telegram/MtprotoTelegramGateway.ts` — `attachHandler` ichida
  (~L1398–1420) va `fetchMissed` ichida (~L1295).

**Interfaces:**
- Produces: `export function kiruvchigaQabul(i: { peerKind: TelegramPeerKind; senderIsUser: boolean; senderIsBot: boolean; senderId: string }): boolean`

- [ ] **Step 1: Yiqiladigan testni yozing** — `kiruvchiFiltr.spec.ts`

```ts
check('shaxsiy foydalanuvchi', kiruvchigaQabul({ peerKind: 'user', senderIsUser: true, senderIsBot: false, senderId: '42' }), true);
check('guruhdagi foydalanuvchi', kiruvchigaQabul({ peerKind: 'group', senderIsUser: true, senderIsBot: false, senderId: '42' }), false);
check('kanal/supergruppa', kiruvchigaQabul({ peerKind: 'channel', senderIsUser: true, senderIsBot: false, senderId: '42' }), false);
check('bot', kiruvchigaQabul({ peerKind: 'user', senderIsUser: true, senderIsBot: true, senderId: '42' }), false);
check('Telegram xizmati 777000', kiruvchigaQabul({ peerKind: 'user', senderIsUser: true, senderIsBot: false, senderId: '777000' }), false);
check('foydalanuvchi emas', kiruvchigaQabul({ peerKind: 'user', senderIsUser: false, senderIsBot: false, senderId: '42' }), false);
```

- [ ] **Step 2: Test yiqilishini ko'ring**

Run: `npm run test:kiruvchi-filtr --workspace=server` (avval skript va `ci.yml` qatorini
qo'shing).
Expected: FAIL, modul topilmaydi.

- [ ] **Step 3: `kiruvchigaQabul` ni yozing va gatewayga ulang**

`attachHandler` da peer turi `peerKindOf(message.peerId)` (L1671) dan olinadi. Filtrdan
o'tmagan xabar `handleIncoming` ga bormaydi. `fetchMissed` ham shu funksiyani ishlatadi.

- [ ] **Step 4: Testlar o'tishini ko'ring**

Run: `npm run typecheck && bash scripts/run-tests.sh`
Expected: PASS

- [ ] **Step 5: Commit** — `git commit -am "Kiruvchi oqimga faqat shaxsiy chatlar"`

### Task 4: Chekka qarz modullarini o'chirish

Bu vazifa agent yadrosiga tegmaydigan qarz modullarini olib tashlaydi.

**Files (Delete):**
- `mcp/` paketi va root `workspaces` dan `mcp`.
- Talabnoma:
  - `S/infrastructure/talabnoma/`
  - `S/application/services/Talabnoma*.ts`
  - `S/presentation/http/routes/talabnoma*`
  - `W/pages/TalabnomalarPage.tsx`, `W/components/talabnoma/`
- Qo'ng'iroqlar:
  - `S/presentation/mcp/qongiroqMcp.ts`
  - `S/application/services/Qongiroq*.ts`
  - telefon qo'ng'iroqlari repozitoriysi va route
  - `W/components/ClientCallsCard.tsx`
- Premium: `PremiumEslatmaWatcher.ts`, `W/components/AccountPremiumForm.tsx`,
  `W/components/PremiumBadge.tsx`.
- Oylik eslatma: `OylikEslatmaWatcher.ts`.
- Bayramlar: `HolidaysPage.tsx`, `HolidaysCard.tsx`, holidays route.
  `evaluateWindow` chaqiruvlariga `holidays: []` uzatiladi, repozitoriy esa o'chiriladi.
- Obyekt cheklovi: `QamrovTekshiruvchi.ts`, `mijozQamrovi*`, `qamrovSharti*`, userObjects
  route.
- Hisobot va kunlik sahifalar: `ReportsPage.tsx`, `DailyPage.tsx`,
  `W/components/TushumEksporti.tsx`, ularning route fayllari.
- `DebtSnapshotWriter.ts`, `RekvizitManbai.ts`.
- `ContractSyncScheduler.ts`, `BulkContractSync.ts`, `W/components/SyncContractButton.tsx`.
- Shu modullarning `*.spec.ts` fayllari, `package.json` dagi `test:*` skriptlari va
  `ci.yml` dagi qatorlari.

**Modify:**
- `S/composition/container.ts`, `S/main.ts` — o'chirilgan servislarni yaratish va ishga
  tushirish olib tashlanadi.
- `AgentRunner` konstruktoriga `phoneCalls` va `talabnomalar` uchun `null` uzatiladi. Ular
  8-vazifada butunlay olinadi.
- `SilenceWatcher` dagi `talabnomaSukuti` o'rniga `{ sukutdami: async () => false }`
  uzatiladi.
- `W/App.tsx`, `W/lib/nav.ts` — yo'qolgan sahifalar olib tashlanadi.
- `S/domain/entities/Permission.ts` va `W/lib/types.ts` — talabnoma, qo'ng'iroq, bayram,
  hisobot va obyekt ruxsatlari olib tashlanadi.

- [ ] **Step 1: Fayllarni o'chiring va havolalarni tozalang**

`npm run typecheck` xatolari bo'yicha boring. Agar biror qism agent yadrosi bilan
chirmashib ketgan bo'lsa, o'chirmasdan joyida qoldiring va 8- yoki 14-vazifaga qoldiring.
Bunday qismlarni commit xabarida sanab o'ting.

- [ ] **Step 2: Tekshiring**

Run: `npm run typecheck && bash scripts/run-tests.sh && npm run build`
Expected: PASS

Run: `npm run dev`, keyin brauzerda `http://localhost:5174`.
Expected: Dashboard, Suhbatlar, Mijozlar, Telegram, Agent, Loglar va Sozlamalar ochiladi.

- [ ] **Step 3: Commit** — `git commit -am "Chekka qarz modullari o'chirildi"`

---

## B. Sotuv domeni

### Task 5: Kurslar va xaridlar domeni (sof mantiq)

**Files:**
- Create: `S/domain/entities/Course.ts`, `S/domain/entities/course.spec.ts`.
- Create: `S/domain/entities/Purchase.ts`, `S/domain/entities/purchase.spec.ts`.

**Interfaces — Produces:**

```ts
// Course.ts
export type LinkAfter = 'birinchi_qism' | 'toliq';
export interface Course {
  id: string; name: string; description: string | null;
  salesStart: string; salesEnd: string;          // YYYY-MM-DD, ikkalasi ham kiradi
  price: number; duration: string | null; topics: string[];
  startsOn: string | null; groupLink: string | null; isActive: boolean;
  installmentAllowed: boolean; installmentParts: number | null;
  installmentFirstMin: number | null; linkAfter: LinkAfter;
}
export type KnowledgeKind = 'dastur' | 'savol_javob' | 'etiroz' | 'boshqa';
export interface CourseKnowledge { id: string; courseId: string; kind: KnowledgeKind; title: string; body: string; sortOrder: number }
export function sotuvdagiKurslar(courses: Course[], todayIso: string): Course[];   // faol + davr ichida, salesStart bo'yicha
export function keyingiKurs(courses: Course[], todayIso: string): Course | null;   // faol, salesStart > today, eng yaqini

// Purchase.ts
export const XARID_BOSQICHLARI = ['yangi','suhbatda','qiziqdi','karta_yuborildi','chek_keldi','qisman_toladi','toladi','rad_etdi'] as const;
export type XaridBosqichi = (typeof XARID_BOSQICHLARI)[number];
export const BOSQICH_YORLIGI: Record<XaridBosqichi, string>;
export type BosqichAktori = 'agent' | 'tizim' | 'menejer';
export interface Purchase {
  id: string; clientId: string; courseId: string | null; stage: XaridBosqichi;
  stageChangedAt: Date; totalAmount: number | null; paidAmount: number;
  installment: boolean; linkSentAt: Date | null; remindedStages: XaridBosqichi[]; createdAt: Date;
}
export function yakunlanganmi(stage: XaridBosqichi): boolean;  // toladi | rad_etdi
export function bosqichOtishi(current: XaridBosqichi, requested: XaridBosqichi, actor: BosqichAktori): XaridBosqichi | null;
export function tolovdanKeyingiBosqich(paid: number, total: number): 'qisman_toladi' | 'toladi';
```

Spec 6.3 `reminder_sent_for_stage` deydi. Bu yerda u `remindedStages: XaridBosqichi[]`
ko'rinishida (`reminded_stages text[]`). Sabab: bitta ustun bilan "bir bosqichga bitta
eslatma" va "rad etilgandan keyin yangi eslatma yo'q" qoidalarini birga ifodalab bo'lmaydi.

`bosqichOtishi` qoidalari (spec 6.3):

| Aktor | Ruxsat etilgan o'tishlar | Natija |
|---|---|---|
| `agent` | faqat oldinga, `yangi → suhbatda → qiziqdi` ichida | yangi bosqich |
| `agent` | yakunlanmagan istalgan bosqichdan `rad_etdi` ga | `rad_etdi` |
| `agent` | boshqa barcha o'tishlar | `null` |
| `tizim` | `karta_yuborildi`, `chek_keldi`, `qisman_toladi`, `toladi`, `karta_yuborildi` ga qaytish (chek rad etilganda) | yangi bosqich |
| `menejer` | istalgan bosqich | yangi bosqich |

Qo'shimcha: `current === requested` bo'lsa `null`. Yakunlangan bosqichdan faqat `menejer`
chiqara oladi.

- [ ] **Step 1: Yiqiladigan testlarni yozing**

`course.spec.ts`:

```ts
const k = (id: string, s: string, e: string, active = true) => ({ ...BASE, id, salesStart: s, salesEnd: e, isActive: active });
const C = [k('nov', '2026-11-01', '2026-11-30'), k('dek', '2026-12-01', '2026-12-31'), k('off', '2026-11-01', '2026-11-30', false)];
check('davr boshi kiradi', sotuvdagiKurslar(C, '2026-11-01').map(c => c.id), ['nov']);
check('davr oxiri kiradi', sotuvdagiKurslar(C, '2026-11-30').map(c => c.id), ['nov']);
check('faol emas chiqmaydi', sotuvdagiKurslar(C, '2026-11-15').some(c => c.id === 'off'), false);
check('ikki kurs bir vaqtda', sotuvdagiKurslar([...C, k('x', '2026-11-20', '2026-12-05')], '2026-12-01').map(c => c.id), ['x', 'dek']);
check('sotuvda yo\'q', sotuvdagiKurslar(C, '2027-01-02'), []);
check('keyingi kurs', keyingiKurs(C, '2026-10-20')?.id, 'nov');
check('keyingi yo\'q', keyingiKurs(C, '2027-01-02'), null);
```

`ikki kurs bir vaqtda` testida `salesStart` bo'yicha tartib tekshiriladi: `x` 20-noyabr,
`dek` 1-dekabr.

`purchase.spec.ts`:

```ts
check('agent oldinga', bosqichOtishi('yangi', 'qiziqdi', 'agent'), 'qiziqdi');
check('agent orqaga emas', bosqichOtishi('qiziqdi', 'suhbatda', 'agent'), null);
check('agent karta qo\'ya olmaydi', bosqichOtishi('qiziqdi', 'karta_yuborildi', 'agent'), null);
check('agent toladi qo\'ya olmaydi', bosqichOtishi('chek_keldi', 'toladi', 'agent'), null);
check('agent rad etdi', bosqichOtishi('karta_yuborildi', 'rad_etdi', 'agent'), 'rad_etdi');
check('chek kartasiz keladi', bosqichOtishi('yangi', 'chek_keldi', 'tizim'), 'chek_keldi');
check('chek rad → karta', bosqichOtishi('chek_keldi', 'karta_yuborildi', 'tizim'), 'karta_yuborildi');
check('yakunlangandan tizim chiqarmaydi', bosqichOtishi('toladi', 'chek_keldi', 'tizim'), null);
check('menejer istalgan', bosqichOtishi('toladi', 'suhbatda', 'menejer'), 'suhbatda');
check('o\'zgarishsiz', bosqichOtishi('qiziqdi', 'qiziqdi', 'menejer'), null);
check('qisman', tolovdanKeyingiBosqich(500_000, 1_500_000), 'qisman_toladi');
check('aniq', tolovdanKeyingiBosqich(1_500_000, 1_500_000), 'toladi');
check('ortiqcha', tolovdanKeyingiBosqich(1_600_000, 1_500_000), 'toladi');
```

Bu misollarda `qisman_toladi` dan keyingi to'lov ham `tizim` orqali `chek_keldi` ga
o'tadi: `qisman_toladi` yakunlanmagan bosqich hisoblanadi.

- [ ] **Step 2: Testlar yiqilishini ko'ring**

Run: `npm run test:course --workspace=server && npm run test:purchase --workspace=server`
Expected: FAIL

- [ ] **Step 3: Funksiyalarni yozing**

`Course.ts` va `Purchase.ts` ni yuqoridagi imzolar bilan yozing.

- [ ] **Step 4: Testlar o'tishini ko'ring**

Run: `npm run typecheck && bash scripts/run-tests.sh`
Expected: PASS

- [ ] **Step 5: Commit** — `git commit -am "Kurs va xarid domeni"`

### Task 6: Kurslar va xaridlar — baza, API, sahifalar

**Files:**
- Create: `server/migrations/002_kurslar_va_xaridlar.sql`.
- Create:
  - `S/domain/repositories/ICourseRepository.ts`
  - `S/domain/repositories/IPurchaseRepository.ts`
  - `S/infrastructure/db/repositories/PgCourseRepository.ts`
  - `S/infrastructure/db/repositories/PgPurchaseRepository.ts`
- Create: `S/presentation/http/routes/courseRoutes.ts`.
- Modify:
  - `S/infrastructure/db/mappers.ts`
  - `S/composition/container.ts`
  - `S/presentation/http/createApp.ts`
  - `Permission.ts` va `W/lib/types.ts`
  - `clientRoutes.ts` — filtrlar, eksport, bosqichni qo'lda o'zgartirish
  - `PgClientRepository` — ro'yxat filtri
- Create: `W/pages/KurslarPage.tsx`.
- Modify: `W/App.tsx`, `W/lib/nav.ts`, `W/pages/ClientsPage.tsx`, `W/lib/types.ts`.

**Migration `002_kurslar_va_xaridlar.sql`:**
- `courses`:
  - id uuid pk; name text not null; description text; sales_start date not null;
    sales_end date not null with check `sales_end >= sales_start`;
  - price numeric(14,0) not null with check `> 0`; duration text; topics text[] not null
    default '{}'; starts_on date; group_link text; is_active bool default true;
  - installment_allowed bool default false; installment_parts int; installment_first_min
    numeric(14,0); link_after text default 'birinchi_qism' with check in
    (`birinchi_qism`, `toliq`);
  - created_at, updated_at, deleted_at.
- `course_knowledge`:
  - id; course_id fk on delete cascade; kind text with check;
  - title text not null; body text not null; sort_order int; is_enabled bool default true;
  - updated_at.
- `clients` ga qo'shiladi: `source text not null default 'qolda'` with check (4 qiymat),
  `source_group text`, `source_comment text`.
- `purchases`:
  - id; client_id fk; course_id fk null; stage text not null default 'yangi' with check
    (8 qiymat); stage_changed_at;
  - total_amount numeric(14,0); paid_amount numeric(14,0) not null default 0;
  - installment bool default false; link_sent_at timestamptz; reminded_stages text[] not
    null default '{}'; created_at, updated_at.
  - Partial unique index: bitta mijozda bitta faol xarid,
    `ON purchases(client_id) WHERE stage NOT IN ('toladi','rad_etdi')`.
- `roles` ga ruxsatlar: `courses.view` va `courses.edit` admin hamda operatorga.

**Interfaces — Produces:**

```ts
interface ICourseRepository {
  list(): Promise<Course[]>; findById(id: string): Promise<Course | null>;
  create(data: NewCourse): Promise<Course>; update(id: string, patch: Partial<NewCourse>): Promise<Course>; remove(id: string): Promise<void>;
  listKnowledge(courseId: string): Promise<CourseKnowledge[]>;
  addKnowledge(courseId: string, data: NewKnowledge): Promise<CourseKnowledge>;
  updateKnowledge(id: string, patch: Partial<NewKnowledge>): Promise<CourseKnowledge>; removeKnowledge(id: string): Promise<void>;
}
interface IPurchaseRepository {
  findActiveByClient(clientId: string): Promise<Purchase | null>;
  findLatestByClient(clientId: string): Promise<Purchase | null>;
  create(data: { clientId: string; courseId: string | null; totalAmount: number | null }): Promise<Purchase>;
  setStage(id: string, stage: XaridBosqichi): Promise<Purchase>;
  setCourse(id: string, courseId: string, totalAmount: number): Promise<Purchase>;
  setInstallment(id: string, installment: boolean): Promise<void>;
  addPaid(id: string, amount: number): Promise<Purchase>;
  markLinkSent(id: string, at: Date): Promise<boolean>;            // faqat link_sent_at null bo'lsa true
  addRemindedStage(id: string, stage: XaridBosqichi): Promise<void>;
  countByStage(): Promise<Record<XaridBosqichi, number>>;
}
// application/services/XaridXizmati.ts
class XaridXizmati {
  constructor(purchases: IPurchaseRepository, courses: ICourseRepository, events: IEventBus, audit: IAuditRepository, clock: IClock);
  faolXarid(clientId: string): Promise<Purchase>;                  // yo'q bo'lsa 'yangi' xarid ochadi
  bosqich(clientId: string, requested: XaridBosqichi, actor: BosqichAktori, by?: string): Promise<Purchase | null>; // bosqichOtishi orqali
  kursBelgila(clientId: string, courseId: string): Promise<Purchase>; // totalAmount = course.price, faqat hali karta yuborilmagan bo'lsa
}
```

`XaridXizmati.bosqich` har bir o'zgarishni `audit` ga `purchase.stage` sifatida yozadi va
`client.updated` hodisasini chiqaradi. Hodisa nomi mavjud socket naqshidan olinadi.

**Routes:**
- `/courses`:
  - `GET /` (`courses.view`)
  - `POST /`, `PATCH /:id`, `DELETE /:id` (`courses.edit`; zod: `salesEnd >= salesStart`,
    `price > 0`)
  - `GET|POST /:id/knowledge`, `PATCH|DELETE /knowledge/:kid`
- `/clients` ga qo'shiladi:
  - query filtrlari `stage`, `source`, `courseId`;
  - har bir mijozga `purchase` (faol yoki oxirgi) qo'shib qaytariladi;
  - `PATCH /clients/:id/stage` `{stage}` (`clients.edit` yoki mavjud ekvivalenti),
    `actor='menejer'`;
  - eksportga ustunlar: Manba, Bosqich, Kurs, To'langan.

**Web:**
- `KurslarPage`: chapda kurslar ro'yxati, unda nomi, davr va "Sotuvda" belgisi bor. O'ngda
  kurs formasi va ma'lumotlar bazasi yozuvlari ro'yxati (qo'shish, tahrirlash, o'chirish,
  turi bo'yicha guruhlab). Joylashuvi AgentPage qoidalari uslubida.
- Nav: `{ to: '/kurslar', label: 'Kurslar', permission: 'courses.view' }`.
- `ClientsPage`: Bosqich, Manba va Kurs filtrlari; bosqich ustuni (rangli belgi) va manba
  ustuni.

- [ ] **Step 1:** Migratsiyani yozing. `npm run migrate --workspace=server` xatosiz o'tsin.
- [ ] **Step 2:** Repozitoriylar, mapperlar, `XaridXizmati` va route'larni yozing,
  containerga ulang.
- [ ] **Step 3:** Web sahifalarini yozing.
- [ ] **Step 4: Tekshiring**

Run: `npm run typecheck && bash scripts/run-tests.sh`, keyin `npm run dev`.
Expected:
- Kurslar sahifasida kurs yaratiladi, tahrirlanadi va unga ma'lumot yozuvi qo'shiladi;
- `salesEnd < salesStart` bo'lsa 400 qaytadi;
- Mijozlar sahifasida filtrlar ishlaydi.

- [ ] **Step 5: Commit** — `git commit -am "Kurslar va xaridlar: baza, API, sahifalar"`

### Task 7: Karta xabari (sof mantiq va servis)

**Files:**
- Create: `S/domain/services/karta.ts`, `S/domain/services/karta.spec.ts`.
- Create: `S/application/services/KartaYuboruvchi.ts`.
- Modify:
  - `RuntimeSettings.ts`: `paymentCards` va `kompaniyaNomi`
  - `settingsRoutes.ts` (zod)
  - `W/lib/types.ts`
  - `SettingsPage.tsx`: yangi `function KartalarPanel()` va saqlash ro'yxati

**Interfaces — Produces:**

```ts
// karta.ts
export interface PaymentCard { id: string; number: string; holder: string; bank: string; active: boolean }
export function tanlanganKarta(cards: PaymentCard[]): PaymentCard | null;          // birinchi active
export function kartaSummasi(course: Course, purchase: Purchase): number | null;
//  installment=false → purchase.totalAmount; installment=true va paidAmount=0 → course.installmentFirstMin;
//  installment=true va paidAmount>0 → null (qolgan summani agent aytadi)
export type KartaTayyorligi = { ok: true; card: PaymentCard; amount: number | null } | { ok: false; reason: 'kurs_yoq' | 'karta_yoq' | 'bolib_tolash_yoq' };
export function kartaTayyorligi(i: { cards: PaymentCard[]; course: Course | null; purchase: Purchase }): KartaTayyorligi;
export function kartaXabari(card: PaymentCard, amount: number | null): string;
// application/services/KartaYuboruvchi.ts
class KartaYuboruvchi {
  constructor(settings: RuntimeSettings, courses: ICourseRepository, xarid: XaridXizmati, conversations: IConversationRepository, dispatcher: MessageDispatcher, audit: IAuditRepository, events: IEventBus);
  yubor(conversationId: string, clientId: string): Promise<{ sent: boolean; reason?: string }>;
}
```

`kartaXabari` ning aniq matni. Summa `null` bo'lsa "Summa" qatori chiqmaydi. Raqam
bo'shliqlarsiz saqlanadi va 4 tadan guruhlanadi, summa minglik bo'shliq bilan yoziladi.

```
To'lov uchun karta:
8600 1234 5678 9012
Egasi: ALIYEV ALI
Bank: Kapitalbank
Summa: 1 500 000 so'm
```

`KartaYuboruvchi.yubor` qanday ishlaydi:
- `kartaTayyorligi` `ok: false` bo'lsa, suhbat menejerga o'tadi:
  `conversations.update(id, { needsHuman: true, humanReason: <sabab matni> })`.
  Sabab matnlari:
  - `kurs_yoq` → "Karta yuborib bo'lmadi: mijozning kursi aniqlanmagan"
  - `karta_yoq` → "Karta yuborib bo'lmadi: Sozlamalarda faol karta yo'q"
  - `bolib_tolash_yoq` → "Karta yuborib bo'lmadi: bu kursda bo'lib to'lash yo'q"
- `ok: true` bo'lsa xabar `dispatcher.send({ conversation, body: kartaXabari(...), author: 'agent', meta: { kind: 'karta' } })`
  bilan yuboriladi, keyin `xarid.bosqich(clientId, 'karta_yuborildi', 'tizim')` chaqiriladi.

- [ ] **Step 1: Yiqiladigan test** — `karta.spec.ts`

```ts
check('birinchi faol', tanlanganKarta([{ ...K1, active: false }, K2, K3])?.id, K2.id);
check('faol yo\'q', tanlanganKarta([{ ...K1, active: false }]), null);
check('to\'liq — xariddagi summa, kurs narxi emas', kartaSummasi({ ...COURSE, price: 2_000_000 }, { ...P, totalAmount: 1_500_000 }), 1_500_000);
check('birinchi qism', kartaSummasi(COURSE_BT, { ...P, installment: true, paidAmount: 0 }), 500_000);
check('keyingi qism', kartaSummasi(COURSE_BT, { ...P, installment: true, paidAmount: 500_000 }), null);
check('kurs yo\'q', kartaTayyorligi({ cards: [K2], course: null, purchase: P }), { ok: false, reason: 'kurs_yoq' });
check('karta yo\'q', kartaTayyorligi({ cards: [], course: COURSE, purchase: P }), { ok: false, reason: 'karta_yoq' });
check('bo\'lib to\'lash ruxsat emas', kartaTayyorligi({ cards: [K2], course: COURSE, purchase: { ...P, installment: true } }), { ok: false, reason: 'bolib_tolash_yoq' });
check('matn', kartaXabari({ id: 'a', number: '8600123456789012', holder: 'ALIYEV ALI', bank: 'Kapitalbank', active: true }, 1_500_000),
  "To'lov uchun karta:\n8600 1234 5678 9012\nEgasi: ALIYEV ALI\nBank: Kapitalbank\nSumma: 1 500 000 so'm");
check('summasiz', kartaXabari(K2, null).includes('Summa'), false);
```

- [ ] **Step 2:** Run: `npm run test:karta --workspace=server`. Expected: FAIL.
- [ ] **Step 3:** `karta.ts` va `KartaYuboruvchi` ni yozing. Sozlamalarga kalitlar
  qo'shing:
  - `paymentCards: PaymentCard[]`, standart `[]`, zod raqami `^\d{16}$`;
  - `kompaniyaNomi: string`, standart `'LolaSales'`.

  `KartalarPanel` da kartalarni qo'shish, tahrirlash, o'chirish va faol belgisini bosish
  mumkin. Raqam ro'yxatda faqat oxirgi 4 ta raqam bilan ko'rsatiladi.
- [ ] **Step 4:** Run: `npm run typecheck && bash scripts/run-tests.sh`. Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "To'lov kartalari va karta xabari"`

---

## C. Agent

### Task 8: Agent yadrosi — kontekst, prompt, javob sxemasi, AgentRunner

Bu eng katta vazifa. Agentning debt kontekstini sotuv konteksti bilan almashtiradi.
`AgentRunner` va undan foydalanuvchilar bir commitda o'zgaradi, aks holda typecheck buziladi.

**Files:**
- Modify: `S/domain/services/IAgentEngine.ts`.
- Rewrite:
  - `S/infrastructure/ai/prompt/systemPrompt.ts`
  - `S/infrastructure/ai/prompt/userPrompt.ts`
  - `S/infrastructure/ai/agentOutput.ts`
- Modify: `ClaudeAgentEngine.ts`, `OpenAiAgentEngine.ts` — faqat metodlar ro'yxati.
- Rewrite: `S/application/services/AgentRunner.ts`.
- Create:
  - `S/infrastructure/ai/prompt/salesContext.spec.ts`
  - `S/infrastructure/ai/agentOutputSales.spec.ts`
- Delete:
  - `PromiseWatcher.ts`, `JavobYonaltiruvchi` dagi qarz tarmoqlari
  - `EscalationPolicy` va bosim richaglari
  - `vadaKorinishi`, `recordPromise`, `watchPaymentClaim`, `syncStage`
  - va'da, sukut va CRM bilan bog'liq spec'lar (ro'yxatdan ham)
- Temporarily:
  - `SilenceWatcher` containerdan olinadi (10-vazifada qaytadi).
  - `PaymentCheckService.receiptThanks` yangi `receiptConfirmedThanks` imzosiga moslanadi
    (9-vazifada qayta yoziladi).

**Interfaces — Produces:**

```ts
// IAgentEngine.ts
export interface AgentSalesContext {
  clientName: string; clientFirstName: string | null; interlocutor?: Interlocutor | null;
  source: 'reklama' | 'guruh' | 'raqam' | 'qolda'; sourceGroup: string | null; sourceComment: string | null;
  purchase: { stage: XaridBosqichi; courseId: string | null; totalAmount: number | null; paidAmount: number; installment: boolean } | null;
  coursesOnSale: Array<{ course: Course; knowledge: CourseKnowledge[] }>;
  nextCourse: Course | null;                     // faqat coursesOnSale bo'sh bo'lsa
  boughtCourses: string[];                       // oldin to'liq to'lagan kurs nomlari
}
export type TurnMode = 'first' | 'reply' | 'nudge' | 'operator' | 'receipt_confirmed' | 'receipt_rejected';
export interface AgentTurnInput {
  conversationId: string; clientId: string; knowledge: AgentKnowledgeBlocks; context: AgentSalesContext;
  history: HistoryItem[]; incoming: string | null; sessionId: string | null; signal?: AbortSignal;
  operatorInstruction?: string | null; receiptPending: boolean; receiptReview?: 'new' | 'acknowledged' | null;
  receiptConfirmed?: { paidAmount: number; totalAmount: number; remaining: number; linkWillBeSent: boolean } | null;
  receiptRejected?: { reason: string } | null; nudgeStage?: XaridBosqichi | null;
}
export interface AgentTurnOutput {
  reply: string | null; replySecond: string | null; sessionId: string | null;
  stage: XaridBosqichi | null; courseId: string | null; sendCard: boolean; installment: boolean;
  escalate: { reason: string } | null; internalNote: string | null;
  lesson: AgentLessonCapture | null; clientMemory: AgentClientMemoryCapture | null;
  interlocutor?: Interlocutor | null; usage?: AgentUsage;
}
export interface IAgentEngine {
  composeFirstContact(i: Omit<AgentTurnInput, 'incoming'>): Promise<AgentTurnOutput>;
  respond(i: AgentTurnInput): Promise<AgentTurnOutput>;
  composeNudge(i: Omit<AgentTurnInput, 'incoming'>): Promise<AgentTurnOutput>;
  composeOperatorTurn(i: Omit<AgentTurnInput, 'incoming'>): Promise<AgentTurnOutput>;
  composeReceiptConfirmed(i: Omit<AgentTurnInput, 'incoming'>): Promise<AgentTurnOutput>;
  composeReceiptRejected(i: Omit<AgentTurnInput, 'incoming'>): Promise<AgentTurnOutput>;
}
// systemPrompt.ts
export const DEFAULT_PERSONA: PromptPersona = { name: 'Lola', role: 'sotuv menejeri' };
export function buildSystemPrompt(persona: PromptPersona, companyName: string, knowledge: AgentKnowledgeBlocks): string;
export function buildContextBlock(context: AgentSalesContext, now: Date, timeZone: string): string;
export const AGENT_OUTPUT_SCHEMA: Record<string, unknown>;
// AgentRunner
class AgentRunner {
  constructor(engines: AgentEngineFactory, clients: IClientRepository, conversations: IConversationRepository, messages: IMessageRepository,
    dispatcher: MessageDispatcher, settings: RuntimeSettings, audit: IAuditRepository, events: IEventBus, clock: IClock, prompt: PromptComposer,
    lessons: ILessonRepository, profiles: IClientProfileRepository, accounts: ITelegramAccountRepository, accountLabels: AccountLabels,
    paymentChecks: IPaymentCheckRepository, usageLog: IAgentUsageRepository, courses: ICourseRepository, xarid: XaridXizmati, karta: KartaYuboruvchi);
  abort(conversationId: string, reason?: AbortReason): number;
  firstContact(conversationId: string, external?: AbortSignal): Promise<AgentTurnResult>;
  reply(conversationId: string, incoming: string): Promise<AgentTurnResult>;
  nudge(conversationId: string, stage: XaridBosqichi): Promise<AgentTurnResult>;
  operatorTurn(conversationId: string): Promise<AgentTurnResult>;
  receiptConfirmedThanks(conversationId: string, c: NonNullable<AgentTurnInput['receiptConfirmed']>): Promise<AgentTurnResult>;
  receiptRejected(conversationId: string, reason: string): Promise<AgentTurnResult>;
  buildContext(clientId: string): Promise<AgentSalesContext>;
}
export interface AgentTurnResult { sent: boolean; reply: string | null; escalated: boolean; cardSent: boolean }
```

`AGENT_OUTPUT_SCHEMA` (strict, hamma maydon `required`):
- `reply`, `replySecond`: string|null
- `stage`: enum `['suhbatda','qiziqdi','rad_etdi', null]`
- `courseId`: string|null
- `sendCard`: boolean
- `installment`: boolean
- `escalate`, `note`: string|null
- `lesson`: `{lesson, evidence|null}|null`
- `clientMemory`: `{clientType: enum['tez_qaror','oylaydigan','narxga_sezgir','shubhali',null], summary, whatWorks}|null`
- `interlocutor`: Debitordagidek

Bu maydonlar `buildOutputSpec()` matnida ham, `RawAgentOutput`/`toTurnOutput` da ham bir xil
bo'lishi kerak.

`buildSystemPrompt` bo'limlari tartibi:
1. Shaxs: "Siz {ism}siz, {companyName} kompaniyasining {persona.role}. Vazifangiz — sotuvdagi
   kursni mijozga mos bo'lsa sotish: avval savol berib ehtiyojni bilib olasiz, keyin taklif
   qilasiz, e'tirozlarga javob berasiz va to'lovga olib borasiz."
2. Misollarni qanday o'qish.
3. `knowledge.rules`.
4. Sotuv bosqichlari bloki: tanishuv → ehtiyoj → taqdimot → e'tiroz → yopish → to'lov → chek.
5. Qat'iy taqiqlar:
   - narx, sana, karta va havolani o'ylab topmaslik;
   - karta raqamini yozmaslik (`sendCard` bilan so'rash);
   - to'lov qabul qilindi demaslik;
   - bazada yo'q savolga `escalate` qaytarish.
6. `knowledge.lessons`.
7. `knowledge.clientMemory`.
8. Til va alifbo, ohang (Debitordan).
9. `buildOutputSpec()`.

`buildContextBlock` mazmuni:
- Bugungi sana.
- "## MIJOZ": ism, manba. Manba `guruh` bo'lsa: "Kanal: {sourceGroup}. Mijoz komment
  yozgan: «{sourceComment}»".
- Bosqich yorlig'i, qiziqqan kurs, to'langan va qolgan summa.
- "## SOTUVDAGI KURSLAR": har bir kurs uchun id, nomi, narx, davomiylik, boshlanish,
  mavzular, bo'lib to'lash shartlari (yoki "bo'lib to'lash yo'q"), keyin ma'lumotlar bazasi
  turi bo'yicha guruhlab.
- Sotuvda kurs bo'lmasa: "Hozir sotuvda kurs yo'q", keyingi kurs nomi va sotuv boshlanish
  sanasi. Keyingi kurs ham bo'lmasa: "tez orada xabar beramiz".

`first` rejimining vazifa matni manbaga qarab farq qiladi:
- `guruh`: kommentga tayanadi;
- `raqam`: o'zini tanishtirib, kurs haqida qisqa so'raydi;
- `reklama`: bu rejim ishlatilmaydi, chunki mijoz o'zi yozgan.

`AgentRunner.apply()` tartibi:
1. Javob yuboriladi (Debitordagidek: `reply`, 2–4 s pauza, keyin `replySecond`).
2. `courseId` faqat `coursesOnSale` ichida bo'lsa → `xarid.kursBelgila`.
3. `installment` → `purchases.setInstallment`.
4. `stage` → `xarid.bosqich(..., 'agent')`.
5. `sendCard` → `karta.yubor`. Natija `cardSent` ga yoziladi.
6. `escalate` → `needsHuman`.
7. `lesson`, `clientMemory`, `interlocutor` → Debitordagi `captureMemory`.

- [ ] **Step 1: Yiqiladigan testlar**

`salesContext.spec.ts` — `buildContextBlock` uchun:

```ts
const blok = buildContextBlock(CTX_GURUH, new Date('2026-11-05T09:00:00Z'), 'Asia/Tashkent');
check('komment ko\'rinadi', blok.includes('«menga xabar bering»'), true);
check('narx formatlangan', blok.includes("1 500 000 so'm"), true);
check('karta raqami yo\'q', /\d{4} \d{4} \d{4} \d{4}/.test(blok), false);
check('kurs yo\'q bloki', buildContextBlock({ ...CTX_GURUH, coursesOnSale: [], nextCourse: DEK }, NOW, TZ).includes('Hozir sotuvda kurs yo\'q'), true);
check('bo\'lib to\'lash yo\'q yozilgan', blok.includes("bo'lib to'lash yo'q"), true);
```

`agentOutputSales.spec.ts` — `parseAgentOutput` va `toTurnOutput` uchun:

```ts
check('sendCard', toTurnOutput(parseAgentOutput({ ...MIN, sendCard: true }, ''), null, undefined).sendCard, true);
check('noma\'lum stage tashlanadi', toTurnOutput(parseAgentOutput({ ...MIN, stage: 'toladi' }, ''), null, undefined).stage, null);
check('fallback matn', toTurnOutput(parseAgentOutput(null, 'salom'), null, undefined).reply, 'salom');
check('sxemada promise yo\'q', 'promise' in (AGENT_OUTPUT_SCHEMA as any).properties, false);
```

- [ ] **Step 2:** Run: `npm run test:sales-context --workspace=server && npm run test:agent-output-sales --workspace=server`. Expected: FAIL.
- [ ] **Step 3:** Interfeyslar, promptlar va `AgentRunner` ni yozing. Eskirgan
  chaqiruvchilarni yuqoridagi ro'yxat bo'yicha o'chiring yoki moslang. `conversations.state`
  va `stage` ustunlari bazada qoladi, lekin agent ularni o'zgartirmaydi; ular 14-vazifada
  o'chiriladi.
- [ ] **Step 4: Tekshiring**

Run: `npm run typecheck && bash scripts/run-tests.sh`
Expected: PASS

Run: `npm run try-agent --workspace=server`. CLI'ni yangi kontekstga moslang: sotuvdagi bir
kurs bo'lgan fiks kontekst ishlatilsin.
Expected: agent o'zbekcha sotuvchi javobini beradi va JSON sxemaga mos chiqaradi.

- [ ] **Step 5: Commit** — `git commit -am "Agent yadrosi sotuvga o'tkazildi"`

### Task 9: Standart sotuv qoidalari

**Files:**
- Rewrite:
  - `S/infrastructure/ai/prompt/knowledgeBase.ts`
  - `S/infrastructure/ai/prompt/seedDefaultRules.ts` (`SECTIONS`, `EXAMPLE_SECTIONS`)
  - `defaultRulesText.ts`
- Create: `S/infrastructure/ai/prompt/sotuvQoidalari.spec.ts`.

**Interfaces:** `syncRuleSections` va `resetSection` imzolari o'zgarmaydi.

Bo'limlar:

| Kalit | Turi | Manba |
|---|---|---|
| `real_team_style` | bullets | Debitordan |
| `human_tone` | bullets | Debitordan |
| `style` | bullets | Debitordan |
| `anti_repetition` | bullets | Debitordan |
| `channel_rules` | bullets | Debitordan |
| `media` | bullets | Debitordan |
| `stop_signals` | bullets | Debitordan |
| `salomlashish` | bullets | yangi |
| `ehtiyojni_aniqlash` | bullets | yangi |
| `kursni_taqdim_etish` | bullets | yangi |
| `narx_va_tolov` | bullets | yangi |
| `yopish` | bullets | yangi |
| `chek` | bullets | yangi |
| `prohibitions` | bullets | sotuvga moslangan |
| `first_messages` | bullets | manba bo'yicha, yangi |
| `etirozlar` | examples | yangi |
| `dialog_misollari` | examples | yangi |
| `tone_examples` | examples | Debitordan, qarz so'zlari almashtirilgan |

Har bir yangi bo'limda kamida 5 ta qoida yoki 4 ta misol bo'lsin. `etirozlar` bo'limida
kamida quyidagi e'tirozlar bo'lsin: "qimmat", "o'ylab ko'raman", "vaqtim yo'q", "foydasi
bo'ladimi", "keyinroq", "boshqa joyda arzon".

Ruh: samimiy, qisqa, odamdek, bosimsiz; avval savol beradi, keyin taklif qiladi.

- [ ] **Step 1: Yiqiladigan test** — `sotuvQoidalari.spec.ts`

```ts
const t = defaultRulesText();
for (const soz of ['qarz', 'kechik', 'undir', 'shartnoma', 'talabnoma', "va'da"]) check(`"${soz}" yo'q`, t.toLowerCase().includes(soz), false);
check('etirozlar bo\'limi', t.includes('## ') && /qimmat/i.test(t), true);
check('karta raqami misoli yo\'q', /\d{4} ?\d{4} ?\d{4} ?\d{4}/.test(t), false);
```

- [ ] **Step 2:** Run: `npm run test:sotuv-qoidalari --workspace=server`. Expected: FAIL.
- [ ] **Step 3:** Qoidalarni yozing.
- [ ] **Step 4: Tekshiring**

Run: `npm run typecheck && bash scripts/run-tests.sh`. Keyin bo'sh bazada server ishga
tushiriladi va Agent sahifasida "Prompt ko'rinishi" ochiladi.
Expected: yangi bo'limlar ko'rinadi.

- [ ] **Step 5: Commit** — `git commit -am "Standart sotuv qoidalari"`

---

## D. To'lov oqimi

### Task 10: Chek: ochish, tasdiqlash, rad etish va havola

**Files:**
- Create: `server/migrations/003_chek_xaridga.sql`.
  - `payment_checks` ga qo'shiladi: `purchase_id uuid fk`, `confirmed_amount numeric(14,0)`,
    `rejected_reason text`.
  - `status` check'iga `rejected` qo'shiladi.
- Create: `S/domain/services/havola.ts`, `S/domain/services/havola.spec.ts`.
- Rewrite: `S/application/services/PaymentCheckService.ts`.
  - Faqat `receipt_review` qoladi.
  - `crm_watch`, `tick` va `checkNow` o'chiriladi.
- Modify:
  - `HandleIncomingMessageUseCase.ts` (L231–265): chek kelganda
    `xarid.bosqich(clientId, 'chek_keldi', 'tizim')`.
  - `IPaymentCheckRepository` va `PgPaymentCheckRepository`: `reject(id, actor, reason, at)`,
    `confirmByOperator(id, actor, amount, at)`.
- Modify: `conversationRoutes.ts`.
  - `POST /:id/receipt-confirm` endi body `{ amount: number }` oladi (zod, `> 0`).
  - Yangi `POST /:id/receipt-reject` route, body `{ reason: string }` (1–300 belgi),
    ruxsat `receipts.confirm`.
  - `POST /:id/check-payment` o'chiriladi.
- Modify:
  - `Permission.ts`: `receipts.confirm`; migratsiyada admin va operatorga beriladi.
  - `W/components/ReceiptConfirmButton.tsx`: summa maydoni (standart — kutilgan summa) va
    "Rad etish" tugmasi (sabab so'raladi).
  - `W/pages/ChatPage.tsx`: "Chek keldi" filtri.
- Delete: `W/components/CheckPaymentButton.tsx`.

**Interfaces — Produces:**

```ts
// havola.ts
export function havolaYuborilsinmi(i: { linkAfter: LinkAfter; linkSentAt: Date | null; paid: number; total: number; groupLink: string | null }): boolean;
export function havolaXabari(link: string): string;
// PaymentCheckService
type ReceiptConfirmOutcome = { kind: 'confirmed'; stage: XaridBosqichi; linkSent: boolean } | { kind: 'no_review' } | { kind: 'not_sent'; reason: 'kill_switch' | 'agent_disabled' | 'agent_error' };
openReceiptReview(conversationId: string, clientId: string, messageId: string | null, source: ReceiptSource): Promise<PaymentCheck>;
confirmReceipt(conversationId: string, actor: string, amount: number): Promise<ReceiptConfirmOutcome>;
rejectReceipt(conversationId: string, actor: string, reason: string): Promise<{ kind: 'rejected' } | { kind: 'no_review' }>;
```

`havolaXabari` ning aniq matni:

```
Yopiq guruhga havola: {link}
Qo'shilish so'rovini yuboring, tez orada qabul qilamiz.
```

**`confirmReceipt` tartibi:**
1. `checks.confirmByOperator`. U `false` qaytarsa → `no_review`.
2. `purchases.addPaid(amount)`.
3. `xarid.bosqich(clientId, tolovdanKeyingiBosqich(paid, total), 'tizim')`.
4. `needsHuman` tozalanadi.
5. `agent.receiptConfirmedThanks(...)` chaqiriladi, `remaining = max(0, total - paid)`.
6. `havolaYuborilsinmi` `true` bo'lsa va `purchases.markLinkSent` `true` qaytarsa,
   `dispatcher.send(havolaXabari(course.groupLink), meta: { kind: 'havola' })`.
7. Audit: `receipt_review.confirmed`, summa bilan.

**`rejectReceipt` tartibi:**
1. `checks.reject`.
2. `xarid.bosqich(clientId, 'karta_yuborildi', 'tizim')`.
3. `purchases.addRemindedStage(id, 'karta_yuborildi')` (spec 6.6).
4. `needsHuman` tozalanadi.
5. `agent.receiptRejected(conversationId, reason)`.
6. Audit: `receipt_review.rejected`.

- [ ] **Step 1: Yiqiladigan test** — `havola.spec.ts`

```ts
const B = { linkAfter: 'birinchi_qism' as const, linkSentAt: null, total: 1_500_000, groupLink: 'https://t.me/+abc' };
check('birinchi qismdan keyin', havolaYuborilsinmi({ ...B, paid: 500_000 }), true);
check('toliq qoidasi, qisman', havolaYuborilsinmi({ ...B, linkAfter: 'toliq', paid: 500_000 }), false);
check('toliq qoidasi, to\'liq', havolaYuborilsinmi({ ...B, linkAfter: 'toliq', paid: 1_500_000 }), true);
check('ikkinchi marta yo\'q', havolaYuborilsinmi({ ...B, paid: 1_500_000, linkSentAt: new Date() }), false);
check('havola kiritilmagan', havolaYuborilsinmi({ ...B, paid: 1_500_000, groupLink: null }), false);
check('nol to\'lov', havolaYuborilsinmi({ ...B, paid: 0 }), false);
check('matn', havolaXabari('https://t.me/+abc'), "Yopiq guruhga havola: https://t.me/+abc\nQo'shilish so'rovini yuboring, tez orada qabul qilamiz.");
```

Havola kiritilmagan bo'lsa (`groupLink === null`), xabar yuborilmaydi. Buning o'rniga suhbat
menejerga o'tadi: `humanReason = "Kursga guruh havolasi kiritilmagan"`. Bu `confirmReceipt`
ning 6-qadamida bajariladi.

- [ ] **Step 2:** Run: `npm run test:havola --workspace=server`. Expected: FAIL.
- [ ] **Step 3:** Migratsiya, servis, route'lar va web qismini yozing. Debitordagi
  `chekTasdiqi`, `chekPoygasi` va `chekTakroriyRahmat` spec'larini yangi imzoga moslang.
  `crm_watch` ga tegishlilarini o'chiring.
- [ ] **Step 4: Tekshiring**

Run: `npm run typecheck && bash scripts/run-tests.sh`
Expected: PASS

Qo'lda tekshiruv (`npm run dev` va sinov akkaunti, bo'lib to'lashli kurs):
1. Sinov mijozi rasm yuboradi → mijoz kartasida chek va tugmalar chiqadi.
2. 500 000 bilan "Tasdiqlash" → bosqich "Qisman to'ladi", mijozga rahmat va havola keladi.
3. Ikkinchi chek → yana tasdiqlash → bosqich "To'ladi", havola qayta kelmaydi.

- [ ] **Step 5: Commit** — `git commit -am "Chek oqimi xaridga bog'landi, rad etish va havola"`

### Task 11: Eslatma (follow-up)

**Files:**
- Create: `S/domain/services/eslatma.ts`, `S/domain/services/eslatma.spec.ts`.
- Create: `S/application/services/EslatmaKuzatuvchi.ts`. U `SilenceWatcher.ts` ning o'rniga
  keladi; eski fayl va uning spec'lari o'chiriladi.
- Modify:
  - `IConversationRepository` / `PgConversationRepository`:
    `findEslatmaNomzodlari(limit: number): Promise<Array<{ conversationId: string; clientId: string; purchaseId: string; stage: XaridBosqichi; remindedStages: XaridBosqichi[]; lastOutboundAt: Date; lastInboundAt: Date | null }>>`.
    Shartlar:
    - faol xarid bosqichi `qiziqdi` yoki `karta_yuborildi`;
    - `agent_enabled` yoqilgan, `needs_human` emas, o'chirilmagan;
    - telegram status blocked yoki deactivated emas;
    - ochiq chek yo'q.
  - `RuntimeSettings`: `eslatmaYoqilgan: boolean` (standart `true`) va `eslatmaSoat: number`
    (standart `24`, zod 1–168). Debitordagi `silenceNudge*` kalitlari o'chiriladi.
  - `SettingsPage`: "Eslatma" bo'limi.
  - `container.ts`, `main.ts`: kuzatuvchi ishga tushiriladi.

**Interfaces — Produces:**

```ts
export function eslatmaKerakmi(i: { stage: XaridBosqichi; remindedStages: XaridBosqichi[]; lastOutboundAt: Date | null; lastInboundAt: Date | null }, now: Date, soat: number): boolean;
class EslatmaKuzatuvchi { constructor(conversations, agent: AgentRunner, xarid: XaridXizmati, purchases: IPurchaseRepository, settings: RuntimeSettings, audit, clock); start(): void; stop(): Promise<void>; tekshir(): Promise<number> }
```

`eslatmaKerakmi` quyidagilarning hammasi bajarilganda `true` qaytaradi:
- bosqich `qiziqdi` yoki `karta_yuborildi`;
- bu bosqich `remindedStages` da yo'q;
- `lastOutboundAt` bor;
- `lastInboundAt` yo'q yoki `lastOutboundAt` dan oldin;
- `now - lastOutboundAt >= soat`.

`tekshir()` tartibi:
1. Kill switch yoki `!eslatmaYoqilgan` bo'lsa → 0.
2. Yuborish oynasi `evaluateWindow` bo'yicha tekshiriladi (`holidays: []`).
3. Har bir nomzod uchun: `eslatmaKerakmi`, keyin `addRemindedStage` (avval), keyin
   `agent.nudge(conversationId, stage)`.
4. Interval 15 daqiqa, partiya 20 ta, nomzodlar orasida `minDelaySec..maxDelaySec` pauza.

- [ ] **Step 1: Yiqiladigan test** — `eslatma.spec.ts`

```ts
const T0 = new Date('2026-11-05T06:00:00Z'), H = (h: number) => new Date(T0.getTime() + h * 3600_000);
const B = { stage: 'qiziqdi' as const, remindedStages: [], lastOutboundAt: T0, lastInboundAt: null };
check('24 soat o\'tdi', eslatmaKerakmi(B, H(24), 24), true);
check('erta', eslatmaKerakmi(B, H(23), 24), false);
check('mijoz javob bergan', eslatmaKerakmi({ ...B, lastInboundAt: H(1) }, H(30), 24), false);
check('shu bosqichda yozilgan', eslatmaKerakmi({ ...B, remindedStages: ['qiziqdi'] }, H(48), 24), false);
check('keyingi bosqichda yana bir marta', eslatmaKerakmi({ ...B, stage: 'karta_yuborildi', remindedStages: ['qiziqdi'] }, H(48), 24), true);
check('rad etilgandan keyin yo\'q', eslatmaKerakmi({ ...B, stage: 'karta_yuborildi', remindedStages: ['qiziqdi', 'karta_yuborildi'] }, H(48), 24), false);
check('suhbatda bosqichida yo\'q', eslatmaKerakmi({ ...B, stage: 'suhbatda' }, H(48), 24), false);
```

- [ ] **Step 2:** Run: `npm run test:eslatma --workspace=server`. Expected: FAIL.
- [ ] **Step 3:** Funksiya, kuzatuvchi, repozitoriy so'rovi va sozlamalarni yozing.
- [ ] **Step 4:** Run: `npm run typecheck && bash scripts/run-tests.sh`. Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "Bir bosqichga bitta eslatma"`

---

## E. Mijoz manbalari

### Task 12: Kiruvchi (reklama) va raqam importi

**Files:**
- Delete:
  - `NomalumMijozOchuvchi.ts`, `NomalumMijozAgenti.ts`, `NomalumHujjatQabul.ts` va ularning
    spec'lari
  - `W/components/NomalumPanel.tsx`
  - `sotuvRaqami` va `nomalumAgent` sozlamalari
- Create: `S/application/services/MijozYaratuvchi.ts`.
- Modify: `HandleIncomingMessageUseCase.ts`.
  - L94–116: noma'lum yozuvchi uchun `mijozYaratuvchi.reklamadan(incoming)` chaqiriladi.
  - `nomalumSuhbati` va eskirgan xabar tarmog'i o'chiriladi.
- Create:
  - `S/infrastructure/import/leadColumns.ts`
  - `S/infrastructure/import/leadColumns.spec.ts`
  - `S/application/usecases/import/ImportLeadsUseCase.ts`
- Modify:
  - `XlsxDebtorParser.ts` → `XlsxLeadParser.ts` nomi bilan: `parseLeads(buffer, filename): Promise<ParsedLeadFile>`.
    Debitor ustunlari va `parseDebtors` o'chiriladi.
  - `importRoutes.ts`: `POST /import/leads`.
  - `W/pages/ImportPage.tsx`: bitta "Mijozlar ro'yxati" yuklash bloki.
- Modify kampaniyalar:
  - `CreateCampaignUseCase.ts` va `CampaignsPage.tsx`: filtrlar `stage[]`, `source[]`,
    `courseId`, `onlyWithoutConversation`.
  - Debitordagi qarz filtrlari (kechikish, summa, obyekt) o'chiriladi.
  - `OutreachScheduler` `AgentRunner.firstContact` ni chaqirishda davom etadi.

**Interfaces — Produces:**

```ts
class MijozYaratuvchi {
  constructor(clients: IClientRepository, xarid: XaridXizmati, events: IEventBus);
  reklamadan(incoming: IncomingMessage): Promise<Client>;      // source='reklama', telegram identity 'found', faol xarid 'yangi'
  guruhdan(i: { accountId: string; peer: ResolvedPeer; fullName: string; sourceGroup: string; sourceComment: string }): Promise<{ client: Client; created: boolean }>;
  raqamdan(i: { fullName: string; phone: string; courseId: string | null; batchId: string }): Promise<{ client: Client; created: boolean }>;
}
interface ParsedLeadRow { rowNumber: number; fullName: string | null; phones: string[]; courseName: string | null }
export function leadUstunlari(headers: string[]): { name: number | null; phone: number | null; course: number | null };
```

Takrorlanishni tekshirish:
- `guruhdan`: `findByTelegramUserId` bo'yicha.
- `raqamdan`: `findByPhone` bo'yicha.
- Mijoz topilsa, u qaytariladi (`created: false`) va manbasi o'zgartirilmaydi.

`leadUstunlari` sarlavhalarni `normalizeHeader` orqali taniydi:
- `ism`, `fio`, `имя`, `клиент`, `name` → ism;
- `telefon`, `raqam`, `телефон`, `phone` → telefon;
- `kurs`, `курс`, `course` → kurs.

`ImportLeadsUseCase.execute({ buffer, filename, userId })` qanday ishlaydi:
- Kurs nomi `courses` bilan katta-kichik harfga qaramay solishtiriladi. Topilmasa
  `courseId = null` bo'ladi va qator ogohlantirish bilan baribir yaratiladi.
- Natija `{ created, existing, errors, totalRows }`.
- Mavjud `import_batches` undo mexanizmi saqlanadi.

- [ ] **Step 1: Yiqiladigan test** — `leadColumns.spec.ts`

```ts
check('o\'zbekcha', leadUstunlari(['Ism', 'Telefon raqam', 'Kurs']), { name: 0, phone: 1, course: 2 });
check('ruscha', leadUstunlari(['Имя', 'Телефон']), { name: 0, phone: 1, course: null });
check('telefonsiz', leadUstunlari(['Ism']).phone, null);
```

- [ ] **Step 2:** Run: `npm run test:lead-columns --workspace=server`. Expected: FAIL.
- [ ] **Step 3:** Yuqoridagilarni yozing.
- [ ] **Step 4: Tekshiring**

Run: `npm run typecheck && bash scripts/run-tests.sh`
Expected: PASS

Qo'lda tekshiruv:
1. Sinov akkauntiga begona akkauntdan yoziladi → Mijozlar ro'yxatida "Reklama", "Yangi"
   bilan yangi mijoz paydo bo'ladi va agent javob beradi.
2. Bir xil Excel ikki marta yuklanadi → ikkinchisida hammasi "existing" bo'ladi.

- [ ] **Step 5: Commit** — `git commit -am "Reklama va raqam manbalari"`

### Task 13: Kanal kommentlaridan mijoz olish

**Files:**
- Modify: `S/domain/services/ITelegramGateway.ts`, `MtprotoTelegramGateway.ts` — 3 ta yangi
  metod.
- Create:
  - `S/infrastructure/telegram/izohMuallifi.ts` va `.spec.ts`
  - `S/domain/services/izohFiltri.ts` va `.spec.ts`
- Create:
  - `S/application/services/IzohYiguvchi.ts`
  - `S/presentation/http/routes/commentRoutes.ts`
  - `W/pages/GuruhlarPage.tsx`
- Modify:
  - `RuntimeSettings`: `izohKalitSozlari: string[]` (standart
    `['menga xabar bering','menga yozing','qiziqaman','narxi','+']`) va `izohLimit: number`
    (standart 500, zod 50–2000). `SettingsPage` da ular uchun bo'lim.
  - `Permission.ts`: `comments.view`, `comments.import`; migratsiya
    `004_izoh_ruxsatlari.sql`.
  - `W/App.tsx`, `nav.ts`: `{ to: '/guruhlar', label: 'Guruhlar' }`.

**Interfaces — Produces:**

```ts
// ITelegramGateway
export interface ChannelInfo { peer: TelegramPeerRef; title: string; linkedChatId: string | null; memberOfLinked: boolean }
export interface ChannelPost { id: number; date: Date; text: string; repliesCount: number }
export type CommentAuthor = { kind: 'user'; peer: ResolvedPeer; fullName: string } | { kind: 'anonim'; title: string };
export interface ChannelComment { id: number; postId: number; date: Date; text: string; author: CommentAuthor }
listCommentChannels(accountId: string): Promise<ChannelInfo[]>;        // kanallar, faqat linkedChatId bor bo'lganlar
listChannelPosts(accountId: string, channel: TelegramPeerRef, o: { limit: number; sinceDays?: number }): Promise<ChannelPost[]>;
getComments(accountId: string, channel: TelegramPeerRef, postId: number, o: { limit: number }): Promise<ChannelComment[]>;
// izohMuallifi.ts — GetReplies javobidagi fromId, users va chats dan muallif
export function izohMuallifi(fromId: { kind: 'user' | 'channel' | 'none'; id: string }, users: Map<string, { id: string; accessHash: string | null; username: string | null; firstName: string | null; lastName: string | null; bot: boolean }>, chats: Map<string, { title: string }>): CommentAuthor | null; // bot → null
// izohFiltri.ts
export function kalitSozMos(text: string, keywords: string[]): boolean;
export function izohlarniAjrat(comments: ChannelComment[], keywords: string[] | null, existingTelegramIds: Set<string>):
  Array<ChannelComment & { tanlasaBoladi: boolean; mavjudMijoz: boolean }>;
// IzohYiguvchi
class IzohYiguvchi {
  constructor(telegram: ITelegramGateway, clients: IClientRepository, mijoz: MijozYaratuvchi, campaigns: CreateCampaignUseCase, settings: RuntimeSettings, audit);
  kommentlar(accountId: string, channelId: string, postIds: number[] | 'all', sinceDays: number | null, filtrsiz: boolean): Promise<ReturnType<typeof izohlarniAjrat>>;
  mijozQil(accountId: string, channelTitle: string, items: Array<{ peer: ResolvedPeer; fullName: string; text: string }>, by: string): Promise<{ created: number; existing: number; campaignId: string | null }>;
}
```

Gateway amalga oshirishi:
- `listCommentChannels`: `listDialogs` dagi kanallar uchun `channels.GetFullChannel`
  chaqiriladi, `linkedChatId` olinadi va a'zolik linked chat dialoglar ichida bor-yo'qligi
  bilan aniqlanadi.
- `listChannelPosts`: `getMessages(channel, { limit })`. `repliesCount` `message.replies`
  dan olinadi.
- `getComments`: `messages.GetReplies({ peer: channel, msgId: postId, limit })`. Mualliflar
  `izohMuallifi` orqali aniqlanadi.
- Hammasi `runExclusive(accountId, { kind: 'other', priority: 'manual', label: 'izohlar' })`
  ichida bajariladi. FloodWait'da mavjud `translateError` ishlaydi.

`kalitSozMos` qoidalari:
- Matn va kalit so'zlar kichik harfga o'tkaziladi; `'`, `‘` va `ʻ` bitta belgiga
  keltiriladi.
- `'+'` faqat butun matn (trim qilingan) `+` bo'lsa mos keladi.
- Boshqa kalit so'zlar matn ichida qism-satr sifatida qidiriladi.

`izohlarniAjrat` qoidalari:
- `keywords === null` bo'lsa filtr ishlatilmaydi.
- `anonim` muallif bo'lsa `tanlasaBoladi = false`.
- `mavjudMijoz` — muallifning `telegramUserId` qiymati `existingTelegramIds` da bor.
- Bir xil `telegramUserId` dan bir nechta komment bo'lsa, faqat eng oxirgisi qoladi.

`mijozQil` tartibi:
1. Har bir qator uchun `mijoz.guruhdan(...)`. `telegram_account_id` va
   `telegram_hash_account_id` = `accountId`, `telegram_status = 'found'`.
2. Yangi yaratilgan mijozlar uchun kampaniya yaratiladi va ishga tushiriladi. Nomi:
   `Kanal: {channelTitle} — {YYYY-MM-DD}`. Maqsadlar — shu mijozlar.
3. Peer allaqachon ma'lum bo'lgani uchun `ClientTelegramResolver` telefon qidirishni
   o'tkazib yuborishi kerak. Agar hozirgi kod buni qilmasa, shu vazifada tuzatiladi va test
   bilan qamraladi.

**Routes** (`/comments`):
- `GET /channels?accountId` (`comments.view`)
- `GET /posts?accountId&channelId&sinceDays`
- `POST /fetch` `{accountId, channelId, postIds | 'all', sinceDays, filtrsiz}`
- `POST /to-leads` `{accountId, channelTitle, items}` (`comments.import`)

**Web `GuruhlarPage`:**
1. Akkaunt tanlanadi.
2. Kanallar ro'yxati chiqadi. `memberOfLinked = false` bo'lsa ogohlantirish: "Akkaunt
   muhokama guruhiga a'zo emas — kommentlarni o'qish uchun guruhga qo'shiling".
3. Postlar ro'yxati (belgilash mumkin) va "Oxirgi N kun" tanlovi.
4. "Kommentlarni olish" tugmasi.
5. Jadval: belgilash katagi, muallif, @username, komment, post, sana, holat ("Mijoz bor",
   "Yozib bo'lmaydi").
6. "Mijoz qilish (N)" tugmasi. Natija toast bilan ko'rsatiladi va kampaniyaga havola
   beriladi.

- [ ] **Step 1: Yiqiladigan testlar**

`izohFiltri.spec.ts`:

```ts
check('kalit so\'z', kalitSozMos('Assalomu alaykum, menga xabar bering!', KW), true);
check('apostrof turlari', kalitSozMos("qiziqaman, ma'lumot bering", ["ma‘lumot"]), true);
check('plyus yolg\'iz', kalitSozMos(' + ', KW), true);
check('plyus matn ichida emas', kalitSozMos('2+2', KW), false);
check('mos emas', kalitSozMos('zo\'r post', KW), false);
const r = izohlarniAjrat([C_USER_A1, C_USER_A2, C_ANON, C_USER_B], KW, new Set([B_ID]));
check('bir odamdan bitta', r.filter(x => x.author.kind === 'user' && x.author.peer.telegramUserId === A_ID).length, 1);
check('anonim tanlanmaydi', r.find(x => x.author.kind === 'anonim')?.tanlasaBoladi, false);
check('mavjud mijoz belgilanadi', r.find(x => x.author.kind === 'user' && x.author.peer.telegramUserId === B_ID)?.mavjudMijoz, true);
check('filtrsiz', izohlarniAjrat([C_NOKW], null, new Set()).length, 1);
```

`izohMuallifi.spec.ts`:

```ts
check('foydalanuvchi', izohMuallifi({ kind: 'user', id: '5' }, USERS, CHATS)?.kind, 'user');
check('access_hash saqlanadi', (izohMuallifi({ kind: 'user', id: '5' }, USERS, CHATS) as any).peer.accessHash, 'h5');
check('kanal nomidan', izohMuallifi({ kind: 'channel', id: '9' }, USERS, CHATS), { kind: 'anonim', title: 'Lola kanal' });
check('bot', izohMuallifi({ kind: 'user', id: '7' }, USERS, CHATS), null);
check('fromId yo\'q', izohMuallifi({ kind: 'none', id: '' }, USERS, CHATS), { kind: 'anonim', title: 'Anonim' });
```

- [ ] **Step 2:** Run: `npm run test:izoh-filtri --workspace=server && npm run test:izoh-muallifi --workspace=server`. Expected: FAIL.
- [ ] **Step 3:** Gateway metodlari, servis, route'lar, sahifa va sozlamalarni yozing.
- [ ] **Step 4: Tekshiring**

Run: `npm run typecheck && bash scripts/run-tests.sh`
Expected: PASS

Qo'lda tekshiruv: sinov akkaunti test kanalining muhokama guruhiga a'zo bo'ladi.
1. Kanaldagi postga boshqa akkauntdan "menga xabar bering" deb yoziladi.
2. Guruhlar sahifasida komment topiladi.
3. "Mijoz qilish" bosiladi → kampaniya yaratiladi va birinchi xabar komment haqida eslatib
   ketadi.
4. Kanalda va guruhda hech narsa yozilmagani tekshiriladi.

- [ ] **Step 5: Commit** — `git commit -am "Kanal kommentlaridan mijoz olish"`

---

## F. Yakunlash

### Task 14: Qolgan qarz kodi va sxemasini tozalash

**Files (Delete):**
- `S/infrastructure/contracts/`
- `ContractSyncService.ts`, `ShartnomaBoglovchi.ts`, `CreateClientFromContract`,
  `BulkRecontact` va `recontact_topics` bilan bog'liq kod (kod va UI:
  `W/components/recontact/`)
- `contract*` va `payment_promise*` repozitoriylari va entity'lari
- `crmKonteksti`, `vada*`, `sukut*`, `kechikish*`, `tolov*`, `contractDebt*` va shunga
  o'xshash spec'lar
- `.env.example` dagi `CONTRACTS_*` o'zgaruvchilari
- `docs/` dagi qarz hujjatlari: `crm-*`, `talabnoma-*`, `qongiroq-*`, `call-markaz/`

**Modify:**
- `server/migrations/001_init.sql` dan qarz jadvallari olib tashlanadi: `contracts`,
  `contract_payments`, `contract_events`, `payment_promises`, `debt_snapshots`,
  `holidays`, `talabnoma*`, `phone_calls`, `recontact_topics`, rekvizit jadvallari va
  `users.objects`. Shuningdek `conversations.stage` va `conversations.state` dan qarz
  qiymatlari, `clients.external_id`, `clients.nomalum` olinadi.
  - `conversations.state` ustuni qoladi. Uning check'i: `new`, `contacted`, `active`,
    `closed`. `nudge_count` olinadi.
  - Baza hali hech qayerda deploy qilinmagan, shuning uchun `001` to'g'ridan-to'g'ri
    tahrirlanadi. Dev bazasi qayta yaratiladi (`dropdb lolasales && createdb lolasales`).
- `Permission.ts` va `W/lib/types.ts`: qarz ruxsatlari olinadi (`contracts.*` va
  shunga o'xshash). Mavjud ruxsatlar to'plami spec 6.7 ga mos bo'lishi kerak.
- `XulosaBoti.ts`: kunlik xulosa sotuv raqamlariga o'tkaziladi — yangi mijozlar soni
  manbalar bo'yicha, tasdiqlangan to'lovlar soni va summasi, navbatdagi cheklar. Matnlar
  sotuvga moslanadi.
- `README.md` LolaSales uchun qayta yoziladi:
  1. Talablar va o'rnatish (port 4200/5174, baza `lolasales`).
  2. Birinchi ishga tushirish: Telegram akkaunt → Kurs → Karta → Kampaniya yoki Guruhlar.
  3. Bo'limlar ro'yxati.

- [ ] **Step 1:** Tozalang. Tekshirish: `rg -i "contract|shartnoma|qarz|debt|promise|va'da|talabnoma|xonsaroy" server/src web/src` faqat izohlarda, yoki umuman topmasligi kerak. Topilgan har birini ko'rib chiqing.
- [ ] **Step 2: Tekshiring**

Run: `dropdb lolasales; createdb lolasales && npm run seed --workspace=server && npm run typecheck && bash scripts/run-tests.sh && npm run build`
Expected: PASS

- [ ] **Step 3: Commit** — `git commit -am "Qarz kodi va sxemasi to'liq olib tashlandi"`

### Task 15: Dashboard voronkasi va yakuniy tekshiruv

**Files:**
- Modify:
  - `S/presentation/http/routes/statsRoutes.ts` (yoki dashboard statistikasini beruvchi
    fayl)
  - `W/pages/DashboardPage.tsx`
  - `W/lib/nav.ts` — spec 7-bo'limidagi tartib
- Create: `S/domain/services/voronka.ts`, `voronka.spec.ts`.

**Interfaces — Produces:**

```ts
export interface VoronkaQatori { stage: XaridBosqichi; label: string; count: number; ulush: number } // ulush = count / yangi..toladi yig'indisi, 0..1
export function voronka(counts: Record<XaridBosqichi, number>): VoronkaQatori[];   // XARID_BOSQICHLARI tartibida, rad_etdi oxirida
```

Dashboard API `GET /stats/sales` qaytaradigan ma'lumot:
- `voronka`;
- `bugunManbalar: Record<source, number>`;
- `bugunTolovlar: { soni, summa }` — bugun tasdiqlangan `payment_checks.confirmed_amount`;
- `navbatdagiCheklar: number`.

UI'da gorizontal voronka va 3 ta raqam kartasi bo'ladi. Sozlamalar sahifasidagi bo'limlar
tartibi:
1. Yuborish tezligi
2. Ish vaqti
3. Agent (persona, kompaniya nomi, avto-javob, kill switch)
4. To'lov kartalari
5. Eslatma
6. Kanal kommentlari
7. AI modellar
8. Akkaunt navbati
9. Xulosa boti
10. Sinov reseti

- [ ] **Step 1: Yiqiladigan test** — `voronka.spec.ts`

```ts
const v = voronka({ yangi: 10, suhbatda: 5, qiziqdi: 3, karta_yuborildi: 2, chek_keldi: 1, qisman_toladi: 1, toladi: 3, rad_etdi: 4 });
check('tartib', v.map(x => x.stage), [...XARID_BOSQICHLARI]);
check('rad etdi oxirida', v.at(-1)?.stage, 'rad_etdi');
check('ulush', v[0].ulush, 10 / 25);
check('bo\'sh', voronka(Object.fromEntries(XARID_BOSQICHLARI.map(s => [s, 0])) as any).every(x => x.ulush === 0), true);
```

- [ ] **Step 2:** Run: `npm run test:voronka --workspace=server`. Expected: FAIL.
- [ ] **Step 3:** Yozing.
- [ ] **Step 4: Butun tizimni tekshiring**

Run: `npm run typecheck && bash scripts/run-tests.sh && npm run build`
Expected: PASS

Qo'lda, to'liq oqim (sinov akkaunti va ikkinchi "mijoz" akkaunti bilan):
1. Kurs yaratiladi: sotuv davri bugunni o'z ichiga oladi, bo'lib to'lash yoqilgan, havola
   bor.
2. Sozlamalarda karta qo'shiladi.
3. "Mijoz" sinov akkauntiga yozadi → agent kurs haqida gapiradi va bosqich "Suhbatda" ga,
   keyin "Qiziqdi" ga o'tadi.
4. "Mijoz" to'lashga rozi bo'ladi → aniq karta xabari keladi, bosqich "Karta yuborildi".
5. "Mijoz" rasm yuboradi → "Chek keldi". Menejer tasdiqlaydi → "Qisman to'ladi" yoki
   "To'ladi", havola keladi.
6. Dashboard voronkasi shu harakatlarni ko'rsatadi.
7. Loglarda xatolar yo'q.

- [ ] **Step 5: Commit** — `git commit -am "Sotuv voronkasi va yakuniy tekshiruv"`
