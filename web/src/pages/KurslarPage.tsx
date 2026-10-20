import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { useCan } from '@/store/auth';
import type { Course, CourseKnowledge, KnowledgeKind } from '@/lib/types';
import { som } from '@/lib/format';
import { EmptyState, ErrorNote, Spinner, Toggle } from '@/components/ui';

/** Bugungi sana Toshkent vaqti bilan (YYYY-MM-DD) — sotuv davri shu bo'yicha. */
function bugun(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
}

const sotuvdami = (c: Course, today: string): boolean =>
  c.isActive && c.salesStart <= today && today <= c.salesEnd;

const KIND_LABEL: Record<KnowledgeKind, string> = {
  dastur: 'Dastur',
  savol_javob: 'Savol-javob',
  etiroz: 'E\'tirozlar',
  boshqa: 'Boshqa',
};
const KINDS = Object.keys(KIND_LABEL) as KnowledgeKind[];

interface CourseForm {
  name: string;
  description: string;
  salesStart: string;
  salesEnd: string;
  price: string;
  duration: string;
  topics: string;
  startsOn: string;
  groupLink: string;
  isActive: boolean;
  installmentAllowed: boolean;
  installmentParts: string;
  installmentFirstMin: string;
  linkAfter: 'birinchi_qism' | 'toliq';
}

const BOSH_FORMA: CourseForm = {
  name: '', description: '', salesStart: '', salesEnd: '', price: '', duration: '', topics: '',
  startsOn: '', groupLink: '', isActive: true, installmentAllowed: false, installmentParts: '',
  installmentFirstMin: '', linkAfter: 'birinchi_qism',
};

const formaDan = (c: Course): CourseForm => ({
  name: c.name,
  description: c.description ?? '',
  salesStart: c.salesStart,
  salesEnd: c.salesEnd,
  price: String(c.price),
  duration: c.duration ?? '',
  topics: c.topics.join('\n'),
  startsOn: c.startsOn ?? '',
  groupLink: c.groupLink ?? '',
  isActive: c.isActive,
  installmentAllowed: c.installmentAllowed,
  installmentParts: c.installmentParts ? String(c.installmentParts) : '',
  installmentFirstMin: c.installmentFirstMin ? String(c.installmentFirstMin) : '',
  linkAfter: c.linkAfter,
});

const bosh = (v: string): string | null => (v.trim() ? v.trim() : null);
const sonYoki = (v: string): number | null => (v.trim() ? Number(v.replace(/\s/g, '')) : null);

function payloadDan(f: CourseForm): Record<string, unknown> {
  return {
    name: f.name.trim(),
    description: bosh(f.description),
    salesStart: f.salesStart,
    salesEnd: f.salesEnd,
    price: Number(f.price.replace(/\s/g, '')),
    duration: bosh(f.duration),
    topics: f.topics.split('\n').map((t) => t.trim()).filter(Boolean),
    startsOn: bosh(f.startsOn),
    groupLink: bosh(f.groupLink),
    isActive: f.isActive,
    installmentAllowed: f.installmentAllowed,
    installmentParts: f.installmentAllowed ? sonYoki(f.installmentParts) : null,
    installmentFirstMin: f.installmentAllowed ? sonYoki(f.installmentFirstMin) : null,
    linkAfter: f.linkAfter,
  };
}

