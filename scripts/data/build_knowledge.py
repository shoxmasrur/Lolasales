#!/usr/bin/env python3
"""A yo'li: real suhbatlardan agent uchun uslub, e'tiroz javoblari va FAQ qoralamalarini chiqaradi.

Kirish : data/training/conversations.jsonl  (build_training_data.py natijasi)
Chiqish: data/knowledge/
  style_profile.json      — menejer uslubi (uzunlik, murojaat, emoji, ochilish/yopilish)
  objection_playbook.json — e'tiroz turlari bo'yicha g'olib (to'lovga yetgan) suhbatlardan javoblar
  faq_candidates.json     — mijozlar tez-tez so'ragan mavzular + menejer javoblari
  winning_examples.jsonl  — to'lovga yetgan toza suhbatlar (few-shot uchun)
  README.md               — qisqa hisobot

Bular QORALAMA: kurs faktlari (narx, sana) ni odam tekshirib, bilim bazasiga kiritadi.

  python3 -I scripts/data/build_knowledge.py
"""
import argparse
import json
import re
import statistics
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# Jamoa a'zolari bilan ichki chatlar (mijoz emas) va savdo suhbati uchun eng uzun navbat soni.
STAFF_CLIENTS = ["Lola Zunnunova", "Dilrabo LZ", "Mohidil Opa"]
MAX_SALES_TURNS = 80

PAID_RE =re.compile(r"to.ladim|tashadim|tushirdim|o.tkazdim|to.lov qildim|chek")
OBJECTIONS = {
    "narx_qimmat": r"qimmat|narxi baland|pulim yo.q|pul yo.q|imkon(im)? yo.q|moliyaviy|arzonroq",
    "keyinroq_oylab": r"keyinroq|o.ylab ko.r|o.ylab koray|ko.rib chiq|keyin yozaman|hozir emas",
    "vaqt_yoq": r"vaqtim yo.q|bandman|ishdaman|vaqt topol|farzand(lar)?im",
    "oila_maslahat": r"erim|turmush o.rtog|oilam|maslahatlash|ruxsat",
    "ishonch": r"aldamo|ishonch|rostdan|haqiqat|kafolat|firibgar|aldov",
    "bolib_tolash": r"bo.lib to.l|qismlab|bo.lib ber|muddat",
    "format_onlayn_oflayn": r"onlayn|online|oflayn|offlayn|zoom|jonli|yozib olin|yozuv",
    "joy_sana": r"qayerda|manzil|qachon|soat nechchi|kuni|sana|boshlanadi",
}
FAQ_TOPICS = {
    "narx": r"narx|qancha|necha pul|so.m|ming",
    "sana_vaqt": r"qachon|sana|soat|kuni|boshlanadi|davomiy",
    "joy_manzil": r"qayerda|manzil|joyi|lokatsiya|hudud|shahar",
    "onlayn_oflayn": r"onlayn|online|oflayn|zoom|jonli",
    "bolib_tolash": r"bo.lib|qismlab|muddat",
    "yozilish_tartibi": r"qanday yozil|ro.yxat|band qil|bron|karta|to.lov",
    "kimlar_uchun": r"kimlar uchun|yosh|turmush|farzand|bo.lmagan|qizlar",
    "sertifikat_natija": r"sertifikat|natija|foyda|nima beradi|nima o.rgat",
}
EMOJI_RE = re.compile("[\U0001F300-\U0001FAFF☀-➿]")
ADDRESS = ["opajon", "opa", "aka", "habibi", "asalim", "jonim", "singlim", "qadrdonim", "xonim"]
Q_RE = re.compile(r"\?|^(qanday|qancha|nechchi|qayerda|qachon|nima|necha|kim)\b", re.I)


def norm(s: str) -> str:
    return re.sub(r"\W+", " ", s.lower()).strip()


def clean_reply(t: str) -> str:
    return t.replace("[ovozli xabar] ", "").strip()


