# 🤖 Reapers Dealer Bot

Discord bot pro správu RP ekonomiky (prodeje, sklad, ztráty, nákup surovin).

---

## 🚀 Funkce

* 💰 Prodej sáčků (progresivní ceny)
* 🌿 Správa skladu (gramy)
* 🚔 Evidence ztrát (/pd)
* 🛒 Nákup surovin (modal + potvrzení)
* 📊 Statistiky hráčů
* 📝 Automatické logování
* 🏆 (volitelně) TOP leaderboard

---

## ⚙️ Technologie

* Node.js
* discord.js v14
* Supabase (PostgreSQL)
* Railway (hosting)

---

## 🔐 Environment Variables

```env
TOKEN=
SUPABASE_URL=
SUPABASE_KEY=
LOG_CHANNEL_ID=

TOP_CHANNEL_ID=
TOP_HOUR=
TOP_MINUTE=
```

---

## 🗄️ Databáze

### sklad

* id (1)
* trava (gramy)
* penize

### prodeje

* user_id
* user_name
* pocet
* castka
* datum

### ztraty

* user_id
* user_name
* gramy
* datum

---

## 📦 Commandy

| Command    | Popis          |
| ---------- | -------------- |
| /prodej    | Prodej sáčků   |
| /pd        | Zabavené sáčky |
| /sber      | Přidání trávy  |
| /nakup     | Odečet peněz   |
| /stav      | Stav skladu    |
| /moje      | Statistiky     |
| /ztraty    | Ztráty         |
| /kalkulace | Nákup surovin  |

---

## 🧠 Ekonomika

* 1 sáček = 5g
* limit = 60 sáčků / den
* progresivní ceny (180 → 150)

---

## 🛒 Nákup systém

1. `/kalkulace`
2. otevře modal
3. preview
4. potvrzení
5. odečet peněz

---

## 📡 Logy

* prodej
* sběr
* nákup
* ztráty
* nákup surovin

---

## 🚀 Deploy

1. push na GitHub
2. Railway auto deploy
3. hotovo

---

## 🔧 Budoucí rozšíření

* role-based přístup
* leaderboard ztrát
* web dashboard
* ceny z DB
