// ai.mjs — ProxyCLI AI 解析層 (gRPC)
//
// 功能：
//   1. Provider 輪替：每次呼叫 round-robin 換下一家，失敗自動降級
//   2. 解析自然語言：new event / batch / edit / done / delete / reflect / chat
//
import 'dotenv/config'
import grpc from '@grpc/grpc-js'
import protoLoader from '@grpc/proto-loader'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const packageDef = protoLoader.loadSync(join(__dirname, 'aiproxy.proto'), {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
})
const aiproxy = grpc.loadPackageDefinition(packageDef).aiproxy

const PROXY_HOST = process.env.AI_PROXY_HOST || 'cli.twloop.com'
const PROXY_PORT = process.env.AI_PROXY_PORT || '443'
const PROXY_TOKEN = process.env.AI_PROXY_TOKEN

const client = new aiproxy.AIProxy(
  `${PROXY_HOST}:${PROXY_PORT}`,
  grpc.credentials.createSsl()
)

function getMetadata() {
  const meta = new grpc.Metadata()
  meta.add('authorization', `Bearer ${PROXY_TOKEN}`)
  return meta
}

// === Provider 輪替 ===
const PROVIDERS = (process.env.AI_PROXY_PROVIDERS || 'claude,gemini,openai,deepseek')
  .split(',').map(s => s.trim()).filter(Boolean)

let rrIdx = 0

function modelForProvider(provider) {
  const envKey = `AI_PROXY_${provider.toUpperCase()}_MODEL`
  return process.env[envKey] || null
}

function grpcCompleteOnce(request) {
  return new Promise((resolve, reject) => {
    const deadline = new Date()
    deadline.setSeconds(deadline.getSeconds() + 25)
    client.Complete(request, getMetadata(), { deadline }, (err, response) => {
      if (err) return reject(err)
      resolve(response)
    })
  })
}

export async function callAI({ prompt, system, maxTokens = 700, validator = null }) {
  const startIdx = rrIdx
  let lastErr = null

  for (let i = 0; i < PROVIDERS.length; i++) {
    const idx = (startIdx + i) % PROVIDERS.length
    const provider = PROVIDERS[idx]
    const req = {
      provider,
      prompt, system,
      max_tokens: maxTokens,
      project: process.env.AI_PROXY_PROJECT || 'ChatCal',
      group: process.env.AI_PROXY_GROUP || 'webdev',
    }
    const explicitModel = modelForProvider(provider)
    if (explicitModel) req.model = explicitModel
    else req.tier = 'mid'

    try {
      const resp = await grpcCompleteOnce(req)

      if (validator) {
        const check = validator(resp)
        if (!check.ok) {
          console.warn(`[AI] ✗ ${provider} 格式不對 (${resp.actual_model})，試下一家`)
          lastErr = check.error || new Error('validator rejected')
          continue
        }
        rrIdx = (idx + 1) % PROVIDERS.length
        console.log(`[AI] ✓ ${provider} (${resp.actual_model})`)
        return { response: resp, provider, parsed: check.parsed }
      }

      rrIdx = (idx + 1) % PROVIDERS.length
      console.log(`[AI] ✓ ${provider} (${resp.actual_model})`)
      return { response: resp, provider }
    } catch (err) {
      lastErr = err
      console.warn(`[AI] ✗ ${provider} 失敗: ${err.message || err.code}，試下一個`)
    }
  }

  throw new Error(`所有 provider 都失敗: ${lastErr?.message || lastErr}`)
}

// === 時間 ===
function nowTaipei() {
  return new Date().toLocaleString('sv-SE', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).replace(' ', 'T') + '+08:00'
}

// === 個性 ===
const PERSONA = `你是「小曆」，一本住在 Discord 裡的手帳助理。
個性：溫和、簡潔、不油膩。繁體中文口語。回覆 1-2 句話。`

