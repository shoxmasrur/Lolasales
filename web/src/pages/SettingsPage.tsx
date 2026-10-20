import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCan } from '@/store/auth';
import type { LlmModel, OutreachSettings, PaymentCard } from '@/lib/types';
import { relative } from '@/lib/format';
import { ErrorNote, Spinner, Toggle } from '@/components/ui';
import { RecontactTopicsSettings } from '@/components/recontact/RecontactTopicsSettings';
import { XulosaBotiPanel } from '@/components/XulosaBotiPanel';

const WEEKDAYS = [
  { value: 1, label: 'Du' },
  { value: 2, label: 'Se' },
  { value: 3, label: 'Ch' },
  { value: 4, label: 'Pa' },
  { value: 5, label: 'Ju' },
  { value: 6, label: 'Sh' },
  { value: 7, label: 'Ya' },
];

interface ResetSummary {
  conversations: number;
  messages: number;
  promises: number;
  profiles: number;
  campaignTargets: number;
}

interface AuditRow {
  actor: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  /** Amalning tafsiloti — har amal uchun o'z shakli bor. */
  payload?: unknown;
  createdAt: string;
}

/**
 * Jurnal qatorining o'qiladigan tafsiloti.
 *
 * NEGA KERAK: jadvalda faqat "kim / qanday amal / qachon" turardi va
 * `client.name_mismatch_override` kabi qatorlar javobsiz qolardi —
 * savol aynan "QAYSI mijozga yozilgan?" bo'ladi, javob esa `payload`
 * ichida turardi-yu, ekranga chiqmasdi.
 *
 * Tanish maydonlar chiqariladi, tanilmagani umuman ko'rsatilmaydi:
 * jadvalni xom JSON bilan to'ldirish uni o'qib bo'lmas holga keltiradi.
 */
function auditTafsilot(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const matn = (k: string): string | null =>
    typeof p[k] === 'string' && p[k] ? (p[k] as string) : null;

  const qismlar: string[] = [];
  // Eksport jurnali (`clients.exported`) — mijoz ismi emas, nechta yozuv
  // olinganini ko'rsatamiz. Aks holda bu qator butunlay bo'sh chiqardi.
  if (typeof p.count === 'number') qismlar.push(`${p.count} ta yozuv`);

  const mijoz = matn('mijoz');
  const telegramda = matn('telegramda');
  const phone = matn('phone');

  if (mijoz) qismlar.push(mijoz);
  if (telegramda) qismlar.push(`→ ${telegramda}`);
  else if (mijoz) qismlar.push('→ (Telegramda ism yo\'q)');
  if (phone) qismlar.push(`· ${phone}`);
  // Qidiruv paytida topilgan mos kelmaslik: operator ismlar ro'yxatini
  // ko'rmagan, "chiqsa ham yuborilsin" deb umumiy ruxsat bergan.
  if (p.qidiruvda_topildi === true) qismlar.push('· qidiruvda topilgan');

  // Kunlik xulosa boti: qaysi bot saqlangani (`token_saved`) yoki qaysi
  // chatga ulanganini (`chat_linked`) ko'rsatamiz — token o'zi hech qachon
  // bu yerga tushmaydi (payload'da yo'q).
  const botUsername = matn('botUsername');
  if (botUsername) qismlar.push(`@${botUsername}`);

  const chatNomi = matn('chatNomi');
  if (chatNomi) qismlar.push(chatNomi);
  if (typeof p.chatId === 'string' && p.chatId) qismlar.push(`(${p.chatId})`);

  return qismlar.length ? qismlar.join(' ') : null;
}

/**
 * OpenAI kaliti va til modellari — Sozlamalar sahifasining "AI modellari"
 * bo'limi.
 *
 * NEGA ALOHIDA KOMPONENT: bu
 * yerda ham bir nechta mustaqil holat bor (kalit maydoni, "yangilash"
 * natijasi, tekshiruv xabarlari), ularni asosiy `SettingsPage`ning umumiy
 * `form` holatiga aralashtirish sahifani chalkashtirardi.
 *
 * Butun bo'lim `settings.edit`ka bog'liq: server tomonda `llmRoutes.ts`
 * BARCHA yo'llarni (o'qishni ham) shu ruxsat bilan yopgan — shuning uchun
 * bu yerda ham faqat o'qish uchun alohida `settings.view` tekshirilmaydi.
 */