export default function KurslarPage() {
  const canEdit = useCan('courses.edit');
  const today = bugun();
  // `null` — hech narsa tanlanmagan, 'new' — yangi kurs formasi.
  const [selected, setSelected] = useState<string | 'new' | null>(null);

  const coursesQuery = useQuery({
    queryKey: ['courses'],
    queryFn: () => api.get<{ items: Course[] }>('/courses'),
  });
  const courses = coursesQuery.data?.items ?? [];
  const current = courses.find((c) => c.id === selected) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <aside className="flex max-h-72 w-full shrink-0 flex-col border-b border-ink-800 md:max-h-none md:w-72 md:border-b-0 md:border-r">
        <header className="flex items-center justify-between border-b border-ink-800 px-4 py-3">
          <div>
            <h1 className="text-base font-semibold">Kurslar</h1>
            <p className="text-xs text-ink-500">{courses.length} ta</p>
          </div>
          {canEdit ? (
            <button type="button" className="btn-ghost shrink-0 !py-1 text-xs" onClick={() => setSelected('new')}>
              + Kurs
            </button>
          ) : null}
        </header>
        <div className="flex-1 overflow-y-auto">
          {coursesQuery.isLoading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : courses.length === 0 ? (
            <EmptyState title="Kurs yo'q" hint="Birinchi kursni yarating." />
          ) : (
            <ul className="divide-y divide-ink-800/60">
              {courses.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(c.id)}
                    className={clsx(
                      'w-full px-4 py-3 text-left transition-colors hover:bg-ink-900/60',
                      selected === c.id && 'bg-ink-800/60',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-medium text-ink-100">{c.name}</p>
                      {sotuvdami(c, today) ? (
                        <span className="chip shrink-0 bg-emerald-500/15 text-emerald-300">Sotuvda</span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[11px] text-ink-500">
                      {c.salesStart} — {c.salesEnd}
                    </p>
                    {!c.isActive ? <p className="text-[11px] text-ink-600">Faol emas</p> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <section className="min-w-0 flex-1 overflow-y-auto">
        {selected === 'new' ? (
          <CourseEditor key="new" course={null} canEdit={canEdit} onSaved={(id) => setSelected(id)} onGone={() => setSelected(null)} />
        ) : current ? (
          <CourseEditor key={current.id} course={current} canEdit={canEdit} onSaved={(id) => setSelected(id)} onGone={() => setSelected(null)} />
        ) : (
          <EmptyState title="Kurs tanlang" hint="Chapdan kursni tanlang yoki yangisini yarating." />
        )}
      </section>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-ink-400">{label}</span>
      {children}
      {hint ? <span className="mt-0.5 block text-[10px] text-ink-600">{hint}</span> : null}
    </label>
  );
}

function CourseEditor({
  course,
  canEdit,
  onSaved,
  onGone,
}: {
  course: Course | null;
  canEdit: boolean;
  onSaved: (id: string) => void;
  onGone: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CourseForm>(course ? formaDan(course) : BOSH_FORMA);
  const set = <K extends keyof CourseForm>(key: K, value: CourseForm[K]): void =>
    setForm((f) => ({ ...f, [key]: value }));

  // Boshqa joyda (masalan boshqa operator) yangilangan kurs formaga tushsin.
  useEffect(() => {
    if (course) setForm(formaDan(course));
  }, [course]);

  const save = useMutation({
    mutationFn: () =>
      course
        ? api.patch<{ course: Course }>(`/courses/${course.id}`, payloadDan(form))
        : api.post<{ course: Course }>('/courses', payloadDan(form)),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['courses'] });
      onSaved(res.course.id);
    },
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/courses/${course!.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['courses'] });
      onGone();
    },
  });

  const davrXato = form.salesStart && form.salesEnd && form.salesEnd < form.salesStart;
  const tayyor = form.name.trim().length >= 2 && form.salesStart && form.salesEnd && !davrXato && Number(form.price.replace(/\s/g, '')) > 0;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="card space-y-3">
        <h2 className="text-sm font-medium">{course ? course.name : 'Yangi kurs'}</h2>
        <fieldset disabled={!canEdit} className="space-y-3">
          <Field label="Nomi">
            <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Tavsif">
            <textarea className="input" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Sotuv boshlanishi">
              <input type="date" className="input" value={form.salesStart} onChange={(e) => set('salesStart', e.target.value)} />
            </Field>
            <Field label="Sotuv tugashi">
              <input type="date" className="input" value={form.salesEnd} onChange={(e) => set('salesEnd', e.target.value)} />
            </Field>
          </div>
          {davrXato ? <p className="text-xs text-red-300">Sotuv tugashi boshlanishidan oldin bo'lmasin</p> : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Narxi (so'm)" hint={form.price ? som(Number(form.price.replace(/\s/g, '')) || 0) : undefined}>
              <input className="input" inputMode="numeric" value={form.price} onChange={(e) => set('price', e.target.value)} />
            </Field>
            <Field label="Davomiyligi">
              <input className="input" placeholder="masalan: 2 oy" value={form.duration} onChange={(e) => set('duration', e.target.value)} />
            </Field>
            <Field label="Kurs boshlanadi">
              <input type="date" className="input" value={form.startsOn} onChange={(e) => set('startsOn', e.target.value)} />
            </Field>
            <Field label="Guruh havolasi" hint="Agent uni o'zi yozmaydi — tizim to'lovdan keyin yuboradi">
              <input className="input" value={form.groupLink} onChange={(e) => set('groupLink', e.target.value)} />
            </Field>
          </div>
          <Field label="Mavzular (har biri alohida qatorda)">
            <textarea className="input" rows={4} value={form.topics} onChange={(e) => set('topics', e.target.value)} />
          </Field>
          <Toggle label="Faol" checked={form.isActive} onChange={(v) => set('isActive', v)} />
          <Toggle label="Bo'lib to'lash mumkin" checked={form.installmentAllowed} onChange={(v) => set('installmentAllowed', v)} />
          {form.installmentAllowed ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Qismlar soni">
                <input className="input" inputMode="numeric" value={form.installmentParts} onChange={(e) => set('installmentParts', e.target.value)} />
              </Field>
              <Field label="Birinchi to'lov (kamida, so'm)">
                <input className="input" inputMode="numeric" value={form.installmentFirstMin} onChange={(e) => set('installmentFirstMin', e.target.value)} />
              </Field>
            </div>
          ) : null}
          <Field label="Guruh havolasi qachon beriladi">
            <select className="input" value={form.linkAfter} onChange={(e) => set('linkAfter', e.target.value as CourseForm['linkAfter'])}>
              <option value="birinchi_qism">Birinchi qism to'langach</option>
              <option value="toliq">To'liq to'langach</option>
            </select>
          </Field>
        </fieldset>

        {save.error ? <ErrorNote error={save.error} /> : null}
        {remove.error ? <ErrorNote error={remove.error} /> : null}
        {canEdit ? (
          <div className="flex gap-2">
            <button type="button" className="btn-primary !py-1.5 text-xs" disabled={!tayyor || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? <Spinner /> : null}
              Saqlash
            </button>
            {course ? (
              <button
                type="button"
                className="btn-danger !py-1.5 text-xs"
                disabled={remove.isPending}
                onClick={() => {
                  if (confirm(`"${course.name}" o'chirilsinmi?`)) remove.mutate();
                }}
              >
                O'chirish
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {course ? <KnowledgeSection courseId={course.id} canEdit={canEdit} /> : (
        <p className="text-xs text-ink-500">Ma'lumotlar bazasi yozuvlari kurs saqlangandan keyin qo'shiladi.</p>
      )}
    </div>
  );
}

function KnowledgeSection({ courseId, canEdit }: { courseId: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const key = useMemo(() => ['course-knowledge', courseId], [courseId]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ kind: KnowledgeKind; title: string; body: string }>({
    kind: 'dastur', title: '', body: '',
  });

  const listQuery = useQuery({
    queryKey: key,
    queryFn: () => api.get<{ items: CourseKnowledge[] }>(`/courses/${courseId}/knowledge`),
  });
  const refresh = (): void => void queryClient.invalidateQueries({ queryKey: key });

  const add = useMutation({
    mutationFn: () => api.post(`/courses/${courseId}/knowledge`, draft),
    onSuccess: () => {
      setAdding(false);
      setDraft({ kind: 'dastur', title: '', body: '' });
      refresh();
    },
  });
  const update = useMutation({
    mutationFn: (v: { id: string; patch: Record<string, unknown> }) => api.patch(`/courses/knowledge/${v.id}`, v.patch),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/courses/knowledge/${id}`),
    onSuccess: refresh,
  });

  const items = listQuery.data?.items ?? [];
  const error = add.error ?? update.error ?? remove.error;

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium">Ma'lumotlar bazasi</h2>
          <p className="text-[11px] text-ink-500">Agent shu yozuvlar asosida kurs haqida javob beradi</p>
        </div>
        {canEdit ? (
          <button type="button" className="btn-ghost !py-1 text-[11px]" onClick={() => setAdding(!adding)}>
            + Qo'shish
          </button>
        ) : null}
      </div>

      {error ? <ErrorNote error={error} /> : null}

      {adding ? (
        <div className="space-y-2 rounded-lg border border-brand-500/30 bg-brand-500/5 p-3">
          <select className="input" value={draft.kind} onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value as KnowledgeKind }))}>
            {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
          <input className="input" placeholder="Sarlavha" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
          <textarea className="input" rows={4} placeholder="Matn" value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} />
          <div className="flex gap-2">
            <button type="button" className="btn-primary !py-1 text-xs" disabled={add.isPending || !draft.title.trim() || !draft.body.trim()} onClick={() => add.mutate()}>
              Saqlash
            </button>
            <button type="button" className="btn-ghost !py-1 text-xs" onClick={() => setAdding(false)}>Bekor</button>
          </div>
        </div>
      ) : null}

      {listQuery.isLoading ? (
        <div className="flex justify-center py-4"><Spinner /></div>
      ) : items.length === 0 ? (
        <p className="py-3 text-center text-xs text-ink-600">Yozuv yo'q</p>
      ) : (
        KINDS.map((kind) => {
          const group = items.filter((i) => i.kind === kind);
          if (group.length === 0) return null;
          return (
            <div key={kind}>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-500">{KIND_LABEL[kind]}</p>
              <ul className="space-y-1.5">
                {group.map((item) => (
                  <KnowledgeRow
                    key={item.id}
                    item={item}
                    canEdit={canEdit}
                    isEditing={editing === item.id}
                    onEdit={() => setEditing(item.id)}
                    onCancel={() => setEditing(null)}
                    onSave={(patch) => update.mutate({ id: item.id, patch })}
                    onToggle={(v) => update.mutate({ id: item.id, patch: { isEnabled: v } })}
                    onDelete={() => {
                      if (confirm('Bu yozuv o\'chirilsinmi?')) remove.mutate(item.id);
                    }}
                  />
                ))}
              </ul>
            </div>
          );
        })
      )}
    </div>
  );
}

function KnowledgeRow({
  item, canEdit, isEditing, onEdit, onCancel, onSave, onToggle, onDelete,
}: {
  item: CourseKnowledge;
  canEdit: boolean;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (patch: { kind: KnowledgeKind; title: string; body: string }) => void;
  onToggle: (v: boolean) => void;
  onDelete: () => void;
}) {
  const [v, setV] = useState({ kind: item.kind, title: item.title, body: item.body });
  useEffect(() => {
    if (isEditing) setV({ kind: item.kind, title: item.title, body: item.body });
  }, [isEditing, item]);

  if (isEditing) {
    return (
      <li className="space-y-2 rounded-lg border border-ink-700 bg-ink-900/40 p-3">
        <select className="input" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as KnowledgeKind })}>
          {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        <input className="input" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
        <textarea className="input" rows={4} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} />
        <div className="flex gap-2">
          <button type="button" className="btn-primary !py-1 text-xs" disabled={!v.title.trim() || !v.body.trim()} onClick={() => onSave(v)}>
            Saqlash
          </button>
          <button type="button" className="btn-ghost !py-1 text-xs" onClick={onCancel}>Bekor</button>
        </div>
      </li>
    );
  }

  return (
    <li className={clsx('rounded-lg border border-ink-800 p-3', !item.isEnabled && 'opacity-50')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-100">{item.title}</p>
          <p className="mt-0.5 whitespace-pre-wrap text-xs text-ink-400">{item.body}</p>
        </div>
        {canEdit ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <Toggle size="sm" label="Yoqilgan" checked={item.isEnabled} onChange={onToggle} />
            <button type="button" className="btn-ghost !py-0.5 text-[11px]" onClick={onEdit}>Tahrirlash</button>
            <button type="button" className="btn-ghost !py-0.5 text-[11px] text-red-300" onClick={onDelete}>O'chirish</button>
          </div>
        ) : null}
      </div>
    </li>
  );
}
