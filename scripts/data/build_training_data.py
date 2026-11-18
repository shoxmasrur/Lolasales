#!/usr/bin/env python3
"""Telegram eksporti + ovoz transkriptlaridan LLM fine-tuning ma'lumotlarini tayyorlaydi.

Kirish  (data/tg_export_text/): messages.jsonl, chats.jsonl, transcripts.jsonl
Chiqish (data/training/):
  conversations.jsonl   — to'liq, FILTRSIZ suhbatlar (tahlil va build_knowledge uchun)
  finetune_train.jsonl  — chat formati {"messages":[system,user,assistant,...]} (~95%)
  finetune_val.jsonl    — validatsiya (~5%, chat darajasida ajratilgan)
  stats.json, README.md

Rollar: eksport egasi «Lola Zunnunova Menejer» = assistant, qolgan yuboruvchi = user.
Ovozli xabar matni transkriptdan olinadi. Karta/telefon raqamlari niqoblanadi.

O'qitish uchun sifat filtrlari (conversations.jsonl ga tegmaydi):
  - ichki jamoa chatlari (mijoz emas) chiqariladi;
  - faqat media belgisidan iborat menejer javoblari olib tashlanadi;
  - ommaviy reklama shablonlari (5+ marta takrorlangan uzun javob) har biri
    ko'pi bilan TEMPLATE_CAP marta qoladi — model yodlab olmasin;
  - olib tashlangan navbatlar atrofidagi bir xil rolli navbatlar birlashtiriladi;
  - juda qisqa ("ok") javoblardan iborat namunalar tashlanadi;
  - yakunda har namuna format jihatidan tekshiriladi.

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
STAFF_CLIENTS = ["Lola Zunnunova", "Dilrabo LZ", "Mohidil Opa"]  # ichki chatlar
SESSION_GAP_H = 12          # shundan uzoq tanaffus — yangi suhbat
MAX_TURNS = 40              # bitta o'qitish namunasidagi eng ko'p navbat
MAX_CHARS = 7000            # va eng ko'p belgi
TEMPLATE_MIN_LEN = 40       # shu uzunlikdan qisqa javob "shablon" hisoblanmaydi
TEMPLATE_MIN_COUNT = 5      # shuncha va undan ko'p takror = shablon
TEMPLATE_CAP = 3            # shablon har biri shuncha marta qoladi
MIN_ASSISTANT_CHARS = 25    # namunadagi menejer matnlari yig'indisi shundan kam bo'lsa tashlanadi
CHARS_PER_TOKEN = 3.2       # o'zbek lotin matni uchun taxminiy (aniq tokenizer emas)
SYSTEM = (
    "Siz Lola Zunnunova jamoasining sotuv menejerisiz. Telegramda mijozlar bilan "
    "o'zbek tilida samimiy va hurmat bilan muloqot qilasiz: ehtiyojni aniqlaysiz, "
    "kursni tushuntirasiz, e'tirozlarga javob berasiz va mijozni to'lovga olib borasiz."
)
MEDIA_LABEL = {
    "photo": "[rasm]", "video": "[video]", "file": "[fayl]", "audio_file": "[audio]",
    "contact": "[kontakt]", "location": "[joylashuv]", "voice_message": "[ovozli xabar]",
}
MEDIA_ONLY_RE = re.compile(r"^(\[(rasm|video|fayl|audio|kontakt|joylashuv)\]\s*)+$")

CARD_RE = re.compile(r"\b(?:\d[ -]?){16}\b")
PHONE_RE = re.compile(r"(?<!\d)(?:\+?998[ -]?)?\(?\d{2}\)?[ -]?\d{3}[ -]?\d{2}[ -]?\d{2}(?!\d)")


URL_RE = re.compile(r"(?:https?://|www\.|t\.me/)\S+", re.I)


def mask(t: str) -> str:
    """Karta, telefon va havolalarni niqoblaydi: loyiha qoidasiga ko'ra karta raqami va
    guruh havolasini LLM emas, tizim yuboradi — model faqat o'rinbosarni o'rganadi."""
    return URL_RE.sub("[HAVOLA]", PHONE_RE.sub("[TELEFON]", CARD_RE.sub("[KARTA]", t)))


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


def has_both(turns) -> bool:
    return any(t["role"] == "assistant" for t in turns) and any(t["role"] == "user" for t in turns)


def merge_adjacent(turns):
    out = []
    for t in turns:
        if out and out[-1]["role"] == t["role"]:
            out[-1] = dict(out[-1], content=out[-1]["content"] + "\n" + t["content"],
                           voice=out[-1]["voice"] or t["voice"])
        else:
            out.append(dict(t))
    return out


def clean_for_training(turns, counts, seen, stats):
    """Media-only va ortiqcha shablon menejer javoblarini olib tashlaydi."""
    kept = []
    for t in turns:
        if t["role"] == "assistant":
            c = t["content"].strip()
            if MEDIA_ONLY_RE.match(c):
                stats["olib_tashlandi_media_only"] += 1
                continue
            if len(c) >= TEMPLATE_MIN_LEN and counts[c] >= TEMPLATE_MIN_COUNT:
                seen[c] += 1
                if seen[c] > TEMPLATE_CAP:
                    stats["olib_tashlandi_shablon"] += 1
                    continue
        kept.append(t)
    return merge_adjacent(kept)


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
        if has_both(b):
            res.append(b)
    return res


def validate(ex) -> str | None:
    """Namuna formatidagi xato bo'lsa matn, aks holda None."""
    m = ex["messages"]
    if len(m) < 3 or m[0]["role"] != "system":
        return "system yo'q yoki juda qisqa"
    for i, x in enumerate(m[1:], 1):
        if not x["content"].strip():
            return "bo'sh matn"
        if x["role"] != ("user" if i % 2 == 1 else "assistant"):
            return "rollar navbatlashmaydi"
    return None if m[-1]["role"] == "assistant" else "assistant bilan tugamaydi"


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

    # 1-o'tish: sessiyalar va shablon sanog'i
    sessions = []
    counts = Counter()
    for chat in sorted(by_chat):
        for si, sess in enumerate(build_sessions(by_chat[chat], transcripts)):
            sessions.append((chat, si, sess))
            for t in sess:
                if t["role"] == "assistant" and len(t["content"].strip()) >= TEMPLATE_MIN_LEN:
                    counts[t["content"].strip()] += 1

    # 2-o'tish: yozish va filtrlash
    stats = Counter()
    seen = Counter()
    post_seen = Counter()
    train, val = [], []
    with open(a.out_dir / "conversations.jsonl", "w", encoding="utf-8") as conv:
        for chat, si, sess in sessions:
            if not has_both(sess):
                stats["sessiya_bir_tomonlama"] += 1
                continue
            stats["sessiya"] += 1
            client = names.get(chat)
            conv.write(json.dumps({
                "chat": chat, "client": client, "session": si,
                "start": sess[0]["ts"], "end": sess[-1]["ts"],
                "turns": [{"role": t["role"], "content": t["content"], "voice": t["voice"]} for t in sess],
            }, ensure_ascii=False) + "\n")

            if any(s.lower() in (client or "").lower() for s in STAFF_CLIENTS):
                stats["ichki_chat_sessiya_chiqarildi"] += 1
                continue
            turns = clean_for_training(sess, counts, seen, stats)
            # Birlashtirishdan keyin paydo bo'lgan takrorlar ham cheklanadi.
            turns = [t for t in turns if not (
                t["role"] == "assistant" and len(t["content"].strip()) >= TEMPLATE_MIN_LEN
                and post_seen.update([t["content"].strip()]) is None
                and post_seen[t["content"].strip()] > TEMPLATE_CAP)]
            turns = merge_adjacent(turns)
            if not has_both(turns):
                stats["tozalashdan_keyin_bosh"] += 1
                continue
            is_val = int(hashlib.md5(chat.encode()).hexdigest(), 16) % 20 == 0
            for b in chunk(turns):
                if sum(len(t["content"]) for t in b if t["role"] == "assistant") < MIN_ASSISTANT_CHARS:
                    stats["namuna_juda_qisqa_tashlandi"] += 1
                    continue
                ex = {"messages": [{"role": "system", "content": SYSTEM}]
                      + [{"role": t["role"], "content": t["content"]} for t in b]}
                err = validate(ex)
                if err:
                    stats["format_xatosi_tashlandi"] += 1
                    continue
                (val if is_val else train).append(ex)
                stats["namuna_val" if is_val else "namuna_train"] += 1
                stats["assistant_navbat"] += sum(t["role"] == "assistant" for t in b)
                stats["ovozli_navbat"] += sum(t["voice"] for t in b)

    for name, rows in (("finetune_train.jsonl", train), ("finetune_val.jsonl", val)):
        with open(a.out_dir / name, "w", encoding="utf-8") as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")

    chars = sum(len(x["content"]) for r in train + val for x in r["messages"])
    stats["transkript_soni"] = len(transcripts)
    stats["chatlar"] = len(by_chat)
    stats["taxminiy_token_jami"] = int(chars / CHARS_PER_TOKEN)
    (a.out_dir / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=2))
    (a.out_dir / "README.md").write_text(
        "# O'qitish ma'lumotlari\n\n"
        "Skript: `scripts/data/build_training_data.py` (qayta ishga tushsa hammasi yangidan yasaladi).\n\n"
        f"- `finetune_train.jsonl` — {len(train)} namuna, `finetune_val.jsonl` — {len(val)} namuna.\n"
        "  Format: `{\"messages\":[system,user,assistant,...]}` (OpenAI-chat / ko'pchilik trenerlar bilan mos);\n"
        "  validatsiya chat darajasida ajratilgan (sizish yo'q).\n"
        f"- Taxminiy hajm: ~{int(chars / CHARS_PER_TOKEN):,} token (belgi/{CHARS_PER_TOKEN}; aniq tokenizer bilan qayta hisoblang).\n"
        "- `conversations.jsonl` — filtrsiz to'liq sessiyalar (tahlil uchun, o'qitishga emas).\n"
        "- Menejer (Lola Zunnunova Menejer) = `assistant`, mijoz = `user`.\n"
        "- Ovozli xabarlar `[ovozli xabar] <matn>` ko'rinishida (Nai.uz STT, o'zbek lotin imlosiga keltirilgan).\n"
        "- Karta (`[KARTA]`) va telefon (`[TELEFON]`) raqamlari niqoblangan.\n"
        "- Filtrlar: ichki jamoa chatlari chiqarilgan; faqat media javoblar va 5+ marta takrorlangan\n"
        f"  reklama shablonlari (har biri ko'pi bilan {TEMPLATE_CAP} marta) olib tashlangan.\n"
        "- Maxfiy: haqiqiy mijoz yozishmalari — `data/` git'ga qo'shilmaydi.\n"
    )
    print(json.dumps(stats, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
