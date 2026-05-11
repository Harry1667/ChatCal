// app.js — 手帳前端
const TZ = 'Asia/Taipei'
const API_KEY = localStorage.getItem('chatcal_api_key') || ''

const state = {
  currentDate: todayStr(),
  calMonth: new Date(),
  eventsByDay: new Map(),
  reflectionsByDay: new Map(),
  editingId: null,
}

// === 時間 ===
function todayStr() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: TZ })
}
function toDayStr(iso) {
  return new Date(iso).toLocaleDateString('sv-SE', { timeZone: TZ })
}
function shiftDay(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return dt.toLocaleDateString('sv-SE')
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('zh-TW', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

// === API ===
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (API_KEY) headers['x-api-key'] = API_KEY
  const res = await fetch(path, { ...options, headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '網路錯誤' }))
    throw new Error(err.error || '未知錯誤')
  }
  return res.json()
}

async function loadEvents() {
  const list = await api('/api/events/recent?days=60')
  state.eventsByDay.clear()
  for (const ev of list) {
    const key = ev.start_time ? toDayStr(ev.start_time) : toDayStr(ev.created_at)
    if (!state.eventsByDay.has(key)) state.eventsByDay.set(key, [])
    state.eventsByDay.get(key).push(ev)
  }
  renderCalendar()
  renderTimeline()
  renderUpcoming()
}

async function loadReflections() {
  const end = new Date(); end.setDate(end.getDate() + 30)
  const start = new Date(); start.setDate(start.getDate() - 60)
  const from = start.toLocaleDateString('sv-SE', { timeZone: TZ })
  const to = end.toLocaleDateString('sv-SE', { timeZone: TZ })
  try {
    const list = await api(`/api/reflections?from=${from}&to=${to}`)
    state.reflectionsByDay.clear()
    for (const r of list) state.reflectionsByDay.set(r.date, r)
    renderCalendar()
    renderReflectionCard()
  } catch {}
}

// === 今日紙籤 ===
function renderTodayChip() {
  const d = new Date()
  document.getElementById('todayChip').textContent =
    d.toLocaleDateString('zh-TW', {
      timeZone: TZ, year: 'numeric', month: 'long', day: 'numeric',
    })
}

// === 月曆 ===
function renderCalendar() {
  const base = state.calMonth
  const y = base.getFullYear()
  const m = base.getMonth()
  document.getElementById('calTitle').textContent =
    `${y} 年 ${String(m + 1).padStart(2, '0')} 月`

  const firstWeekday = new Date(y, m, 1).getDay()
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const daysInPrev = new Date(y, m, 0).getDate()

  const grid = document.getElementById('calGrid')
  grid.innerHTML = ''
  const today = todayStr()

  for (let i = firstWeekday - 1; i >= 0; i--) {
    const d = daysInPrev - i
    const dateStr = formatDate(y, m - 1 < 0 ? 11 : m - 1, d, m - 1 < 0 ? y - 1 : y)
    grid.appendChild(makeCell(d, dateStr, true))
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = formatDate(y, m, d)
    const cell = makeCell(d, dateStr, false)
    if (dateStr === today) cell.classList.add('today')
    if (dateStr === state.currentDate) cell.classList.add('selected')
    grid.appendChild(cell)
  }
  const used = firstWeekday + daysInMonth
  const rest = (7 - (used % 7)) % 7
  for (let d = 1; d <= rest; d++) {
    const dateStr = formatDate(y, m + 1 > 11 ? 0 : m + 1, d, m + 1 > 11 ? y + 1 : y)
    grid.appendChild(makeCell(d, dateStr, true))
  }
}

