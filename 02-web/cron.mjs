// cron.mjs — 手帳定時任務
//
// 每天 08:00（可設定）：早報（今日概覽）→ Embed 金黃色
// 每天 22:00（可設定）：晚報（明日預告 + 反思邀請）→ Embed 靛藍色
// 週日 21:00（可設定）：週回顧
// 每分鐘：掃事件前 60 / 30 分鐘提醒
//   - is_urgent = 1：60分 + 30分 雙重提醒
//   - is_urgent = 0：只有 30分 提醒
// 每 10 分鐘：過期 pending → missed
//
import 'dotenv/config'
import cron from 'node-cron'
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'
import {
  getTodayEvents, getTomorrowEvents,
  getPendingReminders, updateEvent, markOverdueMissed,
  getSetting,
  getEventsByStatusInRange, getReflectionsByRange,
} from './db.mjs'
import { writeWeeklyReview, generateReflectionPrompt } from './ai.mjs'

const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID

const DEFAULTS = {
  brief_hour: '8',
  brief_minute: '0',
  reflect_hour: '22',
  reflect_minute: '0',
  weekly_hour: '21',
  weekly_minute: '0',
  reminder_enabled: 'true',
  reflect_enabled: 'true',
  weekly_enabled: 'true',
}

function cfg(key) {
  return getSetting('cron_' + key) || DEFAULTS[key]
}

let discordClient = null

export function initCron(client) {
  discordClient = client

  cron.schedule('* * * * *', async () => {
    const now = new Date()
    const datetime = now.toLocaleString('sv-SE', {
      timeZone: 'Asia/Taipei',
      hour: '2-digit', minute: '2-digit', hour12: false,
    })
    const [h, m] = datetime.split(':').map(Number)
    const dow = now.toLocaleDateString('en-US', { timeZone: 'Asia/Taipei', weekday: 'short' })

    if (h === parseInt(cfg('brief_hour')) && m === parseInt(cfg('brief_minute'))) {
      sendMorningReport().catch(err => console.error('[Cron] 早報失敗:', err.message))
    }

    if (cfg('reflect_enabled') === 'true'
        && h === parseInt(cfg('reflect_hour')) && m === parseInt(cfg('reflect_minute'))) {
      sendEveningReport().catch(err => console.error('[Cron] 晚報失敗:', err.message))
    }

    if (cfg('weekly_enabled') === 'true'
        && dow === 'Sun'
        && h === parseInt(cfg('weekly_hour')) && m === parseInt(cfg('weekly_minute'))) {
      sendWeeklyReview().catch(err => console.error('[Cron] 週回顧失敗:', err.message))
    }

    if (cfg('reminder_enabled') === 'true') {
      sendReminders().catch(err => console.error('[Cron] 提醒失敗:', err.message))
    }
  }, { timezone: 'Asia/Taipei' })

  cron.schedule('*/10 * * * *', () => {
    const n = markOverdueMissed()
    if (n > 0) console.log(`[Cron] 自動標記 ${n} 件 missed`)
  }, { timezone: 'Asia/Taipei' })

  console.log('[Cron] 已排程（早報 / 晚報 / 週回顧 / 提醒）')
}

