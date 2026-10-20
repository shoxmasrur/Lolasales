import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCan } from '@/store/auth';
import { ErrorNote, Spinner } from '@/components/ui';

interface ReportRow {
  clientId: string;
  clientName: string;
  contractNos: string[];
  phone: string;
  reason: string | null;
  blockedByName: string | null;
  blockedAt: string;
}

/**
 * "CRM'da raqami noto'g'ri" ro'yxatini CSV qilib yuklab beradi.
 *
 * NEGA KERAK: raqam mijozdan uzilganda muammoning MANBAI tuzalmaydi —
 * CRM'da (`app-api.xonsaroy.uz`) raqam hamon eski egasiga bog'langan
 * holicha turadi. Bizda u yerga yozish huquqi yo'q, shuning uchun
 * Xonsaroy jamoasiga beriladigan aniq ro'yxat kerak.
 *
 * Shartnoma raqami ham chiqadi: CRM'da mijozni ism bilan emas, aynan shu
 * bo'yicha topadilar.
 */
const HEADER = ['Mijoz', 'Shartnoma', 'Noto\'g\'ri raqam', 'Sana', 'Sabab', 'Kim uzdi'];

/**
 * Excel CSV'ni vergul bilan ajratadi va qo'shtirnoq ichidagi qo'shtirnoqni
 * ikkilantirishni talab qiladi. Mijoz ismida vergul uchrashi mumkin,
 * shuning uchun har bir katak qo'shtirnoqqa olinadi.
 */
const cell = (v: string): string => `"${v.replaceAll('"', '""')}"`;

export function PhoneBlocksExport() {
  const download = useMutation({
    mutationFn: async () => {
      const { rows } = await api.get<{ rows: ReportRow[] }>('/clients/phone-blocks');
      if (!rows.length) return 0;

      const lines = [
        HEADER.map(cell).join(','),
        ...rows.map((r) =>
          [
            r.clientName,
            r.contractNos.join(' '),
            r.phone,
            new Date(r.blockedAt).toLocaleDateString('ru-RU'),
            r.reason ?? '',
            r.blockedByName ?? '',
          ]
            .map(cell)
            .join(','),
        ),
      ];

      // BOM'siz Excel kirill va o'zbek harflarini buzib ko'rsatadi.
      const blob = new Blob([`﻿${lines.join('\r\n')}\r\n`], {
        type: 'text/csv;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `crm-notogri-raqamlar-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      return rows.length;
    },
  });

  const canExport = useCan('clients.export');
  if (!canExport) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="btn-ghost text-xs"
        disabled={download.isPending}
        onClick={() => download.mutate()}
        title="Uzilgan raqamlar ro'yxatini CRM jamoasiga berish uchun"
      >
        {download.isPending ? <Spinner /> : null}
        CRM uchun: noto'g'ri raqamlar
      </button>
      {download.data === 0 ? (
        <span className="text-[11px] text-ink-600">Hozircha uzilgan raqam yo'q</span>
      ) : null}
      {download.error ? <ErrorNote error={download.error} /> : null}
    </div>
  );
}
