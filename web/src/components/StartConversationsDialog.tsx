import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  BulkStartAccountPlan,
  BulkStartOutlook,
  BulkStartPreview,
  OutreachSettings,
  TelegramAccount,
} from '@/lib/types';
import { ErrorNote, Spinner } from '@/components/ui';
import { Sheet } from '@/components/Sheet';

/**
 * "Suhbat boshlash" tugmasidan keyingi tasdiqlash oynasi.
 *
 * NEGA KERAK: ilgari tugma bosilishi bilan ish ketaverardi va operator
 * nima bo'layotganini faqat progressdan bilardi — 33 tadan 14 tasi
 * o'tkazib yuborilgani soatlar o'tib ma'lum bo'lardi. Endi tanlov
 * bosishdan OLDIN ko'rsatiladi.
 */

const LABELS: Record<BulkStartOutlook, string> = {
  ready: 'Telegram profili tayyor',
  needs_lookup: 'Telegramda qidiriladi',
  name_mismatch: 'Telegramdagi ism mos kelmadi',
  already_started: 'Suhbat allaqachon boshlangan',
  not_sold: 'Shartnoma holati yozishga mos emas (Сотилди, К оплате yoki Проц. отказ emas)',
  no_debt: 'Oyma-oy to\'lovda kechikish yo\'q',
  below_min_debt: 'Kechikish minimal chegaradan kichik',
  no_phone: 'Telefon raqami yo\'q',
  do_not_contact: 'Bog\'lanish taqiqlangan',
  blocked: 'Bloklangan',
  deactivated: 'Telegram akkaunti o\'chirilgan',
};

/** Ko'rsatish tartibi: avval yuboriladiganlar, keyin o'tkazib yuboriladiganlar. */
const ORDER: BulkStartOutlook[] = [
  'ready', 'needs_lookup', 'name_mismatch',
  'already_started', 'not_sold', 'no_debt', 'below_min_debt', 'no_phone',
  'do_not_contact', 'blocked', 'deactivated',
];

const SKIPPED: ReadonlySet<BulkStartOutlook> = new Set([
  'already_started', 'not_sold', 'no_debt', 'below_min_debt', 'no_phone',
  'do_not_contact', 'blocked', 'deactivated',
]);

/**
 * Hozirgi vaqt + `qoshimchaDaqiqa`, HH:mm ko'rinishida.
 *
 * Brauzer vaqti bo'yicha — operator va server bir vaqt mintaqasida
 * ishlaydi (Asia/Tashkent). Bu qiymat faqat maydonning taklifi va
 * ko'rsatiladigan hisob uchun; haqiqiy sur'atni server o'zi hisoblaydi.
 */
