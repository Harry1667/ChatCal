// server.mjs — 手帳 Web API + 靜態檔
//
// events:
//   GET    /api/events?day=YYYY-MM-DD[&category=work]  某天（含重複展開）
//   GET    /api/events/inbox                            未定時間的 pending 事件
//   GET    /api/events/recent?days=30                   最近 N 天
//   GET    /api/events/search?q=xxx                     搜尋
//   POST   /api/events                                  自然語言新增（走 AI）
//   POST   /api/events/manual                           指定欄位新增
//   PATCH  /api/events/:id
//   PATCH  /api/events/:id/snooze                       推遲 30 分鐘
//   DELETE /api/events/:id
//
// reflections:
//   GET    /api/reflections?from=YYYY-MM-DD&to=YYYY-MM-DD
//   GET    /api/reflections/:date
//   PUT    /api/reflections/:date       { mood, text }
//
// stats:
//   GET    /api/stats/month?y=2026&m=4
//
// settings:
//   GET/PUT /api/settings
//
import 'dotenv/config'
import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import {
  insertEvent, updateEvent, deleteEvent, getEvent,
  getEventsByDay, getRecentEvents, searchEvents, getInboxEvents,
  upsertReflection, getReflection, getReflectionsByRange,
  getEventsByStatusInRange,
  getSetting, setSetting,
  getDiscordTargets, upsertDiscordTarget, deleteDiscordTarget,
} from './db.mjs'
import { parseText } from './ai.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3002
const API_KEY = process.env.API_KEY

app.use(express.json())
app.use(express.static(join(__dirname, 'public')))

function auth(req, res, next) {
  if (!API_KEY) return next()
  const ip = req.ip || req.connection.remoteAddress
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return next()
  if (req.headers['x-api-key'] !== API_KEY) return res.status(401).json({ error: '未授權' })
  next()
}

