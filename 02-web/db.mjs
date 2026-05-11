// db.mjs — 手帳資料層
//
// events: 一件事 = 一則日誌條目
//   title / description / start_time / end_time / raw_text
//   status: pending | done | missed
//   category: work | study | life | none
//   is_urgent: 0 | 1（緊急 = 60+30min 雙提醒；一般 = 只有 30min）
//   reminded_60 / reminded_30 / briefed_at / notes / mood
//   repeat_type: none | daily | weekly | monthly
//   repeat_until (ISO)
//   source: discord | web
//
// reflections: 每天一則睡前反思
//   date (YYYY-MM-DD) / mood (emoji) / text / created_at
//
import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dirname, 'chatcal.sqlite')

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    start_time TEXT,
    end_time TEXT,
    raw_text TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'done', 'missed')),
    category TEXT NOT NULL DEFAULT 'none'
      CHECK (category IN ('work', 'study', 'life', 'none')),
    is_urgent INTEGER NOT NULL DEFAULT 0,
    reminded_60 INTEGER NOT NULL DEFAULT 0,
    reminded_30 INTEGER NOT NULL DEFAULT 0,
    briefed_at TEXT,
    notes TEXT,
    mood TEXT,
    repeat_type TEXT NOT NULL DEFAULT 'none'
      CHECK (repeat_type IN ('none', 'daily', 'weekly', 'monthly')),
    repeat_until TEXT,
    source TEXT NOT NULL DEFAULT 'discord'
      CHECK (source IN ('discord', 'web')),
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  )
`)

// 既有 DB migration（欄位新增用 try/catch 吞掉已存在錯誤）
try { db.exec(`ALTER TABLE events ADD COLUMN repeat_type TEXT NOT NULL DEFAULT 'none'`) } catch {}
try { db.exec(`ALTER TABLE events ADD COLUMN repeat_until TEXT`) } catch {}
try { db.exec(`ALTER TABLE events ADD COLUMN category TEXT NOT NULL DEFAULT 'none'`) } catch {}
try { db.exec(`ALTER TABLE events ADD COLUMN is_urgent INTEGER NOT NULL DEFAULT 0`) } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS reflections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,
    mood TEXT,
    text TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`)

db.exec(`
  CREATE TRIGGER IF NOT EXISTS update_events_timestamp
  AFTER UPDATE ON events
  BEGIN
    UPDATE events SET updated_at = datetime('now', 'localtime')
    WHERE id = NEW.id;
  END
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS discord_targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL DEFAULT '預設',
    server_id TEXT,
    channel_record TEXT,
    channel_reminder TEXT,
    channel_diary TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS channel_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type_key TEXT UNIQUE NOT NULL,
    prompt TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS discord_channel_maps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_id INTEGER NOT NULL,
    channel_type_id INTEGER NOT NULL,
    channel_id TEXT,
    channel_label TEXT,
    UNIQUE(target_id, channel_type_id)
  )
`)

const DEFAULT_PROMPTS = {
  record: `回覆時間一律用 24 小時制（14:30 不是「下午 2:30」）
事件分類：工作接案選 work，學校課業選 study，生活日常選 life，不確定選 none
有「緊急」「截止」「deadline」「一定要」等詞，is_urgent 設 1
回覆確認訊息簡潔，1-2 句話`,
  reminder: `解析「再提醒我 X 分鐘/小時」，回覆推遲後的新時間
若無法辨識時間，請用一句話引導使用者重新說明
回覆語氣輕鬆，不要太制式`,
  diary: `保留日記的情感細節，不要過度精簡
從內容自動判斷心情 emoji
以溫暖、不說教的語氣回應，1-2 句話`,
}

