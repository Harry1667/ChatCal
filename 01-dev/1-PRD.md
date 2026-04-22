# 智慧行事曆 (ChatCal) 產品需求文件

> 版本：v2.2 · 2026-04-23

---

## 一、產品概述

### 1. 核心定位

Discord 輸入 + 早晚報 + 事前提醒 + 日誌（手帳）+ Web 介面的個人生活與專案管理中控台。主打「隨口說、隨手記」，透過 Discord 將輸入阻力降到最低，並透過網頁端的「收件匣」與「Category Tab 過濾」讓生活、學習與工作井然有序。

### 2. 解決的核心痛點

- **輸入摩擦力過大**：傳統行事曆需要繁瑣點擊，無法應對走路或上課中的突發記錄需求。
- **資訊極度碎片化**：靈感、待辦、會議散落各處，缺乏統一且無痛的收集與歸檔機制。
- **多重身分互相干擾**：大學生與接案者的雙重身分容易產生視覺焦慮，需要能隔離「生活 / 學習 / 工作」的過濾視圖。

---

## 二、核心功能模組

### 2.1 Discord 極速輸入端

Bot 只聽指定頻道（`DISCORD_CHANNEL_ID`）。打任何自然語言，AI 自動分成 8 種意圖：

| 意圖 | 範例 | 結果 |
|------|------|------|
| **新事件** | 「明天下午三點跟教授討論論文，帶筆電」 | 存事件 + Embed 確認 + 按鈕列 |
| **批次新事件** | 「明天三件事：9點晨會、下午做報告、晚上買菜」 | 一次存三筆，逐一 Embed 確認 |
| **重複事件** | 「每週三下午 3 點打籃球」 | 存 repeat_type=weekly，自動展開未來週三 |
| **修改** | 「把 3 點的論文討論改到 4 點半」 | AI 從近期事件挑出那件，改時間 |
| **完成** | 「論文寫完了」 | 那件事 status → done |
| **取消** | 「今晚火鍋取消」 | 刪掉那件事 |
| **日記（反思）** | 「今天好累，但功能跑起來了，很爽」 | 存成當日日記，AI 挑 emoji + 整理文字 |
| **閒聊** | 「嗨」「你是誰」 | 直接回覆，不存 |

**時間解析規則**：
- 下午兩點 → 14:00；晚上 → 20:00；早上 → 09:00
- 只有日期沒時刻 → 9:00
- 完全沒提時間 → 存成「未定時間」，進收件匣

**時間衝突偵測**：新增事件時若與現有事件重疊，Bot 回覆警告並附 `[確定存] [取消]` 按鈕。

### 2.2 自動推播（兩報一顧）

|  | 時間（Web 可調） | 內容 | 開關 |
|---|---|---|---|
| ☀️ **早報** | 每天 08:00 | 今日時間表 + 待辦 + 重複事件 🔁 | 常開 |
| 🌙 **晚報** | 每天 22:00 | 明日預告 + AI 生成反思邀請語 | `reflect_enabled` |
| 📊 **週回顧** | 週日 21:00 | 本週完成 / 錯過 / 待續 + AI 手帳式總結 | `weekly_enabled` |
| ⏰ **事前提醒** | 事件前 60 / 30 分鐘 | 倒數提醒，含事件描述 | `reminder_enabled` |

所有推播改用 **Discord Embed** 格式，按 category 顯示對應顏色邊框。

### 2.3 Discord Embed 訊息規格

**Category 顏色對照**：

| 標籤 | Embed 顏色 |
|------|-----------|
| 🔵 工作（work） | `0x3B82F6` 藍 |
| 🟢 學習（study） | `0x22C55E` 綠 |
| 🟣 生活（life） | `0xA855F7` 紫 |
| ⚪ 未分類（none） | `0x9CA3AF` 灰 |

**事件確認 Embed 範例**：
```
╔══════════════════════════════╗  ← 按 category 上色
  ✅ 已新增事件
  與教授討論論文
  📅 明天 15:00   🏷️ 學習

  帶筆電

  [✅ 完成] [⏰ 推遲30分] [✏️ 編輯時間] [🗑️ 刪除]
╚══════════════════════════════╝
```

**事件按鈕列**：完成 / 推遲30分 / 編輯時間 / 刪除

### 2.4 Category 標籤系統

每個事件帶一個 `category` 欄位（work / study / life / none）。AI 輸入時自動判斷標籤；Web 編輯 modal 可手動修改。標籤作為 Web 介面 Tab 過濾和 Embed 顏色的依據。

### 2.5 收件匣（Triage Inbox）

所有「未定時間」的事件進入收件匣。Web 左側欄顯示收件匣列表，可拖曳卡片到右頁時間軸完成排程。Discord `/inbox` 指令可列出目前所有待處理項目。