function LlmSettingsPanel() {
  const admin = useCan('settings.edit');
  const qc = useQueryClient();

  // `manba` — kalit qayerdan kelayotgani: `.env` dan kelsa paneldan
  // o'chirib bo'lmaydi (`LlmKaliti.kalitManbasi()` izohiga qarang).
  const keyQuery = useQuery({
    queryKey: ['llm-key'],
    queryFn: () => api.get<{ hasKey: boolean; manba: 'baza' | 'env' | null }>('/llm/key'),
    enabled: admin,
  });

  const modelsQuery = useQuery({
    queryKey: ['llm-models'],
    queryFn: () => api.get<{ items: LlmModel[] }>('/llm/models'),
    enabled: admin,
  });

  // Kalit maydoni HAR DOIM bo'sh boshlanadi — server uni hech qachon
  // qaytarmaydi (`llmRoutes.ts` izohi), shuning uchun "to'ldirilgan"
  // ko'rinishga kelishi mumkin emas: faqat holat matni (`hasKey`) orqali
  // bildiriladi.
  const [keyInput, setKeyInput] = useState('');
  const saveKey = useMutation({
    mutationFn: (key: string | null) =>
      api.put<{ hasKey: boolean; manba: 'baza' | 'env' | null }>('/llm/key', { key }),
    onSuccess: () => {
      setKeyInput('');
      void qc.invalidateQueries({ queryKey: ['llm-key'] });
    },
  });

  // "Modellarni yangilash" — OpenAI'dan RO'YXAT so'raladi (server o'zi
  // kalit bilan so'raydi). Natija faqat shu paneldagi tanlov uchun,
  // bazaga hech narsa yozilmaydi — shu sabab `useQuery` emas, tugma
  // bosilganda ishlaydigan `useMutation`.
  const availableModels = useMutation({
    mutationFn: () => api.get<{ items: Array<{ id: string }> }>('/llm/openai/available'),
  });

  const [pickedModel, setPickedModel] = useState('');
  const [label, setLabel] = useState('');
  const [inputPrice, setInputPrice] = useState('');
  const [outputPrice, setOutputPrice] = useState('');

  const createModel = useMutation({
    mutationFn: () =>
      api.post<LlmModel>('/llm/models', {
        provider: 'openai',
        model: pickedModel,
        label: label.trim(),
        // Bo'sh maydon — "hali kiritilmagan" (`null`), 0 EMAS: 0 xato
        // ravishda "bepul" deb hisoblanardi.
        inputPricePerMtok: inputPrice.trim() === '' ? null : Number(inputPrice),
        outputPricePerMtok: outputPrice.trim() === '' ? null : Number(outputPrice),
      }),
    onSuccess: () => {
      setPickedModel('');
      setLabel('');
      setInputPrice('');
      setOutputPrice('');
      void qc.invalidateQueries({ queryKey: ['llm-models'] });
    },
  });

  const patchModel = useMutation({
    mutationFn: (payload: { id: string; patch: Partial<Pick<LlmModel, 'isEnabled'>> }) =>
      api.patch<LlmModel>(`/llm/models/${payload.id}`, payload.patch),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['llm-models'] }),
  });

  const deleteModel = useMutation({
    mutationFn: (id: string) => api.delete(`/llm/models/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['llm-models'] }),
  });

  // Tekshiruv natijasi bazaga yozilmaydi (`llmRoutes.ts`dagi probe
  // marshruti haqiqiy tarmoqqa chiqib, `{ ok, message }` qaytaradi) —
  // shu sabab faqat shu paneldagi vaqtinchalik holat, model ID bo'yicha.
  const [probeResults, setProbeResults] = useState<Record<string, { ok: boolean; message: string }>>(
    {},
  );
  const probeModel = useMutation({
    mutationFn: (id: string) => api.post<{ ok: boolean; message: string }>(`/llm/models/${id}/probe`),
    onSuccess: (data, id) => setProbeResults((prev) => ({ ...prev, [id]: data })),
  });

  if (!admin) return null;

  const models = modelsQuery.data?.items ?? [];

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="text-sm font-medium">AI modellari</h2>
        <p className="mt-1 text-xs text-ink-500">
          Agent OpenAI orqali ishlaydigan modellar — kalit, narx va akkauntga
          biriktirish shu yerda sozlanadi. Claude jadvaldan tanlanmaydi: u
          doim standart dvigatel, model nomi kodda qattiq yozilgan.
        </p>
      </div>

      <div className="max-w-sm">
        <label className="label">OpenAI kaliti</label>
        <div className="flex items-center gap-2">
          <input
            type="password"
            className="input"
            value={keyInput}
            disabled={saveKey.isPending}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder={keyQuery.data?.hasKey ? 'Yangisi bilan almashtirish uchun kiriting' : 'sk-...'}
          />
          <button
            type="button"
            className="btn-primary !py-1.5 text-xs"
            disabled={!keyInput.trim() || saveKey.isPending}
            onClick={() => saveKey.mutate(keyInput.trim())}
          >
            {saveKey.isPending ? <Spinner /> : null}
            Saqlash
          </button>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-500">
          {keyQuery.isLoading
            ? 'Tekshirilmoqda…'
            : keyQuery.data?.manba === 'env'
              ? 'Kalit `.env` faylidan keladi — uni paneldan o\'chirib bo\'lmaydi.'
              : keyQuery.data?.hasKey
                ? 'Kalit kiritilgan.'
                : 'Kalit yo\'q — hech qaysi model ishlamaydi.'}{' '}
          Kalitning o'zi hech qachon panelga qaytarilmaydi — faqat bor/yo'q holati ko'rsatiladi.
        </p>
        {keyQuery.data?.hasKey && keyQuery.data?.manba === 'baza' ? (
          <button
            type="button"
            className="btn-ghost mt-2 !py-1 text-xs text-red-300"
            disabled={saveKey.isPending}
            onClick={() => {
              if (confirm('Kalit o\'chirilsinmi? Shundan keyin OpenAI modellari ishlamay qoladi.')) {
                saveKey.mutate(null);
              }
            }}
          >
            O'chirish
          </button>
        ) : null}
        {saveKey.error ? (
          <div className="mt-2">
            <ErrorNote error={saveKey.error} />
          </div>
        ) : null}
      </div>

      <div className="border-t border-ink-800 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-ghost !py-1 text-xs"
            disabled={availableModels.isPending}
            onClick={() => availableModels.mutate()}
          >
            {availableModels.isPending ? <Spinner /> : null}
            Modellarni yangilash
          </button>
          <span className="text-[11px] text-ink-600">
            OpenAI'dan mavjud modellar ro'yxati so'raladi — kalit avval kiritilgan bo'lishi kerak.
          </span>
        </div>
        {availableModels.error ? (
          <div className="mt-2">
            <ErrorNote error={availableModels.error} />
          </div>
        ) : null}

        {availableModels.data ? (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div>
              <label className="label">Model</label>
              <select
                className="input !py-1 text-xs"
                value={pickedModel}
                onChange={(e) => setPickedModel(e.target.value)}
              >
                <option value="">— tanlang —</option>
                {availableModels.data.items.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Nomi</label>
              <input
                className="input !py-1 w-36 text-xs"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Masalan: GPT-4.1 tez"
              />
            </div>
            <div>
              <label className="label">Kirish narxi ($/MTok)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                className="input !py-1 w-28 text-xs"
                value={inputPrice}
                onChange={(e) => setInputPrice(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Chiqish narxi ($/MTok)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                className="input !py-1 w-28 text-xs"
                value={outputPrice}
                onChange={(e) => setOutputPrice(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn-primary !py-1 text-xs"
              disabled={!pickedModel || !label.trim() || createModel.isPending}
              onClick={() => createModel.mutate()}
            >
              {createModel.isPending ? <Spinner /> : null}
              Qo'shish
            </button>
          </div>
        ) : null}
        {createModel.error ? (
          <div className="mt-2">
            <ErrorNote error={createModel.error} />
          </div>
        ) : null}
      </div>

      <div className="border-t border-ink-800 pt-4">
        {modelsQuery.isLoading ? <Spinner /> : null}
        {models.length === 0 ? (
          <p className="text-xs text-ink-600">Hali model qo'shilmagan.</p>
        ) : (
          <div className="table-wrap rounded-xl border border-ink-800">
            <table className="w-full text-xs">
              <thead className="bg-ink-900/60 uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Nomi</th>
                  <th className="px-3 py-2 text-left font-medium">Provayder</th>
                  <th className="px-3 py-2 text-left font-medium">Model</th>
                  <th className="px-3 py-2 text-right font-medium">Kirish $/MTok</th>
                  <th className="px-3 py-2 text-right font-medium">Chiqish $/MTok</th>
                  <th className="px-3 py-2 text-center font-medium">Yoqilgan</th>
                  <th className="px-4 py-2 text-right font-medium" />
                </tr>
              </thead>
              <tbody>
                {models.map((m) => {
                  const probe = probeResults[m.id];
                  return (
                    <tr key={m.id} className="border-t border-ink-800/60 align-top">
                      <td className="px-4 py-1.5 text-ink-200">{m.label}</td>
                      <td className="px-3 py-1.5 text-ink-500">{m.provider}</td>
                      <td className="px-3 py-1.5 font-mono text-ink-400">{m.model}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-ink-300">
                        {m.inputPricePerMtok ?? '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-ink-300">
                        {m.outputPricePerMtok ?? '—'}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <Toggle
                          checked={m.isEnabled}
                          disabled={patchModel.isPending}
                          onChange={(v) => patchModel.mutate({ id: m.id, patch: { isEnabled: v } })}
                        />
                      </td>
                      <td className="px-4 py-1.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            className="btn-ghost !py-0.5 text-xs"
                            disabled={probeModel.isPending && probeModel.variables === m.id}
                            onClick={() => probeModel.mutate(m.id)}
                          >
                            {probeModel.isPending && probeModel.variables === m.id ? <Spinner /> : null}
                            Tekshirish
                          </button>
                          <button
                            type="button"
                            className="btn-ghost !py-0.5 text-xs text-red-300"
                            disabled={deleteModel.isPending}
                            onClick={() => {
                              if (
                                confirm(
                                  `"${m.label}" o'chirilsinmi? Shu modelga biriktirilgan akkauntlar ` +
                                    'standart dvigatelga (Claude) qaytadi.',
                                )
                              ) {
                                deleteModel.mutate(m.id);
                              }
                            }}
                          >
                            O'chirish
                          </button>
                        </div>
                        {probe ? (
                          <p className={`mt-1 text-[11px] ${probe.ok ? 'text-emerald-400' : 'text-red-300'}`}>
                            {probe.message}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const admin = useCan('settings.edit');
  const canKill = useCan('settings.kill_switch');
  const canAudit = useCan('audit.view');
  const canReset = useCan('conversations.reset');

  const [form, setForm] = useState<OutreachSettings | null>(null);
  const [resetCampaigns, setResetCampaigns] = useState(true);

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<{ settings: OutreachSettings }>('/settings'),
  });

  const auditQuery = useQuery({
    queryKey: ['audit'],
    queryFn: () => api.get<{ items: AuditRow[] }>('/settings/audit', { limit: 50 }),
    enabled: canAudit,
  });

  useEffect(() => {
    if (settingsQuery.data) setForm(settingsQuery.data.settings);
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (patch: Partial<OutreachSettings>) =>
      api.patch<{ settings: OutreachSettings }>('/settings', patch),
    onSuccess: (data) => {
      setForm(data.settings);
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const resetMutation = useMutation({
    mutationFn: () =>
      api.post<{ summary: ResetSummary }>('/conversations/reset', { resetCampaigns }),
    onSuccess: () => {
      // Suhbatlar, mijoz ro'yxati va statistikaning hammasi o'zgardi.
      void queryClient.invalidateQueries();
    },
  });

  if (!form) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const patch = <K extends keyof OutreachSettings>(key: K, value: OutreachSettings[K]): void =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="hidden border-b border-ink-800 px-4 py-3 md:block md:px-6 md:py-4">
        <h1 className="text-base font-semibold">Sozlamalar</h1>
        <p className="mt-0.5 text-xs text-ink-500">
          Yuborish tezligi, ish vaqti va agentning avtomatik javob rejimi
        </p>
      </header>

      <div className="max-w-3xl space-y-5 p-4 md:p-6">
        <div
          className={`card ${form.killSwitch ? 'border-red-500/40 bg-red-500/5' : 'border-emerald-500/25'}`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-medium">
                {form.killSwitch ? 'Yuborish TO\'XTATILGAN' : 'Yuborish yoqilgan'}
              </h2>
              <p className="mt-1 text-xs text-ink-500">
                To'xtatilganda hech qanday xabar ketmaydi — na agent, na operator, na kampaniya.
                Favqulodda holatda darhol bosing.
              </p>
            </div>
            <Toggle
              checked={!form.killSwitch}
              disabled={!canKill || saveMutation.isPending}
              onChange={(v) => {
                patch('killSwitch', !v);
                saveMutation.mutate({ killSwitch: !v });
              }}
            />
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="text-sm font-medium">Yuborish tezligi</h2>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" title="Faqat yangi suhbat boshlashga tegishli">
                Kampaniya uchun kunlik standart
              </label>
              <input
                type="number"
                className="input"
                value={form.dailyLimit}
                disabled={!admin}
                onChange={(e) => patch('dailyLimit', Number(e.target.value) || 1)}
              />
              <p className="mt-1 text-[11px] leading-relaxed text-ink-500">
                Yangi kampaniya shu qiymat bilan yaratiladi. Akkauntning o'z kunlik
                chegarasi Telegram sahifasida sozlanadi.
              </p>
            </div>
            <div>
              <label className="label">Min. pauza (sek)</label>
              <input
                type="number"
                className="input"
                value={form.minDelaySec}
                disabled={!admin}
                onChange={(e) => patch('minDelaySec', Number(e.target.value) || 5)}
              />
            </div>
            <div>
              <label className="label">Maks. pauza (sek)</label>
              <input
                type="number"
                className="input"
                value={form.maxDelaySec}
                disabled={!admin}
                onChange={(e) => patch('maxDelaySec', Number(e.target.value) || 5)}
              />
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-ink-500">
            Telegram notanish odamlarga ko'p yozilganda akkauntni bloklaydi (PEER_FLOOD). Bu ikki
            qiymat — xabarlar orasidagi ENG QISQA pauza. Haqiqiy oraliq bundan uzunroq: kunlik
            limit ish vaqtiga taqsimlanadi (10 soat / 30 ta ≈ 20 daqiqa) va har safar tasodifiy
            bo'ladi — bir xil oraliq o'zi spam filtri uchun signal. Spam filtri ishga tushsa,
            kampaniya avtomatik pauza qilinadi.
            <br />
            <span className="text-ink-300">
              Kunlik limit faqat YANGI suhbat boshlashga tegishli.
            </span>{' '}
            Mijoz o'zi yozgan suhbatdagi javoblar bu limitga kirmaydi va uni sarflamaydi —
            agent kun davomida javob beraveradi.
          </p>
        </div>

        <div className="card space-y-4">
          <h2 className="text-sm font-medium">Akkaunt navbati</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Xabarlar orasida — min. (sek)</label>
              <input
                type="number"
                className="input"
                value={form.gateMessageMinSec}
                disabled={!admin}
                onChange={(e) => patch('gateMessageMinSec', Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="label">Xabarlar orasida — maks. (sek)</label>
              <input
                type="number"
                className="input"
                value={form.gateMessageMaxSec}
                disabled={!admin}
                onChange={(e) => patch('gateMessageMaxSec', Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="label">Qidiruv va tekshiruv — min. (sek)</label>
              <input
                type="number"
                className="input"
                value={form.gateOtherMinSec}
                disabled={!admin}
                onChange={(e) => patch('gateOtherMinSec', Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="label">Qidiruv va tekshiruv — maks. (sek)</label>
              <input
                type="number"
                className="input"
                value={form.gateOtherMaxSec}
                disabled={!admin}
                onChange={(e) => patch('gateOtherMaxSec', Number(e.target.value) || 0)}
              />
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-ink-500">
            Bitta akkaunt bir vaqtda Telegramga FAQAT BITTA so'rov yuboradi: mijozga
            yozayotgan payt boshqa mijozni qidirmaydi, ikkita xabarni baravar jo'natmaydi.
            Bu qiymatlar — ikki so'rov orasidagi tasodifiy tanaffus. Doimiy bir xil oraliq
            ham, bir vaqtda ketgan so'rovlar ham Telegram uchun bot belgisi.
            <br />
            <span className="text-ink-300">
              Yuqoridagi kampaniya pauzasi bilan adashtirmang: u ikki MIJOZ orasidagi oraliq
              va daqiqalar bilan o'lchanadi. Bu esa har qanday ikki so'rov orasidagi eng
              kichik bo'shliq — mijozga javob ham, qidiruv ham shunga bo'ysunadi.
            </span>{' '}
            Mijozning javobi navbatda ommaviy qidiruvdan oldinga o'tadi.
          </p>
        </div>

        <div className="card space-y-4">
          <h2 className="text-sm font-medium">Ish vaqti</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Boshlanish</label>
              <input
                type="time"
                className="input"
                value={form.windowStart}
                disabled={!admin}
                onChange={(e) => patch('windowStart', e.target.value)}
              />
            </div>
            <div>
              <label className="label">Tugash</label>
              <input
                type="time"
                className="input"
                value={form.windowEnd}
                disabled={!admin}
                onChange={(e) => patch('windowEnd', e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="label">Ish kunlari</label>
            <div className="flex gap-1.5">
              {WEEKDAYS.map((d) => {
                const active = form.weekdays.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    disabled={!admin}
                    onClick={() =>
                      patch(
                        'weekdays',
                        active
                          ? form.weekdays.filter((w) => w !== d.value)
                          : [...form.weekdays, d.value].sort((a, b) => a - b),
                      )
                    }
                    className={`h-9 w-9 rounded-lg text-xs font-medium transition-colors ${
                      active ? 'bg-brand-600 text-white' : 'bg-ink-800 text-ink-400 hover:bg-ink-700'
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="text-sm font-medium">Agent</h2>

          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-ink-200">Avtomatik javob berish</p>
              <p className="mt-0.5 text-xs text-ink-500">
                Yoqilgan bo'lsa — agent mijozning javobiga o'zi javob yozadi va yuboradi.
                O'chirilganda — javobni qoralama sifatida tayyorlaydi, siz tasdiqlaysiz.
              </p>
            </div>
            <Toggle
              checked={form.agentAutoReply}
              disabled={!admin}
              onChange={(v) => patch('agentAutoReply', v)}
            />
          </div>

          <div className="max-w-xs">
            <label className="label">Agent ismi — standart</label>
            <input
              className="input"
              value={form.personaName}
              disabled={!admin}
              onChange={(e) => patch('personaName', e.target.value)}
            />
            <p className="mt-1 text-[11px] leading-relaxed text-ink-500">
              Telegram akkauntida o'z ismi ko'rsatilmagan bo'lsa shu ism ishlatiladi.
            </p>
          </div>
        </div>

        <LlmSettingsPanel />

        <KartalarPanel />

        <div className="card space-y-4">
          <h2 className="text-sm font-medium">Va'da kunidagi eslatma</h2>

          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-ink-200">Kelishilgan kuni eslatib qo'yish</p>
              <p className="mt-0.5 text-xs text-ink-500">
                Mijoz "15-avgustda to'layman" degan bo'lsa — o'sha kuni ertalab bitta
                yumshoq eslatma ketadi ("bugun kelishuvimiz kuni edi"). Bosim emas:
                mijoz hali kechikmagan. Har bir va'da uchun faqat bir marta.
              </p>
            </div>
            <Toggle
              checked={form.promiseReminder}
              disabled={!admin}
              onChange={(v) => patch('promiseReminder', v)}
            />
          </div>

          <div className="max-w-xs">
            <label className="label">Eslatma shu vaqtgacha yuboriladi</label>
            <input
              type="time"
              className="input"
              value={form.promiseReminderUntil}
              disabled={!admin || !form.promiseReminder}
              onChange={(e) => patch('promiseReminderUntil', e.target.value)}
            />
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-500">
              Ish vaqti boshlanganidan shu vaqtgacha. Kunning ikkinchi yarmidagi eslatma
              mijozga ta'qib bo'lib tuyuladi — tushgacha qo'yish tavsiya etiladi.
            </p>
          </div>

          <div className="max-w-xs">
            <label className="label">"Pul tushdi" xabari shu vaqtgacha</label>
            <input
              type="time"
              className="input"
              value={form.promiseThanksUntil}
              disabled={!admin}
              onChange={(e) => patch('promiseThanksUntil', e.target.value)}
            />
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-500">
              To'lov bankdan tunda ham ko'rinishi mumkin, lekin xabar ish vaqtida —
              boshlanishidan shu vaqtgacha va yuqoridagi hafta kunlarida ketadi.
              Tashqarida qolgani yo'qolmaydi, ertalab yuboriladi.
            </p>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-medium">Eslatma</div>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-500">
                "Qiziqdi" yoki "Karta yuborildi" bosqichida mijoz javob bermasa, agent
                har bosqich uchun BITTA yumshoq eslatma yuboradi. Faqat yuborish
                oynasi ichida va limitlarga amal qilgan holda.
              </p>
            </div>
            <Toggle
              checked={form.eslatmaYoqilgan}
              disabled={!admin}
              onChange={(v) => patch('eslatmaYoqilgan', v)}
            />
          </div>

          <div className="max-w-xs">
            <label className="label">Necha soatdan keyin eslatish</label>
            <input
              type="number"
              min={1}
              max={168}
              className="input"
              value={form.eslatmaSoat}
              disabled={!admin || !form.eslatmaYoqilgan}
              onChange={(e) => patch('eslatmaSoat', Number(e.target.value))}
            />
          </div>

          <div className="max-w-xs">
            <label className="label">Minimal qarzdorlik chegarasi (so'm)</label>
            <input
              type="number"
              min={0}
              max={10_000_000}
              step={10_000}
              className="input"
              value={form.minDebt}
              disabled={!admin}
              onChange={(e) => patch('minDebt', Number(e.target.value))}
            />
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-500">
              Kechikkan to'lovi shu summadan katta bo'lmagan mijozga
              yozilmaydi: 800-1000 so'mlik qoldiq yaxlitlash farqi, uning
              uchun yuborilgan xabar hech narsani tezlashtirmaydi. Hisob
              mijozning yoziladigan BARCHA shartnomalari (Сотилди, К оплате,
              Проц. отказ) bo'yicha yig'ib
              olinadi. 0 — chegara yo'q.
            </p>
            {form.minDebt === 0 ? (
              // Maydonni tozalash ham `0` beradi — sozlama sukut saqlashda
              // sezdirmasdan o'chib qolmasin, shu yerda ochiq ogohlantiramiz.
              <p className="mt-1 text-[11px] leading-relaxed text-amber-400">
                Chegara o'chirilgan — 800 so'mlik qoldiqqa ham yoziladi.
              </p>
            ) : null}
          </div>

          <div className="border-t border-ink-800 pt-4">
            <div className="font-medium">Kanal izohlari (Guruhlar)</div>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-500">
              Kanal postlari ostidagi izohlar shu so'zlar bo'yicha saralanadi. Har qatorda bitta
              so'z yoki ibora; katta-kichik harf va tutuq belgisi turlari farq qilmaydi.
              "+" — faqat izoh to'liq "+" bo'lsa mos keladi.
            </p>
          </div>

          <div className="max-w-md">
            <label className="label">Kalit so'zlar</label>
            <textarea
              className="input min-h-[7rem]"
              value={form.izohKalitSozlari.join('\n')}
              disabled={!admin}
              onChange={(e) => patch('izohKalitSozlari', e.target.value.split('\n'))}
            />
          </div>

          <div className="max-w-xs">
            <label className="label">Bir yig'ishda jami izohlar</label>
            <input
              type="number"
              min={50}
              max={2000}
              step={50}
              className="input"
              value={form.izohLimit}
              disabled={!admin}
              onChange={(e) => patch('izohLimit', Number(e.target.value))}
            />
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-500">
              Barcha tanlangan postlar bo'yicha jami (50–2000). Ko'p o'qish akkauntni Telegram
              cheklovlariga yaqinlashtiradi.
            </p>
          </div>
        </div>

        {saveMutation.error ? <ErrorNote error={saveMutation.error} /> : null}

        {admin ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="btn-primary"
              disabled={saveMutation.isPending}
              onClick={() =>
                saveMutation.mutate({
                  dailyLimit: form.dailyLimit,
                  minDelaySec: form.minDelaySec,
                  maxDelaySec: form.maxDelaySec,
                  windowStart: form.windowStart,
                  windowEnd: form.windowEnd,
                  weekdays: form.weekdays,
                  agentAutoReply: form.agentAutoReply,
                  personaName: form.personaName,
                  promiseReminder: form.promiseReminder,
                  promiseReminderUntil: form.promiseReminderUntil,
                  promiseThanksUntil: form.promiseThanksUntil,
                  eslatmaYoqilgan: form.eslatmaYoqilgan,
                  eslatmaSoat: form.eslatmaSoat,
                  minDebt: form.minDebt,
                  izohKalitSozlari: form.izohKalitSozlari.map((k) => k.trim()).filter(Boolean),
                  izohLimit: form.izohLimit,
                })
              }
            >
              {saveMutation.isPending ? <Spinner /> : null}
              Saqlash
            </button>
            {saveMutation.isSuccess ? <span className="text-xs text-emerald-400">Saqlandi</span> : null}
          </div>
        ) : (
          <p className="text-xs text-ink-500">Sozlamalarni faqat admin o'zgartira oladi.</p>
        )}

        {canReset ? (
          <div className="card border-red-500/30 bg-red-500/5">
            <h2 className="text-sm font-medium text-red-300">Sinovni noldan boshlash</h2>
            <p className="mt-1 text-xs text-ink-400">
              Barcha suhbatlar, xabarlar, va'dalar va agentning mijozlar haqidagi xotirasi
              o'chiriladi. <span className="text-ink-300">Mijozlar, shartnomalar va agent
              qoidalari saqlanib qoladi</span> — import qayta bajarilmaydi.
            </p>

            <label className="mt-3 flex items-center gap-2 text-xs text-ink-300">
              <input
                type="checkbox"
                className="accent-red-400"
                checked={resetCampaigns}
                onChange={(e) => setResetCampaigns(e.target.checked)}
              />
              Kampaniyalarni ham qayta tiklash — o'sha mijozlarga qaytadan xabar yuboriladi
            </label>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="btn-ghost !py-1 text-xs text-red-300"
                disabled={resetMutation.isPending}
                onClick={() => {
                  if (
                    confirm(
                      'Barcha yozishmalar o\'chiriladi. Bu amalni QAYTARIB BO\'LMAYDI.\n\n'
                      + (resetCampaigns
                        ? 'Kampaniyalar ham qayta tiklanadi — mijozlarga yangi xabar ketadi.\n\n'
                        : '')
                      + 'Davom etilsinmi?',
                    )
                  ) {
                    resetMutation.mutate();
                  }
                }}
              >
                {resetMutation.isPending ? <Spinner /> : null}
                Yozishmalarni tozalash
              </button>

              {resetMutation.data ? (
                <span className="text-xs text-emerald-400">
                  {resetMutation.data.summary.conversations} suhbat,{' '}
                  {resetMutation.data.summary.messages} xabar o'chirildi
                  {resetMutation.data.summary.campaignTargets > 0
                    ? `, ${resetMutation.data.summary.campaignTargets} kampaniya nishoni tiklandi`
                    : ''}
                </span>
              ) : null}
              {resetMutation.error ? <ErrorNote error={resetMutation.error} /> : null}
            </div>
          </div>
        ) : null}

        <RecontactTopicsSettings />

        <div className="card space-y-4">
          <XulosaBotiPanel />
        </div>

        {canAudit ? (
          <div>
            <h2 className="mb-2 text-sm font-medium text-ink-200">Amallar jurnali</h2>
            <div className="table-wrap rounded-xl border border-ink-800">
              <table className="w-full text-xs">
                <thead className="bg-ink-900/60 uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Kim</th>
                    <th className="px-3 py-2 text-left font-medium">Amal</th>
                    <th className="px-3 py-2 text-left font-medium">Tafsilot</th>
                    <th className="px-4 py-2 text-right font-medium">Qachon</th>
                  </tr>
                </thead>
                <tbody>
                  {(auditQuery.data?.items ?? []).map((row, i) => {
                    const tafsilot = auditTafsilot(row.payload);
                    // Ism mos kelmagani holda yuborish — jurnaldagi eng
                    // xavfli qator: to'lov ma'lumoti begona odamga ketgan
                    // bo'lishi mumkin. Ko'zga tashlanib tursin.
                    const xavfli = row.action === 'client.name_mismatch_override';
                    return (
                      <tr key={i} className="border-t border-ink-800/60">
                        <td className="px-4 py-1.5 text-ink-300">{row.actor}</td>
                        <td
                          className={`px-3 py-1.5 font-mono ${xavfli ? 'text-amber-300' : 'text-ink-400'}`}
                        >
                          {row.action}
                        </td>
                        <td className={`px-3 py-1.5 ${xavfli ? 'text-amber-200/80' : 'text-ink-500'}`}>
                          {tafsilot ?? '—'}
                        </td>
                        <td className="px-4 py-1.5 text-right text-ink-500">
                          {relative(row.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * To'lov kartalari. Agent karta raqamini o'zi yozmaydi: tizim birinchi FAOL kartani
 * xabar qilib yuboradi. Ro'yxatda faqat oxirgi 4 raqam; to'liq raqam faqat tahrir formasida.
 * Panel o'zi saqlaydi (PATCH /settings, faqat `paymentCards`).
 */
function KartalarPanel() {
  const admin = useCan('settings.edit');
  const qc = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<{ settings: OutreachSettings }>('/settings'),
  });
  const cards = settingsQuery.data?.settings.paymentCards ?? [];

  const save = useMutation({
    mutationFn: (paymentCards: PaymentCard[]) =>
      api.patch<{ settings: OutreachSettings }>('/settings', { paymentCards }),
    onSuccess: () => {
      setEdit(null);
      void qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const [edit, setEdit] = useState<PaymentCard | null>(null);
  const raqamToza = edit ? edit.number.replace(/\D/g, '') : '';
  const yaroqli = !!edit && /^\d{16}$/.test(raqamToza) && edit.holder.trim() !== '' && edit.bank.trim() !== '';

  const submit = () => {
    if (!edit || !yaroqli) return;
    const yangi = { ...edit, number: raqamToza, holder: edit.holder.trim(), bank: edit.bank.trim() };
    const bor = cards.some((c) => c.id === yangi.id);
    save.mutate(bor ? cards.map((c) => (c.id === yangi.id ? yangi : c)) : [...cards, yangi]);
  };

  return (
    <div className="card space-y-3">
      <h2 className="text-sm font-medium">To'lov kartalari</h2>
      <p className="text-xs text-ink-500">
        Mijozga birinchi faol karta yuboriladi. Karta raqamini agent yozmaydi — tizim aniq qiymatni yuboradi.
      </p>
      {cards.length === 0 ? <p className="text-sm text-ink-500">Karta qo'shilmagan.</p> : null}
      <ul className="space-y-2">
        {cards.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
            <div>
              <span className="font-mono">•••• {c.number.slice(-4)}</span>{' '}
              <span className="text-ink-200">{c.holder}</span>{' '}
              <span className="text-ink-500">· {c.bank}</span>
            </div>
            <div className="flex items-center gap-2">
              <Toggle
                checked={c.active}
                disabled={!admin || save.isPending}
                onChange={(v) => save.mutate(cards.map((x) => (x.id === c.id ? { ...x, active: v } : x)))}
              />
              {admin ? (
                <>
                  <button type="button" className="btn-ghost !py-0.5 text-xs" onClick={() => setEdit({ ...c })}>
                    Tahrirlash
                  </button>
                  <button
                    type="button"
                    className="btn-ghost !py-0.5 text-xs text-red-300"
                    disabled={save.isPending}
                    onClick={() => save.mutate(cards.filter((x) => x.id !== c.id))}
                  >
                    O'chirish
                  </button>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {edit ? (
        <div className="space-y-2 rounded border border-ink-700 p-3">
          <input
            className="input font-mono"
            placeholder="Karta raqami (16 ta raqam)"
            inputMode="numeric"
            value={edit.number}
            onChange={(e) => setEdit({ ...edit, number: e.target.value })}
          />
          <input
            className="input"
            placeholder="Egasi (masalan ALIYEV ALI)"
            value={edit.holder}
            onChange={(e) => setEdit({ ...edit, holder: e.target.value })}
          />
          <input
            className="input"
            placeholder="Bank"
            value={edit.bank}
            onChange={(e) => setEdit({ ...edit, bank: e.target.value })}
          />
          <div className="flex gap-2">
            <button type="button" className="btn-primary" disabled={!yaroqli || save.isPending} onClick={submit}>
              Saqlash
            </button>
            <button type="button" className="btn-ghost" onClick={() => setEdit(null)}>
              Bekor qilish
            </button>
          </div>
        </div>
      ) : admin ? (
        <button
          type="button"
          className="btn-ghost text-xs"
          onClick={() => setEdit({ id: crypto.randomUUID(), number: '', holder: '', bank: '', active: true })}
        >
          + Karta qo'shish
        </button>
      ) : null}
      {save.error ? <ErrorNote error={save.error} /> : null}
    </div>
  );
}
