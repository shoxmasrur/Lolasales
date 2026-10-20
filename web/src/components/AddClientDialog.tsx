import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Client, Course } from '@/lib/types';
import { useCan } from '@/store/auth';
import { ErrorNote, Spinner } from '@/components/ui';
import { Sheet } from '@/components/Sheet';

/**
 * "+ Mijoz qo'shish" oynasi — lead qo'lda qo'shiladi (manba "Qo'lda").
 *
 * Shu telefonli mijoz bazada bo'lsa yangisi yaratilmaydi: server mavjudini
 * qaytaradi va oyna uni ochadi. Kurs tanlansa xarid shu kursga ochiladi.
 */
export function AddClientDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (clientId: string) => void;
}) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [courseId, setCourseId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [mavjud, setMavjud] = useState<Client | null>(null);

  const canSeeCourses = useCan('courses.view');
  const coursesQuery = useQuery({
    queryKey: ['courses'],
    queryFn: () => api.get<{ items: Course[] }>('/courses'),
    enabled: canSeeCourses,
  });
  const kurslar = (coursesQuery.data?.items ?? []).filter((c) => c.isActive);

  const tayyor = fullName.trim().length >= 2 && phone.trim().length > 0;

  const create = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ client: Client; created: boolean }>('/clients', {
        fullName: fullName.trim(),
        phone: phone.trim(),
        courseId: courseId || null,
      });
      if (res.created) {
        onCreated(res.client.id);
        return;
      }
      // Shu raqamli mijoz bor — yangisi yaratilmadi.
      setMavjud(res.client);
      setBusy(false);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      // Saqlash ketayotganda dialog yopilmasin.
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Mijoz qo'shish"
      maxWidth="max-w-lg"
    >
      <div className="space-y-3 p-4 md:p-5">
        <p className="text-xs leading-relaxed text-ink-400">
          Ism va telefon raqamini kiriting. Mijoz «Qo'lda» manbasi bilan qo'shiladi; suhbatni
          keyin kartadan yoki kampaniya orqali boshlaysiz.
        </p>

        <div>
          <label className="label">Ism</label>
          <input
            autoFocus
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Masalan: Aziz Karimov"
            className="input"
          />
        </div>

        <div>
          <label className="label">Telefon</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && tayyor && !busy) void create();
            }}
            placeholder="+998 90 123 45 67"
            className="input"
          />
        </div>

        {canSeeCourses ? (
          <div>
            <label className="label">Kurs (ixtiyoriy)</label>
            <select className="input" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">Tanlanmagan</option>
              {kurslar.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <ErrorNote error={error} />

        {mavjud ? (
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-300">
            Bu raqam bazada bor: {mavjud.fullName}. «Ochish» uning kartasini ko'rsatadi.
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost !py-1 text-xs" disabled={busy} onClick={onClose}>
            Bekor qilish
          </button>
          {mavjud ? (
            <button type="button" className="btn-primary !py-1 text-xs" onClick={() => onCreated(mavjud.id)}>
              Ochish
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary !py-1 text-xs"
              disabled={busy || !tayyor}
              onClick={() => void create()}
            >
              {busy ? <Spinner /> : null}
              Qo'shish
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
