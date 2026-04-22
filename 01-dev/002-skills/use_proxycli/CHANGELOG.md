# AI Proxy Client 更新日誌

## v3.0.0 (2026-04-06)

### 破壞性變更

- **group 欄位改為必填** — 所有 AI 呼叫必須指定 `group`（小組），未指定會回傳錯誤。用於追蹤各功能模組的 token 消耗。可在 `.env` 設定 `AI_PROXY_GROUP=預設值`

### 新功能

- **Prompt Caching** — Claude API 自動啟用 prompt caching，相同 system prompt 的連續呼叫延遲降低最高 85%。無需客戶端修改，server 端自動處理
- **Provider 備援切換** — 當指定的 AI provider 不可用時，自動沿 fallback chain 切換（Claude → Gemini → OpenAI → DeepSeek → ... → Cohere）
- **API Key 個別用量統計** — 儀表板左側 API Key 區塊顯示每個 key 的請求數、token 用量、平均延遲
- **遠端 OAuth 授權** — Claude/Gemini/OpenAI 授權改為 manual code 模式，遠端存取儀表板也能完成 OAuth
- **Login Agent** — 本機跑 `login-agent.py`，一鍵在本機完成 Claude OAuth，token 自動上傳 VPS

### 改進

- 文件大幅更新：強調 group 必填、模型篩選指南、Provider 備援說明、延遲優化技巧
- 修復 heartbeat 在 tunnel 關閉後仍持續送的問題
- 修復 stop_tunnel race condition

---

## v2.1.0 (2026-04-04)

### 新功能

#### OpenAI 相容 API — IDE 整合

新增 `/v1/chat/completions` 和 `/v1/models` 端點，完全相容 OpenAI API 格式。所有支援 OpenAI 端點的 IDE 工具都能直接使用 proxy-cli：

- **Google Antigravity** — Custom / OpenAI Compatible
- **VS Code + Continue** — OpenAI provider
- **VS Code + Cline** — OpenAI Compatible
- **Aider** — `--openai-api-base`
- **其他任何支援 OpenAI API 的工具**

設定方式：

```
API Base URL: https://clip.twloop.com/v1
API Key: 你的 Bearer token
Model: gemini-2.5-pro 或 claude/sonnet
```

特性：
- 支援 `stream: true`（SSE 格式，相容 OpenAI chunk 結構）
- 支援多模態（`image_url` content part → 自動切換 Gemini）
- 模型名稱支援 `provider/model`（如 `gemini/gemini-2.5-pro`）和直接名稱（如 `sonnet`）
- 走 CLI-first 路由（文字免費，API Key 留給多模態）
- 自動建立 `ide` 專案用於統計
- 可透過 `X-Project` header 指定專案名

---

## v2.0.0 (2026-04-04)

### 新功能

#### 媒體生成（圖片、影片、語音、音樂）

新增 4 個媒體生成函數，全部走 REST API（`POST /api/generate`），由 Gemini API 提供。

> **必須設定 Gemini API Key**（CLI OAuth scope 不支援媒體生成）。
> 免費 Key：https://aistudio.google.com/apikey
> Gemini CLI（`gemini` 指令）只能文字對話，不能生成圖片/影片。

```python
from proxy import ai_image, ai_video, ai_tts, ai_music

# 圖片生成（預設模型：gemini-2.5-flash-image）
ai_image("一隻坐在窗台上的橘貓，水彩風格", output="cat.png", project="design")

# 影片生成（預設模型：veo-3.0-generate-001，較慢，預設 300 秒超時）
ai_video("海邊日落的縮時攝影", output="sunset.mp4", project="content")

# 文字轉語音（預設模型：gemini-2.5-flash-preview-tts）
ai_tts("歡迎使用 AI Proxy 服務", output="welcome.wav", project="app")

# 音樂生成（預設模型：lyria-3-clip-preview，預設 300 秒超時）
ai_music("輕快的爵士鋼琴背景音樂", output="jazz.wav", project="content")
```

REST API 規格（給 TypeScript / 其他語言用）：

```
POST https://clip.twloop.com/api/generate
Authorization: Bearer <token>
Content-Type: application/json

{"prompt": "描述", "type": "image|video|tts|music", "project": "專案名"}
```

Response 的 `items[0].data` 是 base64 編碼的二進位資料，`items[0].mime_type` 是 MIME 類型。

> 注意：endpoint 是 `/api/generate`，不是 `/api/generate/image`。用 `type` 欄位區分媒體類型。

#### Server-side 模型管理

新增 `AI_PROXY_SERVER_TIER=true` 設定，開啟後 tier 由 server 解析：