def is_won(turns) -> bool:
    card_at = next((i for i, t in enumerate(turns) if t["role"] == "assistant" and "[KARTA]" in t["content"]), None)
    if card_at is None:
        return False
    return any(
        t["role"] == "user" and ("[rasm]" in t["content"] or PAID_RE.search(t["content"].lower()))
        for t in turns[card_at + 1:]
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in-file", type=Path, default=ROOT / "data" / "training" / "conversations.jsonl")
    ap.add_argument("--out-dir", type=Path, default=ROOT / "data" / "knowledge")
    ap.add_argument("--top", type=int, default=8)
    a = ap.parse_args()
    a.out_dir.mkdir(parents=True, exist_ok=True)

    convs = [json.loads(l) for l in open(a.in_file, encoding="utf-8")]
    # Ichki jamoa chatlari va juda uzun (ish-jarayon) suhbatlari mijoz savdosi emas.
    before = len(convs)
    convs = [c for c in convs
             if not any(s.lower() in (c.get("client") or "").lower() for s in STAFF_CLIENTS)
             and len(c["turns"]) <= MAX_SALES_TURNS]
    print(f"ichki/uzun suhbatlar chiqarildi: {before - len(convs)}")
    won =[c for c in convs if is_won(c["turns"])]
    won_ids = {(c["chat"], c["session"]) for c in won}

    # ── Uslub profili ──
    mgr = [t for c in convs for t in c["turns"] if t["role"] == "assistant"]
    lens = [len(t["content"]) for t in mgr if not t["voice"]]
    low = " ".join(t["content"].lower() for t in mgr)
    openers = Counter(" ".join(clean_reply(c["turns"][0]["content"]).lower().split()[:3])
                      for c in convs if c["turns"][0]["role"] == "assistant")
    closers = Counter(" ".join(norm(clean_reply(c["turns"][-1]["content"])).split()[-3:])
                      for c in convs if c["turns"][-1]["role"] == "assistant")
    style = {
        "menejer_navbatlari": len(mgr),
        "ovozli_ulushi": round(sum(t["voice"] for t in mgr) / max(1, len(mgr)), 3),
        "matn_uzunligi_belgi": {
            "mediana": statistics.median(lens) if lens else 0,
            "p90": sorted(lens)[int(len(lens) * 0.9)] if lens else 0,
        },
        "emoji_ulushi": round(sum(bool(EMOJI_RE.search(t["content"])) for t in mgr) / max(1, len(mgr)), 3),
        "top_emoji": Counter(e for t in mgr for e in EMOJI_RE.findall(t["content"])).most_common(8),
        "murojaat_soni": {w: len(re.findall(rf"\b{w}\b", low)) for w in ADDRESS},
        "inshaalloh_soni": low.count("inshaalloh") + low.count("in sha alloh"),
        "top_ochilishlar": openers.most_common(12),
        "top_yopilishlar": closers.most_common(12),
        "suhbat_soni": len(convs),
        "tolovga_yetgan_suhbat": len(won),
    }
    (a.out_dir / "style_profile.json").write_text(json.dumps(style, ensure_ascii=False, indent=2))

    # ── E'tirozlar: g'olib javoblar ──
    book = {}
    for name, pat in OBJECTIONS.items():
        rx = re.compile(pat, re.I)
        total = in_won = 0
        replies, all_replies = Counter(), Counter()
        sample, all_sample = {}, {}
        for c in convs:
            T = c["turns"]
            hit = False
            for i, t in enumerate(T[:-1]):
                if t["role"] != "user" or len(t["content"]) > 300 or not rx.search(t["content"].lower()):
                    continue
                total += 1
                hit = True
                nxt = T[i + 1]
                if nxt["role"] == "assistant" and 25 <= len(nxt["content"]) <= 600:
                    akey = norm(clean_reply(nxt["content"]))[:120]
                    all_replies[akey] += 1
                    all_sample.setdefault(akey, {"mijoz": t["content"], "menejer": clean_reply(nxt["content"]),
                                                 "ovozli": nxt["voice"]})
                if (c["chat"], c["session"]) in won_ids and nxt["role"] == "assistant" and 25 <= len(nxt["content"]) <= 600:
                    key = norm(clean_reply(nxt["content"]))[:120]
                    replies[key] += 1
                    sample.setdefault(key, {"mijoz": t["content"], "menejer": clean_reply(nxt["content"]),
                                            "ovozli": nxt["voice"]})
            in_won += hit and (c["chat"], c["session"]) in won_ids
        top = [dict(sample[k], takrorlanishi=n) for k, n in replies.most_common(a.top)]
        top_all = [dict(all_sample[k], takrorlanishi=n) for k, n in all_replies.most_common(a.top)]
        book[name] = {"mijozlar_soni": total, "shundan_tolovga_yetgan_suhbat": in_won,
                      "golib_javoblar": top, "eng_kop_javoblar_barcha_suhbat": top_all}
    (a.out_dir / "objection_playbook.json").write_text(json.dumps(book, ensure_ascii=False, indent=2))

    # ── FAQ nomzodlari ──
    faq = {}
    for name, pat in FAQ_TOPICS.items():
        rx = re.compile(pat, re.I)
        qs, ans = Counter(), Counter()
        ans_sample = {}
        for c in convs:
            T = c["turns"]
            for i, t in enumerate(T[:-1]):
                if t["role"] == "user" and len(t["content"]) <= 200 and Q_RE.search(t["content"]) and rx.search(t["content"].lower()):
                    qs[norm(t["content"])[:100]] += 1
                    nxt = T[i + 1]
                    if nxt["role"] == "assistant" and 25 <= len(nxt["content"]) <= 600:
                        k = norm(clean_reply(nxt["content"]))[:120]
                        ans[k] += 1
                        ans_sample.setdefault(k, clean_reply(nxt["content"]))
        faq[name] = {
            "savol_soni": sum(qs.values()),
            "namuna_savollar": [q for q, _ in qs.most_common(6)],
            "tez_javoblar": [{"matn": ans_sample[k], "takrorlanishi": n} for k, n in ans.most_common(5)],
        }
    (a.out_dir / "faq_candidates.json").write_text(json.dumps(faq, ensure_ascii=False, indent=2))

    # ── G'olib suhbatlar (few-shot) ──
    good = [c for c in won if 6 <= len(c["turns"]) <= 24 and sum(len(t["content"]) for t in c["turns"]) <= 4000]
    good.sort(key=lambda c: len(c["turns"]))
    with open(a.out_dir / "winning_examples.jsonl", "w", encoding="utf-8") as f:
        for c in good[:300]:
            f.write(json.dumps({"chat": c["chat"], "start": c["start"], "turns": c["turns"]}, ensure_ascii=False) + "\n")

    (a.out_dir / "README.md").write_text(
        "# Bilim va uslub qoralamalari (A yo'li)\n\n"
        f"Suhbatlar: {len(convs)}, to'lovga yetganlari: {len(won)}.\n\n"
        "- `style_profile.json` — menejer uslubi statistikasi\n"
        "- `objection_playbook.json` — e'tirozlarga to'lovga yetgan suhbatlardagi javoblar\n"
        "- `faq_candidates.json` — tez-tez so'raladigan savollar va javoblar\n"
        "- `winning_examples.jsonl` — few-shot uchun toza g'olib suhbatlar\n\n"
        "Bular qoralama: kurs faktlarini (narx, sana, manzil) tekshirib, keyin bilim bazasiga kiritiladi.\n"
    )
    print(f"suhbat={len(convs)} golib={len(won)} namuna={min(300, len(good))}")
    for k, v in book.items():
        print(f"  {k}: {v['mijozlar_soni']} mijoz, {len(v['golib_javoblar'])} javob")


if __name__ == "__main__":
    main()
