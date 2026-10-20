import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCan } from '@/store/auth';
import { ErrorNote, Spinner } from '@/components/ui';

interface ReportRow {
  clientId: string;
  clientName: string;
  phone: string;
  reason: string | null;
  blockedByName: string | null;
  blockedAt: string;
}

/**
 * "Mijozniki emas" deb uzilgan raqamlar ro'yxatini CSV qilib yuklab beradi
 * — qaysi raqam kimdan, qachon va nima sababdan uzilganini ko'rib chiqish
 * yoki reklama/import manbasini tozalash uchun.
 */
const HEADER = ['Mijoz', 'Noto\'g\'ri raqam', 'Sana', 'Sabab', 'Kim uzdi'];

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
      a.download = `notogri-raqamlar-${new Date().toISOString().slice(0, 10)}.csv`;
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
        title="«Mijozniki emas» deb uzilgan raqamlar ro'yxati (CSV)"
      >
        {download.isPending ? <Spinner /> : null}
        Noto'g'ri raqamlar
      </button>
      {download.data === 0 ? (
        <span className="text-[11px] text-ink-600">Hozircha uzilgan raqam yo'q</span>
      ) : null}
      {download.error ? <ErrorNote error={download.error} /> : null}
    </div>
  );
}