```bash
# .env — 只要 5 行 + 1 行開關
AI_PROXY_HOST=cli.twloop.com
AI_PROXY_PORT=443
AI_PROXY_TLS=true
AI_PROXY_TOKEN=你的token
AI_PROXY_PROJECT=你的專案名
AI_PROXY_SERVER_TIER=true
```

```python
from proxy import ai

ai("複雜分析", tier="best")   # server 根據專案策略選最佳模型
ai("簡單問答", tier="basic")  # server 選最快最便宜的
ai("一般任務")                # server 自動路由
```

管理員在儀表板（`clip.twloop.com`）統一管理模型目錄和專案策略，客戶端不需要在 .env 設定每個 provider 的模型名稱。

#### 智慧模型目錄（Server 端）

- 內建 26 個模型（10 個 provider），首次啟動自動載入
- 有 API Key 的 provider 每 24 小時自動刷新模型列表
- 新模型自動發現，在儀表板提醒管理員分類
- 每個模型有多維度屬性：品質（best/good/basic）、速度、成本、用途（text/image/video/tts/music）
- 專案可設定不同的模型策略（chatbot 用快的、code review 用強的）

#### 圖片分析取關鍵詞（已有功能，新增文檔範例）

不需要 API Key，走 CLI OAuth 免費額度：

```python
from proxy import ai

# 取關鍵詞
keywords = ai("列出關鍵詞，逗號分隔", image="photo.jpg", project="seo")

# 圖片分類
category = ai("分類：風景/人物/美食/動物", image="photo.jpg", project="classify")

# OCR 文字擷取
text = ai("擷取圖片中所有文字", image="receipt.jpg", project="ocr")

# 商品描述
desc = ai("寫一段賣場描述", image="item.jpg", project="shop")
```

> 圖片理解（輸入分析）= CLI OAuth 免費；圖片生成（輸出圖片）= 需要 API Key。

#### 多模態對話（REST API）

除了 gRPC，新增 REST API 支援多模態對話：

```
POST /api/chat          — 單次對話（支援圖片/PDF/音訊/影片附件）
POST /api/chat/stream   — SSE 串流對話
POST /api/chat/tools    — Function Calling
POST /api/embed         — 文字嵌入向量
```

Python 用戶不需要手動呼叫這些 REST API，`proxy.py` 的 `ai()`、`ai_stream()`、`ai_tools()` 會自動選擇最佳路徑（gRPC 或 REST）。

#### 儀表板增強（clip.twloop.com）

- **認證管理** — 移到左側欄最上方，顯示 `1/3 組正常` 格式 + 綠/黃/紅燈
- **多電腦目錄管理** — 記錄不同電腦（Mac/Windows/Linux）的憑證目錄，存在 SQLite
- **模型管理** — 模型目錄、專案策略、效能統計三個 tab
- **一鍵 OAuth 登入** — Gemini、Claude、OpenAI 直接在瀏覽器授權

### 改進

- **文字生成 CLI 優先** — 執行順序改為 快取 → CLI（OAuth 免費額度）→ Direct API（API Key）→ 備用模型 → Fallback Chain。API Key 額度留給媒體生成，文字類優先消耗 CLI 的免費 OAuth 額度
- **TLS 連線** — 新增 `AI_PROXY_TLS=true` 環境變數，支援 `cli.twloop.com:443` 安全連線
- **.env 標準化** — 統一格式（不加引號、不加空格），向下相容舊版變數名
- **健康探測** — 正確識別 `Not logged in` 為認證失敗（之前被忽略）
- **探測記錄** — 所有健康探測一律記錄（包含 Gemini 的 0 token 探測）
- **自動清理** — 健康探測記錄超過 180 天自動刪除
- **Config 匯入** — SQLite 已有用戶時跳過 config.yaml 匯入，避免重複建立

### 破壞性變更

無。所有改動向下相容，舊版客戶端不需修改。

### 前置需求

- Server 端需更新到對應版本
- 媒體生成需要 Gemini API Key（在儀表板 API Key 設定中新增）
- TLS 連線需要 server 配置 SSL 憑證（已完成）

---

## v1.0.0 (2026-03)

初始版本。

- gRPC 連線（Claude、Gemini、OpenAI）
- `ai()` 一行呼叫
- 模型等級（tier）：high / mid / fast
- 自動路由（依 prompt 長度和關鍵字）
- 圖片/文件/音訊/影片理解
- Function Calling (`ai_tools`)
- SSE Streaming (`ai_stream`)
- 雙 AI 比較 (`ai_dual`)
- 用量統計 (`usage`)
- 健康檢查 (`health`)
- 多 provider 支援（10 個）
- 回應快取、請求去重、自動重試
- 多憑證輪替 + OAuth 一鍵登入
