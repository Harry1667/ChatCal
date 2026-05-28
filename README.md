# ChatCal

Discord 手帳機器人 — 在 Discord 隨口說，AI 自動解析成行事曆事件、日記，並同步至 Web 介面。解決輸入摩擦力過大、資訊碎片化的問題。

## Discord 輸入 — 8 種意圖自動識別

| 意圖 | 範例 | 結果 |
|------|------|------|
| 新事件 | 「明天下午三點跟教授討論論文」 | 存事件 + Embed 確認 + 按鈕列 |
| 批次新增 | 「明天三件事：9點晨會、下午做報告、晚上買菜」 | 一次存三筆 |
| 重複事件 | 「每週三下午 3 點打籃球」 | 自動展開未來週三 |
| 修改 | 「把 3 點的論文討論改到 4 點半」 | AI 定位並修改 |
| 完成 | 「論文寫完了」 | status → done |
| 取消 | 「今晚火鍋取消」 | 刪除事件 |
| 日記 | 「今天好累，但功能跑起來了，很爽」 | AI 挑 emoji + 整理，存日記 |
| 閒聊 | 「嗨」 | 直接回覆，不存 |

**時間解析**：「下午兩點」→ 14:00；「晚上」→ 20:00；只有日期沒時刻 → 09:00；完全沒提時間 → 存為「未定時間」進收件匣

**時間衝突偵測**：重疊時 Bot 自動警告並附 `[確定存] [取消]` 按鈕

## 自動推播

| 推播 | 時間 | 內容 |
|------|------|------|
| ☀️ 早報 | 每天 08:00 | 今日時間表 + 待辦 + 重複事件 |
| 🌙 晚報 | 每天 22:00 | 明日預告 + AI 反思邀請語 |
| 📊 週回顧 | 週日 21:00 | 本週完成 / 錯過 / 待續 + AI 手帳式總結 |
| ⏰ 事前提醒 | 事件前 60 / 30 分鐘 | 倒數提醒 |

所有推播使用 Discord Embed 格式，依 category（生活 / 學習 / 工作）顯示對應顏色邊框。

## Web 介面
- 行事曆視圖（月 / 週 / 日）
- 收件匣：「未定時間」事件集中管理
- Category Tab 篩選（隔離生活 / 學習 / 工作）
- 推播時間設定面板

## 技術棧
- Node.js + Discord.js（Bot）
- better-sqlite3（本地資料庫）
- proxycli（AI 意圖解析：GPT-4o-mini / Gemini Flash）
- 部署：chatcal.looptw.com（port 3002）

## 快速開始
```bash
cd 02-web
cp .env.example .env
# 填入 DISCORD_BOT_TOKEN, DISCORD_CHANNEL_ID, PROXYCLI_TOKEN
npm run dev   # 同時啟動 API server + Discord Bot
```

---

## English

A Discord-native bullet journal bot. Talk naturally in Discord — AI parses your messages into calendar events and diary entries, synced to a web UI. Built to eliminate input friction and the fragmentation of personal data across apps.

### Discord input — 8 intents auto-detected

| Intent | Example | Result |
|--------|---------|--------|
| New event | "Meet professor tomorrow 3pm to discuss thesis" | Save event + Embed confirmation + action buttons |
| Batch add | "Three things tomorrow: 9am standup, afternoon report, evening groceries" | Saves all three at once |
| Recurring | "Basketball every Wednesday 3pm" | Auto-expands future Wednesdays |
| Edit | "Move the 3pm thesis chat to 4:30" | AI locates and edits |
| Done | "Finished writing the paper" | status → done |
| Cancel | "Cancel tonight's hotpot" | Deletes event |
| Diary | "Tired today but the feature finally works, feels great" | AI picks emoji + cleans up, saves as diary |
| Chit-chat | "Hi" | Replies, doesn't save |

**Time parsing**: "2pm" → 14:00; "evening" → 20:00; date with no time → 09:00; no time at all → saved to inbox as "undated"

**Conflict detection**: when overlapping, the bot warns and attaches `[Confirm] [Cancel]` buttons.

### Auto push notifications

| Push | When | Content |
|------|------|---------|
| ☀️ Morning brief | Daily 08:00 | Today's schedule + todos + recurring events |
| 🌙 Evening brief | Daily 22:00 | Tomorrow preview + AI reflection prompt |
| 📊 Weekly review | Sun 21:00 | Done / missed / continuing + AI journal-style summary |
| ⏰ Pre-event | 60 / 30 min before | Countdown reminder |

All pushes use Discord Embed with category-coloured borders (life / study / work).

### Web UI
- Calendar view (month / week / day)
- Inbox: undated events in one place
- Category tab filter (isolate life / study / work)
- Push schedule settings

### Tech stack
- Node.js + Discord.js (bot)
- better-sqlite3 (local DB)
- proxycli (AI intent parsing: GPT-4o-mini / Gemini Flash)
- Deployed at chatcal.looptw.com (port 3002)

### Quick start
```bash
cd 02-web
cp .env.example .env
# Fill in DISCORD_BOT_TOKEN, DISCORD_CHANNEL_ID, PROXYCLI_TOKEN
npm run dev   # Starts API server + Discord Bot
```
