#!/usr/bin/env python3
"""Telegram eksportidagi barcha ovozli xabarlarni Nai.uz STT orqali matnga o'giradi.

Davom ettiriladigan (resume): `transcripts.jsonl` da muvaffaqiyatli yozilganlar qayta
yuborilmaydi. Xatoli yozuvlar keyingi ishga tushirishda qayta uriniladi.

  python3 scripts/data/transcribe_voices.py --limit 1      # sinov
  python3 scripts/data/transcribe_voices.py                # hammasi

Kalit `.env` dagi NAI_STT_API_KEY dan olinadi (hech qachon chop etilmaydi).
Narx: 1 birlik / soniya. Balans tugasa (402 / insufficient) skript to'xtaydi.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_TEXT_DIR = ROOT / "data" / "tg_export_text"
DEFAULT_EXPORT = Path.home() / "Desktop" / "tg_export" / "Telegram_Export_2026-11-17"
BASE_URL = "https://my.neuronai.uz/api/v1"

# Nai.uz lotin-turkcha belgilar bilan qaytaradi; o'zbek lotin imlosiga o'tkaziladi.
NORMALIZE = {
    "ö": "o'", "Ö": "O'", "ş": "sh", "Ş": "Sh", "ç": "ch", "Ç": "Ch",
    "ğ": "g'", "Ğ": "G'", "ń": "n",
}
NORM_RE = re.compile("|".join(map(re.escape, NORMALIZE)))


def normalize(text: str) -> str:
    return NORM_RE.sub(lambda m: NORMALIZE[m.group(0)], text)


def load_key() -> str:
    key = os.environ.get("NAI_STT_API_KEY")
    if key:
        return key
    for line in (ROOT / ".env").read_text().splitlines():
        if line.startswith("NAI_STT_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("NAI_STT_API_KEY topilmadi")


class StopAll(Exception):
    pass


def call_api(key: str, path: Path, language: str) -> dict:
    """curl orqali bitta so'rov. Qaytaradi: {status, body(dict|None), retry_after}."""
    cmd = [
        "curl", "-sS", "--max-time", "180", "-D", "-", "-o", "-",
        "-X", "POST", f"{BASE_URL}/stt/transcribe",
        "-H", f"Authorization: Bearer {key}", "-H", "Accept: application/json",
        "--form-string", f"language={language}", "-F", 'file=@"' + str(path).replace("\\", "\\\\").replace('"', '\\"') + '"',
    ]
    p = subprocess.run(cmd, capture_output=True)
    if p.returncode != 0:
        return {"status": 0, "body": None, "retry_after": 2, "err": p.stderr.decode()[:200]}
    raw = p.stdout
    head, _, body = raw.rpartition(b"\r\n\r\n")
    headers = head.decode(errors="replace")
    m = re.findall(r"HTTP/[\d.]+ (\d+)", headers)
    status = int(m[-1]) if m else 0
    ra = re.search(r"(?i)retry-after:\s*(\d+)", headers)
    try:
        data = json.loads(body.decode())
    except Exception:
        data = None
    return {"status": status, "body": data, "retry_after": int(ra.group(1)) if ra else 2}


class RateLimiter:
    """Barcha ishchilar uchun umumiy: daqiqasiga eng ko'pi bilan `per_minute` so'rov.
    Nai.uz tashkilot limiti — 60 so'rov/daq."""

    def __init__(self, per_minute: float):
        self.gap = 60.0 / per_minute
        self.next = 0.0
        self.lock = threading.Lock()

    def wait(self):
        with self.lock:
            now = time.monotonic()
            slot = max(now, self.next)
            self.next = slot + self.gap
        if slot > now:
            time.sleep(slot - now)


LIMITER = RateLimiter(55)


