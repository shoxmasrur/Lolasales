#!/usr/bin/env python3
"""Telegram eksporti + ovoz transkriptlaridan LLM fine-tuning ma'lumotlarini tayyorlaydi.

Kirish  (data/tg_export_text/): messages.jsonl, chats.jsonl, transcripts.jsonl
Chiqish (data/training/):
  conversations.jsonl   — to'liq, birlashtirilgan suhbatlar (tahlil uchun)
  finetune_train.jsonl  — chat formati {"messages":[system,user,assistant,...]} (95%)
  finetune_val.jsonl    — validatsiya (5%, chat darajasida ajratilgan)
  stats.json, README.md

Rollar: eksport egasi «Lola Zunnunova Menejer» = assistant, qolgan yuboruvchi = user.
Ovozli xabar matni transkriptdan olinadi. Karta/telefon raqamlari niqoblanadi.

  python3 -I scripts/data/build_training_data.py
"""
import argparse
import hashlib
import json
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OWNER = "Lola Zunnunova Menejer"
SESSION_GAP_H = 12          # shundan uzoq tanaffus — yangi suhbat
MAX_TURNS = 40              # bitta o'qitish namunasidagi eng ko'p navbat
MAX_CHARS = 7000            # va eng ko'p belgi
SYSTEM = (
    "Siz Lola Zunnunova jamoasining sotuv menejerisiz. Telegramda mijozlar bilan "
    "o'zbek tilida samimiy va hurmat bilan muloqot qilasiz: ehtiyojni aniqlaysiz, "
    "kursni tushuntirasiz, e'tirozlarga javob berasiz va mijozni to'lovga olib borasiz."
)
MEDIA_LABEL = {
    "photo": "[rasm]", "video": "[video]", "file": "[fayl]", "audio_file": "[audio]",
    "contact": "[kontakt]", "location": "[joylashuv]", "voice_message": "[ovozli xabar]",
}

CARD_RE = re.compile(r"\b(?:\d[ -]?){16}\b")
PHONE_RE = re.compile(r"(?<!\d)(?:\+?998[ -]?)?\(?\d{2}\)?[ -]?\d{3}[ -]?\d{2}[ -]?\d{2}(?!\d)")


def mask(t: str) -> str:
    return PHONE_RE.sub("[TELEFON]", CARD_RE.sub("[KARTA]", t))