// 初始化預設頻道類型（含預設規則）
;(() => {
  const count = db.prepare('SELECT COUNT(*) as n FROM channel_types').get().n
  if (count === 0) {
    const stmt = db.prepare('INSERT INTO channel_types (name, type_key, prompt, sort_order) VALUES (?, ?, ?, ?)')
    stmt.run('記事頻道', 'record',   DEFAULT_PROMPTS.record,   0)
    stmt.run('提醒頻道', 'reminder', DEFAULT_PROMPTS.reminder, 1)
    stmt.run('日記頻道', 'diary',    DEFAULT_PROMPTS.diary,    2)
  } else {
    // 補填舊資料沒有 prompt 的情況
    const upd = db.prepare("UPDATE channel_types SET prompt = ? WHERE type_key = ? AND (prompt IS NULL OR prompt = '')")
    upd.run(DEFAULT_PROMPTS.record,   'record')
    upd.run(DEFAULT_PROMPTS.reminder, 'reminder')
    upd.run(DEFAULT_PROMPTS.diary,    'diary')
    // 舊 ai_extra_rules → record 頻道
    const oldRules = db.prepare("SELECT value FROM settings WHERE key = 'ai_extra_rules'").get()
    if (oldRules?.value?.trim()) {
      const rec = db.prepare("SELECT id, prompt FROM channel_types WHERE type_key = 'record'").get()
      if (rec && !rec.prompt?.includes(oldRules.value.trim())) {
        db.prepare('UPDATE channel_types SET prompt = ? WHERE type_key = ?')
          .run((rec.prompt || '') + '\n' + oldRules.value.trim(), 'record')
      }
    }
  }
})()

// 將舊 discord_targets 的 channel 欄位遷移到 channel_maps
;(() => {
  const targets = db.prepare('SELECT * FROM discord_targets').all()
  const getTypeId = (key) => db.prepare('SELECT id FROM channel_types WHERE type_key = ?').get(key)?.id
  const insertMap = db.prepare(`
    INSERT OR IGNORE INTO discord_channel_maps (target_id, channel_type_id, channel_id)
    VALUES (?, ?, ?)
  `)
  for (const t of targets) {
    const cols = { record: t.channel_record, reminder: t.channel_reminder, diary: t.channel_diary }
    for (const [key, chId] of Object.entries(cols)) {
      if (chId) {
        const typeId = getTypeId(key)
        if (typeId) insertMap.run(t.id, typeId, chId)
      }
    }
  }
})()

// === settings ===
export function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
  return row ? row.value : null
}

export function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value))
}

// === discord_targets CRUD ===
// auto-migrate old single-channel settings on first run
;(() => {
  const count = db.prepare('SELECT COUNT(*) as n FROM discord_targets').get().n
  if (count === 0) {
    const rec = getSetting('discord_channel_record')
    const rem = getSetting('discord_channel_reminder')
    const dia = getSetting('discord_channel_diary')
    if (rec || rem || dia) {
      const r = db.prepare('INSERT INTO discord_targets (label) VALUES (?)').run('預設')
      const id = r.lastInsertRowid
      const getTypeId = (key) => db.prepare('SELECT id FROM channel_types WHERE type_key = ?').get(key)?.id
      const ins = db.prepare('INSERT OR IGNORE INTO discord_channel_maps (target_id, channel_type_id, channel_id) VALUES (?, ?, ?)')
      if (rec) { const tid = getTypeId('record');   if (tid) ins.run(id, tid, rec) }
      if (rem) { const tid = getTypeId('reminder'); if (tid) ins.run(id, tid, rem) }
      if (dia) { const tid = getTypeId('diary');    if (tid) ins.run(id, tid, dia) }
    }
  }
})()

export function getDiscordTargets() {
  return db.prepare('SELECT * FROM discord_targets ORDER BY id ASC').all()
}

export function getDiscordTargetById(id) {
  return db.prepare('SELECT * FROM discord_targets WHERE id = ?').get(id)
}

export function upsertDiscordTarget(data) {
  if (data.id) {
    db.prepare('UPDATE discord_targets SET label=?, server_id=? WHERE id=?')
      .run(data.label || '預設', data.server_id || null, data.id)
    return getDiscordTargetById(data.id)
  }
  const r = db.prepare('INSERT INTO discord_targets (label, server_id) VALUES (?, ?)')
    .run(data.label || '預設', data.server_id || null)
  return getDiscordTargetById(r.lastInsertRowid)
}

