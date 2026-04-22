# AI Proxy 使用指南

**v3.0.0** — [更新日誌](CHANGELOG.md)

把這個目錄複製到你的專案裡，就能呼叫 10 個 AI provider（Claude、Gemini、OpenAI、DeepSeek、Mistral、Groq、xAI、Together AI、Fireworks AI、Cohere）。

## 功能總覽

| 功能 | 函數 | 需要 API Key | 支援 Provider |
|------|------|:---:|------|
| 文字對話 | `ai()` | ❌ | Claude, Gemini, OpenAI, DeepSeek 等 10 個 |
| 串流對話 | `ai_stream()` | ❌ | Claude, Gemini |
| 詳細回傳（含 token） | `ai_detail()` | ❌ | 全部 |
| Function Calling | `ai_tools()` | ❌ | Claude, Gemini |
| 雙 AI 比較 | `ai_dual()` | ❌ | 任意組合 |
| 圖片理解/OCR | `ai(image=...)` | ✅ | Gemini（自動切換） |
| PDF 文件分析 | `ai(file="*.pdf")` | ✅ | Gemini（自動切換） |
| 音訊轉文字/翻譯 | `ai(file="*.mp3")` | ✅ | Gemini |
| 影片分析/翻譯 | `ai(file="*.mp4")` | ✅ | Gemini |
| 圖片生成 | `ai_image()` | ✅ | Gemini |
| 影片生成 | `ai_video()` | ✅ | Gemini |
| 文字轉語音 | `ai_tts()` | ✅ | Gemini |
| 音樂生成 | `ai_music()` | ✅ | Gemini |
| 文字嵌入向量 | `ai_embed()` | ✅ | Gemini |
| 用量統計 | `usage()` | ❌ | - |
| 健康檢查 | `health()` | ❌ | - |
| 通知推送 | `notify()` | ❌ | Telegram, Discord, Slack |

> ❌ = 走 CLI OAuth 免費額度。✅ = 需要 Gemini API Key（免費額度：https://aistudio.google.com/apikey）。
> 多模態（圖片/文件/音訊/影片）全部需要 API Key，因為 OAuth scope 不支援 Direct API 多模態。

## 安裝

```bash
pip install grpcio
```

只需要一個依賴。

## 設定

### .env 標準寫法

複製範本並填入你的設定：

```bash
cp .env.example .env
```

**必填（5 行就能用）：**

```bash
AI_PROXY_HOST=cli.twloop.com
AI_PROXY_PORT=443
AI_PROXY_TLS=true
AI_PROXY_TOKEN=貼上你的token
AI_PROXY_PROJECT=你的專案名
```

**注意事項：**
- 值不加引號（`AI_PROXY_HOST=cli.twloop.com` ✅，`AI_PROXY_HOST="cli.twloop.com"` ❌）
- 不要有空格（`AI_PROXY_HOST = cli.twloop.com` ❌）
- 舊版 `AI_PROXY_GRPC_HOST` / `AI_PROXY_GRPC_PORT` 仍可用（向下相容）

**指定 provider 和模型（可選）：**

```bash
# 預設用 claude，改成其他 provider
AI_PROXY_PROVIDER=claude

# 每個 provider 的預設模型
AI_PROXY_CLAUDE_MODEL=claude-sonnet-4-6
AI_PROXY_GEMINI_MODEL=gemini-2.5-flash
AI_PROXY_OPENAI_MODEL=gpt-4o-mini
AI_PROXY_DEEPSEEK_MODEL=deepseek-chat
```

**模型等級（推薦用法）：**

用 `tier` 代替直接指定模型名，新模型推出改 `.env` 就好，程式碼不用動：

```bash
# Claude: high=最強 mid=平衡 fast=最快
AI_PROXY_CLAUDE_HIGH=claude-opus-4-6
AI_PROXY_CLAUDE_MID=claude-sonnet-4-6
AI_PROXY_CLAUDE_FAST=claude-haiku-4-5

# Gemini
AI_PROXY_GEMINI_HIGH=gemini-2.5-pro
AI_PROXY_GEMINI_MID=gemini-2.5-flash
AI_PROXY_GEMINI_FAST=gemini-2.5-flash-lite
```

對應用法：
```python
ai("複雜分析", tier="high")                          # → claude-opus-4-6
ai("一般任務", tier="mid")                           # → claude-sonnet-4-6
ai("簡單問答", tier="fast")                          # → claude-haiku-4-5
ai("用 Gemini", tier="high", provider="gemini")      # → gemini-2.5-pro
```

完整的 tier 設定見 `.env.example`（支援全部 10 個 provider）。

**Server-side 模型管理（推薦）：**

開啟後 tier 由 server 解析，不用在 .env 設定模型名。管理員在儀表板統一管理模型，客戶端只要 5 行設定：

```bash
AI_PROXY_HOST=cli.twloop.com
AI_PROXY_PORT=443
AI_PROXY_TLS=true
AI_PROXY_TOKEN=你的token
AI_PROXY_PROJECT=你的專案名
AI_PROXY_SERVER_TIER=true
```

用法不變，server 自動根據專案策略選擇最佳模型：
```python
ai("複雜分析", tier="best")   # server 根據專案設定選模型
ai("簡單問答", tier="basic")  # server 選最快最便宜的
ai("一般任務")                # server 自動路由
```

`proxy.py` 會自動讀取同目錄、上層目錄或工作目錄的 `.env`。環境變數優先於 `.env`。

### 環境變數（替代 .env）

```bash
export AI_PROXY_HOST=cli.twloop.com
export AI_PROXY_PORT=443
export AI_PROXY_TLS=true
export AI_PROXY_TOKEN=你的token
export AI_PROXY_PROJECT=你的專案名
```

## 使用

### 最簡單的用法

