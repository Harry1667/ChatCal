// bot.mjs — Discord 手帳 Bot
//
// 訊息流程：
//   文字 → AI 解析（附最近事件 context）→ 分流到 event/batch/edit/done/delete/reflect/chat
//
// Slash：
//   /today /list /morning /evening /week /month /inbox /reflect /search /done
//
import 'dotenv/config'
import {
  Client, GatewayIntentBits, REST, Routes,
  SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
} from 'discord.js'
import { parseText } from './ai.mjs'
import {
  insertEvent, updateEvent, deleteEvent, getEvent,
  getTodayEvents, getRecentEvents, searchEvents,
  getEventsForAIContext, getInboxEvents, getExpandedEvents,
  upsertReflection, getReflection, getSetting, getDiscordTargets,
  findChannelType,
} from './db.mjs'
import { initCron, sendMorningReport, sendEveningReport, sendWeeklyReview } from './cron.mjs'

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
})

const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID
const APP_ID = process.env.DISCORD_APPLICATION_ID
const TOKEN = process.env.DISCORD_TOKEN

// === 顏色 & 格式 ===
const CATEGORY_COLOR = {
  work:  0x3B82F6,
  study: 0x22C55E,
  life:  0xA855F7,
  none:  0x9CA3AF,
}
const CATEGORY_LABEL = { work: '🔵 工作', study: '🟢 學習', life: '🟣 生活', none: '⚪ 未分類' }

function categoryColor(ev) {
  return CATEGORY_COLOR[ev.category] || CATEGORY_COLOR.none
}

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: 'numeric', day: 'numeric', weekday: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('zh-TW', {
    timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}
function todayStr() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
}

// === Embed 建構 ===
function buildEventEmbed(ev, aiReply) {
  const embed = new EmbedBuilder()
    .setColor(ev.is_urgent ? 0xEF4444 : categoryColor(ev))
    .setTitle((ev.is_urgent ? '🔴 ' : '✅ ') + ev.title)

  const fields = []

  if (ev.start_time) {
    fields.push({ name: '📅 時間', value: fmtDateTime(ev.start_time), inline: true })
  } else {
    fields.push({ name: '📅 時間', value: '未定時間（收件匣）', inline: true })
  }

  const catLabel = CATEGORY_LABEL[ev.category] || CATEGORY_LABEL.none
  fields.push({ name: '🏷️ 分類', value: catLabel, inline: true })

  if (ev.description) {
    fields.push({ name: '📝 說明', value: ev.description, inline: false })
  }

  if (ev.repeat_type && ev.repeat_type !== 'none') {
    const label = { daily: '每天 🔁', weekly: '每週 🔁', monthly: '每月 🔁' }[ev.repeat_type]
    fields.push({ name: '🔁 重複', value: label, inline: true })
  }

  if (ev.is_urgent) {
    fields.push({ name: '⚠️ 緊急', value: '60分 + 30分 雙重提醒', inline: true })
  }

  embed.addFields(fields)

  if (aiReply) embed.setFooter({ text: aiReply })

  return embed
}

function buildEventButtons(eventId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`done_${eventId}`).setLabel('完成').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`snooze_${eventId}`).setLabel('推遲30分').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`delete_${eventId}`).setLabel('刪除').setStyle(ButtonStyle.Danger),
  )
}

