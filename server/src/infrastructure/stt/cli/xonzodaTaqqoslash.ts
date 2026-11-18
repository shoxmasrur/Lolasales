import { createContainer } from '@/composition/container';
import { mapMessage } from '@/infrastructure/db/mappers';
import { closePool, query } from '@/infrastructure/db/pool';

/**
 * Qo'lda: npm run xonzoda-taqqoslash --workspace=server -- [N]
 *
 * Oxirgi N ta (sukut 10) kiruvchi ovozli xabarni XonzodaAI'ga yuborib,
 * natijani bazaga yozadi (chatda Nai matni ostida ko'rinadi) va
 * ikkala matnni yonma-yon chiqaradi. Mijozga hech narsa yuborilmaydi,
 * asosiy `transcript` (Nai) o'zgarmaydi.
 *
 * XonzodaAI bir vaqtda 2 ta so'rov qabul qiladi va jonli qo'ng'iroqlar bilan
 * bitta GPU'da — xabarlar bittadan yuboriladi.
 */
const n = Math.min(100, Math.max(1, Number(process.argv[2] ?? '10') || 10));
const container = createContainer();
const taqqoslash = container.services.sttTaqqoslash;

const { rows } = await query(
  `SELECT * FROM messages
    WHERE direction = 'in' AND media_kind IN ('voice', 'audio', 'video_note')
      AND media_path IS NOT NULL AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT $1`,
  [n],
);
const xabarlar = rows.map(mapMessage).reverse();

if (!xabarlar.length) {
  console.log('Ovozli xabar topilmadi.');
} else {
  console.log(`${xabarlar.length} ta ovozli xabar XonzodaAI'ga yuborilmoqda...\n`);
  for (const m of xabarlar) taqqoslash.boshla(m);
  await taqqoslash.idle();

  const { rows: yangi } = await query(`SELECT * FROM messages WHERE id = ANY($1::uuid[])`, [
    xabarlar.map((m) => m.id),
  ]);
  const byId = new Map(yangi.map(mapMessage).map((m) => [m.id, m]));
  for (const asl of xabarlar) {
    const m = byId.get(asl.id) ?? asl;
    const sana = m.createdAt.toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' });
    const davomiylik = m.media?.durationSec ? `${m.media.durationSec} s` : '?';
    console.log(`── ${sana} · ${m.media?.kind} · ${davomiylik} · ${m.id.slice(0, 8)}`);
    console.log(`  Nai : ${m.transcriptStatus === 'done' ? m.transcript : `(${m.transcriptStatus})`}`);
    const g = m.xonzoda;
    console.log(
      `  XonzodaAI: ${!g ? '(natija yo\'q)' : g.status === 'done' ? g.text : `(xato: ${g.error})`}` +
        (g?.ms != null ? `  [${(g.ms / 1000).toFixed(1)} s]` : ''),
    );
    console.log('');
  }
}

await closePool();
