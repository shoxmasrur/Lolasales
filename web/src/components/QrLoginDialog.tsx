import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '@/lib/api';
import { getSocket, type ServerEvent } from '@/lib/socket';
import type { TelegramAccount } from '@/lib/types';
import { Sheet } from '@/components/Sheet';
import { ErrorNote, Spinner } from '@/components/ui';

/** Serverdagi `QR_TOTAL_MS` bilan bir xil. */
const QR_TOTAL_MS = 120_000;

interface QrStart {
  status: 'qr_ready';
  url: string;
  expiresAt: string;
}

/**
 * QR orqali kirish oynasi.
 *
 * QR rasm shu yerda chiziladi — token tashqi QR xizmatiga yuborilmaydi.
 * Token ~30 soniyada yangilanadi (`telegram.qr`), yakun esa akkaunt
 * holatidan bilinadi (`status` prop'i, `telegram.status` hodisasi bilan
 * yangilanadi).
 */
export function QrLoginDialog({
  accountId,
  phone,
  status,
  statusMessage,
  onClose,
  onConnected,
  onPasswordRequired,
}: {
  accountId: string;
  phone: string;
  status: TelegramAccount['status'];
  statusMessage: string | null;
  onClose: () => void;
  /** Shu urinishda QR skanerlandi va akkaunt ulandi. */
  onConnected: () => void;
  /** Shu urinishda QR skanerlandi, endi 2FA paroli kerak. */
  onPasswordRequired: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  /**
   * Shu urinishda server `awaiting_qr` ga o'tganini bilamiz: POST muvaffaqiyatli
   * bo'ldi (server POST'ga javob berishdan oldin holatni yozadi) yoki `status`
   * prop'i `awaiting_qr` ko'rsatdi. Socket uzilib, skanerlash so'rovlar
   * orasida tugab qolsa ham `connected` o'tishi o'tkazib yuborilmaydi.
   */
  const [seenWaiting, setSeenWaiting] = useState(false);
  /**
   * `status` prop'ining o'zida `awaiting_qr` ko'rilganmi. `finished` uchun
   * faqat shu yetarli: POST'dan keyin prop hali eski `logged_out`/`error`
   * bo'lishi mumkin va u "QR muddati tugadi" ni yolg'on ko'rsatmasligi kerak.
   */
  const [sawWaitingProp, setSawWaitingProp] = useState(false);
  // StrictMode effektni ikki marta ishga tushiradi — server ikkinchi
  // so'rovda birinchisini to'xtatadi, lekin QR bir lahza almashib ketadi.
  const started = useRef(-1);
  // Serverdagi tsikl hali ishlayotgan bo'lishi mumkinmi: POST muvaffaqiyatli
  // bo'lgan va yakuniy holatga yetilmagan. StrictMode'ning soxta unmount'i
  // POST tugashidan oldin bo'ladi — u payt bu `false`, DELETE ketmaydi.
  const loopMayRun = useRef(false);

  const stopLoop = (): void => {
    if (!loopMayRun.current) return;
    loopMayRun.current = false;
    void api.delete(`/telegram/accounts/${accountId}/login/qr`).catch(() => undefined);
  };
  const stopLoopRef = useRef(stopLoop);
  stopLoopRef.current = stopLoop;

  // Sahifadan chiqib ketilsa yoki ota oynani olib tashlasa — serverda
  // 2 daqiqalik yetim tsikl qolmasin.
  useEffect(() => () => stopLoopRef.current(), []);

  useEffect(() => {
    if (started.current === attempt) return;
    started.current = attempt;
    setError(null);
    setUrl(null);
    setSeenWaiting(false);
    setSawWaitingProp(false);
    loopMayRun.current = false;
    api
      .post<QrStart>(`/telegram/accounts/${accountId}/login/qr`)
      .then((data) => {
        loopMayRun.current = true;
        setSeenWaiting(true);
        setUrl(data.url);
        setDeadline(Date.now() + QR_TOTAL_MS);
      })
      .catch(setError);
  }, [accountId, attempt]);

  useEffect(() => {
    const socket = getSocket();
    const onEvent = (event: ServerEvent): void => {
      if (event.type === 'telegram.qr' && event.accountId === accountId) setUrl(event.url);
    };
    socket.on('event', onEvent);
    return () => {
      socket.off('event', onEvent);
    };
  }, [accountId]);

  useEffect(() => {
    if (!url) {
      setImage(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(url, { margin: 1, width: 256 })
      .then((data) => {
        if (!cancelled) setImage(data);
      })
      .catch(setError);
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    if (status === 'awaiting_qr') {
      setSeenWaiting(true);
      setSawWaitingProp(true);
      return;
    }
    // Faqat shu urinishda `awaiting_qr` ko'rilgandan keyingi holat hisobga
    // olinadi — oyna ochilishidan oldingi eski holat (masalan, `connected`)
    // oynani yopib yubormasligi kerak.
    if (!seenWaiting) return;
    if (status === 'connected') {
      loopMayRun.current = false;
      onConnected();
    } else if (status === 'awaiting_password') {
      loopMayRun.current = false;
      onPasswordRequired();
    } else if (sawWaitingProp && (status === 'logged_out' || status === 'error')) {
      // POST'dan keyingi eski `logged_out` tsikl tugadi degani emas — shuning
      // uchun faqat prop'da `awaiting_qr` ko'rilgandan keyin hisoblanadi.
      loopMayRun.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, seenWaiting, sawWaitingProp]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  // Server tsiklni muvaffaqiyatsiz yakunladi. `connected`/`awaiting_password`
  // da matn ko'rsatilmaydi — ota oynani yopishidan oldingi bir kadr uchun.
  const finished = sawWaitingProp && (status === 'logged_out' || status === 'error');
  const secondsLeft = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;

  const close = (): void => {
    // Tsikl hali ishlayotgan bo'lsa — serverdagini ham to'xtatamiz.
    stopLoop();
    onClose();
  };

  return (
    <Sheet open onClose={close} title="QR orqali kirish" maxWidth="max-w-sm">
      <div className="flex flex-col items-center gap-3 p-4 md:p-5">
        {error ? (
          <ErrorNote error={error} />
        ) : finished ? (
          <p className="text-center text-sm text-ink-300">{statusMessage ?? 'QR muddati tugadi'}</p>
        ) : image ? (
          <img src={image} alt="Telegram QR kodi" className="h-64 w-64 rounded-lg bg-white p-2" />
        ) : (
          <div className="flex h-64 w-64 items-center justify-center">
            <Spinner />
          </div>
        )}

        {!error && !finished && secondsLeft !== null ? (
          <p className="text-xs text-ink-400">Qolgan vaqt: {secondsLeft} soniya</p>
        ) : null}

        <ol className="list-decimal space-y-1 pl-5 text-xs leading-relaxed text-ink-400">
          <li>
            <span className="text-ink-200">{phone}</span> raqamli telefonda Telegramni oching
          </li>
          <li>Sozlamalar → Qurilmalar → Qurilma ulash</li>
          <li>Shu QR kodni skanerlang</li>
        </ol>

        {error || finished ? (
          <button type="button" className="btn-primary" onClick={() => setAttempt((n) => n + 1)}>
            Qayta urinish
          </button>
        ) : null}
      </div>
    </Sheet>
  );
}
