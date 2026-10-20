import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import type { AppLogItem } from '@/lib/types';
import { Spinner, EmptyState, ErrorNote } from '@/components/ui';

/** Jonli rejimda ro'yxat shuncha qator bilan cheklanadi — brauzer sekinlashmasin. */
const MAX_JONLI = 300;

/** Jurnal filtrining uchta ko'rinishi. */
type JurnalKorinish = 'all' | 'error' | 'telegram';

/**
 * Server `PgAppLogRepository.list` da ishlatgan filtr bilan bir xil qoida:
 * `all` — `info` dan yuqorilari (Telegram izi ko'rinmaydi, lekin uning
 * XATOLARI ko'rinadi), `error` — faqat xatolar, `telegram` — faqat audit
 * izi. Qidiruv esa akkaunt/mijoz/matn ustida harf
 * katta-kichikligiga qaramay ishlaydi.
 *
 * Socket orqali kelgan qator serverdan filtrlanmasdan keladi — shu
 * funksiya bo'lmasa har bir Telegram chaqiruvi operatorning odatdagi
 * ro'yxatiga oqib chiqardi.
 */
function jurnalFiltrigaMosMi(item: AppLogItem, level: JurnalKorinish, q: string): boolean {
  if (level === 'error' && item.level !== 'error') return false;
  if (level === 'telegram' && item.flag !== 'telegram') return false;
  if (level === 'all' && item.level === 'info') return false;
  const matn = q.trim().toLowerCase();
  if (!matn) return true;
  return [item.akkaunt, item.mijoz, item.msg].some((v) =>
    v?.toLowerCase().includes(matn),
  );
}

