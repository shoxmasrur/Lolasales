import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCan } from '@/store/auth';
import { ErrorNote, Spinner } from '@/components/ui';
import { dateUz } from '@/lib/format';
import type { Bayram } from '@/lib/types';

/**
 * Bayram va dam olish kunlari.
 *
 * NEGA KERAK: bayramda banklar ishlamaydi. Ro'yxatga kiritilgan kunlarda
 * xabar yuborilmaydi, va'da muddati keyingi ish kuniga suriladi va agent
 * "bugun to'lang" demaydi.
 */
export function HolidaysCard() {
  const canEdit = useCan('holidays.manage');
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ['holidays'],
    queryFn: () => api.get<{ items: Bayram[] }>('/holidays'),
  });

  const [name, setName] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [yillik, setYillik] = useState(false);

  const qoshish = useMutation({
    mutationFn: () =>
      api.post('/holidays', { name, startsOn, endsOn: endsOn || startsOn, yillik }),
    onSuccess: () => {
      setName(''); setStartsOn(''); setEndsOn(''); setYillik(false);
      void qc.invalidateQueries({ queryKey: ['holidays'] });
    },
  });

  const ochirish = useMutation({
    mutationFn: (id: string) => api.delete(`/holidays/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['holidays'] }),
  });

  // Bir vaqtda faqat BITTA qator tahrirlanadi: ikkitasini ochiq
  // qoldirish operatorga qaysi biri saqlanmaganini yashirardi.
  const [tahrirId, setTahrirId] = useState<string | null>(null);
  const [tNom, setTNom] = useState('');
  const [tBosh, setTBosh] = useState('');
  const [tOxir, setTOxir] = useState('');
  const [tYillik, setTYillik] = useState(false);

  const tahrirBoshla = (h: Bayram): void => {
    setTahrirId(h.id);
    setTNom(h.name);
    setTBosh(h.startsOn);
    setTOxir(h.endsOn);
    setTYillik(h.yillik);
  };

  const saqlash = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/holidays/${id}`, {
        name: tNom,
        startsOn: tBosh,
        // Qo'shish formasi bilan bir xil qoida: bo'sh tugash sanasi —
        // bir kunlik bayram.
        endsOn: tOxir || tBosh,
        yillik: tYillik,
      }),
    onSuccess: (_data, id) => {
      // Javob operator BOSHQA qatorga o'tib ulgurgandan keyin kelishi
      // mumkin (saqlash ketyotganida "Tahrirlash" boshqa qatorda ham
      // bosiladi). Bu holda `tahrirId` allaqachon o'sha qatorga
      // ko'rsatadi — uni jimgina yopib, hali saqlanmagan matnni
      // yo'qotib qo'ymaslik uchun faqat SHU so'rov tegishli bo'lgan
      // qator hali ham ochiq bo'lsagina yopamiz.
      setTahrirId((cur) => (cur === id ? null : cur));
      void qc.invalidateQueries({ queryKey: ['holidays'] });
    },
  });

  return (
    <div className="card space-y-4">
      <h2 className="text-sm font-medium">Bayram va dam olish kunlari</h2>
      <p className="mt-1 text-xs text-ink-500">
        Bu kunlari xabar yuborilmaydi va va'da muddati keyingi ish kuniga suriladi.
      </p>

      {list.isLoading ? <Spinner /> : null}
      {list.error ? <ErrorNote error={list.error} /> : null}

      <ul className="mt-3 space-y-1">
        {list.data?.items.map((h) => (
          <li key={h.id} className="flex items-center justify-between gap-2 text-xs">
            {tahrirId === h.id ? (
              <div className="flex flex-wrap items-center gap-2">
                <input className="input text-xs" value={tNom} onChange={(e) => setTNom(e.target.value)} />
                <input className="input text-xs" type="date" value={tBosh} onChange={(e) => setTBosh(e.target.value)} />
                <input className="input text-xs" type="date" value={tOxir} onChange={(e) => setTOxir(e.target.value)} />
                <label className="flex items-center gap-2 text-xs text-ink-400">
                  <input type="checkbox" checked={tYillik} onChange={(e) => setTYillik(e.target.checked)} />
                  Har yili
                </label>
                <button type="button" className="btn-primary text-xs"
                        disabled={!tNom.trim() || !tBosh || saqlash.isPending}
                        onClick={() => saqlash.mutate(h.id)}>
                  {saqlash.isPending ? <Spinner /> : null}
                  Saqlash
                </button>
                <button type="button" className="btn-ghost text-xs" onClick={() => setTahrirId(null)}>
                  Bekor qilish
                </button>
                {saqlash.error ? <ErrorNote error={saqlash.error} /> : null}
              </div>
            ) : (
              <>
                <span>
                  {h.name} — {dateUz(h.startsOn)}
                  {h.endsOn !== h.startsOn ? ` … ${dateUz(h.endsOn)}` : ''}
                  {h.yillik ? ' · har yili' : ''}
                </span>
                {canEdit ? (
                  <>
                    <button type="button" className="btn-ghost text-xs" onClick={() => tahrirBoshla(h)}>
                      Tahrirlash
                    </button>
                    <button
                      type="button"
                      className="btn-ghost text-xs"
                      onClick={() => {
                        // Ro'yxat keshlanmaydi: xato bilan bosilgan o'chirish bayram
                        // kunining o'zida xabar yuborishni bir soniyada qayta yoqadi.
                        if (confirm(`"${h.name}" (${dateUz(h.startsOn)}) o'chirilsinmi? Shu kundan xabar yuborish darhol qayta yoqiladi.`)) {
                          ochirish.mutate(h.id);
                        }
                      }}
                    >
                      O'chirish
                    </button>
                  </>
                ) : null}
              </>
            )}
          </li>
        ))}
        {list.data?.items.length === 0 ? (
          <li className="text-xs text-ink-600">Hozircha bayram kiritilmagan</li>
        ) : null}
      </ul>

      {canEdit ? (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <input className="input text-xs" placeholder="Nomi" value={name}
                 onChange={(e) => setName(e.target.value)} />
          <input className="input text-xs" type="date" value={startsOn}
                 onChange={(e) => setStartsOn(e.target.value)} />
          {/* Bo'sh qoldirilsa bir kunlik bayram bo'ladi. */}
          <input className="input text-xs" type="date" value={endsOn}
                 onChange={(e) => setEndsOn(e.target.value)} />
          <label className="flex items-center gap-2 text-xs text-ink-400">
            <input type="checkbox" checked={yillik} onChange={(e) => setYillik(e.target.checked)} />
            Har yili qaytadi
          </label>
          <button type="button" className="btn-primary text-xs"
                  disabled={!name.trim() || !startsOn || qoshish.isPending}
                  onClick={() => qoshish.mutate()}>
            {qoshish.isPending ? <Spinner /> : null}
            Qo'shish
          </button>
          {qoshish.error ? <ErrorNote error={qoshish.error} /> : null}
        </div>
      ) : null}
    </div>
  );
}