### 2.6 Web 手帳介面

米白紙質 + Noto Serif TC + 朱印紅，左右對開書本式版面。

**左頁**：搜尋列 / 月曆（含 category 色點）/ 收件匣 / 近日 8 件事 / 提醒設定

**右頁**：大字日期 + **Category Tab 列**（全部 / 🔵工作 / 🟢學習 / 🟣生活）+ 時間軸（支援拖曳排程）+ 日記卡 + 快速輸入列

### 2.7 AI 輪替機制

輪替順序（`AI_PROXY_PROVIDERS`，預設）：`claude → gemini → openai → deepseek`

每次呼叫走 round-robin；gRPC 失敗或回傳非合法 JSON 時自動換下一家，全部掛掉才拋錯。

---

## 三、資料結構

### `events`
| 欄位 | 說明 |
|------|------|
| id | 自動遞增 |
| title | 標題 |
| description | 詳細說明 |
| start_time / end_time | ISO 8601，可空 |
| raw_text | 原始輸入 |
| status | pending / done / missed |
| category | work / study / life / none（預設 none） |
| reminded_60 / reminded_30 | 0/1，避免重複提醒 |
| repeat_type | none / daily / weekly / monthly |
| repeat_until | 重複結束時間（可空 = 無限） |
| notes | Web 補寫的手寫備註 |
| mood | 單事件心情（保留欄位） |
| source | discord / web |
| created_at / updated_at | |

> **重複事件修改規則**：修改時 Bot 詢問「只改這次 / 之後全部改」，Web 編輯 modal 同樣提供選擇。

### `reflections`（日記）

| 欄位 | 說明 |
|------|------|
| date | YYYY-MM-DD（UNIQUE） |
| mood | emoji |
| text | 內容（手動寫，或 AI 整理過的） |

### `settings`

| key | 對應功能 |
|---|---|
| `cron_brief_hour` / `cron_brief_minute` | 早報時間 |
| `cron_reflect_hour` / `cron_reflect_minute` | 晚報時間 |
| `cron_weekly_hour` / `cron_weekly_minute` | 週回顧時間 |
| `cron_reminder_enabled` | 事前提醒開關 |
| `cron_reflect_enabled` | 晚報開關 |
| `cron_weekly_enabled` | 週回顧開關 |

---

## 四、API 規格

Base URL: `http://localhost:3002`，驗證 header `x-api-key: <API_KEY>`（localhost 免驗證）

### events
- `GET /api/events?day=2026-04-23` — 某天（含重複展開）
- `GET /api/events?day=2026-04-23&category=work` — 某天 + category 過濾
- `GET /api/events/inbox` — 所有未定時間事件
- `GET /api/events/recent?days=30` — 最近 N 天
- `GET /api/events/search?q=keyword` — 全文搜尋
- `POST /api/events` — 自然語言新增（走 AI）
- `POST /api/events/manual` — 直接指定欄位新增
- `PATCH /api/events/:id` — 更新
- `PATCH /api/events/:id/snooze` — 推遲 30 分鐘
- `DELETE /api/events/:id` — 刪除

### reflections
- `GET /api/reflections?from=2026-04-01&to=2026-04-30`
- `GET /api/reflections/:date`
- `PUT /api/reflections/:date` — body: `{ mood, text }`

### stats
- `GET /api/stats/month?y=2026&m=4` — 該月完成 / 錯過 / 待續 + 各 category 完成率

### settings
- `GET /api/settings`
- `PUT /api/settings`

---

## 五、待實作（Phase 3）

| 功能 | 說明 | 優先度 |
|------|------|--------|
| `category` 欄位 + AI 自動標籤 | DB migration + AI prompt 加 category 判斷 | 🔴 高 |
| Discord Embed 重構 | 所有 Bot 回覆改用 Embed + 按顏色上色 | 🔴 高 |
| 推遲30分按鈕 | 事件確認 + 提醒訊息下方加按鈕 | 🔴 高 |
| 收件匣視圖（Web 左欄） | 未定時間事件列表 + 拖曳排程 | 🟡 中 |
| 時間衝突偵測 | 新增時比對重疊，Bot 主動提醒 | 🟡 中 |
| 批次輸入 | AI 一次解析多筆事件 | 🟡 中 |
| Category Tab（Web） | 右頁頂部 tab 過濾 | 🟡 中 |
| 重複事件修改選擇 | 「只改這次 / 之後全部」 | 🟡 中 |
| Telegram 入口 | 新增 Telegram bot 作為第二輸入端 | 🟢 低 |
| AI 建議排程 | 根據習慣推薦最佳時段 | 🟢 低 |
| 習慣追蹤 | 每日打卡 + 連續天數 | 🟢 低 |