```python
from proxy import ai

# 問 Claude（project + group 必填）
answer = ai("寫一個 Python hello world", project="my-project", group="dev")
print(answer)

# 問 Gemini
answer = ai("解釋什麼是 Docker", provider="gemini", project="my-project", group="learning")
print(answer)
```

就這樣。一行搞定。**project 和 group 都是必填的**。在 `.env` 設定預設值，就不用每次寫：

```bash
AI_PROXY_PROJECT=my-project
AI_PROXY_GROUP=dev
```

### 實用範例：文字生成

```python
from proxy import ai

# --- 內容生成 ---
article = ai("寫一篇 500 字的 AI 趨勢文章", tier="high", project="content", group="article")
slogan = ai("為一家咖啡店想 5 個廣告標語", project="marketing", group="copywriting")
email = ai("寫一封英文商業 email，主題：延期交貨道歉", project="business", group="email")

# --- 程式開發 ---
code = ai("用 Python 寫一個 LRU Cache，包含 type hints", project="dev", group="code")
review = ai(f"Review 這段程式碼，列出問題：\n{open('app.py').read()}", tier="high", project="dev", group="review")
sql = ai("寫 SQL：查詢每月營收 top 10 產品，要有同比增長率", project="data", group="sql")

# --- 資料處理 ---
summary = ai(f"摘要這段文字為 3 個重點：\n{long_text}", project="digest", group="summary")
translate = ai("翻譯成英文：今天天氣真好，適合出去走走", project="translate", group="translate")
json_data = ai('把以下文字轉成 JSON：王小明 28歲 工程師 台北',
               system="只回傳 JSON，不要其他文字", project="extract", group="extract")

# --- 批次處理 ---
products = ["iPhone 16", "Galaxy S25", "Pixel 9"]
for p in products:
    desc = ai(f"用 30 字描述 {p} 的最大賣點", tier="fast", project="catalog", group="product-desc")
    print(f"{p}: {desc}")
```

### 自動路由（預設開啟）

不指定 model 或 tier 時，proxy 會分析你的 prompt 自動選擇模型等級：

- 長 prompt（>500字）或含「分析」「設計」「架構」「debug」→ **high**（opus/pro）
- 短 prompt（<80字）且含「翻譯」「你好」「是什麼」→ **fast**（haiku/flash-lite）
- 其他 → **mid**（sonnet/flash）

```python
from proxy import ai

# 自動用 high（prompt 含「分析」）
ai("分析這段程式碼的效能瓶頸", project="dev")

# 自動用 fast（短 prompt + 「翻譯」）
ai("翻譯：你好", project="dev")

# 自動用 mid（一般任務）
ai("寫一個 function 計算費氏數列", project="dev")
```

也可以手動指定 `tier="high"` 或 `model="opus"` 覆蓋自動路由。

關閉自動路由：`.env` 設定 `AI_PROXY_AUTO_ROUTE=false`。

### 指定小組（必填）

> **group 是必填欄位。** 未指定 group 時 server 會回傳錯誤。
> 這是為了追蹤每個 AI 呼叫的用途來源，方便在儀表板分析各功能模組的消耗。

每次呼叫 AI 都必須指定 `group`，代表這次呼叫屬於哪個功能模組：

```python
from proxy import ai

# group = 功能模組名稱（不需要預先建立，傳什麼就記什麼）
ai("寫前端頁面", project="web-app", group="frontend")
ai("寫 API", project="web-app", group="backend")
ai("寫測試", project="web-app", group="qa")
ai("分析使用者行為", project="web-app", group="analytics")
ai("生成推薦內容", project="web-app", group="recommend")
```

**命名建議：**
- 用功能名：`chatbot`、`search`、`recommend`、`translate`、`evaluate`
- 用流程名：`topic-select`、`generate`、`review`、`publish`
- 用角色名：`frontend`、`backend`、`data`、`qa`

**如果忘了帶 group：**
```
錯誤：缺少 group（小組）欄位。
用法：在 gRPC request 中設定 group 欄位，例如 group='chatbot' 或 group='evaluate'。
小組用於追蹤用量來源，方便在儀表板查看各功能模組的消耗。
```

**可以在 .env 設定預設值（避免每次都寫）：**
```bash
AI_PROXY_GROUP=my-module
```

儀表板會自動顯示「按小組」的用量統計，讓你清楚知道哪個功能最花 token。

### 用模型等級（推薦）

不用記模型名稱，用 `tier` 指定等級，新模型推出時改 `.env` 就好：

```python
from proxy import ai

# 自動對應 .env 裡設定的模型
ai("複雜推理任務", tier="high", project="dev")   # → claude-opus-4-6
ai("一般任務", tier="mid", project="dev")        # → claude-sonnet-4-6
ai("簡單問答", tier="fast", project="dev")       # → claude-haiku-4-5

# 指定 provider + tier
ai("用 Gemini", tier="high", provider="gemini", project="dev")  # → gemini-2.5-pro
ai("快速回答", tier="fast", provider="gemini", project="dev")   # → gemini-2.5-flash-lite
```

等級在 `.env` 裡設定對應的模型（見 `.env.example`）。

### 直接指定模型

也可以直接用模型名稱：

```python
from proxy import ai

# Claude 模型
ai("翻譯成英文：你好世界", model="claude-haiku-4-5", project="docs")
ai("寫一篇技術文章", model="claude-opus-4-6", project="content")

# Gemini 模型
ai("分析這段程式碼", provider="gemini", model="gemini-2.5-pro", project="dev")
```

### 圖片理解

> **需要 Gemini API Key**（免費：https://aistudio.google.com/apikey）
>
> 圖片理解走 Gemini Direct API，OAuth scope 不支援多模態。
> 即使指定 `provider="claude"`，有 Gemini API Key 時會自動切換到 Gemini。