export function LogsPage() {
  const [level, setLevel] = useState<JurnalKorinish>('all');
  const [q, setQ] = useState('');
  const [jonli, setJonli] = useState(true);
  const [yangi, setYangi] = useState<AppLogItem[]>([]);
  const [ochiq, setOchiq] = useState<string | null>(null);
  // Socket uzilganda jonli oqim jim to'xtaydi (obuna serverdagi xonaga
  // qaytadan yuborilmaguncha) — operator buni bilishi kerak, aks holda
  // "hech qanday xato yo'q" deb xato xulosaga keladi.
  const [ulanmagan, setUlanmagan] = useState(false);

  const logs = useQuery({
    queryKey: ['logs', level, q],
    queryFn: () =>
      api.get<{ items: AppLogItem[] }>('/logs', {
        level,
        ...(q.trim() ? { q: q.trim() } : {}),
      }),
  });

  // Filtr o'zgarganda jonli to'plam tozalanadi — aks holda eski
  // filtrga tegishli qatorlar ro'yxatda qolib ketardi.
  useEffect(() => setYangi([]), [level, q]);

  // Socket effekti faqat `jonli`ga bog'liq — obuna filtr o'zgarganda qayta
  // ulanmasin. Shuning uchun handler joriy filtrni ref orqali o'qiydi.
  const filtrRef = useRef<{ level: JurnalKorinish; q: string }>({ level, q });
  useEffect(() => {
    filtrRef.current = { level, q };
  }, [level, q]);

  // "Jonli" o'chirilib qayta yoqilgan payt (masalan sahifa ochiq turgan
  // holda) o'chiq turgan oraliqda kelgan qatorlar `yangi`da yo'q —
  // obuna o'sha payt bekor qilingan edi. Asosiy ro'yxatni qayta so'ramasak,
  // ular butunlay ko'rinmay qolib, operator "xato bo'lmadi" deb o'ylardi.
  const birinchiEmasRef = useRef(false);

  useEffect(() => {
    if (!jonli) {
      setUlanmagan(false);
      return;
    }
    const socket = getSocket();

    // Socket.io o'zi qayta ulanadi, lekin har qayta ulanish serverda
    // YANGI socket beradi — `logs` xonasiga a'zolik avvalgi ulanishdan
    // meros bo'lib o'tmaydi (`connectionStateRecovery` yoqilmagan).
    // Shu sabab `connect` hodisasida obunani QAYTA yuborish shart,
    // aks holda deploy yoki qayta ishga tushishdan keyin ro'yxat jim
    // yangilanishdan to'xtab qoladi — checkbox belgili turadi, lekin
    // hech narsa kelmaydi.
    const subscribe = (): void => {
      socket.emit('logs:subscribe');
      setUlanmagan(false);
    };

    const onDisconnect = (): void => setUlanmagan(true);

    if (socket.connected) subscribe();
    else setUlanmagan(true);
    socket.on('connect', subscribe);
    socket.on('disconnect', onDisconnect);

    const onAppended = (event: { item: AppLogItem }): void => {
      const { level: joriyLevel, q: joriyQ } = filtrRef.current;
      if (!jurnalFiltrigaMosMi(event.item, joriyLevel, joriyQ)) return;
      setYangi((oldin) => [event.item, ...oldin].slice(0, MAX_JONLI));
    };
    socket.on('log.appended', onAppended);

    if (birinchiEmasRef.current) void logs.refetch();
    birinchiEmasRef.current = true;

    return () => {
      socket.off('connect', subscribe);
      socket.off('disconnect', onDisconnect);
      socket.off('log.appended', onAppended);
      socket.emit('logs:unsubscribe');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jonli]);

  // Jonli qatorlar tepada; ular ham joriy filtrga mos bo'lishi kerak —
  // aks holda filtr o'zgarganidan keyin eski (endi mos kelmaydigan)
  // qatorlar merge paytida yana ko'rinib qolishi mumkin edi.
  // Takrorlanmasligi uchun id bo'yicha ham filtrlanadi.
  const yangiIdlar = new Set(yangi.map((x) => x.id));
  const items = [
    ...yangi.filter((x) => jurnalFiltrigaMosMi(x, level, q)),
    ...(logs.data?.items ?? []).filter((x) => !yangiIdlar.has(x.id)),
  ];

  return (
    // `flex-1 overflow-y-auto` — Layout'dagi `main` `overflow-hidden` bilan
    // turadi, ya'ni scroll idishini HAR BIR sahifa o'zi berishi kerak. Busiz
    // ekrandan uzun ro'yxat kesilib qolardi va pastki qatorlarga yetib
    // bo'lmasdi. Boshqa ro'yxat sahifalari ham xuddi shu naqsh bilan ishlaydi.
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="mr-2 hidden text-lg md:inline">Tizim jurnali</h1>

        <select
          className="input !py-1 text-xs max-md:min-h-[40px]"
          value={level}
          onChange={(e) => setLevel(e.target.value as JurnalKorinish)}
        >
          <option value="all">Hammasi</option>
          <option value="error">Faqat xato</option>
          <option value="telegram">Telegram</option>
        </select>

        <input
          className="input !py-1 w-full text-xs sm:w-64"
          placeholder="Akkaunt, mijoz yoki matn"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <label className="flex items-center gap-1.5 text-xs text-ink-500">
          <input type="checkbox" checked={jonli} onChange={(e) => setJonli(e.target.checked)} />
          Jonli
        </label>

        {jonli && ulanmagan ? (
          <span
            className="text-xs text-amber-400"
            title="Ulanish uzilgan — jonli oqim vaqtincha to'xtadi, qayta ulanganda o'zi davom etadi"
          >
            uzildi, qayta ulanmoqda…
          </span>
        ) : null}

        {logs.isFetching ? <Spinner /> : null}
      </div>

      {logs.error ? <ErrorNote error={logs.error} /> : null}

      {!logs.isLoading && !logs.error && items.length === 0 ? (
        <EmptyState
          title="Jurnal bo'sh"
          hint={
            level === 'telegram'
              ? 'Telegram chaqiruvlari shu yerda ko\'rinadi'
              : 'Ogohlantirish va xatolar shu yerda ko\'rinadi'
          }
        />
      ) : null}

      <div className="space-y-1">
        {items.map((item) => (
          <div
            key={item.id}
            className="cursor-pointer rounded border border-ink-800 p-2 text-xs"
            onClick={() => setOchiq(ochiq === item.id ? null : item.id)}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="tabular-nums text-ink-600">
                {new Date(item.at).toLocaleString('uz-UZ')}
              </span>
              {/* `info` — Telegram audit izi: unda XATO/OGOH ma'nosiz,
                  qatorni TG nishonining o'zi belgilaydi. */}
              {item.level === 'info' ? null : (
                <span className={item.level === 'error' ? 'text-rose-400' : 'text-amber-300'}>
                  {item.level === 'error' ? 'XATO' : 'OGOH'}
                </span>
              )}
              {item.flag === 'telegram' ? (
                <span className="rounded bg-sky-950 px-1 text-sky-300" title="Telegram chaqiruvi">
                  TG
                </span>
              ) : null}
              {item.scope ? <span className="text-ink-600">{item.scope}</span> : null}
              <span className="text-ink-200">{item.msg}</span>
              {item.akkaunt ? <span className="text-sky-300">{item.akkaunt}</span> : null}
              {item.mijoz ? <span className="text-ink-500">{item.mijoz}</span> : null}
            </div>

            {ochiq === item.id ? (
              <pre className="mt-2 overflow-x-auto rounded bg-ink-900 p-2 text-[11px] text-ink-400">
                {JSON.stringify(item.payload, null, 2)}
              </pre>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
