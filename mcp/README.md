# Debitor MCP server

Boshqa AI agentlaringiz (Usmon_ai, Bozorvoy, Finansist…) Debitor tizimini
o'qishi va xavfsiz amallarni bajarishi uchun MCP server.

## Nima qila oladi

**O'qish (13 ta asbob)** — umumiy statistika, mijozlar va qarzlar, suhbatlar va
yozishmalar, to'lov va'dalari, kampaniyalar, Telegram akkauntlar holati,
agent qoidalari va saboqlari, ish rejimi sozlamalari.

**Xavfsiz yozish (5 ta asbob)**

| Asbob | Nima qiladi |
|-------|-------------|
| `debitor_update_client_memory` | Mijoz haqidagi xotirani yangilaydi |
| `debitor_update_client_note` | Ichki izoh yoki "bog'lanmaslik" belgisi |
| `debitor_escalate_conversation` | Suhbatni operatorga chiqaradi |
| `debitor_set_conversation_state` | Suhbat holatini qo'lda belgilaydi |
| `debitor_propose_lesson` | Agentga saboq taklif qiladi (tasdiq kutadi) |

## Nima QILA OLMAYDI

Quyidagilar **ataylab yo'q** — ular real mijozlarga bevosita ta'sir qiladi va
orqaga qaytarib bo'lmaydi:

- mijozga xabar yuborish
- suhbat boshlash
- kampaniya yaratish yoki ishga tushirish
- kill switch, sozlamalar, foydalanuvchi boshqaruvi

Ikki qatlamli himoya: (1) bunday asboblar umuman mavjud emas,
(2) API kalitning roli baribir ruxsat bermaydi.

## Sozlash

**1. Dashboardda kalit yarating**

`Foydalanuvchilar` → `Foydalanuvchi qo'shish` — agent uchun alohida hisob
(masalan `usmon-ai@xonsaroy.uz`), rol: **MCP agent**.

So'ng `API kalitlar` → `Kalit yaratish`. Kalit **faqat bir marta** ko'rsatiladi.

**2. Agentga ulang**

Claude Code uchun:

```bash
claude mcp add debitor --env DEBITOR_API_URL=http://localhost:4100 --env DEBITOR_API_KEY=dbt_… -- node /Users/ulugbektuxtayev/AI/DebitorAgent02/mcp/dist/index.js
```

Yoki MCP konfiguratsiya faylida:

```json
{
  "mcpServers": {
    "debitor": {
      "command": "node",
      "args": ["/Users/ulugbektuxtayev/AI/DebitorAgent02/mcp/dist/index.js"],
      "env": {
        "DEBITOR_API_URL": "http://localhost:4100",
        "DEBITOR_API_KEY": "dbt_…"
      }
    }
  }
}
```

Ishga tushirishdan oldin: `npm run build --workspace=mcp`

**3. Tekshiring**

Agentga `debitor_whoami` asbobini chaqirishni ayting — u qaysi rol bilan
ulanganini va qanday ruxsatlari borligini qaytaradi.

## Muhit o'zgaruvchilari

| O'zgaruvchi | Sukut | Izoh |
|-------------|-------|------|
| `DEBITOR_API_URL` | `http://localhost:4100` | Debitor API manzili |
| `DEBITOR_API_KEY` | — | **Majburiy.** Dashboarddan olinadi |
| `DEBITOR_TIMEOUT_MS` | `30000` | So'rov kutish vaqti |

## Arxitektura

MCP server bazaga **to'g'ridan-to'g'ri tegmaydi** — barcha so'rovlar REST API
orqali o'tadi. Shuning uchun rol/ruxsat tekshiruvi, kill switch, limitlar va
audit jurnali o'z-o'zidan ishlaydi, biznes mantiq ikki joyda takrorlanmaydi.

```
Boshqa agent → MCP (stdio) → Debitor REST API → RBAC → biznes mantiq → Postgres
                                                  ↓
                                             audit_log
```