```python
from proxy import ai

# 描述一張圖片
print(ai("描述這張圖片的內容", image="photo.jpg", project="dev"))

# 比較多張圖片
print(ai("這兩張圖有什麼不同？", images=["before.png", "after.png"], project="dev"))

# 用 Gemini 分析圖片
print(ai("圖片裡有什麼文字？", image="screenshot.png", provider="gemini", project="dev"))
```

#### 實用範例：圖片分析取關鍵詞

```python
from proxy import ai

# 取得圖片關鍵詞（逗號分隔，方便後續處理）
keywords = ai("列出這張圖片的關鍵詞，用逗號分隔，只要關鍵詞不要其他文字",
              image="product.jpg", project="seo")
tag_list = [k.strip() for k in keywords.split(",")]
print(tag_list)  # ['橘貓', '窗台', '陽光', '室內', '寵物']

# 批次處理多張圖片
import glob
for img in glob.glob("photos/*.jpg"):
    tags = ai("用英文列出 5 個關鍵詞，逗號分隔", image=img, project="catalog")
    print(f"{img}: {tags}")

# 圖片分類
category = ai("這張圖片屬於哪個分類？只回答一個詞：風景/人物/美食/動物/建築/其他",
              image="photo.jpg", project="classify")

# 商品描述生成
desc = ai("根據商品圖片寫一段 50 字內的賣場描述", image="item.jpg", project="shop")

# OCR — 擷取圖片中的文字
text = ai("擷取圖片中所有可見文字，保持原始排版", image="receipt.jpg", project="ocr")

# 圖片比較（品質檢測）
result = ai("比較這兩張圖，列出所有差異", images=["original.png", "modified.png"], project="qa")
```

> 圖片理解 ≠ 圖片生成。理解（輸入圖片分析）用 CLI OAuth 免費；生成（輸出圖片）需要 API Key。

### 文件理解

> 走 Direct API，需要 Gemini API Key（同圖片理解）。

```python
from proxy import ai

# 摘要 PDF
print(ai("用三句話摘要這份文件", file="report.pdf", project="dev"))

# 分析多個文件
print(ai("比較這兩份合約的差異", files=["v1.pdf", "v2.pdf"], project="legal"))

# 圖片 + 文件混合
print(ai("這張圖和這份文件有什麼關聯？", image="chart.png", file="data.pdf", project="dev"))
```

#### 實用範例：文件分析

```python
from proxy import ai

# 合約審查 — 找出風險條款
risks = ai("列出這份合約中對我方不利的條款，每條一行", file="contract.pdf", project="legal")

# 財報分析
analysis = ai("分析這份財報的營收趨勢和關鍵數據", file="quarterly.pdf", project="finance")

# 履歷篩選
score = ai("根據以下標準評分 1-10：Python經驗、團隊合作、英文能力。只回答數字和理由",
           file="resume.pdf", project="hr")

# 技術文件 → 摘要 + 重點
notes = ai("把這份技術文件轉成條列式筆記，包含所有 API endpoint 和參數",
           file="api_docs.pdf", project="dev")

# 批次處理多份文件
import glob
for pdf in glob.glob("invoices/*.pdf"):
    info = ai("擷取：日期、金額、公司名稱。用 JSON 格式回答", file=pdf, project="accounting")
    print(f"{pdf}: {info}")

# 多文件比較
diff = ai("列出 v2 相比 v1 新增、刪除、修改的所有條款",
          files=["contract_v1.pdf", "contract_v2.pdf"], project="legal")
```

### 音訊理解（Gemini 支援）

> 需要 Gemini API Key（同圖片理解）。

```python
from proxy import ai

# 翻譯錄音
print(ai("翻譯成中文", file="meeting.mp3", provider="gemini", project="dev"))

# 分析 Podcast
print(ai("列出這段 Podcast 的重點", file="episode.m4a", provider="gemini", project="content"))

# 會議逐字稿
transcript = ai("把錄音轉成逐字稿，標記不同講者",
                file="meeting.mp3", provider="gemini", project="notes")

# 音訊關鍵詞
keywords = ai("列出這段錄音討論的關鍵詞，逗號分隔",
              file="podcast.m4a", provider="gemini", project="seo")

# 語言辨識 + 翻譯
result = ai("辨識語言並翻譯成繁體中文",
            file="foreign_audio.mp3", provider="gemini", project="translate")
```

> 音訊理解只有 Gemini 支援，需要加 `provider="gemini"`。
> 支援格式：MP3、WAV、M4A、OGG、FLAC。

### 影片理解（Gemini 支援）

> 需要 Gemini API Key（同圖片理解）。

```python
from proxy import ai

# 描述影片
print(ai("這段影片在講什麼？", file="demo.mp4", provider="gemini", project="dev"))

# 分析教學影片
print(ai("列出教學步驟", file="tutorial.mp4", provider="gemini", project="docs"))
```

#### 實用範例：影片分析

```python
from proxy import ai

# 影片關鍵詞提取
keywords = ai("列出這段影片的關鍵詞，逗號分隔，只要關鍵詞",
              file="interview.mp4", provider="gemini", project="seo")
print(keywords)  # 'AI, 機器學習, 深度學習, 自動駕駛, 未來科技'

# 影片內容摘要
summary = ai("用 3 句話摘要這段影片的內容",
             file="meeting.mp4", provider="gemini", project="notes")

# 影片翻譯（語音 → 中文字幕文字）
subtitles = ai("把影片中的對話翻譯成繁體中文，按時間順序列出",
               file="english_talk.mp4", provider="gemini", project="translate")

# 影片分類
category = ai("這段影片屬於哪個分類？只回答一個詞：教學/娛樂/新聞/廣告/音樂/體育/其他",
              file="clip.mp4", provider="gemini", project="classify")

# 影片 QA — 針對影片內容提問
answer = ai("影片中的講者提到了哪些具體數據？",
            file="presentation.mp4", provider="gemini", project="research")

# 批次處理多個影片
import glob
for video in glob.glob("videos/*.mp4"):
    tags = ai("用英文列出 5 個關鍵詞，逗號分隔",
              file=video, provider="gemini", project="catalog")
    print(f"{video}: {tags}")
```