// === Slash 指令註冊 ===
const slashCommands = [
  new SlashCommandBuilder().setName('today').setDescription('查看今日手帳'),
  new SlashCommandBuilder().setName('list').setDescription('查看未來 7 天'),
  new SlashCommandBuilder().setName('morning').setDescription('立刻發早報（今日）'),
  new SlashCommandBuilder().setName('evening').setDescription('立刻發晚報（明日 + 反思邀請）'),
  new SlashCommandBuilder().setName('week').setDescription('本週回顧'),
  new SlashCommandBuilder().setName('month').setDescription('本月概覽'),
  new SlashCommandBuilder().setName('inbox').setDescription('查看收件匣（未定時間待辦）'),
  new SlashCommandBuilder()
    .setName('reflect').setDescription('寫今日反思')
    .addStringOption(o => o.setName('mood').setDescription('心情 emoji，例：😊').setRequired(false))
    .addStringOption(o => o.setName('text').setDescription('今天怎麼樣？').setRequired(false)),
  new SlashCommandBuilder()
    .setName('search').setDescription('搜手帳')
    .addStringOption(o => o.setName('q').setDescription('關鍵字').setRequired(true)),
  new SlashCommandBuilder()
    .setName('done').setDescription('標完成')
    .addIntegerOption(o => o.setName('id').setDescription('事件 id').setRequired(true)),
].map(c => c.toJSON())

async function registerSlashCommands() {
  if (!APP_ID) return
  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN)
    await rest.put(Routes.applicationCommands(APP_ID), { body: slashCommands })
    console.log('[Bot] Slash 指令已註冊')
  } catch (err) {
    console.error('[Bot] Slash 註冊失敗:', err.message)
  }
}

// === 存單一事件 ===
function saveOneEvent(parsed, text) {
  return insertEvent({
    title: parsed.title,
    description: parsed.description,
    start_time: parsed.start_time,
    end_time: parsed.end_time,
    raw_text: text,
    category: parsed.category || 'none',
    is_urgent: parsed.is_urgent ? 1 : 0,
    repeat_type: parsed.repeat_type || 'none',
    repeat_until: parsed.repeat_until,
    source: 'discord',
  })
}

// === 日記頻道：@ChatCal 4月24日記：... ===
async function handleDiaryMessage(message, text) {
  let dateStr = todayStr()
  let content = text.replace(/^日記[：:]\s*/, '').trim()

  const dateMatch = text.match(/(\d{1,2})月(\d{1,2})日/)
  if (dateMatch) {
    const y = new Date().getFullYear()
    const m = String(parseInt(dateMatch[1])).padStart(2, '0')
    const d = String(parseInt(dateMatch[2])).padStart(2, '0')
    dateStr = `${y}-${m}-${d}`
    content = text.replace(/\d{1,2}月\d{1,2}日[記]?[：:]\s*/, '').trim()
  }

  if (!content) {
    await message.reply('日記內容是空的，格式：`4月24日記：今天...`')
    return
  }

  const moodEmojis = ['😊', '😌', '🥲', '😤', '😴', '🎉', '💪', '🌧️']
  let mood = null
  for (const emoji of moodEmojis) {
    if (content.startsWith(emoji)) { mood = emoji; content = content.slice(emoji.length).trim(); break }
  }

  const saved = upsertReflection(dateStr, { mood, text: content })
  const [, m, d] = dateStr.split('-')
  const moodPart = saved.mood ? ` ${saved.mood}` : ''
  await message.reply(`📓 **${parseInt(m)}月${parseInt(d)}日 日記${moodPart}** — 記下了\n\n${saved.text}`)
}

// === 提醒頻道：再過 X 分鐘/小時提醒我 ===
function parseSnoozeMinutes(text) {
  const h = text.match(/(\d+)\s*小時/)
  if (h) return parseInt(h[1]) * 60
  const m = text.match(/(\d+)\s*分/)
  if (m) return parseInt(m[1])
  if (/待會|等一下|晚點/.test(text)) return 15
  return null
}

async function handleReminderMessage(message, text) {
  const mins = parseSnoozeMinutes(text)
  if (!mins) {
    await message.reply('可以說「再提醒我 30 分鐘」或「1 小時後再提醒」。')
    return
  }
  const now = new Date()
  const upcoming = getExpandedEvents(now, new Date(now.getTime() + 2 * 3600 * 1000))
    .filter(e => e.status === 'pending' && e.start_time && !e._is_occurrence)
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))

  if (upcoming.length === 0) {
    await message.reply('接下來 2 小時沒有待辦事件可推遲。')
    return
  }
  const ev = upcoming[0]
  const newTime = new Date(new Date(ev.start_time).getTime() + mins * 60000).toISOString()
  const updated = updateEvent(ev.id, { start_time: newTime, reminded_30: 0, reminded_60: 0 })
  const label = mins >= 60 ? `${mins / 60} 小時` : `${mins} 分鐘`
  await message.reply(`⏰ **${ev.title}** 推遲 ${label}\n新時間：${fmtDateTime(updated.start_time)}`)
}

