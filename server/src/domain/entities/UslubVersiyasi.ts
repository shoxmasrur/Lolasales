/**
 * Agentning yozish uslubi versiyasi.
 *
 * `v1` — 2026-09 gacha shakllangan iliq va uzun uslub.
 * `v2` — jamoaning real yozishmalaridan olingan qisqa uslub
 *        (2026-09-28 auditi: 47 781 xabar).
 *
 * Akkaunt qaysi versiyada ishlashini `telegram_accounts.style_version`
 * belgilaydi; qoida bo'limi qaysi versiyaga tegishli ekanini
 * `agent_rule_sections.style_version` (NULL — ikkalasiga ham).
 */
export const STYLE_VERSIONS = ['v1', 'v2'] as const;

export type StyleVersion = (typeof STYLE_VERSIONS)[number];

/** Noma'lum qiymat `v1` ga tushadi — nosozlikda uslub o'zgarmasin. */
export function uslubVersiyasi(value: unknown): StyleVersion {
  return STYLE_VERSIONS.includes(value as StyleVersion) ? (value as StyleVersion) : 'v1';
}
