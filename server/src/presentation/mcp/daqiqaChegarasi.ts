/**
 * Oddiy "oyna ichida N ta" chegarasi — xotirada, kalit bo'yicha.
 *
 * Bitta jarayon (prod — bitta Node jarayoni) uchun yetarli. Qayta ishga
 * tushganda nollanadi — bu qabul qilinadi: maqsad kalit o'g'irlanganda
 * ma'lumotni tez tortib olishni sekinlatish, aniq hisob emas.
 */
export class DaqiqaChegarasi {
  private readonly vaqtlar = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly oynaMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  ruxsat(kalit: string): boolean {
    const t = this.now();
    const oyna = (this.vaqtlar.get(kalit) ?? []).filter((x) => t - x < this.oynaMs);
    if (oyna.length >= this.limit) {
      this.vaqtlar.set(kalit, oyna);
      return false;
    }
    oyna.push(t);
    this.vaqtlar.set(kalit, oyna);
    return true;
  }
}