// === 訊息流程分流 ===
const _processed = new Set()
client.on('messageCreate', async (message) => {
  if (message.author.bot) return
  if (_processed.has(message.id)) return
  _processed.add(message.id)
  setTimeout(() => _processed.delete(message.id), 60000)

  const chId = message.channel.id
  const isDM = !message.guild
  const isMentioned = message.mentions.has(client.user)

  // 從 DB 反查頻道類型（支援動態新增的頻道類型）
  const channelTypeDef = findChannelType(chId)
  const targets = getDiscordTargets()
  const legacyRecord = getSetting('discord_channel_record') || CHANNEL_ID

  let channelTypeKey = null
  let channelPrompt = ''

  if (channelTypeDef) {
    channelTypeKey = channelTypeDef.type_key
    channelPrompt = channelTypeDef.prompt || ''
  } else if (chId === legacyRecord) {
    channelTypeKey = 'record'
  } else if (isDM || (targets.length === 0 && isMentioned)) {
    channelTypeKey = 'record'
  } else return

  const text = message.content.replace(/<@[!&]?\d+>/g, '').trim()
  if (!text) return

  if (channelTypeKey === 'diary') return handleDiaryMessage(message, text)
  if (channelTypeKey === 'reminder') return handleReminderMessage(message, text)

  await message.channel.sendTyping().catch(() => {})

  const context = getEventsForAIContext()
  const result = await parseText(text, context, channelPrompt)

  try {
    switch (result.type) {
      case 'chat':
        await message.reply(result.reply || '嗯。')
        break

      case 'event': {
        const saved = saveOneEvent(result, text)
        await message.reply({
          embeds: [buildEventEmbed(saved, result.reply)],
          components: [buildEventButtons(saved.id)],
        })
        break
      }

      case 'batch': {
        const eventsArr = result.events || []
        if (eventsArr.length === 0) {
          await message.reply(result.reply || '沒解析到事件。')
          break
        }
        await message.reply(result.reply || `已幫你記下 ${eventsArr.length} 件事。`)
        for (const ev of eventsArr) {
          const saved = saveOneEvent(ev, text)
          await message.channel.send({
            embeds: [buildEventEmbed(saved, null)],
            components: [buildEventButtons(saved.id)],
          })
        }
        break
      }

      case 'edit': {
        const id = Number(result.target_id)
        const existing = getEvent(id)
        if (!existing) {
          await message.reply('找不到那件事耶，可以再講一次嗎？')
          break
        }
        const changes = {}
        if (result.changes) {
          for (const k of ['title', 'description', 'start_time', 'end_time']) {
            if (result.changes[k] !== undefined && result.changes[k] !== null) {
              changes[k] = result.changes[k]
            }
          }
        }
        if (changes.start_time) {
          changes.reminded_60 = 0
          changes.reminded_30 = 0
        }
        const updated = updateEvent(id, changes)
        await message.reply({
          content: result.reply || '改好了。',
          embeds: [buildEventEmbed(updated, null)],
          components: [buildEventButtons(updated.id)],
        })
        break
      }

      case 'done': {
        const id = Number(result.target_id)
        const updated = updateEvent(id, { status: 'done' })
        if (!updated) {
          await message.reply('找不到那件事耶。')
          break
        }
        await message.reply(`${result.reply || '做完啦'} ✅\n\n✓ **${updated.title}**`)
        break
      }

      case 'delete': {
        const id = Number(result.target_id)
        const ev = getEvent(id)
        if (!ev) {
          await message.reply('找不到那件事耶。')
          break
        }
        deleteEvent(id)
        await message.reply(`${result.reply || '好，取消了。'}\n\n🗑️ **${ev.title}**`)
        break
      }

      case 'reflect': {
        const date = todayStr()
        const saved = upsertReflection(date, {
          mood: result.mood || null,
          text: result.text || text,
        })
        const moodPart = saved.mood ? ` ${saved.mood}` : ''
        await message.reply(`📓 **今日反思${moodPart}**\n\n${saved.text}\n\n— ${result.reply || '記下了，好好休息。'}`)
        break
      }

      default:
        await message.reply(result.reply || '嗯，我記下了。')
    }
  } catch (err) {
    console.error('[Bot] 處理失敗:', err.message)
    await message.reply('抱歉，出了點問題。')
  }
})

