#!/usr/bin/env python3
"""A yo'li: Lola Zunnunovaning dars/efir yozuvlari (kesilgan/) matnlaridan bilim va uslub qoralamalari.

Kirish : data/kesilgan_transcripts/*.txt  (transcribe_kesilgan.py natijasi)
Chiqish: data/knowledge/
  lessons_corpus.jsonl        — matn ~700 belgilik bo'laklarga (manba fayl + tartib raqami bilan)
  lessons_style_profile.json  — Lola ovozi: gap uzunligi, murojaat, diniy iboralar, bog'lovchi so'zlar, ochilish/yopilish
  lessons_topics.json         — mavzu bo'yicha chastota va eng mos bo'laklar (bilim bazasi uchun xomashyo)

Bular QORALAMA: odam ko'rib chiqib, kerakli joyini bilim bazasi/agent qoidalariga kiritadi.
Kurs faktlari (narx, sana, manzil) bu manbadan olinmaydi — ular faqat kurs bazasidan.

  python3 -I scripts/data/build_lessons_knowledge.py
"""
import json
import re
import statistics
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data" / "kesilgan_transcripts"
OUT = ROOT / "data" / "knowledge"
CHUNK_CHARS = 700

ADDRESS = ["brilliant", "brilliantlarim", "azizam", "azizalarim", "qizlarim", "qizlar", "sizlar", "opajon",
           "jonim", "go'zallarim", "baxtlilarim", "qadrdonim"]
RELIGIOUS = ["alhamdulillah", "inshaalloh", "mashalloh", "subhanalloh", "robbim", "alloh", "rasululloh", "astag'firulloh"]
MARKERS = ["xo'sh", "demak", "ana", "e'tibor qiling", "ya'ni", "masalan", "shuning uchun", "tasavvur qiling",
           "birinchidan", "ikkinchidan", "xo'p", "mana", "aslida", "chunki", "lekin"]
TOPICS = {
    "turmush_ortogi_munosabat": r"turmush o.rtog|erim|eringiz|er\b|yor",
    "sms_vazifalar": r"\bsms|vazifa|topshiriq|yozing|yozib",
    "ehson_sadaqa": r"ehson|sadaqa|zakot|infoq",
    "farzand_ota_ona_bolalik": r"farzand|ota-ona|onam|otam|bolalik|tarbiya",
    "tan_olinish_isbot": r"tan ol|isbotla|eʼtirof|e.tirof|ko.rsatib qo.y",
    "ayol_energiyasi_go_zallik": r"energiya|go.zal|nafis|ayollik|kosmetika|ko.rinish",
    "iymon_shukr_sabr": r"iymon|shukr|sabr|tavakkul|duo|namoz|qur.on",
    "muloqot_savol_javob": r"muloqot|savol|gaplash|eshit|tinglash",
    "his_tuyg_u_emotsiya": r"tuyg.u|his\b|hissiyot|g.azab|alam|xafa|yig.",
    "illat_nafs_islohi": r"illat|nafs|isloh|xato|kamchilik|odat",
    "oila_mustahkamligi": r"oila|nikoh|ajrim|ajral|ishonch|sadoqat",
}
Q_RE = re.compile(r"\?")


def fix_glue(t: str) -> str:
    t = re.sub(r"([.?!])(?=[A-ZА-Яʼ'])", r"\1 ", t)
    return re.sub(r"\s+", " ", t).strip()


def sentences(t: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.?!])\s+", t) if s.strip()]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    chunks, sent_lens, openers, closers = [], [], [], []
    low_all = []
    q = ex = total_sent = 0
    for f in sorted(SRC.glob("*.txt")):
        text = fix_glue(f.read_text(encoding="utf-8"))
        sents = sentences(text)
        if not sents:
            continue
        openers.append(" ".join(sents[0].split()[:6]))
        closers.append(" ".join(sents[-1].split()[:8]))
        total_sent += len(sents)
        q += sum(bool(Q_RE.search(s)) for s in sents)
        ex += sum("!" in s for s in sents)
        sent_lens += [len(s) for s in sents]
        low_all.append(text.lower())
        buf, n = "", 0
        for s in sents:
            if buf and len(buf) + len(s) > CHUNK_CHARS:
                chunks.append({"file": f.stem, "n": n, "text": buf})
                buf, n = "", n + 1
            buf = f"{buf} {s}".strip()
        if buf:
            chunks.append({"file": f.stem, "n": n, "text": buf})

    with (OUT / "lessons_corpus.jsonl").open("w", encoding="utf-8") as fh:
        for c in chunks:
            fh.write(json.dumps(c, ensure_ascii=False) + "\n")

    low = " ".join(low_all)
    words = re.findall(r"[a-zʼ']+", low)
    tri = Counter(zip(words, words[1:], words[2:]))
    cnt = lambda w: len(re.findall(rf"(?<![a-zʼ']){re.escape(w)}(?![a-zʼ'])", low))
    style = {
        "fayllar": len(openers), "bolaklar": len(chunks), "belgi": len(low), "gaplar": total_sent,
        "gap_uzunligi_belgi": {"mediana": statistics.median(sent_lens), "p90": sorted(sent_lens)[int(len(sent_lens) * 0.9)]},
        "savol_gap_ulushi": round(q / max(1, total_sent), 3),
        "undov_gap_ulushi": round(ex / max(1, total_sent), 3),
        "murojaat": {w: cnt(w) for w in ADDRESS},
        "diniy_iboralar": {w: cnt(w) for w in RELIGIOUS},
        "bog_lovchi_so_zlar": {w: cnt(w) for w in MARKERS},
        "top_3_so_zli_iboralar": [[" ".join(k), v] for k, v in tri.most_common(60) if v >= 8][:40],
        "ochilishlar": openers,
        "yopilishlar": closers,
    }
    (OUT / "lessons_style_profile.json").write_text(json.dumps(style, ensure_ascii=False, indent=2), encoding="utf-8")

    topics = {}
    for name, pat in TOPICS.items():
        rx = re.compile(pat, re.I)
        scored = sorted(((len(rx.findall(c["text"])), i) for i, c in enumerate(chunks)), reverse=True)
        topics[name] = {
            "umumiy_moslik": sum(s for s, _ in scored),
            "bolaklar_soni": sum(1 for s, _ in scored if s),
            "eng_mos_bolaklar": [{"file": chunks[i]["file"], "n": chunks[i]["n"], "text": chunks[i]["text"]}
                                 for s, i in scored[:6] if s],
        }
    (OUT / "lessons_topics.json").write_text(json.dumps(topics, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{len(chunks)} bo'lak, {total_sent} gap, {len(low)} belgi → {OUT}")


if __name__ == "__main__":
    main()
