#!/usr/bin/env python3
"""data/kesilgan/*.ogg (uzun dars/seminar yozuvlari) ni Nai.uz STT bilan matnga o'giradi.

Har fayl ~10 daqiqalik bo'laklarga bo'linadi (hajm/davomiylik cheklovi va xatoda faqat
bitta bo'lakni qayta yuborish uchun). Natija: data/kesilgan_transcripts/<fayl>.txt va
<fayl>.jsonl (bo'lak bo'yicha). Davom ettiriladigan: tayyor bo'laklar qayta yuborilmaydi.
Balans tugasa (402) to'xtaydi.

  python3 -I scripts/data/transcribe_kesilgan.py [--limit-chunks N]
"""
import argparse
import importlib.util
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data" / "kesilgan"
OUT = ROOT / "data" / "kesilgan_transcripts"
CHUNK_SEC = 600

spec = importlib.util.spec_from_file_location("tv", ROOT / "scripts" / "data" / "transcribe_voices.py")
tv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tv)

# Nai.uz qaytaradigan qo'shimcha turkcha belgilar
tv.NORMALIZE.update({"ü": "u", "Ü": "U", "ı": "i", "İ": "I"})
tv.NORM_RE = tv.re.compile("|".join(map(tv.re.escape, tv.NORMALIZE)))


def split(src: Path, workdir: Path) -> list[Path]:
    pattern = workdir / "part_%03d.ogg"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", str(src), "-f", "segment",
         "-segment_time", str(CHUNK_SEC), "-reset_timestamps", "1",
         "-c:a", "libopus", "-b:a", "32k", str(pattern)],
        check=True,
    )
    parts = sorted(workdir.glob("part_*.ogg"))
    # `-c copy` da vaqt belgilari asl fayldan davom etib, Nai.uz ortiqcha pul yechgan edi.
    # Yuborishdan oldin har bo'lak davomiyligi tekshiriladi.
    for p in parts:
        dur = float(subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
            capture_output=True, text=True, check=True).stdout.strip())
        if dur > CHUNK_SEC + 5:
            sys.exit(f"{p.name}: davomiylik {dur:.0f}s > {CHUNK_SEC}s — to'xtatildi (pul sarflanmadi)")
    return parts


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit-chunks", type=int, default=0)
    a = ap.parse_args()
    key = tv.load_key()
    OUT.mkdir(parents=True, exist_ok=True)
    done_chunks = 0
    spent = 0.0

    for src in sorted(SRC.glob("*.ogg")):
        stem = src.stem
        jl = OUT / f"{stem}.jsonl"
        have = {}
        if jl.exists():
            for line in jl.read_text().splitlines():
                r = json.loads(line)
                if not r.get("error"):
                    have[r["chunk"]] = r
        with tempfile.TemporaryDirectory() as td:
            parts = split(src, Path(td))
            print(f"{src.name}: {len(parts)} bo'lak, tayyor {len(have)}", flush=True)
            for i, part in enumerate(parts):
                if i in have:
                    continue
                if a.limit_chunks and done_chunks >= a.limit_chunks:
                    return
                tv.LIMITER.wait()
                attempt = 0
                while True:
                    r = tv.call_api(key, part, "uz")
                    st, body = r["status"], r["body"]
                    if st == 200 and body and body.get("data", {}).get("text", "").strip():
                        d = body["data"]
                        rec = {"file": src.name, "chunk": i, "offset_sec": i * CHUNK_SEC,
                               "sec": d.get("duration_seconds"), "transcript": tv.normalize(d["text"].strip()),
                               "transcript_raw": d["text"].strip(), "error": None}
                        spent += d.get("duration_seconds") or 0
                        print(f"  bo'lak {i}: ok, balans {d.get('balance')}", flush=True)
                        break
                    code = ((body or {}).get("error") or {}).get("code", "") if body else ""
                    if st == 402 or "insufficient" in code or "balance" in code or "quota" in code:
                        sys.exit(f"Balans/kvota tugadi: {st} {code}")
                    if st == 429:
                        tv.time.sleep(max(r["retry_after"], 5))
                        continue
                    attempt += 1
                    if attempt >= 5:
                        rec = {"file": src.name, "chunk": i, "error": f"{st} {code}".strip()}
                        print(f"  bo'lak {i}: XATO {rec['error']}", flush=True)
                        break
                    tv.time.sleep(min(30, 2 ** attempt))
                with jl.open("a") as f:
                    f.write(json.dumps(rec, ensure_ascii=False) + "\n")
                done_chunks += 1
        # to'liq matn
        rows = {}
        for line in jl.read_text().splitlines():
            r = json.loads(line)
            if not r.get("error"):
                rows[r["chunk"]] = r["transcript"]
        (OUT / f"{stem}.txt").write_text("\n\n".join(rows[k] for k in sorted(rows)) + "\n")
    print(f"Tugadi. Sarf: ~{spent:.0f} birlik")


if __name__ == "__main__":
    main()