> 影片理解只有 Gemini 支援，需要加 `provider="gemini"`。
> 支援格式：MP4、MOV、AVI、WEBM。
> 理解（輸入影片分析）= CLI OAuth 免費；生成（輸出影片）= 需要 API Key。

圖片/文件/音訊/影片理解走 REST API（自動偵測），支援：
- 圖片：PNG、JPG、GIF、WebP
- 文件：PDF
- 音訊：MP3、WAV、M4A、OGG、FLAC（Gemini）
- 影片：MP4、MOV、AVI、WEBM（Gemini）

### Function Calling（讓 AI 呼叫工具）

```python
from proxy import ai_tools

# 定義工具（Claude 格式）
tools = [{"name": "get_weather", "description": "查天氣",
          "input_schema": {"type": "object", "properties": {"city": {"type": "string"}}}}]

result = ai_tools("台北現在天氣怎麼樣？", tools=tools, project="dev")
if result["tool_calls"]:
    print(f"AI 想呼叫: {result['tool_calls'][0]['name']}")
    print(f"參數: {result['tool_calls'][0]['arguments']}")
else:
    print(result["content"])
```

#### 實用範例：AI Agent 工具呼叫

```python
from proxy import ai_tools
import json

# 資料庫查詢 Agent
tools = [
    {"name": "query_db", "description": "執行 SQL 查詢",
     "input_schema": {"type": "object", "properties": {
         "sql": {"type": "string", "description": "SQL 語句"}},
         "required": ["sql"]}},
    {"name": "send_email", "description": "寄送 email",
     "input_schema": {"type": "object", "properties": {
         "to": {"type": "string"}, "subject": {"type": "string"}, "body": {"type": "string"}},
         "required": ["to", "subject", "body"]}},
]

result = ai_tools("查詢上個月營收最高的前 5 個產品，然後寄報表給 boss@company.com",
                  tools=tools, project="agent")

# AI 會回傳要呼叫哪些工具
for call in result["tool_calls"]:
    print(f"工具: {call['name']}")
    print(f"參數: {json.dumps(call['arguments'], ensure_ascii=False)}")

# 結構化資料擷取
tools = [{"name": "extract_info", "description": "擷取結構化資料",
          "input_schema": {"type": "object", "properties": {
              "name": {"type": "string"}, "phone": {"type": "string"},
              "email": {"type": "string"}, "address": {"type": "string"}}}}]

result = ai_tools("王小明，手機 0912-345-678，email: ming@test.com，住在台北市信義區",
                  tools=tools, project="extract")
info = result["tool_calls"][0]["arguments"]  # {'name': '王小明', 'phone': '0912-345-678', ...}
```

### 真 SSE Streaming

```python
from proxy import ai_stream

# 逐字輸出（真串流，不是等全部回來再顯示）
for chunk in ai_stream("寫一篇關於 AI 的文章", project="dev"):
    print(chunk, end="", flush=True)
```

優先走 SSE（`/api/chat/stream`），失敗降級到 gRPC。

#### 實用範例：串流應用

```python
from proxy import ai_stream

# CLI 互動工具 — 逐字顯示
question = input("問 AI: ")
for chunk in ai_stream(question, project="chat"):
    print(chunk, end="", flush=True)
print()

# 串流寫入檔案（長文生成）
with open("article.md", "w") as f:
    for chunk in ai_stream("寫一篇 2000 字的 AI 發展歷史文章", tier="high", project="content"):
        f.write(chunk)
        print(chunk, end="", flush=True)  # 同時顯示進度

# Web 後端 SSE（Flask 範例）
from flask import Flask, Response
app = Flask(__name__)

@app.route("/api/ai-stream")
def stream():
    def generate():
        for chunk in ai_stream("寫一段介紹", project="web"):
            yield f"data: {chunk}\n\n"
    return Response(generate(), mimetype="text/event-stream")
```

### 雙 AI 比較決策

需要重要決策時，同時問多個 AI，比較回答：

```python
from proxy import ai_dual

result = ai_dual("這段程式碼有安全問題嗎？", project="dev")
print("Claude:", result["claude"]["content"])
print("Gemini:", result["gemini"]["content"])

# 問三個 AI
result = ai_dual("分析架構", providers=["claude", "gemini", "deepseek"], project="dev")
```

並行發送，時間約等於最慢的那個。

#### 實用範例：多 AI 交叉驗證

```python
from proxy import ai_dual, ai

# Code Review — 兩個 AI 交叉審查
code = open("main.py").read()
result = ai_dual(f"審查這段程式碼，列出所有問題：\n{code}", project="review")
print("=== Claude 認為 ===")
print(result["claude"]["content"])
print("=== Gemini 認為 ===")
print(result["gemini"]["content"])

# 翻譯品質比較
result = ai_dual("翻譯成道地的英文：這件事情急不來，要循序漸進", project="translate")
# 再讓第三個 AI 評分
judge = ai(f"以下兩個翻譯哪個更好？A: {result['claude']['content']} B: {result['gemini']['content']}",
           provider="deepseek", project="translate")

# 資安分析 — 多重確認
result = ai_dual("分析這個 URL 是否可疑：https://example.com/login?redirect=evil.com",
                 providers=["claude", "gemini", "deepseek"], project="security")
```

### 加 System Prompt

```python
from proxy import ai

ai("分析這個 bug", project="dev",
   system="你是一個資深 Python 工程師，回答要簡潔")
```

#### 實用範例：各種角色設定

