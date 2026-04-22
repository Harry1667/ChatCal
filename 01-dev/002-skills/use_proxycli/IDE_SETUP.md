# IDE 整合指南

proxy-cli 提供 **OpenAI 相容 API**，所有支援自訂端點的 IDE 工具都能直接使用你的 AI proxy 來寫程式。

## 連線資訊

所有工具的設定都一樣：

| 項目 | 值 |
|------|-----|
| **API Base URL** | `https://clip.twloop.com/v1` |
| **API Key** | 你的 Bearer token（找管理員拿） |
| **端點** | `/v1/chat/completions`（OpenAI 格式） |
| **認證** | `Authorization: Bearer <token>` |

---

## 各工具設定

### Google Antigravity

Google 的 AI IDE（VS Code 改版），支援多 Agent 同時工作。

1. 開啟 **Settings → Models**
2. 點 **Add Model → Custom / OpenAI Compatible**
3. 填入：

| 欄位 | 值 |
|------|-----|
| Base URL | `https://clip.twloop.com/v1` |
| API Key | 你的 token |
| Model | `gemini-2.5-pro` |

4. 儲存後在 Agent Panel 選擇這個模型

**推薦配置：**
- 主力 Agent：`gemini-2.5-pro`（程式碼生成、複雜任務）
- 快速 Agent：`gemini-2.5-flash`（簡單修改、問答）
- 深度分析：`claude/sonnet`（程式碼審查、架構設計）

### VS Code + Continue