function formatDate(y, m, d, yOverride) {
  const yr = yOverride !== undefined ? yOverride : y
  return `${yr}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function makeCell(num, dateStr, out) {
  const el = document.createElement('div')
  el.className = 'cal-cell' + (out ? ' out' : '')
  const numEl = document.createElement('span')
  numEl.className = 'cal-num'
  numEl.textContent = num
  el.appendChild(numEl)

  const evCount = state.eventsByDay.has(dateStr) ? state.eventsByDay.get(dateStr).length : 0
  if (evCount > 0) el.classList.add('has-event')

  const refl = state.reflectionsByDay.get(dateStr)
  if (refl && refl.mood) {
    const moodEl = document.createElement('span')
    moodEl.className = 'cal-mood'
    moodEl.textContent = refl.mood
    el.appendChild(moodEl)
  }

  el.addEventListener('click', () => {
    state.currentDate = dateStr
    state.calMonth = new Date(dateStr + 'T00:00:00')
    renderCalendar()
    renderTimeline()
    renderReflectionCard()
  })
  return el
}

// === 當天時間軸 ===
function renderTimeline() {
  const [y, m, d] = state.currentDate.split('-').map(Number)
  const dt = new Date(y, m - 1, d)

  document.getElementById('dayNumber').textContent = d
  document.getElementById('dayMonth').textContent = `${y} · ${String(m).padStart(2, '0')} 月`
  document.getElementById('dayWeekday').textContent =
    dt.toLocaleDateString('en-US', { weekday: 'long' })

  const tl = document.getElementById('timeline')
  tl.innerHTML = ''

  // 從 API 拿這天（含重複展開）
  fetch(`/api/events?day=${state.currentDate}`, {
    headers: API_KEY ? { 'x-api-key': API_KEY } : {},
  }).then(r => r.json()).then(events => {
    if (events.length === 0) {
      tl.innerHTML = `
        <div class="empty-state">
          <div class="empty-quill">✒︎</div>
          <div>這天手帳還空著。</div>
        </div>`
      return
    }

    for (const ev of events) {
      const row = document.createElement('div')
      row.className = 'entry ' + (ev.status || 'pending')
      row.addEventListener('click', () => openModal(ev))

      const timeEl = document.createElement('div')
      if (ev.start_time) {
        timeEl.className = 'entry-time'
        timeEl.innerHTML = fmtTime(ev.start_time)
        if (ev.end_time) timeEl.innerHTML += `<span class="dash">↳ ${fmtTime(ev.end_time)}</span>`
      } else {
        timeEl.className = 'entry-time untimed'
        timeEl.textContent = '—'
      }

      const body = document.createElement('div')
      body.className = 'entry-body'
      const title = document.createElement('div')
      title.className = 'entry-title'
      title.textContent = ev.title
      if (ev.repeat_type && ev.repeat_type !== 'none') {
        title.innerHTML += ' <span class="repeat-chip">🔁</span>'
      }
      if (ev.status === 'done') title.innerHTML += '<span class="entry-status-chip">完成</span>'
      else if (ev.status === 'missed') title.innerHTML += '<span class="entry-status-chip">錯過</span>'
      body.appendChild(title)

      if (ev.description) {
        const dd = document.createElement('div')
        dd.className = 'entry-desc'
        dd.textContent = ev.description
        body.appendChild(dd)
      }
      if (ev.notes) {
        const n = document.createElement('div')
        n.className = 'entry-notes'
        n.textContent = ev.notes
        body.appendChild(n)
      }

      row.appendChild(timeEl)
      row.appendChild(body)
      tl.appendChild(row)
    }
  }).catch(err => {
    tl.innerHTML = `<div class="empty-state">載入失敗：${err.message}</div>`
  })
}

// === 近日 ===
function renderUpcoming() {
  const list = document.getElementById('upcomingList')
  const today = todayStr()
  const rows = []

  for (const [day, evs] of state.eventsByDay.entries()) {
    if (day < today) continue
    for (const ev of evs) {
      if (!ev.start_time) continue
      if (ev.status === 'done') continue
      rows.push({ day, ev })
    }
  }
  rows.sort((a, b) => (a.ev.start_time || '').localeCompare(b.ev.start_time || ''))
  const top = rows.slice(0, 8)

  if (top.length === 0) {
    list.innerHTML = '<li class="muted">近期沒有排定</li>'
    return
  }

  list.innerHTML = ''
  for (const { day, ev } of top) {
    const li = document.createElement('li')
    const [Y, M, D] = day.split('-')
    const label = day === today ? '今日' : `${Number(M)}/${Number(D)}`
    li.innerHTML = `<span class="u-date">${label}</span> ${fmtTime(ev.start_time)} — ${esc(ev.title)}`
    li.addEventListener('click', () => {
      state.currentDate = day
      state.calMonth = new Date(day + 'T00:00:00')
      renderCalendar()
      renderTimeline()
      renderReflectionCard()
    })
    list.appendChild(li)
  }
}

// === 反思卡 ===
function renderReflectionCard() {
  const refl = state.reflectionsByDay.get(state.currentDate)
  document.getElementById('reflectionText').value = refl?.text || ''
  document.getElementById('reflectionMood').textContent = refl?.mood || ''
}

async function saveReflection() {
  const text = document.getElementById('reflectionText').value.trim()
  const mood = document.getElementById('reflectionMood').textContent || null
  try {
    const saved = await api(`/api/reflections/${state.currentDate}`, {
      method: 'PUT',
      body: JSON.stringify({ mood, text }),
    })
    state.reflectionsByDay.set(state.currentDate, saved)
    renderCalendar()
    toast('反思已記下')
  } catch (err) {
    toast('存反思失敗：' + err.message)
  }
}

// === 搜尋 ===
let searchTimer = null
async function runSearch() {
  const q = document.getElementById('searchInput').value.trim()
  const box = document.getElementById('searchResults')
  if (!q) { box.hidden = true; box.innerHTML = ''; return }
  try {
    const hits = await api(`/api/events/search?q=${encodeURIComponent(q)}`)
    if (hits.length === 0) {
      box.innerHTML = '<div class="search-empty">沒找到</div>'
    } else {
      box.innerHTML = hits.map(ev => {
        const t = ev.start_time
          ? new Date(ev.start_time).toLocaleDateString('zh-TW', {
              timeZone: TZ, month: 'numeric', day: 'numeric',
            }) + ' ' + fmtTime(ev.start_time)
          : '未定'
        return `<div class="search-hit" data-id="${ev.id}" data-day="${ev.start_time ? toDayStr(ev.start_time) : toDayStr(ev.created_at)}">
          <div class="search-hit-title">${esc(ev.title)}</div>
          <div class="search-hit-meta">${esc(t)}</div>
        </div>`
      }).join('')
      box.querySelectorAll('.search-hit').forEach(el => {
        el.addEventListener('click', () => {
          const day = el.dataset.day
          state.currentDate = day
          state.calMonth = new Date(day + 'T00:00:00')
          renderCalendar()
          renderTimeline()
          renderReflectionCard()
          box.hidden = true
          document.getElementById('searchInput').value = ''
        })
      })
    }
    box.hidden = false
  } catch (err) {
    box.innerHTML = `<div class="search-empty">錯誤：${esc(err.message)}</div>`
    box.hidden = false
  }
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]))
}

// === 快速輸入 ===
async function submitQuick() {
  const input = document.getElementById('quickInput')
  const btn = document.getElementById('quickSubmit')
  const text = input.value.trim()
  if (!text) return

  btn.disabled = true
  btn.textContent = '思考中…'
  try {
    const res = await api('/api/events', {
      method: 'POST',
      body: JSON.stringify({ text }),
    })
    if (res.chat) {
      toast(res.reply || '—')
    } else if (res.reflect) {
      input.value = ''
      toast('反思已記下')
      await loadReflections()
    } else {
      input.value = ''
      toast(res.reply || '已寫入手帳')
      if (res.event?.start_time) {
        const d = toDayStr(res.event.start_time)
        state.currentDate = d
        state.calMonth = new Date(d + 'T00:00:00')
      }
      await loadEvents()
      if (res.event?.start_time) renderCalendar()
    }
  } catch (err) {
    toast('失敗：' + err.message)
  } finally {
    btn.disabled = false
    btn.textContent = '寫入'
  }
}

// === modal ===
function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fromLocalInput(str) {
  if (!str) return null
  return new Date(str).toISOString()
}

function openModal(ev) {
  // 重複事件的 occurrence id 是字串 — 編輯時對 parent 開
  const realId = ev._parent_id || ev.id
  state.editingId = realId
  document.getElementById('modalTitle').textContent = `#${realId} · 編輯`
  document.getElementById('editTitle').value = ev.title || ''
  document.getElementById('editStart').value = toLocalInput(ev.start_time)
  document.getElementById('editEnd').value = toLocalInput(ev.end_time)
  document.getElementById('editRepeat').value = ev.repeat_type || 'none'
  document.getElementById('editDescription').value = ev.description || ''
  document.getElementById('editNotes').value = ev.notes || ''
  document.getElementById('editStatus').value = ev.status || 'pending'
  document.getElementById('modalBackdrop').hidden = false
}