```python
from proxy import ai

# SEO 專家
meta = ai("為這篇文章寫 meta description 和 5 個 SEO 關鍵詞",
          system="你是 SEO 專家，回答要精準、適合搜尋引擎", project="seo")

# JSON 格式輸出（強制結構化）
data = ai("分析這段文字的情感",
          system="你只能用 JSON 回答，格式：{\"sentiment\": \"positive/negative/neutral\", \"score\": 0.0-1.0, \"reason\": \"...\"}",
          project="nlp")

# 程式碼生成（指定風格）
code = ai("寫一個 rate limiter",
          system="你是資深 Python 工程師。只回傳程式碼，不要解釋。用 type hints、寫 docstring。",
          project="dev")

# 多語言翻譯
result = ai("人工智能正在改變世界",
            system="你是專業翻譯。把輸入翻譯成英文、日文、韓文，每行一種語言，格式：[語言] 翻譯",
            project="translate")

# 嚴格 QA — 只回答 YES/NO
answer = ai(f"這段程式碼有 SQL injection 風險嗎？\n{code}",
            system="你是資安審計員。只回答 YES 或 NO，然後一句話說明理由。",
            project="security")
```

### Provider 備援切換（A 不能用就換 B）

當指定的 AI provider 不可用（OAuth 過期、rate limit、服務異常）時，proxy 會自動嘗試其他 provider：

```python
from proxy import ai

# 正常用 Claude，如果 Claude 掛了，自動切到 Gemini → OpenAI → DeepSeek...
answer = ai("分析這段程式碼", project="dev", group="review")

# 手動指定 fallback（優先用 Claude，不行就用 Gemini）
answer = ai("翻譯成英文", provider="claude", project="dev", group="translate")
# → Claude 429/過期 → 自動降級到 Gemini
```

**Fallback Chain（自動）：**
```
Claude → Gemini → OpenAI → DeepSeek → Mistral → Groq → xAI → Together → Fireworks → Cohere
```

只要有任何一個 provider 有可用的 OAuth token 或 API Key，請求就不會失敗。

**手動切換 provider：**
```python
# 如果知道某個 provider 目前比較快
ai("快速回答", provider="groq", project="dev", group="chat")        # Groq 極快
ai("便宜的長文", provider="deepseek", project="dev", group="content") # DeepSeek 便宜
```

在儀表板可以看到哪些 provider 是綠燈（正常）、黃燈（部分異常）、紅燈（不可用）。

### 降低請求延遲

proxy-cli 有幾個機制幫你降低延遲：

**1. Prompt Caching（自動，最有效）**

同一個 system prompt 連續呼叫時，第二次開始命中快取，延遲降低最高 85%：

```python
from proxy import ai

# 第一次：建立快取（正常速度）
ai("分析用戶 A", system="你是資料分析師...", project="data", group="analyze")

# 第二次起：命中快取（延遲大幅降低）
ai("分析用戶 B", system="你是資料分析師...", project="data", group="analyze")
ai("分析用戶 C", system="你是資料分析師...", project="data", group="analyze")
```

> 快取 TTL 5 分鐘，每次命中自動延長。相同 system prompt 的連續呼叫（如 batch 處理）受益最大。

**2. 用 tier 選對模型**

不是每個任務都需要最強的模型。用 `tier` 讓 proxy 自動選擇：

```python
# 簡單任務用 fast（Haiku），延遲 ~1-3 秒
ai("翻譯：你好", tier="fast", project="dev", group="translate")

# 複雜任務才用 high（Opus），延遲 ~10-30 秒
ai("設計一個微服務架構", tier="high", project="dev", group="architect")
```

**3. 自動路由（預設開啟）**

不指定 tier 時，proxy 分析 prompt 自動選模型：短 prompt 用快的，長 prompt 用強的。

**4. 批次處理用 Streaming**

長文生成用 `ai_stream()`，第一個字 1-2 秒就出來，不用等全部生成完：

```python
from proxy import ai_stream

for chunk in ai_stream("寫一篇 2000 字文章", project="content", group="article"):
    print(chunk, end="", flush=True)
```

### 快速 AI 模型篩選

proxy 提供多種方式幫你選對模型，不用每次都手動挑：

**方式 1：自動路由（最簡單，推薦）**

不指定 model 或 tier，proxy 分析你的 prompt 自動分流：

```python
from proxy import ai

ai("翻譯：hello", project="dev", group="translate")        # → 自動用 fast（Haiku）
ai("寫一個 function", project="dev", group="code")          # → 自動用 mid（Sonnet）
ai("設計分散式系統架構", project="dev", group="architect")   # → 自動用 high（Opus）
```

規則：長 prompt（>500字）或含「分析」「設計」「架構」→ high，短 prompt（<80字）+ 簡單詞彙 → fast，其他 → mid。

**方式 2：tier 等級（推薦）**

明確指定需要的模型等級，不用記模型名：

| tier | Claude | Gemini | 適用場景 |
|------|--------|--------|---------|
| `fast` | Haiku | Flash-Lite | 翻譯、分類、簡單問答 |
| `mid` | Sonnet | Flash | 一般任務、程式碼 |
| `high` | Opus | Pro | 複雜分析、架構設計 |

```python
ai("快速分類", tier="fast", project="dev", group="classify")
ai("寫程式碼", tier="mid", project="dev", group="code")
ai("深度分析", tier="high", project="dev", group="analyze")
```

**方式 3：Server-side 模型管理（團隊推薦）**

管理員在儀表板統一設定，工程師不需要操心模型選擇：

```bash
# .env 加一行
AI_PROXY_SERVER_TIER=true
```

```python
ai("任何任務", tier="best", project="dev", group="work")  # server 根據專案策略選模型
```

### 看 Token 用量

```python
from proxy import ai_detail

result = ai_detail("你好")
print(result["content"])        # AI 的回答
print(result["input_tokens"])   # 輸入用了多少 token
print(result["output_tokens"])  # 輸出用了多少 token
print(result["latency_ms"])     # 花了多少毫秒
```

