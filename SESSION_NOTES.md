# SESSION NOTES

## 2026-04-23

### 完成事項
- 分析用戶流程缺口，提出優化建議
- 更新文件：1-PRD.md、2-UserFlow.md、9-talk.md（v2.5）
- 實作 v2.5 全部功能：
  - DB: category / is_urgent 欄位 + migration
  - AI: category 自動判斷、緊急偵測、batch 批次意圖
  - Discord Embed 全面重構（事件/早報/晚報/提醒）
  - 提醒邏輯: 緊急=60+30分；一般=只有30分
  - 按鈕升級: 完成 / 推遲30分 / 刪除
  - /inbox slash 指令 + API 端點
  - snooze API、category filter API
- 建立根目錄 repo，push 到 GitHub Harry1667/6-ChatCal
- 部署到 Oracle 伺服器（root PM2，port 3002）
- 修復 SQLite migration 問題（手動 ALTER TABLE）
- 修復 orphan node process 佔用 port 3002 問題

### 未完成
- Web 前端: 收件匣視圖 + 拖曳排程
- Web 前端: Category Tab 過濾
- Web 編輯 modal 加 category / is_urgent
- 時間衝突偵測
- 重複事件修改選擇（只改這次 / 之後全部）
- Nginx 設定確認（chatcal.looptw.com）

### 下次起點
- 確認 chatcal.looptw.com Nginx 是否已設定
- 做 Web 前端更新（收件匣 + Category Tab）
- 更新指令: `sudo bash -c 'cd /www/wwwroot/chatcal.looptw.com && git pull https://Harry1667:[TOKEN]@github.com/Harry1667/chatcal.git main && export HOME=/root && export PATH=$PATH:/www/server/nodejs/v22.22.2/bin && pm2 restart chatcal-web chatcal-bot'`