def load_jsonl(p: Path):
    with open(p, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                yield json.loads(line)


def message_text(m, transcripts):
    """(matn, ovozmi) — bo'sh bo'lsa None."""
    md = m.get("media")
    mtype = md.get("type") if isinstance(md, dict) else None
    parts = []
    voice = False
    if mtype in ("voice_message", "audio_file"):
        tr = transcripts.get((m["chat"], m["msg_id"]))
        if tr:
            parts.append(f"[ovozli xabar] {tr}")
            voice = True
        else:
            return None, False        # transkripti yo'q ovoz — o'tkazib yuboriladi
    elif mtype:
        parts.append(MEDIA_LABEL.get(mtype, f"[{mtype}]"))
    if m.get("text"):
        parts.append(m["text"].strip())
    text = " ".join(p for p in parts if p).strip()
    return (mask(text) if text else None), voice


def build_sessions(msgs, transcripts):
    """Bitta chat xabarlari -> sessiyalar -> birlashtirilgan navbatlar."""
    msgs.sort(key=lambda m: (m.get("date") or "", m["msg_id"]))
    sessions, cur, last = [], [], None
    for m in msgs:
        text, voice = message_text(m, transcripts)
        if not text:
            continue
        role = "assistant" if m["from"] == OWNER else "user"
        ts = datetime.fromisoformat(m["date"])
        if last and (ts - last).total_seconds() > SESSION_GAP_H * 3600:
            sessions.append(cur)
            cur = []
        last = ts
        if cur and cur[-1]["role"] == role:
            cur[-1]["content"] += "\n" + text
            cur[-1]["voice"] |= voice
        else:
            cur.append({"role": role, "content": text, "voice": voice, "ts": m["date"]})
    if cur:
        sessions.append(cur)
    return sessions


def chunk(turns):
    """Sessiyani chegaralangan bo'laklarga ajratadi: user bilan boshlanib assistant bilan tugaydi."""
    out, buf, size = [], [], 0
    for t in turns:
        if buf and (len(buf) >= MAX_TURNS or size + len(t["content"]) > MAX_CHARS):
            out.append(buf)
            buf, size = [], 0
        buf.append(t)
        size += len(t["content"])
    if buf:
        out.append(buf)
    res = []
    for b in out:
        while b and b[0]["role"] != "user":
            b = b[1:]
        while b and b[-1]["role"] != "assistant":
            b = b[:-1]
        if any(t["role"] == "assistant" for t in b) and any(t["role"] == "user" for t in b):
            res.append(b)
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--text-dir", type=Path, default=ROOT / "data" / "tg_export_text")
    ap.add_argument("--out-dir", type=Path, default=ROOT / "data" / "training")
    a = ap.parse_args()
    a.out_dir.mkdir(parents=True, exist_ok=True)

    transcripts = {}
    for x in load_jsonl(a.text_dir / "transcripts.jsonl"):
        if not x.get("error") and x.get("transcript"):
            transcripts[(x["chat"], x["msg_id"])] = x["transcript"]

    by_chat = defaultdict(list)
    for m in load_jsonl(a.text_dir / "messages.jsonl"):
        if not m.get("service") and m.get("date") and m.get("msg_id") is not None:
            by_chat[m["chat"]].append(m)

    names = {c["chat"]: c["name"] for c in load_jsonl(a.text_dir / "chats.jsonl")}
    stats = Counter()
    train, val = [], []
    with open(a.out_dir / "conversations.jsonl", "w", encoding="utf-8") as conv:
        for chat in sorted(by_chat):
            for si, sess in enumerate(build_sessions(by_chat[chat], transcripts)):
                if not (any(t["role"] == "assistant" for t in sess) and any(t["role"] == "user" for t in sess)):
                    stats["sessiya_bir_tomonlama"] += 1
                    continue
                stats["sessiya"] += 1
                conv.write(json.dumps({
                    "chat": chat, "client": names.get(chat), "session": si,
                    "start": sess[0]["ts"], "end": sess[-1]["ts"],
                    "turns": [{"role": t["role"], "content": t["content"], "voice": t["voice"]} for t in sess],
                }, ensure_ascii=False) + "\n")
                is_val = int(hashlib.md5(chat.encode()).hexdigest(), 16) % 20 == 0
                for b in chunk(sess):
                    ex = {"messages": [{"role": "system", "content": SYSTEM}]
                          + [{"role": t["role"], "content": t["content"]} for t in b]}
                    (val if is_val else train).append(ex)
                    stats["namuna_val" if is_val else "namuna_train"] += 1
                    stats["assistant_navbat"] += sum(t["role"] == "assistant" for t in b)
                    stats["ovozli_navbat"] += sum(t["voice"] for t in b)

    for name, rows in (("finetune_train.jsonl", train), ("finetune_val.jsonl", val)):
        with open(a.out_dir / name, "w", encoding="utf-8") as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")

    stats["transkript_soni"] = len(transcripts)
    stats["chatlar"] = len(by_chat)
    (a.out_dir / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=2))
    (a.out_dir / "README.md").write_text(
        "# O'qitish ma'lumotlari\n\n"
        "Skript: `scripts/data/build_training_data.py` (qayta ishga tushirsa hammasi yangidan yasaladi).\n\n"
        "- `conversations.jsonl` — sessiyalar (12 soatdan uzoq tanaffus = yangi sessiya), navbatlar birlashtirilgan.\n"
        "- `finetune_train.jsonl` / `finetune_val.jsonl` — `{\"messages\":[system,user,assistant,...]}` formati;\n"
        "  validatsiya chat darajasida ajratilgan (sizish yo'q).\n"
        "- Menejer (Lola Zunnunova Menejer) = `assistant`, mijoz = `user`.\n"
        "- Ovozli xabarlar `[ovozli xabar] <matn>` ko'rinishida (Nai.uz STT, o'zbek lotin imlosiga keltirilgan).\n"
        "- Karta (`[KARTA]`) va telefon (`[TELEFON]`) raqamlari niqoblangan.\n"
        "- Maxfiy: haqiqiy mijoz yozishmalari — `data/` git'ga qo'shilmaydi.\n"
    )
    print(json.dumps(stats, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