#### 實用範例：用量監控和成本控制

```python
from proxy import ai_detail

# 監控長文生成的 token 消耗
result = ai_detail("寫一篇 1000 字的產品介紹", tier="high", project="content")
print(f"輸入: {result['input_tokens']} tokens")
print(f"輸出: {result['output_tokens']} tokens")
print(f"延遲: {result['latency_ms']}ms")
print(f"內容: {result['content'][:100]}...")

# 批次任務成本估算
total_in, total_out = 0, 0
items = ["蘋果", "香蕉", "橘子"]
for item in items:
    r = ai_detail(f"用一句話描述{item}的營養價值", project="health")
    total_in += r["input_tokens"]
    total_out += r["output_tokens"]
print(f"總計: {total_in} in + {total_out} out = {total_in + total_out} tokens")
```

### 文字嵌入向量（語義搜尋）

需要 Gemini API Key。

```python
from proxy import ai_embed

# 把文字轉成向量（768 維）
vec = ai_embed("人工智能正在改變世界")
print(f"向量維度: {len(vec)}")  # 768

# 語義相似度計算
import numpy as np
vec1 = ai_embed("今天天氣很好")
vec2 = ai_embed("外面陽光普照")
vec3 = ai_embed("Python 程式設計")
sim_12 = np.dot(vec1, vec2)  # 高相似度（語義接近）
sim_13 = np.dot(vec1, vec3)  # 低相似度（語義不同）
print(f"天氣 vs 陽光: {sim_12:.3f}")  # ~0.85
print(f"天氣 vs Python: {sim_13:.3f}")  # ~0.20

# 簡易語義搜尋引擎
docs = ["Python 入門教學", "機器學習實戰", "日本旅遊攻略", "React 前端開發"]
doc_vecs = [ai_embed(d) for d in docs]
query_vec = ai_embed("我想學寫程式")
scores = [np.dot(query_vec, dv) for dv in doc_vecs]
ranked = sorted(zip(docs, scores), key=lambda x: -x[1])
for doc, score in ranked:
    print(f"  {score:.3f} {doc}")
```

### 通知系統（Telegram / Discord / Slack）

長任務完成後自動通知。

```bash
# .env 設定 webhook（三選一或都設）
AI_PROXY_NOTIFY_TELEGRAM=https://api.telegram.org/bot123:ABC/sendMessage?chat_id=456
AI_PROXY_NOTIFY_DISCORD=https://discord.com/api/webhooks/...
AI_PROXY_NOTIFY_SLACK=https://hooks.slack.com/services/...
```

```python
from proxy import notify, notify_session, ai

# 手動發通知
notify("批次處理完成，共處理 150 張圖片")

# 指定平台
notify("部署完成", service="telegram")

# 自動發 session 用量摘要
# 先跑一堆任務...
for i in range(100):
    ai(f"處理第 {i} 項", project="batch")
# 任務結束，發通知
notify_session("圖片批次生成完成")
# → "圖片批次生成完成\n請求: 100 次 | Token: 15,000 | 錯誤: 0 | 時間: 120s"
```

### 媒體生成（圖片、影片、語音、音樂）

媒體生成走 REST API（`POST /api/generate`），由 Gemini API 提供。

> **重要：媒體生成必須使用 Gemini API Key**，CLI OAuth 認證不支援（scope 不夠）。
>
> 設定方式（二擇一）：
> 1. 儀表板 `clip.twloop.com` → 左側「API Key」→ 選 Gemini → 新增 Key
> 2. 環境變數 `GEMINI_API_KEY=你的key`
>
> 免費 Key 到 https://aistudio.google.com/apikey 取得。

#### Python 用法

```python
from proxy import ai_image, ai_video, ai_tts, ai_music

# 生成圖片
ai_image("一隻坐在窗台上的橘貓，水彩風格", output="cat.png", project="design")

# 生成影片（較慢，預設 300 秒超時）
ai_video("海邊日落的縮時攝影", output="sunset.mp4", project="content")

# 文字轉語音
ai_tts("歡迎使用 AI Proxy 服務", output="welcome.wav", project="app")

# 生成音樂
ai_music("輕快的爵士鋼琴，適合咖啡廳背景音樂", output="jazz.wav", project="content")
```

#### REST API 規格（給其他語言用）

**所有媒體類型共用同一個 endpoint：**

```
POST https://clip.twloop.com/api/generate
Authorization: Bearer <你的token>
Content-Type: application/json
```

**Request Body：**

```json
{
  "prompt": "描述文字",
  "type": "image",
  "model": "",
  "project": "你的專案名",
  "group": ""
}
```

| 欄位 | 必填 | 說明 |
|------|------|------|
| `prompt` | ✅ | 描述文字 |
| `type` | ✅ | `image` / `video` / `tts` / `music` |
| `model` | ❌ | 留空用預設模型（見下表） |
| `project` | ✅ | 專案名稱 |
| `group` | ❌ | 小組名稱 |

**各類型的預設模型：**

| type | 預設模型 | API | 說明 |
|------|---------|-----|------|
| `image` | `gemini-2.5-flash-image` | generateContent | 圖片生成 |
| `video` | `veo-3.0-generate-001` | predict | 影片生成（較慢） |
| `tts` | `gemini-2.5-flash-preview-tts` | generateContent | 文字轉語音 |
| `music` | `lyria-3-clip-preview` | generateContent | 音樂生成 |

**Response（成功）：**

```json
{
  "ok": true,
  "type": "image",
  "items": [
    {
      "data": "base64 編碼的二進位資料",
      "mime_type": "image/png"
    }
  ],
  "text": "（如果 AI 有附加文字說明）",
  "latency_ms": 3200,
  "input_tokens": 15,
  "output_tokens": 0
}
```