[Continue](https://continue.dev/) 是開源的 AI 程式碼助手。

**安裝：** VS Code 擴充套件搜尋 "Continue" 並安裝。

**設定：** 編輯 `~/.continue/config.json`：

```json
{
  "models": [
    {
      "title": "Gemini Pro（主力）",
      "provider": "openai",
      "apiBase": "https://clip.twloop.com/v1",
      "apiKey": "你的token",
      "model": "gemini-2.5-pro"
    },
    {
      "title": "Claude Sonnet（深度分析）",
      "provider": "openai",
      "apiBase": "https://clip.twloop.com/v1",
      "apiKey": "你的token",
      "model": "claude/sonnet"
    },
    {
      "title": "DeepSeek（便宜快速）",
      "provider": "openai",
      "apiBase": "https://clip.twloop.com/v1",
      "apiKey": "你的token",
      "model": "deepseek/deepseek-chat"
    }
  ],
  "tabAutocompleteModel": {
    "title": "Flash 補全",
    "provider": "openai",
    "apiBase": "https://clip.twloop.com/v1",
    "apiKey": "你的token",
    "model": "gemini-2.5-flash"
  }
}
```

**使用：**
- `Cmd+L`（Mac）/ `Ctrl+L`（Win/Linux）— 開聊天面板
- `Cmd+I` — 行內編輯（選取程式碼後直接改寫）
- `Tab` — 自動補全建議
- `@file` — 引用其他檔案作為上下文
- `@codebase` — 搜尋整個專案

### VS Code + Cline

[Cline](https://github.com/cline/cline) 是自主式 AI 編碼 Agent。

**安裝：** VS Code 擴充套件搜尋 "Cline" 並安裝。

**設定：**
1. 開啟 Cline 側邊欄
2. 點齒輪圖示 → **API Provider** 選 **OpenAI Compatible**
3. 填入：
   - **Base URL**: `https://clip.twloop.com/v1`
   - **API Key**: 你的 token
   - **Model ID**: `gemini-2.5-pro`

**使用：**

在 Cline 面板直接打指令，它會自動執行：
```
幫我在 src/api.py 加一個 GET /api/stats 端點
```
Cline 會：讀現有檔案 → 規劃修改 → 寫入程式碼 → 顯示 diff → 等你 Accept/Reject。

### Aider

[Aider](https://aider.chat/) 是終端內的 AI 編碼助手。

**安裝：**
```bash
pip install aider-chat
```

**快速啟動：**
```bash
aider --openai-api-base https://clip.twloop.com/v1 \
      --openai-api-key 你的token \
      --model gemini/gemini-2.5-pro
```

**永久設定：** 建立 `~/.aider.conf.yml`：
```yaml
openai-api-base: https://clip.twloop.com/v1
openai-api-key: 你的token
model: gemini/gemini-2.5-pro
```

之後只要在專案目錄執行 `aider` 即可。

**使用：**
```bash
> 把所有同步函數改成 async
> /add src/db.py src/pool.py    # 加入更多檔案到上下文
> /run pytest tests/            # 跑測試驗證
> /commit                       # 自動 commit
```

### Cursor

[Cursor](https://cursor.com/) 是 AI 原生 IDE。

**設定：**
1. **Settings → Models → OpenAI API Key**
2. 點 "Override OpenAI Base URL"
3. 填入：
   - **Base URL**: `https://clip.twloop.com/v1`
   - **API Key**: 你的 token
4. 在模型列表選擇或手動輸入 `gemini-2.5-pro`

### Open WebUI

[Open WebUI](https://github.com/open-webui/open-webui) 是網頁版 AI 聊天介面。

**設定：**
1. **Admin → Settings → Connections**
2. 新增 OpenAI 連線：
   - **URL**: `https://clip.twloop.com/v1`
   - **API Key**: 你的 token
3. 儲存後模型列表自動載入

---

## 模型選擇指南

### 模型名稱格式

三種寫法都支援：

| 格式 | 範例 | 說明 |
|------|------|------|
| `provider/model` | `gemini/gemini-2.5-pro` | 明確指定 |
| `model` | `gemini-2.5-pro` | 自動偵測 provider |
| 簡稱 | `sonnet`、`flash` | 自動配對 |

### 依場景選模型

| 場景 | 推薦模型 | 原因 |
|------|---------|------|
| 日常寫程式 | `gemini-2.5-pro` | 免費 CLI 額度、品質好 |
| 自動補全 | `gemini-2.5-flash` | 速度快、延遲低 |
| 程式碼審查 | `claude/sonnet` | 邏輯嚴謹、擅長抓 bug |
| 架構設計 | `claude/opus` | 最強推理能力 |
| 快速問答 | `gemini-2.5-flash` | 回應最快 |
| 長文分析 | `gemini-2.5-pro` | 100 萬 token 上下文 |
| 省預算 | `deepseek/deepseek-chat` | 便宜、程式碼品質不錯 |

### 費用說明

| 類型 | 費用 | 說明 |
|------|------|------|
| 一般對話 / 補全 | **免費** | CLI 優先走 OAuth 免費額度（Claude / Gemini / Codex） |
| 多輪對話 | **免費** | CLI 路徑自動扁平化成 `User:/Assistant:` 形式 |
| 圖片理解（多模態） | 需 API Key | 自動切換到 Gemini API Key（有免費額度） |
| **Function Calling / Tools** | **需 API Key** | OAuth 不支援工具呼叫，必須設定付費 API Key |
| 串流（stream=true） | **免費** | 有 CLI 的 provider 假串流；無 CLI 的走真 SSE |

CLI 失敗才會降級到 API Key，文字類請求幾乎不消耗付費額度。

### ⚠️ Function Calling / Tools 的重要限制

**Cline、Continue Agent 模式、Aider 等會大量使用 `tools` 參數做 function calling。這個功能無法透過 OAuth 免費額度執行：**

- **Anthropic `/v1/messages`** 直接回 `401 OAuth authentication is currently not supported` —
  官方 API 明確不接受 Claude Code 的 OAuth token
- **Gemini `generateContent` + tools** 回 `403 ACCESS_TOKEN_SCOPE_INSUFFICIENT` —
  Gemini CLI 的 OAuth scope 不夠

**要啟用 tool calling，必須在儀表板「API Key 管理」設定以下其中一個：**

| Provider | 取得方式 | 費用 |
|---------|---------|------|
| **Gemini API Key** | [aistudio.google.com](https://aistudio.google.com/apikey) | 有免費額度（推薦） |
| **Anthropic API Key** | [console.anthropic.com](https://console.anthropic.com/) | 純付費 |
| **DeepSeek / Groq / xAI 等** | 各家官網 | 各自方案（部分有免費額度） |

設定完成後，proxy 會自動把 OpenAI 格式的 tools 轉成目標 provider 的原生格式
（Claude `input_schema` / Gemini `functionDeclarations`）。

**省錢建議：** Agent 寫程式時用 Gemini API Key（免費額度 + 100 萬 token 上下文），
一般對話、補全、重構維持走 CLI 免費額度。在 Continue 設兩組模型切換即可。

### 判斷請求走哪條路徑

Proxy 內部會依下列規則選擇路徑：

1. **有 `tools` 參數** → direct API（需 API Key）
2. **有圖片 / 多模態** → direct API（Gemini）
3. **`stream=true` 且 provider 無 CLI pool**（deepseek / groq / xai / ...）→ 真 SSE
4. **其他** → CLI-first → 失敗才降級到 direct API（節省免費額度）

---

## 實用工作流

### 1. 寫新功能

在 Antigravity / Cline 的 Agent 面板輸入：
```
幫我在 src/api.py 加一個 GET /api/stats 端點，回傳：
- 今日請求數
- 平均回應時間
- 錯誤率
參考現有的 /api/health 寫法
```
AI 自動讀檔 → 生成程式碼 → 寫入檔案。

### 2. 程式碼審查

Continue 中選取程式碼，`Cmd+L`：
```
這段有什麼問題？有安全漏洞嗎？效能怎麼樣？
```

### 3. 重構

Cline 中輸入：
```
把 utils.py 裡所有同步的資料庫操作改成 async，用 aiosqlite
```

### 4. 寫測試

```
幫 src/pool.py 的 execute_with_fallback 寫 pytest 測試，
覆蓋：正常回傳、CLI 失敗降級 API、全部失敗、超時
```

### 5. Debug

Antigravity Agent 模式：
```
跑 pytest tests/ 後有 3 個測試失敗，幫我修復
```
可以同時派多個 Agent 分別修不同的 bug。

### 6. 修 GitHub Issue

Aider 中：
```
> /run gh issue view 42
> 修復這個 issue，寫測試驗證
> /commit
```

### 7. 雙模型對比

Continue 設定多個模型，隨時切換比較不同 AI 的回答品質。用 Gemini 寫初版，切 Claude 做 review。

### 8. 文件生成

```
讀 src/ 目錄的所有 Python 檔案，生成 API 文件（Markdown 格式）
```

---

## API 呼叫範例

### cURL

```bash
# 基本對話
curl -s https://clip.twloop.com/v1/chat/completions \
  -H "Authorization: Bearer 你的token" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-flash",
    "messages": [{"role": "user", "content": "用 Python 寫快速排序"}]
  }'

# System Prompt + Claude
curl -s https://clip.twloop.com/v1/chat/completions \
  -H "Authorization: Bearer 你的token" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude/sonnet",
    "messages": [
      {"role": "system", "content": "你是資深 Python 工程師，回答簡潔"},
      {"role": "user", "content": "asyncio.gather 和 TaskGroup 差在哪？"}
    ]
  }'

# 串流模式
curl -sN https://clip.twloop.com/v1/chat/completions \
  -H "Authorization: Bearer 你的token" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-flash",
    "stream": true,
    "messages": [{"role": "user", "content": "解釋 Docker 網路模式"}]
  }'

# 圖片理解（需要 Gemini API Key）
curl -s https://clip.twloop.com/v1/chat/completions \
  -H "Authorization: Bearer 你的token" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-flash",
    "messages": [{
      "role": "user",
      "content": [
        {"type": "text", "text": "描述這張圖片"},
        {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,/9j/4AAQ..."}}
      ]
    }]
  }'

# 指定專案（統計用）
curl -s https://clip.twloop.com/v1/chat/completions \
  -H "Authorization: Bearer 你的token" \
  -H "X-Project: my-app" \
  -H "Content-Type: application/json" \
  -d '{"model": "gemini-2.5-flash", "messages": [{"role": "user", "content": "Hello"}]}'

# 列出可用模型
curl -s https://clip.twloop.com/v1/models \
  -H "Authorization: Bearer 你的token" | python3 -m json.tool
```

### Python（openai SDK）

```bash
pip install openai
```

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://clip.twloop.com/v1",
    api_key="你的token",
)

# 基本對話
res = client.chat.completions.create(
    model="gemini-2.5-pro",
    messages=[{"role": "user", "content": "用 Python 寫一個 web scraper"}],
)
print(res.choices[0].message.content)

# 串流
stream = client.chat.completions.create(
    model="claude/sonnet",
    messages=[{"role": "user", "content": "解釋 Python GIL"}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="")
```

### TypeScript / Node.js

```bash
npm install openai
```

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://clip.twloop.com/v1',
  apiKey: '你的token',
});

// 基本對話
const res = await client.chat.completions.create({
  model: 'gemini-2.5-pro',
  messages: [{ role: 'user', content: '用 TypeScript 寫一個 REST API' }],
});
console.log(res.choices[0].message.content);

// 串流
const stream = await client.chat.completions.create({
  model: 'gemini-2.5-flash',
  messages: [{ role: 'user', content: '解釋 React Server Components' }],
  stream: true,
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
```

---

## 故障排除

| 問題 | 原因 | 解決 |
|------|------|------|
| 401 Invalid API key | token 錯誤或過期 | 找管理員確認 token |
| 429 tokens_exceeded | 超過配額限制 | 等待配額重置或聯繫管理員 |
| 500 Request failed | 後端 CLI/API 錯誤 | 檢查 clip.twloop.com 儀表板健康狀態 |
| 模型找不到 | 模型名稱錯誤 | 用 `GET /v1/models` 查看可用模型 |
| 回應很慢 | CLI 冷啟動或模型較慢 | 換用 `gemini-2.5-flash` 或等 CLI pool 預熱 |
| 圖片請求失敗 | 缺 Gemini API Key | 請管理員在儀表板設定 API Key |