// === events ===
// 注意：/inbox /recent /search 必須在 /:id 之前
app.get('/api/events/inbox', auth, (req, res) => {
  try { res.json(getInboxEvents()) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/events/recent', auth, (req, res) => {
  const days = parseInt(req.query.days) || 30
  try { res.json(getRecentEvents(days)) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/events/search', auth, (req, res) => {
  const q = (req.query.q || '').trim()
  if (!q) return res.json([])
  try { res.json(searchEvents(q, 50)) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/events', auth, (req, res) => {
  try {
    const { day, category } = req.query
    if (day) return res.json(getEventsByDay(day, category || null))
    res.json(getRecentEvents(30))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/events', auth, async (req, res) => {
  const { text } = req.body
  if (!text || !text.trim()) return res.status(400).json({ error: '請輸入文字' })

  const parsed = await parseText(text.trim(), [])
  if (parsed.type === 'chat') return res.json({ chat: true, reply: parsed.reply })

  if (parsed.type === 'reflect') {
    const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
    const saved = upsertReflection(date, { mood: parsed.mood, text: parsed.text })
    return res.json({ reflect: true, reflection: saved, reply: parsed.reply })
  }

  if (parsed.type === 'batch') {
    const saved = []
    for (const ev of (parsed.events || [])) {
      saved.push(insertEvent({
        title: ev.title, description: ev.description,
        start_time: ev.start_time, end_time: ev.end_time,
        category: ev.category || 'none', is_urgent: ev.is_urgent ? 1 : 0,
        repeat_type: ev.repeat_type || 'none', repeat_until: ev.repeat_until,
        raw_text: text.trim(), source: 'web',
      }))
    }
    return res.json({ batch: true, events: saved, reply: parsed.reply })
  }

  if (parsed.type !== 'event') {
    return res.json({ chat: true, reply: parsed.reply || '這個操作請在 Discord 說，或用編輯畫面。' })
  }

  try {
    const saved = insertEvent({
      title: parsed.title,
      description: parsed.description,
      start_time: parsed.start_time,
      end_time: parsed.end_time,
      raw_text: text.trim(),
      category: parsed.category || 'none',
      is_urgent: parsed.is_urgent ? 1 : 0,
      repeat_type: parsed.repeat_type || 'none',
      repeat_until: parsed.repeat_until,
      source: 'web',
    })
    res.json({ chat: false, event: saved, reply: parsed.reply })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/events/manual', auth, (req, res) => {
  const { title, description, start_time, end_time, repeat_type, repeat_until, category, is_urgent } = req.body
  if (!title || !title.trim()) return res.status(400).json({ error: '缺標題' })
  try {
    const saved = insertEvent({
      title: title.trim(),
      description: description || null,
      start_time: start_time || null,
      end_time: end_time || null,
      category: category || 'none',
      is_urgent: is_urgent ? 1 : 0,
      repeat_type: repeat_type || 'none',
      repeat_until: repeat_until || null,
      raw_text: null,
      source: 'web',
    })
    res.json(saved)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.patch('/api/events/:id/snooze', auth, (req, res) => {
  const id = parseInt(req.params.id)
  if (!id) return res.status(400).json({ error: '無效的 id' })
  try {
    const ev = getEvent(id)
    if (!ev) return res.status(404).json({ error: '找不到' })
    if (!ev.start_time) return res.status(400).json({ error: '此事件無時間，無法推遲' })

    const newTime = new Date(new Date(ev.start_time).getTime() + 30 * 60 * 1000).toISOString()
    const updated = updateEvent(id, { start_time: newTime, reminded_30: 0, reminded_60: 0 })
    res.json(updated)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.patch('/api/events/:id', auth, (req, res) => {
  const id = parseInt(req.params.id)
  if (!id) return res.status(400).json({ error: '無效的 id' })
  try {
    const updated = updateEvent(id, req.body)
    if (!updated) return res.status(404).json({ error: '找不到' })
    res.json(updated)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.delete('/api/events/:id', auth, (req, res) => {
  const id = parseInt(req.params.id)
  if (!id) return res.status(400).json({ error: '無效的 id' })
  try {
    const ok = deleteEvent(id)
    if (!ok) return res.status(404).json({ error: '找不到' })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// === reflections ===
app.get('/api/reflections', auth, (req, res) => {
  const from = req.query.from
  const to = req.query.to
  if (!from || !to) return res.status(400).json({ error: '缺 from/to' })
  try { res.json(getReflectionsByRange(from, to)) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/reflections/:date', auth, (req, res) => {
  try {
    const r = getReflection(req.params.date)
    if (!r) return res.status(404).json({ error: '沒寫' })
    res.json(r)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.put('/api/reflections/:date', auth, (req, res) => {
  const { mood, text } = req.body
  try {
    const saved = upsertReflection(req.params.date, { mood, text })
    res.json(saved)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// === stats ===
app.get('/api/stats/month', auth, (req, res) => {
  const y = parseInt(req.query.y) || new Date().getFullYear()
  const m = parseInt(req.query.m) || (new Date().getMonth() + 1)
  const start = `${y}-${String(m).padStart(2, '0')}-01`
  const last = new Date(y, m, 0).getDate()
  const end = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`
  try {
    const done = getEventsByStatusInRange('done', start, end)
    const missed = getEventsByStatusInRange('missed', start, end)
    const pending = getEventsByStatusInRange('pending', start, end)

    // 各 category 完成率
    const categories = ['work', 'study', 'life', 'none']
    const byCategory = {}
    for (const cat of categories) {
      const catDone = done.filter(e => e.category === cat).length
      const catTotal = [...done, ...missed, ...pending].filter(e => e.category === cat).length
      byCategory[cat] = { done: catDone, total: catTotal }
    }

    res.json({
      month: `${y}-${String(m).padStart(2, '0')}`,
      done: done.length,
      missed: missed.length,
      pending: pending.length,
      by_category: byCategory,
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// === settings ===
app.get('/api/settings', auth, (req, res) => {
  res.json({
    brief_hour: getSetting('cron_brief_hour') || '8',
    brief_minute: getSetting('cron_brief_minute') || '0',
    reflect_hour: getSetting('cron_reflect_hour') || '22',
    reflect_minute: getSetting('cron_reflect_minute') || '0',
    weekly_hour: getSetting('cron_weekly_hour') || '21',
    weekly_minute: getSetting('cron_weekly_minute') || '0',
    reminder_enabled: getSetting('cron_reminder_enabled') || 'true',
    reflect_enabled: getSetting('cron_reflect_enabled') || 'true',
    weekly_enabled: getSetting('cron_weekly_enabled') || 'true',
    discord_channel_record: getSetting('discord_channel_record') || '',
    discord_channel_reminder: getSetting('discord_channel_reminder') || '',
    discord_channel_diary: getSetting('discord_channel_diary') || '',
  })
})

app.put('/api/settings', auth, (req, res) => {
  const cronKeys = [
    'brief_hour', 'brief_minute',
    'reflect_hour', 'reflect_minute',
    'weekly_hour', 'weekly_minute',
    'reminder_enabled', 'reflect_enabled', 'weekly_enabled',
  ]
  const discordKeys = ['discord_channel_record', 'discord_channel_reminder', 'discord_channel_diary']
  for (const [k, v] of Object.entries(req.body)) {
    if (cronKeys.includes(k)) setSetting('cron_' + k, String(v))
    else if (discordKeys.includes(k)) setSetting(k, String(v))
    else if (k === 'web_password') setSetting('web_password', String(v))
  }
  res.json({ success: true })
})

// === discord-targets ===
app.get('/api/discord-targets', auth, (req, res) => {
  try { res.json(getDiscordTargets()) } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/discord-targets', auth, (req, res) => {
  try { res.json(upsertDiscordTarget(req.body)) } catch (err) { res.status(500).json({ error: err.message }) }
})

app.put('/api/discord-targets/:id', auth, (req, res) => {
  try {
    const t = upsertDiscordTarget({ id: parseInt(req.params.id), ...req.body })
    if (!t) return res.status(404).json({ error: '找不到' })
    res.json(t)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.delete('/api/discord-targets/:id', auth, (req, res) => {
  try {
    const ok = deleteDiscordTarget(parseInt(req.params.id))
    res.json({ ok })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// === auth (web password gate) ===
app.get('/api/auth', (req, res) => {
  res.json({ hasPassword: !!getSetting('web_password') })
})

app.post('/api/auth', (req, res) => {
  const stored = getSetting('web_password')
  if (!stored) return res.json({ ok: true, hasPassword: false })
  res.json({ ok: req.body.password === stored, hasPassword: true })
})

app.listen(PORT, () => {
  console.log(`[Server] http://localhost:${PORT}`)
})

export default app