// === 事件解析 prompt（含 context） ===
function buildEventPrompt(text, context = []) {
  const now = nowTaipei()

  const ctxStr = context.length > 0
    ? '\n\n【最近的事件（可能被修改）】\n' + context.map(e => {
        const t = e.start_time
          ? new Date(e.start_time).toLocaleString('zh-TW', {
              timeZone: 'Asia/Taipei',
              month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
            })
          : '未定時間'
        return `  #${e.id}: "${e.title}" @ ${t}${e.description ? ` (${e.description})` : ''}`
      }).join('\n')
    : ''

  return {
    system: `${PERSONA}

current_datetime: ${now}
時區: Asia/Taipei${ctxStr}

使用者會對你說一段話。你要判斷是哪一種意圖，並回傳對應 JSON（不要 code block，只回傳 JSON）：

【A. 新事件】使用者要記一件新的事
{
  "type": "event",
  "title": "10 字內標題",
  "description": "細節；沒有就 null",
  "start_time": "ISO 8601 含 +08:00；未提就 null",
  "end_time": "ISO 8601；未提就 null",
  "category": "work|study|life|none（根據內容判斷；工作接案選 work，學校課業選 study，生活日常選 life，不確定選 none）",
  "is_urgent": 0 或 1（有「緊急」「急」「趕快」「一定要」「截止」「deadline」「馬上」等詞就設 1，否則 0）,
  "repeat_type": "none|daily|weekly|monthly",
  "repeat_until": "ISO；無就 null",
  "reply": "對主人說的確認話"
}

【B. 批次新事件】使用者一次要記多件事（如「明天三件事：A、B、C」）
{
  "type": "batch",
  "events": [
    { "title": "...", "description": "...", "start_time": "...", "end_time": "...", "category": "...", "is_urgent": 0, "repeat_type": "none", "repeat_until": null },
    ...
  ],
  "reply": "對主人說的確認話（如「已幫你記下 3 件事」）"
}

【C. 修改】改某件事的時間、標題、或內容（需要 context）
{
  "type": "edit",
  "target_id": 事件id,
  "changes": {
    "title": "新標題或 null",
    "description": "新描述或 null",
    "start_time": "新 ISO 或 null",
    "end_time": "新 ISO 或 null"
  },
  "reply": "確認話"
}

【D. 完成】使用者說某件事做完了
{ "type": "done", "target_id": 事件id, "reply": "讚美或確認話" }

【E. 刪除/取消】使用者說某件事取消或不做了
{ "type": "delete", "target_id": 事件id, "reply": "確認話" }

【F. 反思/日記】使用者在講今天感覺或心情
{
  "type": "reflect",
  "mood": "一個 emoji 代表心情",
  "text": "整理過的日記內容（保留重點）",
  "reply": "溫暖的回應"
}

【G. 閒聊】其他不屬於以上類型
{ "type": "chat", "reply": "你的回覆" }

規則：
- target_id 必須從 context 列表裡選，沒匹配就回 chat 並說找不到
- 時間解析：下午兩點 → 14:00，晚上 → 20:00，早上 → 09:00
- 只提日期沒時刻 → 9:00
- 重複：「每天」daily、「每週」weekly、「每月」monthly
- 反思關鍵詞：「今天…」「好累」「很開心」「心情…」「反思」「日記」
- 完成關鍵詞：「寫完了」「做好了」「交了」「完成」「搞定」
- 刪除關鍵詞：「取消」「不去了」「不做了」「刪掉」
- 修改關鍵詞：「改到」「延到」「提前到」「換成」
- 批次關鍵詞：一句話裡出現多個不同事件（用頓號、逗號、「還有」等分隔）

只回傳 JSON。`,
    prompt: text,
  }
}

// === 解析文字 ===
export async function parseText(text, context = []) {
  const { system, prompt } = buildEventPrompt(text, context)

  const validator = (resp) => {
    const raw = (resp.content || '').trim()
    const jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    try {
      const p = JSON.parse(jsonStr)
      const validTypes = ['event', 'batch', 'edit', 'done', 'delete', 'reflect', 'chat']
      if (!validTypes.includes(p.type)) {
        return { ok: false, error: new Error(`unknown type: ${p.type}`) }
      }
      return { ok: true, parsed: p }
    } catch (err) {
      return { ok: false, error: err }
    }
  }

  try {
    const { response, provider, parsed } = await callAI({ prompt, system, maxTokens: 800, validator })
    parsed.success = true
    parsed._provider = provider
    parsed._model = response.actual_model
    return parsed
  } catch (err) {
    console.error('[AI] parseText 所有 provider 都失敗:', err.message)
    return {
      success: false,
      type: 'event',
      title: text.slice(0, 20),
      description: null,
      start_time: null,
      end_time: null,
      category: 'none',
      is_urgent: 0,
      reply: null,
      error: err.message,
    }
  }
}

// === 週回顧 prompt ===
export async function writeWeeklyReview({ done, missed, pending, reflections }) {
  const system = `${PERSONA}

你現在要幫主人寫一段本週的回顧。像是翻手帳時會寫的小結：2-4 句話，溫和、不說教。

回傳純文字（不是 JSON），繁體中文。`

  const prompt = `本週完成 ${done.length} 件、錯過 ${missed.length} 件、還有 ${pending.length} 件待續。

完成：
${done.map(e => `- ${e.title}`).join('\n') || '（無）'}

錯過：
${missed.map(e => `- ${e.title}`).join('\n') || '（無）'}

反思紀錄：
${reflections.map(r => `- ${r.date}${r.mood ? ' ' + r.mood : ''}：${r.text || '（無）'}`).join('\n') || '（本週沒記）'}

幫我寫一段手帳式的週回顧。`

  try {
    const { response } = await callAI({ prompt, system, maxTokens: 500 })
    return response.content.trim()
  } catch (err) {
    console.error('[AI] 週回顧失敗:', err.message)
    return null
  }
}

// === 晚間反思 prompt 生成 ===
export async function generateReflectionPrompt(todayEvents) {
  const system = `${PERSONA}

你現在是在一天結束時，用一句話邀請主人寫今天的反思。要柔和、有溫度、不制式。繁體中文，20 字內。`

  const prompt = todayEvents.length > 0
    ? `今天有這些事情發生了：${todayEvents.map(e => e.title).slice(0, 5).join('、')}。幫我寫一句邀請主人反思的話。`
    : `今天主人沒特別寫什麼事情。幫我寫一句邀請主人反思的話。`

  try {
    const { response } = await callAI({ prompt, system, maxTokens: 100 })
    return response.content.trim()
  } catch {
    return '今天過得如何？'
  }
}