def transcribe_one(key, item, export_root, language, stop: threading.Event):
    path = export_root / item["file"]
    attempt = 0
    while attempt < 5:
        if stop.is_set():
            raise StopAll()
        LIMITER.wait()
        r = call_api(key, path, language)
        st, body = r["status"], r["body"]
        if st == 200 and body and body.get("data", {}).get("text", "").strip():
            d = body["data"]
            raw_text = d["text"].strip()
            return {
                "chat": item["chat"], "msg_id": item["msg_id"], "file": item["file"],
                "from": item["from"], "date": item["date"],
                "transcript": normalize(raw_text), "transcript_raw": raw_text,
                "language": d.get("language"), "sec": d.get("duration_seconds"),
                "cost": d.get("duration_seconds"), "balance": None,
                "request_id": body.get("request_id"), "error": None,
            }
        code = ((body or {}).get("error") or {}).get("code", "") if body else ""
        if st == 402 or "insufficient" in code or "balance" in code or "quota" in code:
            stop.set()
            raise StopAll(f"balans/kvota: {st} {code}")
        if st == 429:
            # Limit — bu xato emas: urinish sanalmaydi, faqat kutiladi.
            time.sleep(min(60, max(r["retry_after"], 5)))
            continue
        if st in (0, 500, 502, 503, 504):
            time.sleep(min(30, max(r["retry_after"], 2 ** attempt)))
            attempt += 1
            continue
        return {"chat": item["chat"], "msg_id": item["msg_id"], "file": item["file"],
                "error": f"{st} {code}".strip()}
    return {"chat": item["chat"], "msg_id": item["msg_id"], "file": item["file"],
            "error": "qayta urinishlar tugadi"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--text-dir", type=Path, default=DEFAULT_TEXT_DIR)
    ap.add_argument("--export-root", type=Path, default=DEFAULT_EXPORT)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--language", default="uz")
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()

    key = load_key()
    out_path = a.text_dir / "transcripts.jsonl"
    done = set()
    if out_path.exists():
        for line in out_path.read_text().splitlines():
            x = json.loads(line)
            if not x.get("error"):
                done.add((x["chat"], x["msg_id"]))

    todo, missing = [], 0
    for line in (a.text_dir / "messages.jsonl").read_text().splitlines():
        m = json.loads(line)
        md = m.get("media")
        if m.get("service") or not isinstance(md, dict):
            continue
        if md.get("type") not in ("voice_message", "audio_file") or not md.get("file"):
            continue
        if (m["chat"], m["msg_id"]) in done:
            continue
        if not (a.export_root / md["file"]).is_file():
            missing += 1
            continue
        todo.append({"chat": m["chat"], "msg_id": m["msg_id"], "file": md["file"],
                     "from": m.get("from"), "date": m.get("date")})
    if a.limit:
        todo = todo[: a.limit]
    print(f"bajarilgan: {len(done)}, qoldi: {len(todo)}, fayli yo'q: {missing}", flush=True)

    lock, stop = threading.Lock(), threading.Event()
    ok = err = 0
    secs = 0.0
    t0 = time.time()
    with open(out_path, "a", encoding="utf-8") as f, ThreadPoolExecutor(a.workers) as ex:
        futs = [ex.submit(transcribe_one, key, it, a.export_root, a.language, stop) for it in todo]
        try:
            for i, fu in enumerate(as_completed(futs), 1):
                try:
                    rec = fu.result()
                except StopAll as e:
                    print(f"TO'XTADI: {e}", flush=True)
                    continue
                with lock:
                    f.write(json.dumps(rec, ensure_ascii=False) + "\n")
                    f.flush()
                if rec.get("error"):
                    err += 1
                else:
                    ok += 1
                    secs += rec.get("sec") or 0
                if i % 100 == 0 or i == len(futs):
                    (a.text_dir / "transcribe_progress.txt").write_text(
                        f"{i}/{len(futs)} muvaffaqiyatli: {ok} xato: {err} "
                        f"sarflangan: {secs:.0f} soniya o'tgan: {(time.time()-t0)/60:.1f} daq\n")
                    print(f"{i}/{len(futs)} ok={ok} xato={err} sarf={secs:.0f}s", flush=True)
        except KeyboardInterrupt:
            stop.set()
            print("Qo'lda to'xtatildi; davom ettirish uchun qayta ishga tushiring")
    print(f"tugadi: ok={ok} xato={err}")


if __name__ == "__main__":
    main()
