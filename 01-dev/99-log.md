# ChatCal 開發日誌

## 2026-04-23 — Phase 2.5 全面升級

### 完成事項
- DB migration：新增 `category`（work/study/life/none）和 `is_urgent`（0/1）欄位
- AI prompt 升級：新增 category 自動判斷、is_urgent 緊急偵測、batch 批次新增
- Discord Embed 全面重構：事件確認、提醒訊息、早報、晚報全改 EmbedBuilder
- Category 顏色：工作藍 / 學習綠 / 生活紫 / 未分類灰；緊急用紅色
- 按鈕升級：完成 / 推遲30分 / 刪除（三鍵）
- 提醒邏輯：is_urgent=1 → 60分+30分雙提醒；is_urgent=0 → 只有30分
- 新增 `/inbox` slash 指令：列出所有未定時間待辦
- 新增 `GET /api/events/inbox` 端點
- 新增 `PATCH /api/events/:id/snooze` 端點（推遲30分）
- `GET /api/events?day=...&category=work` 支援 category 過濾
- stats API 加入各 category 完成率
- batch 批次輸入（一句話多件事）

### 未完成
- 部署到 Oracle 伺服器
- Web 前端：收件匣視圖 + 拖曳排程
- Web 前端：Category Tab 過濾
- Web 前端：is_urgent / category 顯示與編輯
- 重複事件修改選擇（只改這次 / 之後全部）
- 時間衝突偵測

### 下次起點
- 部署 or 繼續 Web 前端更新（收件匣 + Tab）

---

## 2026-04-13 — Phase 1 + Phase 2 完成

### 完成事項
- Discord bot (小曆) — 文字輸入 → AI 分類 → 確認回覆 + Select Menu 改分類
- ProxyCLI gRPC 串接 (gemini-2.5-flash, good tier)
- SQLite DB (WAL mode, updated_at trigger, settings table)
- Express API (events CRUD + settings)
- Web Dashboard — 5 tabs (收件匣/工作/學習/生活/全部)
- 日曆視圖 (FullCalendar) + 拖曳排程
- 列表/日曆一鍵切換
- Tab 顏色主題 (work=藍, study=綠, life=紫)
- Deadline 倒數 badge
- Onboarding 空白狀態引導
- 指定頻道監聯 (不用 @)
- 小曆 agent 個性 + 閒聊模式
- 網頁可編輯 agent 提示詞 (即時生效)
- 完整提醒系統 (事件前30分鐘 / Deadline前一天 / 收件匣催整理 / 晨間簡報 / 週報)
- 網頁可調整所有提醒設定
- UI 視覺優化 (漸層 header, pill tabs, 卡片陰影)
- 手機響應式

### 未完成
- 部署到 Oracle 伺服器
- ProxyCLI 新增 chatcal 專案 (目前借用 mathbox)
- Phase 3: Telegram 入口、AI 建議排程、習慣追蹤

### 下次起點
- 部署到 Oracle (PM2 + Nginx, port 3002, chatcal.looptw.com)
- 或繼續 Phase 3 功能