export function deleteDiscordTarget(id) {
  db.prepare('DELETE FROM discord_channel_maps WHERE target_id = ?').run(id)
  return db.prepare('DELETE FROM discord_targets WHERE id = ?').run(id).changes > 0
}

// === channel_types CRUD ===
export function getChannelTypes() {
  return db.prepare('SELECT * FROM channel_types ORDER BY sort_order, id').all()
}

export function getChannelTypeByKey(typeKey) {
  return db.prepare('SELECT * FROM channel_types WHERE type_key = ?').get(typeKey)
}

export function upsertChannelType(data) {
  if (data.id) {
    db.prepare('UPDATE channel_types SET name=?, prompt=? WHERE id=?')
      .run(data.name || '頻道', data.prompt || null, data.id)
    return db.prepare('SELECT * FROM channel_types WHERE id=?').get(data.id)
  }
  const n = db.prepare('SELECT COUNT(*) as n FROM channel_types').get().n
  const typeKey = `custom_${Date.now()}`
  const r = db.prepare('INSERT INTO channel_types (name, type_key, prompt, sort_order) VALUES (?, ?, ?, ?)')
    .run(data.name || '新頻道', typeKey, data.prompt || null, n)
  return db.prepare('SELECT * FROM channel_types WHERE id=?').get(r.lastInsertRowid)
}

export function deleteChannelType(id) {
  db.prepare('DELETE FROM discord_channel_maps WHERE channel_type_id=?').run(id)
  return db.prepare('DELETE FROM channel_types WHERE id=?').run(id).changes > 0
}

// === discord_channel_maps ===
export function getDiscordChannelMaps(targetId) {
  return db.prepare(`
    SELECT m.id, m.target_id, m.channel_type_id, m.channel_id, m.channel_label,
           ct.name as type_name, ct.type_key
    FROM discord_channel_maps m
    JOIN channel_types ct ON ct.id = m.channel_type_id
    WHERE m.target_id = ?
    ORDER BY ct.sort_order, ct.id
  `).all(targetId)
}

export function upsertDiscordChannelMap(targetId, channelTypeId, channelId, channelLabel) {
  db.prepare(`
    INSERT INTO discord_channel_maps (target_id, channel_type_id, channel_id, channel_label)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(target_id, channel_type_id)
    DO UPDATE SET channel_id = excluded.channel_id, channel_label = excluded.channel_label
  `).run(targetId, channelTypeId, channelId || null, channelLabel || null)
}

// 從 Discord 頻道 ID 反查頻道類型（給 bot 路由用）
export function findChannelType(discordChannelId) {
  return db.prepare(`
    SELECT ct.*
    FROM discord_channel_maps m
    JOIN channel_types ct ON ct.id = m.channel_type_id
    WHERE m.channel_id = ?
    LIMIT 1
  `).get(discordChannelId)
}

// === events CRUD ===
const insertStmt = db.prepare(`
  INSERT INTO events (title, description, start_time, end_time, raw_text, source, category, is_urgent, repeat_type, repeat_until)
  VALUES (@title, @description, @start_time, @end_time, @raw_text, @source, @category, @is_urgent, @repeat_type, @repeat_until)
`)

export function insertEvent(data) {
  const result = insertStmt.run({
    title: data.title,
    description: data.description || null,
    start_time: data.start_time || null,
    end_time: data.end_time || null,
    raw_text: data.raw_text || null,
    source: data.source || 'discord',
    category: data.category || 'none',
    is_urgent: data.is_urgent ? 1 : 0,
    repeat_type: data.repeat_type || 'none',
    repeat_until: data.repeat_until || null,
  })
  return getEvent(result.lastInsertRowid)
}

export function getEvent(id) {
  return db.prepare('SELECT * FROM events WHERE id = ?').get(id)
}