// === 按鈕 + Slash ===
client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton()) {
    const parts = interaction.customId.split('_')
    const action = parts[0]
    const id = parseInt(parts[1])
    if (!id) return

    if (action === 'done') {
      const updated = updateEvent(id, { status: 'done' })
      if (!updated) return interaction.reply({ content: '找不到這條。', ephemeral: true })
      await interaction.update({
        content: `✅ 已完成：**${updated.title}**`,
        embeds: [],
        components: [],
      })
    } else if (action === 'snooze') {
      const ev = getEvent(id)
      if (!ev) return interaction.reply({ content: '找不到這條。', ephemeral: true })
      if (!ev.start_time) return interaction.reply({ content: '這件事沒有時間，無法推遲。', ephemeral: true })

      const newTime = new Date(new Date(ev.start_time).getTime() + 30 * 60 * 1000).toISOString()
      const updated = updateEvent(id, { start_time: newTime, reminded_30: 0, reminded_60: 0 })
      await interaction.update({
        content: `⏰ 已推遲 30 分鐘`,
        embeds: [buildEventEmbed(updated, `新時間：${fmtDateTime(updated.start_time)}`)],
        components: [buildEventButtons(id)],
      })
    } else if (action === 'delete') {
      const ev = getEvent(id)
      if (!ev) return interaction.reply({ content: '找不到這條。', ephemeral: true })
      deleteEvent(id)
      await interaction.update({
        content: `🗑️ 已刪除：**${ev.title}**`,
        embeds: [],
        components: [],
      })
    }
    return
  }

  if (!interaction.isChatInputCommand()) return

  try {
    const cmd = interaction.commandName

    if (cmd === 'today') {
      const list = getTodayEvents()
      if (list.length === 0) {
        return interaction.reply({ content: '📖 今日手帳是空的，輕鬆過一天。' })
      }
      const embeds = list.slice(0, 10).map(ev => buildEventEmbed(ev, null))
      await interaction.reply({ content: `📖 **今日** — ${list.length} 件`, embeds })
    }
    else if (cmd === 'list') {
      const now = new Date()
      const list = getRecentEvents(7).filter(e => {
        if (!e.start_time) return false
        return new Date(e.start_time) >= now && e.status !== 'done'
      })
      await interaction.reply({ content: buildListView('未來 7 天', list) })
    }
    else if (cmd === 'morning') {
      await interaction.deferReply()
      await sendMorningReport()
      await interaction.editReply('☀️ 早報已送出。')
    }
    else if (cmd === 'evening') {
      await interaction.deferReply()
      await sendEveningReport()
      await interaction.editReply('🌙 晚報已送出。')
    }
    else if (cmd === 'week') {
      await interaction.deferReply()
      await sendWeeklyReview()
      await interaction.editReply('📊 週回顧已送出。')
    }
    else if (cmd === 'month') {
      await interaction.reply(buildMonthView())
    }
    else if (cmd === 'inbox') {
      const inbox = getInboxEvents()
      if (inbox.length === 0) {
        return interaction.reply({ content: '📥 收件匣是空的，讚！' })
      }
      let msg = `📥 **收件匣** — ${inbox.length} 件待排程\n\n`
      for (const ev of inbox) {
        const cat = CATEGORY_LABEL[ev.category] || ''
        msg += `\`#${ev.id}\` ${cat} **${ev.title}**`
        if (ev.description) msg += `\n     └ ${ev.description}`
        msg += '\n'
      }
      await interaction.reply({ content: msg })
    }
    else if (cmd === 'reflect') {
      const mood = interaction.options.getString('mood') || null
      const text = interaction.options.getString('text') || null
      if (!mood && !text) {
        const existing = getReflection(todayStr())
        if (!existing) {
          return interaction.reply({ content: '還沒寫呢。用 `/reflect mood:😊 text:今天怎樣` 記錄。', ephemeral: true })
        }
        return interaction.reply(`📓 **今日反思${existing.mood ? ' ' + existing.mood : ''}**\n\n${existing.text || ''}`)
      }
      const saved = upsertReflection(todayStr(), { mood, text })
      await interaction.reply(`📓 **今日反思${saved.mood ? ' ' + saved.mood : ''}**\n\n${saved.text || ''}`)
    }
    else if (cmd === 'search') {
      const q = interaction.options.getString('q', true)
      const hits = searchEvents(q, 20)
      await interaction.reply({ content: buildSearchView(q, hits) })
    }
    else if (cmd === 'done') {
      const id = interaction.options.getInteger('id', true)
      const updated = updateEvent(id, { status: 'done' })
      if (!updated) return interaction.reply({ content: `找不到 id=${id}`, ephemeral: true })
      await interaction.reply(`✅ 完成：**${updated.title}**`)
    }
  } catch (err) {
    console.error('[Bot] 指令錯誤:', err.message)
    if (interaction.deferred) await interaction.editReply('出了點問題。')
    else if (!interaction.replied) await interaction.reply({ content: '出了點問題。', ephemeral: true })
  }
})