async function sendToChannel(payload) {
  if (!discordClient || !CHANNEL_ID) return
  const channel = await discordClient.channels.fetch(CHANNEL_ID)
  if (!channel) return
  if (typeof payload === 'string') {
    await channel.send(payload)
  } else {
    await channel.send(payload)
  }
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('zh-TW', {
    timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function buildTimedText(events) {
  return events.filter(e => e.start_time).map(e => {
    let line = `**${fmtTime(e.start_time)}** ${e.is_urgent ? '🔴 ' : ''}${e.title}`
    if (e.repeat_type && e.repeat_type !== 'none') line += ' 🔁'
    if (e.description) line += `\n└ *${e.description}*`
    return line
  }).join('\n') || '（無）'
}

function buildUntimedText(events) {
  return events.filter(e => !e.start_time).map(e =>
    `· ${e.is_urgent ? '🔴 ' : ''}${e.title}`
  ).join('\n') || '（無）'
}

// === 早報 · 今日 ===
export async function sendMorningReport() {
  const today = getTodayEvents()
  const dateStr = new Date().toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle(`☀️ 早報 · ${dateStr}`)

  if (today.length === 0) {
    embed.setDescription('今天手帳是空的，輕鬆一天。')
    await sendToChannel({ embeds: [embed] })
    return
  }

  embed.setDescription(`今天共 **${today.length}** 件事`)

  const timed = today.filter(e => e.start_time)
  const untimed = today.filter(e => !e.start_time)

  if (timed.length > 0) {
    embed.addFields({ name: '🕐 時間表', value: buildTimedText(today).slice(0, 1024) })
  }
  if (untimed.length > 0) {
    embed.addFields({ name: '📌 待辦', value: buildUntimedText(today).slice(0, 1024) })
  }

  await sendToChannel({ embeds: [embed] })
  console.log(`[Cron] 早報送出，${today.length} 件`)
}

export const sendDailyBrief = sendMorningReport

// === 晚報 · 明日預告 + 反思邀請 ===
export async function sendEveningReport() {
  const today = getTodayEvents()
  const tomorrow = getTomorrowEvents()

  const tomorrowDate = (() => {
    const now = new Date()
    const todayStr = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
    const [y, m, d] = todayStr.split('-').map(Number)
    const next = new Date(y, m - 1, d + 1)
    return next.toLocaleDateString('zh-TW', {
      timeZone: 'Asia/Taipei', month: 'long', day: 'numeric', weekday: 'long',
    })
  })()

  const embed = new EmbedBuilder()
    .setColor(0x4F46E5)
    .setTitle('🌙 晚報 · 晚安～')

  if (tomorrow.length === 0) {
    embed.addFields({ name: `📅 明天（${tomorrowDate}）`, value: '手帳是空的，睡個好覺。' })
  } else {
    const timed = tomorrow.filter(e => e.start_time)
    const untimed = tomorrow.filter(e => !e.start_time)
    let tmrValue = ''
    if (timed.length > 0) tmrValue += buildTimedText(tomorrow)
    if (untimed.length > 0) {
      if (tmrValue) tmrValue += '\n'
      tmrValue += buildUntimedText(tomorrow)
    }
    embed.addFields({
      name: `📅 明天（${tomorrowDate}）共 ${tomorrow.length} 件事`,
      value: tmrValue.slice(0, 1024),
    })
  }

  const line = await generateReflectionPrompt(today)
  embed.addFields({
    name: '📓 今日反思',
    value: `${line}\n\n用 \`/reflect mood:😊 text:今天...\` 寫一下，或直接打字告訴我。`,
  })

  await sendToChannel({ embeds: [embed] })
  console.log(`[Cron] 晚報送出，明日 ${tomorrow.length} 件`)
}

export const sendReflectionPrompt = sendEveningReport

// === 事前提醒 ===
// is_urgent = 1 → 60分 + 30分 雙重提醒
// is_urgent = 0 → 只有 30分 提醒
export async function sendReminders() {
  const events = getPendingReminders()
  const now = Date.now()

  for (const ev of events) {
    const diffMin = Math.round((new Date(ev.start_time).getTime() - now) / 60000)

    if (ev.is_urgent && !ev.reminded_60 && diffMin >= 55 && diffMin <= 65) {
      await sendOneReminder(ev, 60)
      updateEvent(ev.id, { reminded_60: 1 })
      continue
    }

    if (!ev.reminded_30 && diffMin >= 25 && diffMin <= 35) {
      await sendOneReminder(ev, 30)
      updateEvent(ev.id, { reminded_30: 1 })
    }
  }
}

async function sendOneReminder(ev, minutes) {
  const CATEGORY_COLOR = { work: 0x3B82F6, study: 0x22C55E, life: 0xA855F7, none: 0x9CA3AF }
  const color = ev.is_urgent ? 0xEF4444 : (CATEGORY_COLOR[ev.category] || CATEGORY_COLOR.none)

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`⏰ ${minutes} 分鐘後 — ${fmtTime(ev.start_time)}`)
    .setDescription(`**${ev.is_urgent ? '🔴 ' : ''}${ev.title}**`)

  if (ev.description) {
    embed.addFields({ name: '📝', value: ev.description, inline: false })
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`done_${ev.id}`).setLabel('完成').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`snooze_${ev.id}`).setLabel('推遲30分').setStyle(ButtonStyle.Secondary),
  )

  await sendToChannel({ embeds: [embed], components: [row] })
  console.log(`[Cron] 提醒 (${minutes}min${ev.is_urgent ? ' 🔴' : ''}): ${ev.title}`)
}

// === 週回顧 ===
export async function sendWeeklyReview() {
  const end = new Date()
  const endStr = end.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
  const startD = new Date(end); startD.setDate(startD.getDate() - 6)
  const startStr = startD.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })

  const done = getEventsByStatusInRange('done', startStr, endStr)
  const missed = getEventsByStatusInRange('missed', startStr, endStr)
  const pending = getEventsByStatusInRange('pending', startStr, endStr)
  const reflections = getReflectionsByRange(startStr, endStr)

  const total = done.length + missed.length + pending.length
  if (total === 0 && reflections.length === 0) {
    await sendToChannel(`📊 **本週回顧**\n\n本週手帳空空的，多寫一點吧。`)
    return
  }

  let header = `📊 **本週回顧** · ${startStr} → ${endStr}\n`
  header += `✓ 完成 ${done.length}　× 錯過 ${missed.length}　‥ 待續 ${pending.length}\n`

  const review = await writeWeeklyReview({ done, missed, pending, reflections })
  const body = review ? `\n${review}` : ''

  await sendToChannel(header + body)
  console.log('[Cron] 週回顧已送出')
}