**Response（失敗）：**

```json
{
  "ok": false,
  "error": "錯誤原因"
}
```

#### 各語言呼叫範例

**TypeScript / JavaScript：**

```typescript
// ⚠️ 注意：endpoint 是 /api/generate，不是 /api/generate/image
async function generateImage(prompt: string, project: string): Promise<Buffer> {
  const resp = await fetch("https://clip.twloop.com/api/generate", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt, type: "image", project }),
  });
  const data = await resp.json();
  if (!data.ok) throw new Error(data.error);
  return Buffer.from(data.items[0].data, "base64");
}

// 用法
const imgBuf = await generateImage("一隻橘貓", "my-project");
fs.writeFileSync("cat.png", imgBuf);
```

**cURL：**

```bash
curl -X POST https://clip.twloop.com/api/generate \
  -H "Authorization: Bearer 你的token" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"一隻橘貓","type":"image","project":"my-project"}' \
  | jq -r '.items[0].data' | base64 -d > cat.png
```

> **注意事項：**
> - 媒體生成走 REST API（不是 gRPC），需要在 `.env` 設定 `AI_PROXY_DASHBOARD_PORT`
> - **必須設定 Gemini API Key**（CLI OAuth 不支援媒體生成）
> - Gemini CLI（`gemini` 指令）只能做文字對話，不能生成圖片/影片
> - 用量會自動記錄到儀表板統計中

## REST API 完整列表

除了 gRPC，proxy 還提供 REST API。**媒體生成、圖片理解、streaming 都走 REST**。

Base URL：`https://clip.twloop.com`（或 `http://VPS_IP:8091`）

所有 API 都需要 `Authorization: Bearer <token>` header。

| Method | Path | 說明 |
|--------|------|------|
| `POST` | `/api/generate` | 媒體生成（圖片/影片/語音/音樂）|
| `POST` | `/api/chat` | 多模態對話（支援圖片/PDF/音訊/影片附件）|
| `POST` | `/api/chat/stream` | SSE 串流對話 |
| `POST` | `/api/chat/tools` | Function Calling |
| `POST` | `/api/embed` | 文字嵌入向量 |
| `GET` | `/api/health` | 各 provider 健康狀態 |
| `GET` | `/api/usage?days=7` | 用量統計 |
| `GET` | `/api/recent?limit=20` | 最近請求記錄 |
| `GET` | `/api/models` | 模型目錄 |
| `GET` | `/v1/models` | 模型列表（OpenAI 相容格式）|
| `POST` | `/v1/chat/completions` | 聊天補全（OpenAI 相容格式，支援 stream）|

### 查詢用量統計

```python
from proxy import usage

u = usage(days=7)
print(f"這週用了 {u['total_requests']} 次")
print(f"總 Token: {u['total_input_tokens']} + {u['total_output_tokens']}")
```

### 健康檢查

```python
from proxy import health

h = health()
print(h["claude"]["available"])  # True/False
print(h["gemini"]["available"])  # True/False
```

### 設定超時時間

```python
from proxy import ai

# 預設 90 秒，可自訂
ai("複雜的分析任務", project="dev", timeout=180)  # 3 分鐘
ai("簡單問答", project="dev", timeout=30)          # 30 秒
```

## IDE 整合（Antigravity / Continue / Cline / Aider）

proxy-cli 提供 **OpenAI 相容 API**（`/v1/chat/completions`），所有支援自訂端點的 IDE 工具都能直接使用。

**詳細設定指南 → [IDE_SETUP.md](IDE_SETUP.md)**（含各工具設定、模型選擇、實用工作流、API 範例、故障排除）

### 快速開始

所有工具的設定都一樣：

| 項目 | 值 |
|------|-----|
| API Base URL | `https://clip.twloop.com/v1` |
| API Key | 你的 Bearer token |
| Model | `gemini-2.5-pro`（推薦） |

支援的工具：Google Antigravity、VS Code + Continue、VS Code + Cline、Aider、Cursor、Open WebUI，以及任何支援 OpenAI API 的工具。

文字請求走 CLI 免費額度，圖片/多模態自動切換 Gemini API Key。

## 用戶和專案

### 開始使用前

你需要兩樣東西，找管理員拿：
1. **Token** — 你的 API 認證 token
2. **專案名稱** — 管理員在儀表板幫你開好的專案

管理員在儀表板 `https://clip.twloop.com/` 左側欄操作：
- 新增用戶：輸入名稱，自動生成 token，點 `key` 查看
- 新增專案：輸入名稱，即時生效
- 用戶和專案存在 SQLite 資料庫，重建容器不會丟失

### 專案是必填的

每次呼叫都必須帶 `project`，而且專案必須先在儀表板新增過：

```python
from proxy import ai

ai("分析這段程式碼", project="web-app")       # ✅ 正確
ai("寫一段 SQL", project="data-pipeline")     # ✅ 正確
ai("你好")                                     # ❌ 被拒絕：缺少 project
ai("你好", project="not-exist")               # ❌ 被拒絕：專案不存在
```

### 系統專案

`_activation` 是內建的系統專案，不需要在儀表板建立：

```python
from proxy import ai

# 激活用量會獨立統計，不混入一般用量
ai("激活測試", project="_activation")
```

激活用量在儀表板的「激活統計」卡片中查看，不會出現在一般統計和最近請求中。

### 查詢用量

```python
from proxy import usage

# 查全部
usage(days=7)

# 只查某個專案
usage(days=7, project="web-app")

# 查某個用戶在某個專案的用量
usage(days=7, user="alice", project="web-app")

# 查某個小組的用量
usage(days=7, project="web-app", group="frontend")
```

儀表板上點左側的專案名稱就能篩選該專案的統計數據。

## 測試

```bash
# 設好環境變數後
python proxy.py
```

會依序測試健康檢查、Claude、Gemini、用量統計。

