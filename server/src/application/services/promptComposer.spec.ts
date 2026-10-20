import { PromptComposer } from '@/application/services/PromptComposer';
import type { AgentRuleSection } from '@/domain/entities/AgentRule';

/** Qo'lda ishga tushiriladi: npm run test:prompt-composer */
const NOW = new Date('2026-09-28T09:00:00Z');

function rule(body: string) {
  return {
    id: body, sectionId: 's', body, situation: null, badExample: null,
    goodExample: null, why: null, isEnabled: true, sortOrder: 0, updatedAt: NOW,
  };
}

function section(key: string, styleVersion: 'v1' | 'v2' | null, body: string): AgentRuleSection {
  return {
    id: key, key, title: key, description: null, kind: 'bullets',
    sortOrder: 0, styleVersion, rules: [rule(body)],
  };
}

const SECTIONS = [
  section('umumiy', null, 'TAQIQ: -da ishlatma'),
  section('uslub', 'v1', 'Iliq va batafsil yoz'),
  section('uslub_v2', 'v2', 'Qisqa yoz'),
];

let soralganMarta = 0;
const rules = {
  listSections: async () => { soralganMarta += 1; return SECTIONS; },
} as never;
const lessons = { listApproved: async () => [] } as never;
const profiles = {} as never;

let failed = 0;
const eq = (nom: string, got: boolean) => { if (!got) { console.error(`✗ ${nom}`); failed += 1; } };

const composer = new PromptComposer(rules, lessons, profiles);

const v1 = await composer.renderSections('v1');
eq('v1 da umumiy bo\'lim bor', v1.includes('TAQIQ: -da ishlatma'));
eq('v1 da v1 bo\'limi bor', v1.includes('Iliq va batafsil yoz'));
eq('v1 da v2 bo\'limi YO\'Q', !v1.includes('Qisqa yoz'));

const v2 = await composer.renderSections('v2');
eq('v2 da umumiy bo\'lim bor', v2.includes('TAQIQ: -da ishlatma'));
eq('v2 da v2 bo\'limi bor', v2.includes('Qisqa yoz'));
eq('v2 da v1 bo\'limi YO\'Q', !v2.includes('Iliq va batafsil yoz'));

// Kesh versiyalar orasida aralashmasligi kerak: v1 keshi v2 ga berilsa,
// akkaunt boshqa uslubda yozib yuboradi.
//
// `v2Yana === v2` tekshiruvi o'zi bilan o'zini solishtirar edi (ikkalasi
// ham renderSections qaytargan string, tarkibi bir xil bo'lishi shart —
// bu tavtologiya). Haqiqiy tekshiruv: kesh ISHLAGANDA `listSections` ikkinchi
// marta CHAQIRILMAYDI, ya'ni `soralganMarta` birinchi so'rovdan keyin ham 1
// bo'lib qoladi (v1 va v2 alohida kesh yacheykasida, lekin v2 ikki marta
// so'ralganda faqat bittasi haqiqiy so'rov).
eq('v2 keshdan bir xil matn qaytadi', await composer.renderSections('v2') === v2);
eq('kesh ishlayotganda listSections qayta chaqirilmaydi', soralganMarta === 2);

composer.invalidate();
await composer.renderSections('v1');
eq('invalidate keshni tozalaydi (yangi so\'rov ketadi)', soralganMarta === 3);

console.log(failed ? `${failed} ta xato` : 'Hammasi o\'tdi');
process.exit(failed ? 1 : 0);
