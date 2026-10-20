import type { AccountCheckReport } from '@/application/services/AccountChecker';
import type { AccountRestriction, TelegramAccount } from '@/domain/entities/TelegramAccount';
import { premiumKunQoldi } from '@/domain/services/premium';
import { activeRestrictions, remainingQuota, remainingLookups } from '@/domain/entities/TelegramAccount';

/**
 * Telegram akkauntini API'ga chiqarish.
 * api_hash, sessiya satri va proksi paroli HECH QACHON tashqariga
 * chiqmaydi — sessiya satri akkauntga to'liq kirish huquqini beradi.
 */
export function serializeTelegramAccount(account: TelegramAccount, todayIso: string) {
  return {
    id: account.id,
    label: account.label,
    personaName: account.personaName,
    phone: account.phone,
    apiId: account.apiId,
    hasSession: Boolean(account.session),
    status: account.status,
    statusMessage: account.statusMessage,
    tgUserId: account.tgUserId,
    tgUsername: account.tgUsername,
    dailyLimit: account.dailyLimit,
    sentToday: account.counterDate === todayIso ? account.sentToday : 0,
    remainingToday: remainingQuota(account, todayIso),
    lookupLimit: account.lookupLimit,
    lookupsToday: account.counterDate === todayIso ? account.lookupsToday : 0,
    remainingLookupsToday: remainingLookups(account, todayIso),
    floodWaitUntil: account.floodWaitUntil,
    floodWaitSince: account.floodWaitSince,
    peerFloodSince: account.peerFloodSince,
    // Cheklovlar HAR SAFAR chiqadi — karta ochilishi bilan ko'rinishi
    // uchun tekshiruv tugmasini bosish shart emas.
    restrictions: activeRestrictions(account).map(serializeRestriction),
    spamStatus: account.spamStatus,
    spamCheckedAt: account.spamCheckedAt,
    spamMessage: account.spamMessage,
    spamUntil: account.spamUntil,
    proxy: account.proxy
      ? {
          host: account.proxy.host,
          port: account.proxy.port,
          username: account.proxy.username,
          // Parolning O'ZI hech qachon chiqmaydi — panelga faqat
          // "saqlangan parol bor" degan belgi kerak.
          hasPassword: Boolean(account.proxy.password),
        }
      : null,
    isEnabled: account.isEnabled,
    styleVersion: account.styleVersion,
    llmModelId: account.llmModelId,
    premiumUntil: account.premiumUntil,
    // Panel soatiga emas, loyiha vaqt mintaqasidagi bugunga nisbatan.
    premiumKunQoldi: account.premiumUntil ? premiumKunQoldi(account.premiumUntil, todayIso) : null,
    createdAt: account.createdAt,
  };
}

/**
 * Tekshiruv hisoboti.
 *
 * `probe` ning ichki xato matni chiqariladi, chunki operator uchun
 * aynan Telegramning javobi qimmatli — "nimadir xato" degan umumiy
 * xabar bilan sababni topib bo'lmaydi.
 */
export function serializeCheckReport(report: AccountCheckReport) {
  return {
    checkedAt: report.checkedAt,
    probe: report.probe.ok
      ? { ok: true as const, username: report.probe.username }
      : {
          ok: false as const,
          reason: report.probe.reason,
          seconds: report.probe.seconds,
          message: report.probe.message,
        },
    spamStatus: report.spam.status,
    restrictions: report.restrictions.map(serializeRestriction),
    notFoundLookups: report.notFoundLookups,
  };
}

function serializeRestriction(r: AccountRestriction) {
  return { kind: r.kind, since: r.since, until: r.until, source: r.source, message: r.message };
}