function hozirHHmm(qoshimchaDaqiqa = 0): string {
  const d = new Date(Date.now() + qoshimchaDaqiqa * 60_000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** `from` dan `to` gacha necha daqiqa. Manfiy — vaqt o'tib ketgan. */
function daqiqaFarqi(from: string, to: string): number {
  const [fh = 0, fm = 0] = from.split(':').map(Number);
  const [th = 0, tm = 0] = to.split(':').map(Number);
  return th * 60 + tm - (fh * 60 + fm);
}

/** Sukut taklifi: bitta mijozga shuncha daqiqa. */
const TAKLIF_DAQIQA = 10;

export function StartConversationsDialog({
  clientIds,
  onClose,
  onConfirm,
  pending,
  error,
}: {
  clientIds: string[];
  onClose: () => void;
  onConfirm: (
    allowNameMismatch: boolean,
    accountIds: string[],
    perAccount: Record<string, number>,
    spreadUntil: string,
  ) => void;
  pending: boolean;
  error: unknown;
}) {
  const [allowMismatch, setAllowMismatch] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  /**
   * Operator qo'lda kiritgan taqsimot: accountId → nechta mijoz.
   *
   * Bo'sh (`{}`) bo'lsa ham serverga YUBORILADI — aks holda tizim o'zi
   * teng taqsimlab yuborardi. Operator sonni o'zi kiritishi kerak.
   */
  const [taqsimot, setTaqsimot] = useState<Record<string, number>>({});

  /**
   * Taqsimot qaysi soatgacha cho'zilsin (HH:mm).
   *
   * Operator tegmaguncha taklif bilan yangilanib turadi — akkaunt
   * tanlanishi bilan yuboriladiganlar soni o'zgaradi va taklif ham
   * o'zgarishi kerak. Qo'lda tuzatilgach ushlab turiladi.
   */
  const [until, setUntil] = useState('');
  const [untilTouched, setUntilTouched] = useState(false);

  const accountsQuery = useQuery({
    queryKey: ['telegram-accounts'],
    queryFn: () =>
      api.get<{ items: TelegramAccount[]; defaultPersonaName: string }>('/telegram/accounts'),
  });
  const accounts = accountsQuery.data?.items ?? [];
  // Tanlash mumkinligi API validatsiyasi bilan bir xil qoidada.
  const selectable = accounts.filter((a) => a.isEnabled && a.spamStatus !== 'banned');

  // Ish oynasining oxiri kerak: taqsimot undan oshib ketolmaydi —
  // oyna tugaganda ish baribir to'xtaydi.
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<{ settings: OutreachSettings }>('/settings'),
    staleTime: 60_000,
  });
  const windowEnd = settingsQuery.data?.settings.windowEnd ?? '19:00';
  const minDelaySec = settingsQuery.data?.settings.minDelaySec ?? 60;

  // Oyna ochiq turganda socket orqali akkaunt ro'yxati yangilanishi mumkin
  // (masalan, tanlangan akkaunt banned yoki o'chirilgan holatga o'tadi).
  // Shunday holatda `selected` dan endi yaroqsiz id'larni olib tashlaymiz —
  // aks holda checkbox `checked=true` va `disabled=true` bo'lib qolib,
  // operator uni yecha olmaydi va "Boshlash" doim 400 bilan qaytadi.
  // Faqat ro'yxat haqiqatan o'zgarganda `setSelected` chaqiramiz — aks holda
  // har renderda yangi massiv qaytarilib cheksiz render tsikli boshlanadi.
  useEffect(() => {
    setSelected((s) => {
      const validIds = new Set(selectable.map((a) => a.id));
      const next = s.filter((id) => validIds.has(id));
      return next.length === s.length ? s : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]);

  const previewQuery = useQuery({
    queryKey: ['bulk-start-preview', clientIds, selected, taqsimot],
    queryFn: () =>
      api.post<{ preview: BulkStartPreview }>('/clients/start-conversation-bulk/preview', {
        clientIds,
        accountIds: selected,
        perAccount: taqsimot,
      }),
    // Tanlov o'zgarmasa qayta so'ramaymiz — oyna ochiq turganda ham.
    staleTime: Infinity,
    // Har checkbox bosilishida `selected` o'zgaradi, ya'ni queryKey ham
    // o'zgaradi va yangi so'rov boshlanadi. Bu bayroqsiz `data` bir zumga
    // `undefined` bo'lardi va butun blok — akkauntlar ro'yxati bilan birga —
    // "Tekshirilyapti…" ga almashardi: operator ikkinchi akkauntni belgilash
    // uchun kutishga majbur edi. Eski natijani ko'rsatib turamiz, yangilanish
    // esa `isFetching` bilan bildiriladi.
    placeholderData: (prev: { preview: BulkStartPreview } | undefined) => prev,
  });

  // Eslatma: bu yerda alohida Esc `useEffect`i bo'lgan (window'ga
  // `keydown` tinglovchi qo'shib, `!pending` bo'lsa `onClose` chaqirardi).
  // Endi u ortiqcha edi — xuddi shu ishni `Sheet` o'zi (guarded `onClose`
  // orqali) bajaradi, shu sabab olib tashlandi.
  const preview = previewQuery.data?.preview;
  const counts = preview?.counts;
  const mismatches = preview?.mismatches ?? [];

  // Aniq ketadiganlar. `needs_lookup` bu yerga qo'shilmaydi: ular Telegramda
  // qidiriladi va topilmasligi ham mumkin — "ketadi" deb va'da bermaymiz.
  const willSend = (counts?.ready ?? 0) + (allowMismatch ? (counts?.name_mismatch ?? 0) : 0);
  const maybe = counts?.needs_lookup ?? 0;
  const sends = willSend + maybe;

  // Taklif: bitta mijozga 10 daqiqa, lekin ish oynasidan oshmaydi.
  // `hozirHHmm` BIR MARTA chaqiriladi — ikki chaqiruv daqiqa chegarasida
  // har xil qiymat qaytarib, solishtiruvni buzishi mumkin edi.
  const xomTaklif = hozirHHmm(sends * TAKLIF_DAQIQA);
  const taklif = daqiqaFarqi(xomTaklif, windowEnd) < 0 ? windowEnd : xomTaklif;

  useEffect(() => {
    if (!untilTouched) setUntil(taklif);
  }, [taklif, untilTouched]);

  const qolganDaqiqa = until ? daqiqaFarqi(hozirHHmm(), until) : 0;
  const vaqtOtgan = Boolean(until) && qolganDaqiqa <= 0;
  // O'rtacha oraliq — server hisoblaydigan qiymatning aynan o'zi.
  const ortachaDaqiqa = sends > 0 && qolganDaqiqa > 0 ? Math.round(qolganDaqiqa / sends) : null;
  // Pastki chegara: shundan tez yubora olmaymiz.
  const siqiq = ortachaDaqiqa !== null && (qolganDaqiqa * 60) / sends < minDelaySec;
  const realDaqiqa = Math.ceil((sends * minDelaySec) / 60);
  // Ko'rsatilayotgan natija eskirgan — yangisi kelyapti. Ro'yxatni
  // yo'qotmasdan, faqat shu belgi bilan bildiramiz.
  const refreshing = previewQuery.isFetching && !previewQuery.isPending;

  return (
    <Sheet
      open
      onClose={() => {
        if (!pending) onClose();
      }}
      title={`Suhbat boshlash — ${clientIds.length} ta mijoz`}
      maxWidth="max-w-lg"
    >
      <div className="p-4 md:p-5">
        {previewQuery.isPending ? (
          <div className="flex items-center gap-2 py-8 text-sm text-ink-400">
            <Spinner /> Tekshirilyapti…
          </div>
        ) : previewQuery.error ? (
          <div className="mt-4">
            <ErrorNote error={previewQuery.error} />
          </div>
        ) : counts ? (
          <>
            <p className="mt-1 text-xs text-ink-500">
              Xabar ketishidan oldin tanlanganlar tekshirildi.
            </p>

            <ul className="mt-4 space-y-1 text-xs">
              {ORDER.filter((key) => counts[key] > 0).map((key) => (
                <li key={key} className="flex items-baseline justify-between gap-3">
                  <span
                    className={
                      key === 'name_mismatch'
                        ? 'text-amber-300'
                        : SKIPPED.has(key)
                          ? 'text-ink-500'
                          : 'text-ink-200'
                    }
                  >
                    {LABELS[key]}
                    {SKIPPED.has(key) ? ' — o\'tkazib yuboriladi' : ''}
                  </span>
                  <span className="shrink-0 tabular-nums text-ink-300">{counts[key]}</span>
                </li>
              ))}
            </ul>

            {/* Ism mos kelmaganlar — asosiy ogohlantirish. */}
            {mismatches.length ? (
              <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
                <p className="text-xs font-medium text-amber-200">
                  ⚠ {mismatches.length} ta mijozda Telegramdagi ism mos kelmadi
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-400">
                  Raqam boshqa odamga o'tgan bo'lishi mumkin. Unday bo'lsa to'lov
                  ma'lumoti begona odamga ketadi. Ismlar odamlarda turlicha yozilgani
                  uchun bu har doim ham xato degani emas — quyidagilarni ko'rib chiqing.
                </p>

                <ul className="mt-2.5 max-h-44 space-y-1.5 overflow-y-auto pr-1">
                  {mismatches.map((m) => (
                    <li key={m.id} className="text-[11px] leading-tight">
                      <span className="text-ink-200">{m.fullName}</span>
                      <span className="text-ink-600"> → </span>
                      <span className="text-amber-200">{m.telegramName || '(ism yo\'q)'}</span>
                      {m.phone ? <span className="text-ink-600"> · {m.phone}</span> : null}
                    </li>
                  ))}
                </ul>

                <label className="mt-3 flex cursor-pointer items-start gap-2 text-[11px] leading-tight text-ink-300">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-amber-400"
                    checked={allowMismatch}
                    disabled={pending}
                    onChange={(e) => setAllowMismatch(e.target.checked)}
                  />
                  <span>
                    Ha, shularga ham yuborilsin — javobgarlikni o'z zimmamga olaman.
                    <span className="block text-ink-500">
                      Har bir bunday mijoz amallar jurnaliga yoziladi.
                      {maybe > 0
                        ? ' Qidiruv paytida yangi mos kelmaslik chiqsa, ularga ham yuboriladi.'
                        : ''}
                    </span>
                  </span>
                </label>
              </div>
            ) : (
              /*
               * Mos kelmaslik OLDINDAN ma'lum emas — lekin ish paytida
               * baribir chiqishi mumkin. Shuning uchun belgi HAR DOIM
               * turadi.
               *
               * NEGA HAR DOIM: bu belgi ijro vaqtidagi ruxsat, oyna esa
               * atigi bashorat. Ilgari u bashoratga bog'langan edi va
               * ikki marta teshik qoldirgan:
               *
               *   1. Hali qidirilmagan mijoz ("Telegramda qidiriladi") —
               *      mos kelmaslik qidiruv paytida chiqadi;
               *   2. "Tayyor" ko'ringan mijoz ham — ommaviy boshlashda
               *      mijozlar akkauntlarga qayta biriktiriladi, saqlangan
               *      `access_hash` esa (akkaunt, peer) juftligiga bog'liq,
               *      ya'ni yaroqsiz bo'lib qoladi va qidiruv QAYTADAN
               *      bajariladi. Odam shu orada Telegramdagi ismini
               *      o'zgartirgan bo'lsa — mos kelmaydi.
               *
               * Ikkala holatda ham operator "suhbat boshlandi, lekin
               * hech kimga yozilmadi" degan natijani ish TUGAGACH
               * ko'rardi va oynada belgi umuman yo'q edi.
               */
              <div className="mt-4 rounded-xl border border-ink-700 bg-ink-950/50 p-3">
                <p className="text-xs font-medium text-ink-200">
                  {maybe > 0
                    ? `${maybe} ta mijoz Telegramda qidiriladi`
                    : 'Ism mos kelmasligi ish paytida chiqishi mumkin'}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-400">
                  Telegramdagi ismi mijozning ismiga mos kelmaydigani chiqishi mumkin —
                  raqam boshqa odamga o'tgan bo'lsa, to'lov ma'lumoti begona odamga
                  ketadi. Sukut bo'yicha bunday mijoz o'tkazib yuboriladi va siz uni
                  ish tugagach ro'yxatda ko'rasiz.
                </p>

                <label className="mt-3 flex cursor-pointer items-start gap-2 text-[11px] leading-tight text-ink-300">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-amber-400"
                    checked={allowMismatch}
                    disabled={pending}
                    onChange={(e) => setAllowMismatch(e.target.checked)}
                  />
                  <span>
                    Ism mos kelmasa ham hammasiga yuborilsin — javobgarlikni o'z
                    zimmamga olaman.
                    <span className="block text-ink-500">
                      Har bir bunday mijoz amallar jurnaliga yoziladi.
                    </span>
                  </span>
                </label>
              </div>
            )}

            <div className="mt-4 rounded-xl border border-ink-700 bg-ink-950/50 p-3 text-[11px] leading-relaxed text-ink-400">
              <span className="text-ink-200">
                {willSend} ta mijozga xabar ketadi
                {maybe > 0 ? `, yana ${maybe} tasi Telegramda qidiriladi` : ''}.
              </span>

              <label className="mt-2.5 flex flex-wrap items-center gap-2 text-ink-300">
                <span>Taqsimot shu soatgacha cho'zilsin:</span>
                <input
                  type="time"
                  className="input !w-28 !py-0.5 text-xs"
                  value={until}
                  min={hozirHHmm(5)}
                  max={windowEnd}
                  disabled={pending}
                  onChange={(e) => {
                    setUntilTouched(true);
                    setUntil(e.target.value);
                  }}
                />
                <span className="text-ink-500">ish oynasi {windowEnd} da tugaydi</span>
              </label>

              {vaqtOtgan ? (
                <p className="mt-2 text-amber-300">
                  Bu vaqt allaqachon o'tdi — keyingi soatni tanlang.
                </p>
              ) : siqiq ? (
                <p className="mt-2 text-amber-300">
                  Bunchalik qisqa vaqtga sig'maydi — xabarlar orasida kamida{' '}
                  {Math.round(minDelaySec / 60)} daqiqa saqlanadi, ish taxminan {realDaqiqa}{' '}
                  daqiqa oladi.
                </p>
              ) : ortachaDaqiqa !== null ? (
                <p className="mt-2">
                  {sends} ta xabar {hozirHHmm()} dan {until} gacha — o'rtacha har{' '}
                  <span className="text-ink-200">{ortachaDaqiqa} daqiqada</span> bittadan.
                  Oraliqlar tasodifiy: goh qisqaroq, goh uzunroq — bir xil oraliq spam
                  filtri uchun signal. Ish vaqti tugasa avtomatik to'xtaydi, qolganini
                  ertaga davom ettirasiz.
                </p>
              ) : null}
            </div>

            {willSend + maybe === 0 ? (
              <p className="mt-3 text-xs text-amber-300">
                Hech kimga xabar ketmaydi — tanlovni o'zgartiring.
              </p>
            ) : null}

            <div className="mt-4 border-t border-ink-800 pt-3">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <p className="text-xs text-ink-400">Qaysi Telegram akkauntlaridan yozilsin</p>
                {/* Ro'yxat joyida qoladi — faqat shu yozuv yangilanishni bildiradi. */}
                {refreshing ? (
                  <span className="shrink-0 text-[11px] text-ink-500">yangilanmoqda…</span>
                ) : null}
              </div>

              {/* Akkauntlar alohida so'rov bilan keladi. Ilgari u yuklanayotganda
                  bo'lim shunchaki bo'sh ko'rinardi va "akkauntim yo'q" degan
                  taassurot berardi. */}
              {accountsQuery.isPending ? (
                <div className="flex items-center gap-2 py-2 text-xs text-ink-500">
                  <Spinner /> Akkauntlar yuklanmoqda…
                </div>
              ) : accountsQuery.error ? (
                <ErrorNote error={accountsQuery.error} />
              ) : !accounts.length ? (
                <p className="py-2 text-xs text-amber-300">
                  Telegram akkaunt qo'shilmagan — avval Telegram sahifasida akkaunt qo'shing.
                </p>
              ) : null}

              <div className="space-y-1.5">
                {accounts.map((account) => {
                  const usable = selectable.some((a) => a.id === account.id);
                  const row: BulkStartAccountPlan | undefined = preview?.accountPlan.find(
                    (p) => p.accountId === account.id,
                  );
                  // Hozir yubora olmaydigan, lekin tanlasa bo'ladigan uchta holat:
                  // ulanmagan, flood-wait, spam filtri cheklagan. Hech biri to'smaydi —
                  // biriktirish saqlanadi, akkaunt tiklangach xabar o'shandan ketadi.
                  const isDisconnected = account.status !== 'connected';
                  const isFloodWaited =
                    Boolean(account.floodWaitUntil) &&
                    new Date(account.floodWaitUntil as string).getTime() > Date.now();
                  const isSpamLimited = account.spamStatus === 'limited';
                  // Bir vaqtda bir nechtasi to'g'ri kelsa faqat bittasi ko'rsatiladi.
                  // Ustuvorlik: ulanmagan eng jiddiysi (operator kirmasa hech narsa
                  // ketmaydi) → flood-wait (vaqtinchalik, TTL bilan o'tadi) →
                  // spam cheklovi (yumshoqroq — faqat notanish odamlarga yozolmaydi).
                  const warning = !usable
                    ? null
                    : isDisconnected
                      ? 'ulanmagan — avval kirish kerak'
                      : isFloodWaited
                        ? 'Telegram vaqtincha cheklagan'
                        : isSpamLimited
                          ? 'spam filtri cheklagan — notanish odamga yoza olmaydi'
                          : null;
                  return (
                    <label key={account.id} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        disabled={!usable || pending}
                        checked={selected.includes(account.id)}
                        onChange={(e) => {
                          setSelected((s) =>
                            e.target.checked
                              ? [...s, account.id]
                              : s.filter((id) => id !== account.id),
                          );
                          // Belgi yechilsa son ham ketadi — aks holda
                          // ko'rinmaydigan son jimgina hisobga qo'shilardi.
                          if (!e.target.checked) {
                            setTaqsimot((c) => {
                              const next = { ...c };
                              delete next[account.id];
                              return next;
                            });
                          }
                        }}
                      />
                      <span className="text-ink-200">
                        {account.personaName ?? accountsQuery.data?.defaultPersonaName ?? ''}
                      </span>
                      <span className="text-ink-500">{account.label}</span>
                      <span className="text-ink-500" title="Shu akkaunt bilan suhbati boshlangan mijozlar (jami)">
                        · suhbatda: {account.conversationClients} ta
                      </span>
                      <span className="text-ink-500">· bugun {account.remainingToday} ta qoldi</span>
                      {/* Bu son — shu akkauntga BIRIKTIRILADIGAN mijozlar soni,
                          xabar ketadiganlar soni EMAS. Taqsimotga to'lovi
                          yo'qlar, suhbati boshlanganlar va ismi mos kelmaganlar
                          ham kiradi — ularga xabar ketmaydi. Ilgari bu son
                          "xabar ketadi" degan son yonida "shu ishda N ta" deb
                          turardi va ikkalasi bir narsadek o'qilardi. */}
                      {selected.includes(account.id) ? (
                        <>
                          <input
                            type="number"
                            min={0}
                            max={clientIds.length}
                            className="input !w-20 !py-0.5 text-xs"
                            value={taqsimot[account.id] ?? ''}
                            placeholder="0"
                            disabled={pending}
                            onChange={(e) =>
                              setTaqsimot((c) => ({
                                ...c,
                                [account.id]: Math.max(0, Number(e.target.value) || 0),
                              }))
                            }
                            // Label ichida — bosilganda checkbox yechilib
                            // ketmasligi uchun hodisa to'xtatiladi.
                            onClick={(e) => e.preventDefault()}
                          />
                          {/* Bu son — shu akkauntga BIRIKTIRILADIGAN mijozlar
                              soni, xabar ketadiganlar soni EMAS. Taqsimotga
                              to'lovi yo'qlar, suhbati boshlanganlar va ismi mos
                              kelmaganlar ham kiradi — ularga xabar ketmaydi. */}
                          {row ? (
                            <span className="text-emerald-300">· biriktiriladi: {row.count} ta</span>
                          ) : null}
                        </>
                      ) : null}
                      {!usable ? (
                        <span className="text-ink-600">
                          · {account.isEnabled ? 'bloklangan' : "o'chirilgan"} — tanlab bo'lmaydi
                        </span>
                      ) : warning ? (
                        <span className="text-amber-400">· {warning}</span>
                      ) : null}
                    </label>
                  );
                })}
              </div>

              {preview && preview.reassigned > 0 ? (
                <p className="mt-2 text-[11px] text-ink-500">
                  {preview.reassigned} ta mijoz tanlangan akkauntlarga biriktiriladi. Yozishmasi
                  boshlangan mijozlarning akkaunti o'zgarmaydi.
                </p>
              ) : null}

              {/* Kunlik kvota ogohlantirishi ATAYLAB olib tashlandi.
                  U `accountPlan[].overQuota` dan hisoblanardi, bu esa
                  biriktiriladiganlar soniga tayanadi — ular orasida to'lovi
                  yo'q, suhbati boshlangan va ismi mos kelmagan mijozlar ham
                  bor, ya'ni xabar OLMAYDIGANLAR. Natijada ogohlantirish
                  bo'lmagan limit oshishi haqida chiqib, operatorni
                  chalg'itardi. Server tomondagi `overQuota` maydoni joyida
                  turibdi — u yerda buzilmadi, faqat bu yerda ko'rsatilmaydi.
                  Limit haqiqatan tugasa, xabar baribir yubormaymiz:
                  `StartConversationUseCase` tekshiradi va mijoz progressda
                  "o'tkazib yuborildi" bo'lib ko'rinadi. */}
            </div>
          </>
        ) : null}

        {error ? (
          <div className="mt-3">
            <ErrorNote error={error} />
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" className="btn-ghost !py-1 text-xs" disabled={pending} onClick={onClose}>
            Bekor qilish
          </button>
          <button
            type="button"
            className="btn-primary !py-1 text-xs"
            disabled={pending || !counts || !selected.length || sends === 0 || vaqtOtgan || !until}
            onClick={() => onConfirm(allowMismatch, selected, taqsimot, until)}
          >
            {pending ? <Spinner /> : null}
            Boshlash
          </button>
        </div>
      </div>
    </Sheet>
  );
}