export function updateEvent(id, data) {
  const existing = getEvent(id)
  if (!existing) return null

  const allowed = [
    'title', 'description', 'start_time', 'end_time',
    'status', 'notes', 'mood', 'category', 'is_urgent',
    'reminded_60', 'reminded_30', 'briefed_at',
    'repeat_type', 'repeat_until',
  ]
  const fields = []
  const values = { id }
  for (const k of allowed) {
    if (data[k] !== undefined) {
      fields.push(`${k} = @${k}`)
      values[k] = data[k]
    }
  }
  if (fields.length === 0) return existing
  db.prepare(`UPDATE events SET ${fields.join(', ')} WHERE id = @id`).run(values)
  return getEvent(id)
}

export function deleteEvent(id) {
  return db.prepare('DELETE FROM events WHERE id = ?').run(id).changes > 0
}

// === 查詢：含重複事件展開 ===

function expandEvent(ev, rangeStart, rangeEnd) {
  if (!ev.start_time) return [ev]
  if (!ev.repeat_type || ev.repeat_type === 'none') return [ev]

  const base = new Date(ev.start_time)
  const dur = ev.end_time ? new Date(ev.end_time).getTime() - base.getTime() : 0
  const until = ev.repeat_until ? new Date(ev.repeat_until) : rangeEnd
  const occurrences = []
  let cur = new Date(base)
  const hardLimit = 400

  for (let i = 0; i < hardLimit; i++) {
    if (cur > until || cur > rangeEnd) break
    if (cur >= rangeStart) {
      occurrences.push({
        ...ev,
        id: i === 0 ? ev.id : `${ev.id}@${cur.toISOString().slice(0, 10)}`,
        start_time: cur.toISOString(),
        end_time: ev.end_time ? new Date(cur.getTime() + dur).toISOString() : null,
        _parent_id: ev.id,
        _is_occurrence: i > 0,
      })
    }
    switch (ev.repeat_type) {
      case 'daily':   cur.setDate(cur.getDate() + 1); break
      case 'weekly':  cur.setDate(cur.getDate() + 7); break
      case 'monthly': cur.setMonth(cur.getMonth() + 1); break
      default: return occurrences
    }
  }
  return occurrences
}

export function getExpandedEvents(rangeStart, rangeEnd) {
  const rows = db.prepare('SELECT * FROM events').all()
  const out = []
  for (const r of rows) out.push(...expandEvent(r, rangeStart, rangeEnd))
  out.sort((a, b) => {
    if (!a.start_time && !b.start_time) return 0
    if (!a.start_time) return 1
    if (!b.start_time) return -1
    return a.start_time.localeCompare(b.start_time)
  })
  return out
}

export function getEventsByDay(dateStr, category = null) {
  const start = new Date(`${dateStr}T00:00:00+08:00`)
  const end = new Date(`${dateStr}T23:59:59+08:00`)
  let timedExpanded = getExpandedEvents(start, end).filter(e => {
    if (!e.start_time) return false
    const d = new Date(e.start_time).toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
    return d === dateStr
  })
  let untimed = db.prepare(`
    SELECT * FROM events WHERE start_time IS NULL
      AND date(created_at, 'localtime') = ?
  `).all(dateStr)

  if (category && category !== 'all') {
    timedExpanded = timedExpanded.filter(e => e.category === category)
    untimed = untimed.filter(e => e.category === category)
  }
  return [...timedExpanded, ...untimed]
}

export function getTodayEvents() {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
  return getEventsByDay(today)
}

export function getTomorrowEvents() {
  const now = new Date()
  const todayStr = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
  const [y, m, d] = todayStr.split('-').map(Number)
  const next = new Date(y, m - 1, d + 1)
  const tomorrow = next.toLocaleDateString('sv-SE')
  return getEventsByDay(tomorrow)
}

