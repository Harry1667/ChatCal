# ChatCal

Discord 手帳機器人 — 在 Discord 輸入自然語言，AI 自動解析成行事曆事件、日記，並同步至 Web 介面。

## 功能
- **Discord 極速輸入**：支援 8 種意圖（新增事件、批次、重複事件、修改、完成、取消、日記、閒聊）
- **時間解析**：「下午兩點」→ 14:00；支援重複事件（每週三下午打籃球）
- **時間衝突偵測**：重疊時自動警告並提供確認按鈕
- **自動推播**：☀️ 早報 08:00（今日時間表）/ 🌙 晚報 22:00（明日預告 + AI 反思邀請）
- **Web 介面**：行事曆視圖 + 收件匣 + Category 篩選

## 技術棧
- Node.js + Discord.js
- better-sqlite3
- proxycli（AI 意圖解析）
- 部署：chatcal.looptw.com（port 3002）

## 快速開始
```bash
cd 02-web
cp .env.example .env
npm run dev
```
