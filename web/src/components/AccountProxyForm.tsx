import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import type { TelegramAccount } from '@/lib/types';
import { Spinner } from '@/components/ui';

type ProbeResult = { ok: true; exitIp: string; latencyMs: number } | { ok: false; error: string };

interface Props {
  account: TelegramAccount;
  onSaved: () => void;
}

/**
 * Akkaunt kartasidagi proksi bo'limi.
 *
 * Kartaning qolgan maydonlaridan farqli o'laroq bu yerda "onBlur →
 * darhol saqlash" ishlamaydi: bitta maydon o'zgarganda saqlash
 * akkauntni yarim sozlangan proksi bilan uzib qo'yardi. Shuning uchun
 * to'rt maydon lokal holatda yig'iladi va bitta tugma bilan yuboriladi.
 */
export function AccountProxyForm({ account, onSaved }: Props) {
  const [host, setHost] = useState(account.proxy?.host ?? '');
  const [port, setPort] = useState(account.proxy ? String(account.proxy.port) : '');
  const [username, setUsername] = useState(account.proxy?.username ?? '');
  // Parol serverdan qaytmaydi — maydon doim bo'sh boshlanadi.
  const [password, setPassword] = useState('');
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [xato, setXato] = useState<string | null>(null);

  const body = (): { host: string; port: number; username: string | null; password?: string | null } => ({
    host: host.trim(),
    port: Number(port),
    username: username.trim() || null,
    // Bo'sh parol maydoni: proksi saqlangan bo'lsa "tegilmasin"
    // (undefined), yangi proksi bo'lsa "paroli yo'q" (null).
    ...(password ? { password } : account.proxy?.hasPassword ? {} : { password: null }),
  });

  const test = useMutation({
    mutationFn: () => api.post<ProbeResult>('/telegram/proxy-test', body()),
    onSuccess: (r) => {
      setProbe(r);
      setXato(null);
    },
    onError: (e) => setXato(e instanceof ApiError ? e.message : 'Tekshirib bo\'lmadi'),
  });

  const save = useMutation({
    mutationFn: (proxy: object | null) => api.patch(`/telegram/accounts/${account.id}`, { proxy }),
    onSuccess: () => {
      // Saqlangach forma qayta o'qiladi (`onSaved` → invalidate), lekin
      // ota komponentdagi `key` faqat host/port/login o'zgarsa qayta
      // tiklanadi. Faqat parol yangilangan holatda (host/port/login
      // o'zgarmagan) komponent qayta tiklanmaydi — shuning uchun parol
      // maydoni bu yerda qo'lda tozalanadi, aks holda operator hozirgina
      // yozgan parol ekranda qolib ketardi.
      setPassword('');
      setXato(null);
      onSaved();
    },
    onError: (e) => setXato(e instanceof ApiError ? e.message : 'Saqlab bo\'lmadi'),
  });

  const toldirilgan = host.trim() !== '' && Number(port) > 0;
  const band = test.isPending || save.isPending;
  // "Tekshirish" `/proxy-test` ga uradi — u akkauntdan mustaqil va bazadagi
  // parolni bilmaydi, shuning uchun bo'sh parol bilan chaqirilsa proksi
  // autentifikatsiyani rad etadi ("Proksi logini yoki paroli noto'g'ri"),
  // hatto saqlangan proksi ishlab turgan bo'lsa ham. "Saqlash" bunday emas:
  // server tomonida parol maydoni yo'qligi "bazadagiga tegma" deb talqin
  // qilinadi, shuning uchun u bo'sh parol bilan ham to'g'ri ishlaydi.
  //
  // Login maydoni ham tekshiriladi: login bo'sh bo'lsa (operator uni hozir
  // tozalayotgan bo'lishi mumkin, yoki bu — login yo'q-u parol saqlangan
  // eski qator), server login yo'qligida parolni baribir jo'natmaydi
  // (`validateProxy` uni `null`ga majburlaydi) — demak bu holatda parolni
  // qayta so'rashning ham ma'nosi yo'q.
  const parolKerak = Boolean(account.proxy?.hasPassword) && username.trim() !== '' && !password;

  return (
    <div className="mt-3 border-t border-ink-800 pt-3">
      <div className="mb-2 text-xs text-ink-500">
        Proksi (SOCKS5)
        <span className="ml-2 text-ink-600">
          {account.proxy ? `${account.proxy.host}:${account.proxy.port}` : 'to\'g\'ridan-to\'g\'ri'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input !py-1 w-36 text-xs"
          placeholder="IP yoki host"
          value={host}
          onChange={(e) => setHost(e.target.value)}
        />
        <input
          className="input !py-1 w-20 text-xs tabular-nums"
          placeholder="port"
          value={port}
          onChange={(e) => setPort(e.target.value)}
        />
        <input
          className="input !py-1 w-24 text-xs"
          placeholder="login"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="password"
          className="input !py-1 w-24 text-xs"
          placeholder={account.proxy?.hasPassword ? '••••••' : 'parol'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          title={
            account.proxy?.hasPassword
              ? 'Bo\'sh qoldirilsa saqlangan parol o\'zgarmaydi'
              : 'Proksi paroli'
          }
        />

        <button
          type="button"
          className="btn-ghost !py-1 text-xs"
          disabled={!toldirilgan || band || parolKerak}
          onClick={() => test.mutate()}
          title={
            parolKerak
              ? 'Tekshirish uchun parolni qayta kiriting — bu so\'rov saqlangan parolni bilmaydi'
              : 'Proksi orqali chiqish IP\'sini aniqlash'
          }
        >
          {test.isPending ? <Spinner /> : null}
          Tekshirish
        </button>
        <button
          type="button"
          className="btn-ghost !py-1 text-xs"
          disabled={!toldirilgan || band}
          onClick={() => save.mutate(body())}
        >
          {save.isPending ? <Spinner /> : null}
          Saqlash
        </button>
        {account.proxy ? (
          <button
            type="button"
            className="btn-ghost !py-1 text-xs text-amber-300"
            disabled={band}
            onClick={() => {
              if (
                confirm(
                  'Proksi o\'chiriladi va akkaunt server IP\'sidan ulanadi. ' +
                    'Bu barcha akkauntlarni bitta IP\'ga qaytaradi — davom etilsinmi?',
                )
              ) {
                setHost('');
                setPort('');
                setUsername('');
                setPassword('');
                save.mutate(null);
              }
            }}
          >
            O'chirish
          </button>
        ) : null}
      </div>

      {probe ? (
        <div className={`mt-2 text-xs ${probe.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
          {probe.ok ? `Chiqish IP: ${probe.exitIp} · ${probe.latencyMs} ms` : probe.error}
        </div>
      ) : null}
      {xato ? <div className="mt-2 text-xs text-rose-400">{xato}</div> : null}
    </div>
  );
}