function closeModal() {
  state.editingId = null
  document.getElementById('modalBackdrop').hidden = true
}

async function saveEdit() {
  if (!state.editingId) return
  const body = {
    title: document.getElementById('editTitle').value.trim(),
    start_time: fromLocalInput(document.getElementById('editStart').value),
    end_time: fromLocalInput(document.getElementById('editEnd').value),
    repeat_type: document.getElementById('editRepeat').value,
    description: document.getElementById('editDescription').value.trim() || null,
    notes: document.getElementById('editNotes').value.trim() || null,
    status: document.getElementById('editStatus').value,
  }
  try {
    await api(`/api/events/${state.editingId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    toast('已儲存')
    closeModal()
    await loadEvents()
  } catch (err) {
    toast('儲存失敗：' + err.message)
  }
}

async function deleteEvt() {
  if (!state.editingId) return
  if (!confirm('確定要刪掉這條嗎？')) return
  try {
    await api(`/api/events/${state.editingId}`, { method: 'DELETE' })
    toast('已刪除')
    closeModal()
    await loadEvents()
  } catch (err) {
    toast('刪除失敗：' + err.message)
  }
}

// === 深色模式 ===
function applyDarkMode(on) {
  document.documentElement.setAttribute('data-theme', on ? 'dark' : '')
  document.getElementById('darkModeToggle').checked = !!on
  localStorage.setItem('chatcal_dark', on ? '1' : '')
}

// === 設定 Modal ===
let settingsAutoSaveTimer = null
function debounceAutoSave(key, value) {
  clearTimeout(settingsAutoSaveTimer)
  settingsAutoSaveTimer = setTimeout(() => {
    api('/api/settings', { method: 'PUT', body: JSON.stringify({ [key]: value }) }).catch(() => {})
  }, 600)
}

function openSettings() { document.getElementById('settingsOverlay').hidden = false }
function closeSettings() { document.getElementById('settingsOverlay').hidden = true }

async function loadSettings() {
  try {
    const s = await api('/api/settings')
    document.getElementById('briefHour').value    = s.brief_hour    || '8'
    document.getElementById('briefMinute').value  = s.brief_minute  || '0'
    document.getElementById('reflectHour').value  = s.reflect_hour  || '22'
    document.getElementById('reflectMinute').value= s.reflect_minute|| '0'
    document.getElementById('weeklyHour').value   = s.weekly_hour   || '21'
    document.getElementById('weeklyMinute').value = s.weekly_minute || '0'
    document.getElementById('reminderEnabled').checked = s.reminder_enabled !== 'false'
    document.getElementById('reflectEnabled').checked  = s.reflect_enabled  !== 'false'
    document.getElementById('weeklyEnabled').checked   = s.weekly_enabled   !== 'false'
  } catch {}
}

// === AI 交流設定 ===
let _channelTypes = []

async function loadAITalkTab() {
  try {
    const [types, servers] = await Promise.all([
      api('/api/channel-types'),
      api('/api/discord-targets'),
    ])
    _channelTypes = types
    renderChannelTypes(types)
    renderDiscordServers(servers, types)
  } catch {}
}

function renderChannelTypes(types) {
  const container = document.getElementById('channelTypesList')
  container.innerHTML = ''
  const fixedKeys = ['record', 'reminder', 'diary']
  for (const t of types) {
    const card = document.createElement('div')
    card.className = 'ct-card'
    const isFixed = fixedKeys.includes(t.type_key)
    card.innerHTML = `
      <div class="ct-head">
        <input class="ct-name" value="${esc(t.name)}" placeholder="頻道名稱" ${isFixed ? 'readonly' : ''} />
        ${isFixed ? '' : `<button class="ct-del-btn" title="刪除此頻道類型">✕</button>`}
      </div>
      <textarea class="ct-prompt" rows="4" placeholder="AI 規則，每行一條（留空使用預設）…">${esc(t.prompt || '')}</textarea>
      <div class="ct-status"></div>
    `
    container.appendChild(card)

    const saveType = async () => {
      const name = card.querySelector('.ct-name').value.trim()
      const prompt = card.querySelector('.ct-prompt').value
      const st = card.querySelector('.ct-status')
      try {
        await api(`/api/channel-types/${t.id}`, {
          method: 'PUT', body: JSON.stringify({ name, prompt }),
        })
        st.textContent = '已儲存'; setTimeout(() => { st.textContent = '' }, 1500)
      } catch { st.textContent = '儲存失敗' }
    }
    card.querySelector('.ct-name').addEventListener('blur', saveType)
    card.querySelector('.ct-prompt').addEventListener('blur', saveType)
    if (!isFixed) {
      card.querySelector('.ct-del-btn').addEventListener('click', async () => {
        if (!confirm(`刪除「${t.name}」頻道類型？相關 Discord 頻道設定也會一起刪除。`)) return
        await api(`/api/channel-types/${t.id}`, { method: 'DELETE' })
        loadAITalkTab()
      })
    }
  }
}

function renderDiscordServers(servers, types) {
  const container = document.getElementById('discordServersList')
  container.innerHTML = ''
  for (const s of servers) container.appendChild(makeServerCard(s, types))
}

function makeServerCard(s, types) {
  const card = document.createElement('div')
  card.className = 'ds-card'

  const labelEl = document.createElement('div')
  labelEl.className = 'ds-card-label'
  labelEl.textContent = s.label || '未命名'

  const delBtn = document.createElement('button')
  delBtn.className = 'target-del'
  delBtn.textContent = '🗑'
  delBtn.onclick = async () => {
    if (!confirm(`刪除「${s.label || '此伺服器'}」？`)) return
    await api(`/api/discord-targets/${s.id}`, { method: 'DELETE' })
    loadAITalkTab()
  }

  const hd = document.createElement('div')
  hd.className = 'ds-card-hd'
  hd.appendChild(labelEl); hd.appendChild(delBtn)

  const body = document.createElement('div')
  body.className = 'ds-card-body'

  const mkField = (label, key, val) => {
    const row = document.createElement('div')
    row.className = 'ds-field'
    row.innerHTML = `<label>${label}</label>`
    const inp = document.createElement('input')
    inp.type = 'text'
    inp.placeholder = label
    inp.value = val || ''
    inp.dataset.key = key
    inp.addEventListener('blur', async () => {
      const data = {}
      body.querySelectorAll('input[data-key]').forEach(i => { data[i.dataset.key] = i.value.trim() || null })
      if (data.label) labelEl.textContent = data.label
      await api(`/api/discord-targets/${s.id}`, { method: 'PUT', body: JSON.stringify(data) }).catch(() => {})
    })
    row.appendChild(inp)
    return row
  }

  body.appendChild(mkField('伺服器名稱', 'label', s.label))
  body.appendChild(mkField('伺服器 ID', 'server_id', s.server_id))

  // 頻道 ID 欄位 — 根據 channel_types 動態產生
  const chDiv = document.createElement('div')
  chDiv.className = 'ds-channels'
  const chTitle = document.createElement('div')
  chTitle.className = 'ds-channels-title'
  chTitle.textContent = '頻道設定'
  chDiv.appendChild(chTitle)

  for (const ct of types) {
    const existing = (s.channels || []).find(c => c.channel_type_id === ct.id)
    const row = document.createElement('div')
    row.className = 'ds-field'
    row.innerHTML = `<label>${ct.name}</label>`
    const inp = document.createElement('input')
    inp.type = 'text'
    inp.placeholder = `${ct.name} ID`
    inp.value = existing?.channel_id || ''
    inp.addEventListener('blur', async () => {
      await api(`/api/discord-targets/${s.id}/channels`, {
        method: 'PUT',
        body: JSON.stringify([{ channel_type_id: ct.id, channel_id: inp.value.trim() || null }]),
      }).catch(() => {})
    })
    row.appendChild(inp)
    chDiv.appendChild(row)
  }

  body.appendChild(chDiv)
  card.appendChild(hd)
  card.appendChild(body)
  return card
}

// === 鎖定畫面 ===
async function initLockScreen() {
  const dark = localStorage.getItem('chatcal_dark')
  if (dark) applyDarkMode(true)

  try {
    const { hasPassword } = await fetch('/api/auth').then(r => r.json())
    if (!hasPassword) return
    const unlocked = sessionStorage.getItem('chatcal_unlocked')
    if (unlocked) return
    document.getElementById('lockScreen').hidden = false
  } catch {}
}

async function tryUnlock() {
  const pwd = document.getElementById('lockPwd').value
  const err = document.getElementById('lockErr')
  try {
    const { ok } = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd }),
    }).then(r => r.json())
    if (ok) {
      sessionStorage.setItem('chatcal_unlocked', '1')
      document.getElementById('lockScreen').hidden = true
      err.textContent = ''
    } else {
      err.textContent = '密碼錯誤'
      document.getElementById('lockPwd').value = ''
    }
  } catch {
    err.textContent = '無法連線'
  }
}

// === toast ===
let toastTimer = null
function toast(msg) {
  const el = document.getElementById('toast')
  el.textContent = msg
  el.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { el.hidden = true }, 2200)
}

// === 綁事件 ===
document.getElementById('prevMonth').onclick = () => {
  state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() - 1, 1)
  renderCalendar()
}
document.getElementById('nextMonth').onclick = () => {
  state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + 1, 1)
  renderCalendar()
}

document.getElementById('prevDay').onclick = () => {
  state.currentDate = shiftDay(state.currentDate, -1)
  state.calMonth = new Date(state.currentDate + 'T00:00:00')
  renderCalendar()
  renderTimeline()
  renderReflectionCard()
}
document.getElementById('nextDay').onclick = () => {
  state.currentDate = shiftDay(state.currentDate, 1)
  state.calMonth = new Date(state.currentDate + 'T00:00:00')
  renderCalendar()
  renderTimeline()
  renderReflectionCard()
}
document.getElementById('goToday').onclick = () => {
  state.currentDate = todayStr()
  state.calMonth = new Date()
  renderCalendar()
  renderTimeline()
  renderReflectionCard()
}

document.getElementById('quickSubmit').onclick = submitQuick
document.getElementById('quickInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') submitQuick()
})

document.getElementById('modalClose').onclick = closeModal
document.getElementById('btnCancel').onclick = closeModal
document.getElementById('btnSave').onclick = saveEdit
document.getElementById('btnDelete').onclick = deleteEvt
document.getElementById('modalBackdrop').addEventListener('click', e => {
  if (e.target.id === 'modalBackdrop') closeModal()
})

// Settings modal
document.getElementById('settingsBtn').onclick = openSettings
document.getElementById('settingsClose').onclick = closeSettings
document.getElementById('settingsOverlay').addEventListener('click', e => {
  if (e.target.id === 'settingsOverlay') closeSettings()
})

// Tab switching
document.querySelectorAll('.stab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'))
    document.querySelectorAll('.stab-content').forEach(c => c.classList.remove('active'))
    btn.classList.add('active')
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active')
    if (btn.dataset.tab === 'aitalk') loadAITalkTab()
  })
})

// Dark mode
document.getElementById('darkModeToggle').addEventListener('change', e => {
  applyDarkMode(e.target.checked)
  api('/api/settings', { method: 'PUT', body: JSON.stringify({ web_dark_mode: e.target.checked ? 'true' : 'false' }) }).catch(() => {})
})

// Auto-save time settings
;['briefHour','briefMinute','reflectHour','reflectMinute','weeklyHour','weeklyMinute'].forEach(id => {
  const key = id.replace(/([A-Z])/g, '_$1').toLowerCase()
  document.getElementById(id).addEventListener('change', e => debounceAutoSave(key, e.target.value))
})
;['reminderEnabled','reflectEnabled','weeklyEnabled'].forEach(id => {
  const key = id.replace(/([A-Z])/g, '_$1').toLowerCase()
  document.getElementById(id).addEventListener('change', e => {
    api('/api/settings', { method: 'PUT', body: JSON.stringify({ [key]: e.target.checked ? 'true' : 'false' }) }).catch(() => {})
  })
})

// AI交流設定 buttons
document.getElementById('addChannelTypeBtn').addEventListener('click', async () => {
  await api('/api/channel-types', { method: 'POST', body: JSON.stringify({ name: '新頻道' }) })
  loadAITalkTab()
})
document.getElementById('addServerBtn').addEventListener('click', async () => {
  await api('/api/discord-targets', { method: 'POST', body: JSON.stringify({ label: '新伺服器' }) })
  loadAITalkTab()
})

// Password
document.getElementById('savePassword').onclick = async () => {
  const pwd = document.getElementById('newPassword').value
  const status = document.getElementById('pwdStatus')
  try {
    await api('/api/settings', { method: 'PUT', body: JSON.stringify({ web_password: pwd }) })
    document.getElementById('newPassword').value = ''
    if (pwd) {
      sessionStorage.removeItem('chatcal_unlocked')
      status.textContent = '密碼已設定，請重新整理頁面後輸入密碼'
      setTimeout(() => location.reload(), 1500)
    } else {
      sessionStorage.setItem('chatcal_unlocked', '1')
      status.textContent = '密碼已清除'
      setTimeout(() => { status.textContent = '' }, 2000)
    }
  } catch (err) { status.textContent = '失敗：' + err.message }
}

// Lock screen
document.getElementById('lockBtn').onclick = tryUnlock
document.getElementById('lockPwd').addEventListener('keydown', e => {
  if (e.key === 'Enter') tryUnlock()
})

document.getElementById('saveReflection').onclick = saveReflection
document.getElementById('moodPicker').addEventListener('click', e => {
  const mood = e.target.dataset.mood
  if (!mood) return
  document.getElementById('reflectionMood').textContent = mood
})

document.getElementById('searchInput').addEventListener('input', () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(runSearch, 250)
})
document.getElementById('searchInput').addEventListener('blur', () => {
  setTimeout(() => { document.getElementById('searchResults').hidden = true }, 200)
})
document.getElementById('searchInput').addEventListener('focus', () => {
  if (document.getElementById('searchInput').value.trim()) runSearch()
})

// === 啟動 ===
applyDarkMode(localStorage.getItem('chatcal_dark') === '1')
initLockScreen()
renderTodayChip()
loadEvents().catch(err => toast('載入失敗：' + err.message))
loadReflections()
loadSettings()

setInterval(() => {
  loadEvents().catch(() => {})
  loadReflections()
}, 30_000)