export function getRecentEvents(days = 30) {
  const end = new Date(); end.setDate(end.getDate() + days)
  const start = new Date(); start.setDate(start.getDate() - days)
  const timed = getExpandedEvents(start, end).filter(e => e.start_time)
  const untimed = db.prepare(`
    SELECT * FROM events WHERE start_time IS NULL
      AND date(created_at, 'localtime') >= date('now', 'localtime', '-' || ? || ' days')
  `).all(days)
  return [...timed, ...untimed]
}

// 收件匣：所有無時間的 pending 事件
export function getInboxEvents() {
  return db.prepare(`
    SELECT * FROM events
    WHERE start_time IS NULL AND status = 'pending'
    ORDER BY created_at DESC
  `).all()
}

export function searchEvents(query, limit = 100) {
  const q = `%${query}%`
  return db.prepare(`
    SELECT * FROM events
    WHERE title LIKE ? OR description LIKE ? OR notes LIKE ? OR raw_text LIKE ?
    ORDER BY
      CASE WHEN start_time IS NULL THEN 1 ELSE 0 END,
      COALESCE(start_time, created_at) DESC
    LIMIT ?
  `).all(q, q, q, q, limit)
}

export function getEventsForAIContext() {
  const start = new Date(); start.setDate(start.getDate() - 3)
  const end = new Date(); end.setDate(end.getDate() + 7)
  const all = getExpandedEvents(start, end).filter(e => e.start_time && e.status !== 'done')
  return all.slice(0, 30)
}

// 有時間但尚未提醒的「即將發生」事件
export function getPendingReminders() {
  const now = new Date()
  const soon = new Date(now.getTime() + 65 * 60 * 1000)
  const expanded = getExpandedEvents(now, soon)
  const pending = []
  for (const ev of expanded) {
    if (ev._is_occurrence) continue
    if (ev.status !== 'pending') continue
    if (ev.reminded_60 && ev.reminded_30) continue
    pending.push(ev)
  }
  return pending
}

export function markOverdueMissed() {
  return db.prepare(`
    UPDATE events SET status = 'missed'
    WHERE status = 'pending'
      AND start_time IS NOT NULL
      AND (repeat_type IS NULL OR repeat_type = 'none')
      AND datetime(start_time) < datetime('now', '-10 minutes')
  `).run().changes
}

// === reflections ===
export function upsertReflection(dateStr, { mood, text }) {
  const existing = db.prepare('SELECT * FROM reflections WHERE date = ?').get(dateStr)
  if (existing) {
    const m = mood !== undefined ? mood : existing.mood
    const t = text !== undefined ? text : existing.text
    db.prepare('UPDATE reflections SET mood = ?, text = ? WHERE date = ?').run(m, t, dateStr)
  } else {
    db.prepare('INSERT INTO reflections (date, mood, text) VALUES (?, ?, ?)')
      .run(dateStr, mood || null, text || null)
  }
  return db.prepare('SELECT * FROM reflections WHERE date = ?').get(dateStr)
}

export function getReflection(dateStr) {
  return db.prepare('SELECT * FROM reflections WHERE date = ?').get(dateStr)
}

export function getReflectionsByRange(startDate, endDate) {
  return db.prepare(`
    SELECT * FROM reflections
    WHERE date BETWEEN ? AND ?
    ORDER BY date ASC
  `).all(startDate, endDate)
}

export function getStatsByRange(startDate, endDate) {
  return db.prepare(`
    SELECT
      status,
      COUNT(*) as count
    FROM events
    WHERE start_time IS NOT NULL
      AND (repeat_type IS NULL OR repeat_type = 'none')
      AND date(start_time, 'localtime') BETWEEN ? AND ?
    GROUP BY status
  `).all(startDate, endDate)
}

export function getEventsByStatusInRange(status, startDate, endDate) {
  return db.prepare(`
    SELECT * FROM events
    WHERE status = ?
      AND start_time IS NOT NULL
      AND (repeat_type IS NULL OR repeat_type = 'none')
      AND date(start_time, 'localtime') BETWEEN ? AND ?
    ORDER BY start_time ASC
  `).all(status, startDate, endDate)
}

export default db