## 目錄內容

```
use_proxycli/
├── README.md              # 本文件
├── CHANGELOG.md           # 版本更新日誌
├── .env.example           # 環境變數範本（cp 成 .env 填入設定）
├── proxy.py               # 客戶端封裝（import 這個就好）
├── aiproxy.proto           # gRPC 服務定義（給其他語言用）
├── aiproxy_pb2.py          # Python gRPC stub
└── aiproxy_pb2_grpc.py     # Python gRPC stub
```

你的專案只需要 import proxy.py，其他檔案是它的依賴。

## 在你的專案裡怎麼放

```
你的專案/
├── main.py
├── ...
└── use_proxycli/       ← 整個目錄丟進來
    ├── proxy.py
    ├── aiproxy_pb2.py
    └── aiproxy_pb2_grpc.py
```

```python
# main.py
from use_proxycli.proxy import ai

answer = ai("你好")
```

## 錯誤處理

```python
import grpc
from proxy import ai

try:
    answer = ai("你好", project="dev")
except RuntimeError as e:
    # Provider 不可用（預檢偵測到授權過期，不會等待超時）
    print(f"服務不可用: {e}")
except grpc.RpcError as e:
    code = e.code()
    if code == grpc.StatusCode.UNAUTHENTICATED:
        print("Token 錯誤，找管理員確認")
    elif code == grpc.StatusCode.INVALID_ARGUMENT:
        print("缺少 project 或 project 不存在，找管理員在儀表板新增")
    elif code == grpc.StatusCode.UNAVAILABLE:
        print("服務不可用，可能是 CLI 授權過期")
    elif code == grpc.StatusCode.RESOURCE_EXHAUSTED:
        print("服務忙碌，稍後重試")
    elif code == grpc.StatusCode.DEADLINE_EXCEEDED:
        print("請求超時")
    else:
        print(f"錯誤: {e.details()}")
```

> **預檢機制：** `ai()` 呼叫前會自動檢查 provider 狀態（快取 30 秒），
> 如果 provider 授權過期，會立即拋出 `RuntimeError` 而不是等到超時才知道。

## 連線資訊

### 外網（TLS，推薦）

| 項目 | 值 |
|------|-----|
| gRPC | `cli.twloop.com:443`（TLS） |
| 儀表板 | `https://clip.twloop.com/` |
| 設定 | `AI_PROXY_TLS=true` `AI_PROXY_PORT=443` |

### 外網（無 TLS）

| 項目 | 值 |
|------|-----|
| gRPC | `cli.twloop.com:50051` |
| 儀表板 | `https://clip.twloop.com/` |
| 設定 | `AI_PROXY_TLS=false` `AI_PROXY_PORT=50051` |


### Token

找管理員拿。或在儀表板左側欄點「管理憑證」上傳 CLI 授權。

## 支援的模型

### Claude（文字對話）

| 等級 | 模型 ID | 說明 | 價格 (input/output per MTok) |
|------|---------|------|-----|
| high | claude-opus-4-6 | 最強，複雜推理和 coding | $5 / $25 |
| mid | claude-sonnet-4-6 | 平衡速度和智慧 | $3 / $15 |
| fast | claude-haiku-4-5 | 最快最便宜 | $1 / $5 |

舊版模型仍可用：claude-sonnet-4-5、claude-opus-4-5、claude-opus-4-1、claude-sonnet-4、claude-opus-4

完整模型列表：https://platform.claude.com/docs/en/about-claude/models/overview

### Gemini（文字對話，CLI 可用）

| 等級 | 模型 ID | 說明 |
|------|---------|------|
| high | gemini-2.5-pro | 最強推理 |
| mid | gemini-2.5-flash | 平衡，預設 |
| fast | gemini-2.5-flash-lite | 最快最便宜 |
| - | gemini-2.0-flash | 上一代快速模型 |
| - | gemini-2.0-flash-lite | 上一代輕量模型 |
| - | gemini-3.1-pro-preview | 最新預覽版（可能不穩定） |
| - | gemini-3-flash-preview | 最新快速預覽版 |

Gemini CLI 只支援文字對話。以下功能需要 **Gemini API Key**（不能用 CLI OAuth）：

| 功能 | 模型 | 說明 |
|------|------|------|
| 圖片生成 | gemini-2.5-flash-image | `ai_image()` |
| 影片生成 | veo-3.0-generate-001 | `ai_video()` |
| 語音合成 | gemini-2.5-flash-preview-tts | `ai_tts()` |
| 音樂生成 | lyria-3-clip-preview | `ai_music()` |
| 嵌入向量 | gemini-embedding-001 | `ai_embed()` |

完整模型列表：https://ai.google.dev/gemini-api/docs/pricing

## 伺服器端優化

使用者不需要做任何設定，以下功能在伺服器端自動運作：

- **CLI 優先路由** — 文字生成：快取 → CLI（免費 OAuth）→ API Key → 備用模型。API Key 額度留給媒體生成
- **回應快取** — 相同的 prompt 在 5 分鐘內直接回快取，不重複呼叫 CLI
- **請求去重** — 同一個 prompt 同時進來只執行一次，其他等結果
- **多憑證輪替** — 支援多組 OAuth 憑證（Web OAuth 一鍵登入），自動輪替使用
- **加權負載均衡** — 根據 API Key 的成功率和延遲動態調整權重
- **自動重試** — 暫時性錯誤（rate limit、網路抖動）自動重試
- **Quota Fallback** — 額度耗盡時自動降級到備用 provider（10 個 provider 互為備援）
- **敏感資料過濾** — 自動偵測 prompt 中的 API Key/密碼，預設警告模式
- **OAuth 憑證備份** — 憑證同時存檔案 + SQLite，重建容器不會丟失
- **健康探測** — 每 5 分鐘自動檢查各憑證，連續 10 次失敗自動清理