// === 純文字視圖（list / search / month） ===
function buildListView(title, list) {
  if (list.length === 0) return `📖 **${title}**\n\n沒有事情。`
  let msg = `📖 **${title}** — ${list.length} 件\n\n`
  for (const ev of list) {
    const urgent = ev.is_urgent ? ' 🔴' : ''
    msg += `\`#${ev.id}\`${urgent} **${fmtDateTime(ev.start_time)}** — ${ev.title}\n`
    if (ev.description) msg += `     └ ${ev.description}\n`
  }
  return msg
}

function buildSearchView(q, hits) {
  if (hits.length === 0) return `🔍 **「${q}」** — 沒找到`
  let msg = `🔍 **「${q}」** — ${hits.length} 件\n\n`
  for (const ev of hits) {
    const t = ev.start_time ? fmtDateTime(ev.start_time) : '未定時間'
    const urgent = ev.is_urgent ? ' 🔴' : ''
    msg += `\`#${ev.id}\`${urgent} ${t} — ${ev.title}\n`
    if (ev.description) msg += `     └ ${ev.description}\n`
  }
  return msg
}

function buildMonthView() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const start = `${y}-${String(m + 1).padStart(2, '0')}-01`
  const last = new Date(y, m + 1, 0).getDate()
  const end = `${y}-${String(m + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`

  const all = getRecentEvents(45).filter(e => {
    if (!e.start_time) return false
    const d = new Date(e.start_time).toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
    return d >= start && d <= end
  })
  const done = all.filter(e => e.status === 'done').length
  const missed = all.filter(e => e.status === 'missed').length
  const pending = all.filter(e => e.status === 'pending').length

  return `📅 **${y} 年 ${m + 1} 月**\n\n✓ 完成：${done} 件\n× 錯過：${missed} 件\n‥ 待續：${pending} 件\n合計：${all.length} 件`
}

// === 啟動 ===
client.once('ready', async () => {
  console.log(`[Bot] 已登入: ${client.user.tag}`)
  await registerSlashCommands()
  initCron(client)
})

client.login(TOKEN)

export default client
