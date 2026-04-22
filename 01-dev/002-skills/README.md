# ProxyCLI Skills 完整指南

> 版本：v1.5.3 | 最後更新：2026-04-09

ProxyCLI 是一個統一的 AI 代理服務，讓你用一組 API 存取 **10 個 AI 供應商、26+ 個模型**，
支援文字、圖片、影片、語音、音樂生成，以及 Function Calling、串流、多 AI 比較等進階功能。

---

## 目錄

1. [快速開始](#1-快速開始)
2. [接入方式總覽](#2-接入方式總覽)
3. [Python SDK 完整 API](#3-python-sdk-完整-api)
4. [模型選擇與智能路由](#4-模型選擇與智能路由)
5. [供應商與模型對照表](#5-供應商與模型對照表)
6. [進階用法](#6-進階用法)
7. [實戰範例：動態挑選 AI 進行分析](#7-實戰範例動態挑選-ai-進行分析)
8. [環境變數參考](#8-環境變數參考)
9. [常見問題](#9-常見問題)

---

## 1. 快速開始

### 1.1 取得檔案

將 `use_proxycli/` 目錄複製到你的專案中：

```
your-project/
├── proxy.py              # SDK 主檔案
├── aiproxy_pb2.py        # gRPC 定義（自動產生）
├── aiproxy_pb2_grpc.py   # gRPC stub（自動產生）
├── .env                  # 你的設定
└── your_code.py          # 你的程式
```

### 1.2 設定 `.env`

```bash
# 必填
AI_PROXY_HOST=cli.twloop.com
AI_PROXY_PORT=443
AI_PROXY_TLS=true
AI_PROXY_TOKEN=你的token

# 建議填（所有請求會自動帶入）
AI_PROXY_PROJECT=your-project
AI_PROXY_GROUP=your-team

# 選填（覆蓋預設值）
AI_PROXY_PROVIDER=claude          # 預設 provider
AI_PROXY_AUTO_ROUTE=true          # 自動選模型等級
AI_PROXY_FALLBACK=true            # 失敗自動切換 provider
```

### 1.3 第一次呼叫

```python
from proxy import ai

# 就這麼簡單
print(ai("用一句話解釋什麼是 gRPC"))
```

### 1.4 安裝相依套件

```bash
pip install grpcio protobuf
```

---

## 2. 接入方式總覽

ProxyCLI 提供 **四種接入方式**，適合不同場景：

### 2.1 Python SDK（推薦）

最簡單的方式，一行就能呼叫 AI。

```python
from proxy import ai, ai_stream, ai_dual, ai_tools, ai_image
```

**適合**：Python 腳本、資料分析、自動化流程、後端服務

### 2.2 gRPC 直連

直接透過 gRPC 協定呼叫，適合需要高效能的場景或其他語言。

```python
import grpc
from aiproxy_pb2 import CompletionRequest
from aiproxy_pb2_grpc import AIProxyStub

channel = grpc.secure_channel("cli.twloop.com:443", grpc.ssl_channel_credentials())
stub = AIProxyStub(channel)
metadata = [("authorization", "Bearer 你的token")]

resp = stub.Complete(
    CompletionRequest(
        provider="claude",
        model="claude-sonnet-4-6",
        prompt="你好",
        project="my-project",
        group="backend",
    ),
    metadata=metadata,
)
print(resp.content)
print(f"Token: {resp.input_tokens} in / {resp.output_tokens} out")
print(f"延遲: {resp.latency_ms}ms")
print(f"實際模型: {resp.actual_model} ({resp.actual_provider})")
```

**可用 RPC**：

| RPC | 用途 |
|-----|------|
| `Complete` | 一元請求（文字回應） |
| `StreamComplete` | 串流請求（逐塊回應） |
| `GetUsage` | 查詢用量統計 |
| `HealthCheck` | 健康檢查（免認證） |
| `GetModelConfig` | 取得可用模型清單 |

**適合**：Go / Java / Node.js / Rust 等語言、微服務架構

### 2.3 REST API

透過 HTTP JSON 呼叫，適合前端或不支援 gRPC 的環境。

```bash
# 文字對話
curl -X POST http://cli.twloop.com:8080/api/chat \
  -H "Authorization: Bearer 你的token" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "你好",
    "provider": "claude",
    "model": "claude-sonnet-4-6",
    "project": "my-project",
    "group": "backend"
  }'

# 串流對話（SSE）
curl -X POST http://cli.twloop.com:8080/api/chat/stream \
  -H "Authorization: Bearer 你的token" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"prompt": "寫一篇文章", "provider": "claude"}'

# Function Calling
curl -X POST http://cli.twloop.com:8080/api/chat/tools \
  -H "Authorization: Bearer 你的token" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "台北現在幾度",
    "provider": "claude",
    "tools": [{"name": "get_weather", "description": "查詢天氣", "input_schema": {"type": "object", "properties": {"city": {"type": "string"}}}}]
  }'

# 媒體生成
curl -X POST http://cli.twloop.com:8080/api/generate \
  -H "Authorization: Bearer 你的token" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "一隻太空貓", "type": "image"}'
```

**REST 端點一覽**：

| 端點 | 方法 | 用途 |
|------|------|------|
| `/api/chat` | POST | 文字對話（含多模態） |
| `/api/chat/stream` | POST | 串流對話（SSE） |
| `/api/chat/tools` | POST | Function Calling |
| `/api/generate` | POST | 媒體生成（圖片/影片/TTS/音樂） |
| `/api/embed` | POST | 文字嵌入向量 |
| `/api/usage` | GET | 用量統計 |
| `/api/health` | GET | 健康檢查 |
| `/api/models` | GET | 模型清單 |

**適合**：前端 JavaScript、Shell 腳本、Webhook 整合

### 2.4 IDE 整合

透過 OpenAI 相容端點（規劃中），讓 IDE 外掛直接使用 ProxyCLI：

- **Continue** (VS Code / JetBrains)
- **Cline** (VS Code Claude 外掛)
- **Aider** (CLI 程式碼助手)

設定方式請參考 `use_proxycli/IDE_SETUP.md`。

---

## 3. Python SDK 完整 API

### 3.1 `ai()` — 基本文字請求

```python
def ai(prompt, provider=None, model=None, tier="", system="",
       max_tokens=4096, project="", group="", image="",
       images=None, file="", files=None, timeout=90) -> str
```

回傳 AI 的回應文字。

```python
# 基本用法
ai("你好")

# 指定 provider
ai("你好", provider="gemini")

# 指定模型
ai("複雜分析", provider="claude", model="claude-opus-4-6")

# 用 tier 等級（不用記模型名）
ai("複雜分析", tier="high")    # → claude-opus-4-6
ai("一般任務", tier="mid")     # → claude-sonnet-4-6
ai("簡單問答", tier="fast")    # → claude-haiku-4-5

# 帶 system prompt
ai("翻譯成英文", system="你是專業翻譯，保持原文語氣")

# 帶圖片
ai("描述這張圖片", image="photo.jpg")
ai("比較這兩張圖", images=["a.png", "b.png"])

# 帶文件
ai("摘要這份報告", file="report.pdf")

# 帶音訊（Gemini）
ai("翻譯這段錄音", file="meeting.mp3", provider="gemini")

# 帶影片（Gemini）
ai("描述影片內容", file="demo.mp4", provider="gemini")
```

### 3.2 `ai_detail()` — 含 Token 用量的請求

```python
def ai_detail(prompt, ...) -> dict
```

回傳完整資訊：

```python
result = ai_detail("分析這段程式碼", tier="high")
print(result["content"])         # 回應文字
print(result["input_tokens"])    # 輸入 token 數
print(result["output_tokens"])   # 輸出 token 數
print(result["latency_ms"])      # 延遲毫秒
print(result["estimated"])       # token 數是否為估計值
```

### 3.3 `ai_stream()` — 串流請求

```python
def ai_stream(prompt, ...) -> Generator[str]
```

逐塊回傳文字，適合即時顯示：

```python
for chunk in ai_stream("寫一篇關於 AI 的文章"):
    print(chunk, end="", flush=True)
```

優先走 SSE（真串流），失敗降級到 gRPC。

### 3.4 `ai_dual()` — 多 AI 比較

```python
def ai_dual(prompt, providers=None, ...) -> dict
```

同時問多個 AI，平行呼叫：

```python
# 預設比較 Claude vs Gemini
result = ai_dual("這段程式碼有安全漏洞嗎？")
print("Claude:", result["claude"]["content"][:200])
print("Gemini:", result["gemini"]["content"][:200])

# 三個一起比
result = ai_dual("分析市場趨勢", providers=["claude", "gemini", "openai"])
for name, r in result.items():
    print(f"{name} ({r['latency_ms']}ms): {r['content'][:100]}")
```

### 3.5 `ai_tools()` — Function Calling

```python
def ai_tools(prompt, tools, ...) -> dict
```

讓 AI 呼叫你定義的工具：

```python
tools = [{
    "name": "search_database",
    "description": "搜尋產品資料庫",
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "搜尋關鍵字"},
            "limit": {"type": "integer", "description": "結果數量"}
        },
        "required": ["query"]
    }
}]

result = ai_tools("找出價格最低的三個產品", tools)
if result["tool_calls"]:
    call = result["tool_calls"][0]
    print(f"呼叫工具: {call['name']}")
    print(f"參數: {call['arguments']}")
else:
    print(f"直接回答: {result['content']}")
```

### 3.6 媒體生成

```python
# 圖片生成（Gemini）
ai_image("一隻太空貓，賽博朋克風格", output="cat.png")

# 影片生成（Gemini Veo 3.0）
ai_video("日落海灘，慢鏡頭", output="sunset.mp4")

# 文字轉語音
ai_tts("歡迎使用 ProxyCLI", output="welcome.wav")

# 音樂生成（Gemini Lyria 3）
ai_music("輕快的電子音樂，適合程式設計時聽", output="coding.wav")

# 文字嵌入向量（768 維）
vector = ai_embed("人工智慧")
print(len(vector))  # 768
```

### 3.7 用量查詢

```python
from proxy import usage, session

# 查伺服器用量
stats = usage(days=7)
print(f"7 天總請求: {stats['total_requests']}")
print(f"總 Token: {stats['total_input_tokens']} in / {stats['total_output_tokens']} out")

# 按專案查
stats = usage(days=30, project="work-A")

# 按小組查
stats = usage(days=7, project="work-A", group="frontend")

# 查本次 session 用量
print(session.summary())
# {'requests': 5, 'input_tokens': 1200, 'output_tokens': 3500, 'total_tokens': 4700, 'errors': 0, 'duration_s': 45}
```

### 3.8 通知系統

```python
from proxy import notify, notify_session

# 發送通知到 Telegram / Discord / Slack
notify("部署完成！")

# 發送 session 用量摘要
notify_session("批次分析完成")
# → "批次分析完成\n請求: 50 次 | Token: 125,000 | 錯誤: 0 | 時間: 300s"
```

需要在 `.env` 設定 webhook：

```bash
AI_PROXY_NOTIFY_TELEGRAM=https://api.telegram.org/bot.../sendMessage?chat_id=...
AI_PROXY_NOTIFY_DISCORD=https://discord.com/api/webhooks/...
AI_PROXY_NOTIFY_SLACK=https://hooks.slack.com/services/...
```

### 3.9 健康檢查

```python
from proxy import health

h = health()
print(h["claude"]["available"])  # True/False
print(h["claude"]["auth_ok"])    # 認證是否有效
print(h["gemini"]["idle"])       # 閒置 pool 數量
```

---

## 4. 模型選擇與智能路由

ProxyCLI 提供三種模型選擇策略，從簡單到智能：

### 4.1 直接指定模型

最明確，你完全控制用哪個模型：

```python
ai("複雜推理", provider="claude", model="claude-opus-4-6")
ai("快速翻譯", provider="gemini", model="gemini-2.5-flash-lite")
```

### 4.2 Tier 等級選擇（推薦）

不用記模型名，用等級描述需求。新模型出來只要改 `.env`：

| Tier | 意義 | Claude | Gemini | OpenAI |
|------|------|--------|--------|--------|
| `high` | 最強、最精確 | opus-4.6 | 2.5-pro | gpt-4o |
| `mid` | 平衡（預設） | sonnet-4.6 | 2.5-flash | gpt-4o-mini |
| `fast` | 最快、最便宜 | haiku-4.5 | 2.5-flash-lite | gpt-4o-mini |

```python
ai("需要深度推理的問題", tier="high")
ai("一般任務", tier="mid")
ai("簡單格式轉換", tier="fast")

# 搭配 provider
ai("用 Gemini 最強模型", tier="high", provider="gemini")
```

**自訂 tier 對應**（在 `.env`）：

```bash
AI_PROXY_CLAUDE_HIGH=claude-opus-4-6
AI_PROXY_CLAUDE_MID=claude-sonnet-4-6
AI_PROXY_CLAUDE_FAST=claude-haiku-4-5
AI_PROXY_GEMINI_HIGH=gemini-2.5-pro
AI_PROXY_GEMINI_MID=gemini-2.5-flash
AI_PROXY_GEMINI_FAST=gemini-2.5-flash-lite
```

### 4.3 自動路由（Auto Route）

SDK 根據 prompt 特徵自動選擇 tier：

| 條件 | 自動選擇 |
|------|---------|
| prompt > 500 字，或含「分析」「架構」「重構」「優化」等關鍵字 | `high` |
| prompt < 80 字，且含「翻譯」「你好」「是什麼」「列出」等關鍵字 | `fast` |
| 其他 | `mid` |

```python
# 自動路由（預設開啟）
ai("分析這段程式碼的架構設計")  # → high（偵測到「分析」「架構」）
ai("翻譯 hello")               # → fast（短 + 偵測到「翻譯」）
ai("寫一個排序函數")           # → mid（預設）
```

控制開關：

```bash
AI_PROXY_AUTO_ROUTE=true   # 開啟（預設）
AI_PROXY_AUTO_ROUTE=false  # 關閉，全部走 mid
```

### 4.4 Server-Side Tier 解析

讓 server 根據歷史統計選最佳模型（考慮延遲、成功率）：

```bash
AI_PROXY_SERVER_TIER=true
```

Server 的路由邏輯：
1. 查專案級模型設定（`project_models` 表）
2. 根據 7 天 `model_stats` 打分：`成功率 × 0.7 + 延遲分 × 0.3`
3. 選分數最高的候選模型

### 4.5 備援切換（Fallback Chain）

當 provider 失敗（429、超時、認證過期），自動嘗試下一個：

```
claude → gemini → deepseek → groq → mistral → xai → together → fireworks → cohere → openai
```

```python
# 預設開啟
ai("你好", provider="claude")
# claude 429 → 自動嘗試 gemini
# gemini 也失敗 → 自動嘗試 deepseek
# ...直到有一個成功
```

自訂 fallback：

```bash
AI_PROXY_FALLBACK=true
AI_PROXY_FALLBACK_CHAIN=gemini,deepseek,groq  # 只嘗試這三個
```

---

## 5. 供應商與模型對照表

### 5.1 文字模型

| 供應商 | 模型 | 品質 | 速度 | 成本 | Context | 特殊能力 |
|--------|------|------|------|------|---------|---------|
| **Claude** | opus-4.6 | best | slow | high | 1M | vision, reasoning, function_calling, long_context |
| | sonnet-4.6 | good | medium | medium | 200K | vision, reasoning, function_calling |
| | haiku-4.5 | basic | fast | low | 200K | vision, function_calling |
| **Gemini** | 2.5-pro | best | medium | free | 1M | vision, reasoning, function_calling, long_context |
| | 2.5-flash | good | fast | free | 1M | vision, function_calling |
| | 2.5-flash-lite | basic | fast | free | 1M | vision |
| **OpenAI** | gpt-4o | best | medium | high | 128K | vision, function_calling |
| | gpt-4o-mini | good | fast | low | 128K | vision, function_calling |
| **DeepSeek** | reasoner | best | slow | low | 64K | reasoning |
| | chat | good | fast | low | 64K | function_calling |
| **Mistral** | large | best | medium | medium | 128K | function_calling |
| | small | good | fast | low | 128K | function_calling |
| **Groq** | llama-3.3-70b | best | fast | free | 128K | function_calling |
| | llama-3.1-8b | basic | fast | free | 128K | — |
| **xAI** | grok-3 | best | medium | high | 131K | function_calling |
| | grok-3-mini | good | fast | medium | 131K | function_calling |
| **Together** | llama-3.3-70b | best | fast | low | 128K | — |
| | llama-3.1-8b | basic | fast | free | 128K | — |
| **Fireworks** | llama-3.3-70b | best | fast | low | 128K | — |
| | llama-3.1-8b | basic | fast | free | 128K | — |
| **Cohere** | command-r-plus | best | medium | medium | 128K | function_calling |
| | command-r | good | fast | low | 128K | function_calling |

### 5.2 媒體生成模型（Gemini 專用）

| 類型 | 模型 | 說明 |
|------|------|------|
| 圖片 | gemini-2.5-flash-preview-image-generation | AI 圖片生成 |
| 影片 | veo-3.0-generate-001 | AI 影片生成 |
| 語音 | gemini-2.5-flash-preview-tts | 文字轉語音 |
| 音樂 | lyria-3-clip-preview | AI 音樂生成 |

### 5.3 免費額度供應商

以下供應商提供免費 tier，善用可大幅降低成本：

- **Gemini** — 所有模型免費（有 RPM 限制）
- **Groq** — Llama 模型免費（高速推理）
- **Together** — 8B 模型免費
- **Fireworks** — 8B 模型免費

---

## 6. 進階用法

### 6.1 敏感資料防護

SDK 內建敏感資料偵測，自動攔截含有 API Key、密碼、私鑰等的 prompt：

```bash
AI_PROXY_SENSITIVE_CHECK=true   # 開啟檢查（預設）
AI_PROXY_SENSITIVE_MODE=warn    # warn=警告繼續 / block=阻擋不送
```

偵測的敏感資料類型：Google API Key、OpenAI Key、Anthropic Key、GitHub Token、GitLab Token、Slack Token、AWS Key、密碼、私鑰等。

### 6.2 專案與小組追蹤

所有請求都必須帶 `group`（v1.5.1+），建議也帶 `project`：

```python
# .env 設定預設值
# AI_PROXY_PROJECT=my-app
# AI_PROXY_GROUP=backend

# 或在呼叫時指定
ai("分析", project="my-app", group="frontend")
ai("分析", project="my-app", group="backend")
ai("分析", project="my-app", group="data-pipeline")
```

用量會按 project → group 分開統計，在儀表板可以看到細分數據。

### 6.3 Session 追蹤

SDK 自動追蹤本次 Python 進程的累計用量：

```python
from proxy import session

# 做一些工作...
ai("任務 1")
ai("任務 2")
ai("任務 3")

# 查看累計用量
s = session.summary()
print(f"本次共 {s['requests']} 次請求")
print(f"消耗 {s['total_tokens']:,} tokens")
print(f"錯誤 {s['errors']} 次")
print(f"執行 {s['duration_s']} 秒")
```

### 6.4 Prompt Caching（Claude）

Server 端已啟用 Claude Prompt Caching，相同 system prompt 的請求在 5 分鐘內重用快取，
延遲可降低最多 85%。你不需要做任何額外設定。

### 6.5 gRPC Proto 定義

如果你用其他語言（Go、Java、Rust 等），可以用 `proto/aiproxy.proto` 產生客戶端：

```protobuf
service AIProxy {
  rpc Complete(CompletionRequest) returns (CompletionResponse);
  rpc StreamComplete(CompletionRequest) returns (stream CompletionChunk);
  rpc GetUsage(UsageRequest) returns (UsageResponse);
  rpc HealthCheck(Empty) returns (HealthResponse);
  rpc GetModelConfig(GetModelConfigRequest) returns (GetModelConfigResponse);
}
```

CompletionRequest 的關鍵欄位：

| 欄位 | 類型 | 說明 |
|------|------|------|
| `provider` | string | "claude", "gemini", "openai" 等 |
| `model` | string | 模型 ID（與 tier 二選一） |
| `prompt` | string | 你的 prompt |
| `system` | string | System prompt（選填） |
| `max_tokens` | int32 | 最大輸出 token |
| `project` | string | 專案名稱 |
| `group` | string | 小組名稱（必填） |
| `tier` | string | "best"/"good"/"basic"（server-side 解析） |
| `usage_type` | string | "text"/"image"/"video"/"tts"/"music" |

---

## 7. 實戰範例：動態挑選 AI 進行分析

### 7.1 根據任務複雜度自動選模型

```python
from proxy import ai

def smart_analyze(text: str) -> str:
    """根據文本長度和內容自動選擇最佳模型"""
    # 自動路由已內建，直接呼叫即可
    # prompt > 500 字或含複雜關鍵字 → high
    # prompt < 80 字且簡單 → fast
    # 其他 → mid
    return ai(text)
```

### 7.2 多 AI 交叉驗證

```python
from proxy import ai_dual

def cross_verify(question: str) -> str:
    """用多個 AI 交叉驗證答案"""
    results = ai_dual(question, providers=["claude", "gemini", "deepseek"])

    # 比較回答
    answers = {name: r["content"] for name, r in results.items()}

    # 用第四個 AI 彙整
    summary_prompt = f"""以下是三個 AI 對同一問題的回答，請彙整出最可靠的結論：

問題：{question}

Claude: {answers['claude'][:500]}

Gemini: {answers['gemini'][:500]}

DeepSeek: {answers['deepseek'][:500]}

請指出共識和分歧，給出你的綜合判斷。"""

    return ai(summary_prompt, tier="high")
```

### 7.3 成本敏感的批次處理

```python
from proxy import ai, session, notify_session

def batch_process(items: list[str], budget_tokens: int = 100000) -> list[str]:
    """在 token 預算內批次處理，動態調整模型等級"""
    results = []

    for i, item in enumerate(items):
        remaining = budget_tokens - session.total_tokens
        if remaining <= 0:
            print(f"預算用盡，已處理 {i}/{len(items)} 項")
            break

        # 根據剩餘預算動態調整
        if remaining > 50000:
            tier = "high"
        elif remaining > 20000:
            tier = "mid"
        else:
            tier = "fast"

        result = ai(item, tier=tier)
        results.append(result)

    notify_session(f"批次處理完成 ({len(results)}/{len(items)})")
    return results
```

### 7.4 根據供應商健康狀態動態選擇

```python
from proxy import ai, health

def resilient_call(prompt: str) -> str:
    """根據供應商健康狀態選擇最佳 provider"""
    h = health()

    # 優先選擇可用且認證正常的
    preferred = ["claude", "gemini", "openai"]
    for provider in preferred:
        info = h.get(provider, {})
        if info.get("available") and info.get("auth_ok"):
            try:
                return ai(prompt, provider=provider, tier="mid")
            except Exception:
                continue

    # 全部失敗，用 fallback chain（會自動嘗試所有 provider）
    return ai(prompt, tier="mid")
```

### 7.5 程式碼審查流水線

```python
from proxy import ai, ai_dual

def code_review_pipeline(code: str, language: str = "python") -> dict:
    """多維度程式碼審查"""

    system = f"你是資深 {language} 工程師，專注於程式碼審查。"

    # 1. 快速安全掃描（用快速模型）
    security = ai(
        f"快速檢查以下程式碼的安全漏洞（SQL injection, XSS, 等）：\n```{language}\n{code}\n```",
        tier="fast", system=system
    )

    # 2. 深度架構分析（用最強模型）
    architecture = ai(
        f"分析以下程式碼的架構設計，指出可改進之處：\n```{language}\n{code}\n```",
        tier="high", system=system
    )

    # 3. 多 AI 風格比較
    style = ai_dual(
        f"評論以下程式碼的可讀性和命名風格：\n```{language}\n{code}\n```",
        providers=["claude", "gemini"]
    )

    return {
        "security": security,
        "architecture": architecture,
        "style_claude": style["claude"]["content"],
        "style_gemini": style["gemini"]["content"],
    }
```

### 7.6 動態 Provider 切換（免費優先）

```python
from proxy import ai

# 免費 provider 優先策略
FREE_PROVIDERS = ["gemini", "groq", "together", "fireworks"]
PAID_PROVIDERS = ["claude", "openai", "deepseek"]

def free_first(prompt: str, need_quality: bool = False) -> str:
    """優先使用免費 provider，需要高品質時才用付費的"""
    if need_quality:
        return ai(prompt, provider="claude", tier="high")

    for provider in FREE_PROVIDERS:
        try:
            return ai(prompt, provider=provider, tier="mid")
        except Exception:
            continue

    # 免費的都失敗，用付費的
    return ai(prompt, provider="claude", tier="mid")
```

### 7.7 Function Calling 工作流

```python
from proxy import ai_tools
import json

# 定義工具
tools = [
    {
        "name": "search_products",
        "description": "搜尋產品資料庫",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "category": {"type": "string", "enum": ["電子", "服飾", "食品"]},
                "max_price": {"type": "number"}
            },
            "required": ["query"]
        }
    },
    {
        "name": "get_user_history",
        "description": "查詢用戶購買歷史",
        "input_schema": {
            "type": "object",
            "properties": {
                "user_id": {"type": "string"}
            },
            "required": ["user_id"]
        }
    }
]

# AI 自動決定呼叫哪個工具
result = ai_tools("幫用戶 U123 找 5000 元以下的耳機", tools)

if result["tool_calls"]:
    for call in result["tool_calls"]:
        print(f"工具: {call['name']}")
        print(f"參數: {json.dumps(call['arguments'], ensure_ascii=False)}")
        # → 工具: search_products
        # → 參數: {"query": "耳機", "category": "電子", "max_price": 5000}
```

---

## 8. 環境變數參考

### 8.1 連線設定

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `AI_PROXY_HOST` | `cli.twloop.com` | Server 位址 |
| `AI_PROXY_PORT` | `443` | gRPC 端口 |
| `AI_PROXY_TLS` | `true` | 是否啟用 TLS |
| `AI_PROXY_TOKEN` | — | 認證 token（必填） |
| `AI_PROXY_DASHBOARD_PORT` | `8080` | REST API 端口 |

### 8.2 預設值

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `AI_PROXY_PROJECT` | — | 預設專案名稱 |
| `AI_PROXY_GROUP` | — | 預設小組名稱 |
| `AI_PROXY_PROVIDER` | `claude` | 預設 provider |

### 8.3 模型路由

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `AI_PROXY_AUTO_ROUTE` | `true` | 自動路由開關 |
| `AI_PROXY_SERVER_TIER` | `false` | Server-side tier 解析 |
| `AI_PROXY_FALLBACK` | `true` | 備援切換開關 |
| `AI_PROXY_FALLBACK_CHAIN` | — | 自訂 fallback 順序 |

### 8.4 Tier 對應模型（可自訂）

| 變數 | 預設值 |
|------|--------|
| `AI_PROXY_CLAUDE_HIGH` | `claude-opus-4-6` |
| `AI_PROXY_CLAUDE_MID` | `claude-sonnet-4-6` |
| `AI_PROXY_CLAUDE_FAST` | `claude-haiku-4-5` |
| `AI_PROXY_GEMINI_HIGH` | `gemini-2.5-pro` |
| `AI_PROXY_GEMINI_MID` | `gemini-2.5-flash` |
| `AI_PROXY_GEMINI_FAST` | `gemini-2.5-flash-lite` |
| `AI_PROXY_OPENAI_HIGH` | `gpt-4o` |
| `AI_PROXY_OPENAI_MID` | `gpt-4o-mini` |
| ... | （其他 provider 同理） |

### 8.5 安全

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `AI_PROXY_SENSITIVE_CHECK` | `true` | 敏感資料檢查 |
| `AI_PROXY_SENSITIVE_MODE` | `warn` | `warn` 或 `block` |

### 8.6 通知

| 變數 | 說明 |
|------|------|
| `AI_PROXY_NOTIFY_TELEGRAM` | Telegram webhook URL |
| `AI_PROXY_NOTIFY_DISCORD` | Discord webhook URL |
| `AI_PROXY_NOTIFY_SLACK` | Slack webhook URL |

---

## 9. 常見問題

### Q: group 欄位一定要填嗎？

**是的**（v1.5.1+）。server 會拒絕沒有 group 的請求。建議在 `.env` 設定 `AI_PROXY_GROUP` 作為預設值。

### Q: 怎麼知道我用了多少 token？

三種方式：
1. `ai_detail()` 回傳每次請求的 token 數
2. `session.summary()` 回傳本次進程累計
3. `usage()` 查伺服器端統計
4. 儀表板圖表即時顯示

### Q: Provider 掛了怎麼辦？

預設開啟 Fallback Chain，會自動嘗試下一個 provider。也可以用 `health()` 預檢。

### Q: 怎麼省錢？

1. 善用免費 provider（Gemini、Groq、Together、Fireworks）
2. 開啟 Auto Route（簡單任務自動用快速模型）
3. 設定 `.env` 讓預設模型是便宜的（如 `AI_PROXY_PROVIDER=gemini`）
4. Claude 已啟用 Prompt Caching，重複 system prompt 會自動快取

### Q: 支援哪些檔案格式？

| 類型 | 格式 | 支援的 Provider |
|------|------|----------------|
| 圖片 | PNG, JPG, GIF, WEBP | Claude, Gemini, OpenAI |
| 文件 | PDF | Claude, Gemini |
| 音訊 | MP3, WAV, OGG, FLAC | Gemini |
| 影片 | MP4, WEBM, MOV | Gemini |

### Q: 怎麼用其他語言（Go、Java）接入？

用 `proto/aiproxy.proto` 產生對應語言的 gRPC 客戶端即可。認證用 gRPC metadata 帶 `authorization: Bearer <token>`。
