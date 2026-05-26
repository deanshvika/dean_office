const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const os = require('os');

const userProfile = os.homedir();
const antigravityDir = path.join(userProfile, '.gemini', 'antigravity');
const brainDir = path.join(antigravityDir, 'brain');
const convDir = path.join(antigravityDir, 'conversations');
const outputPath = path.join(userProfile, 'Desktop', 'ANTIGRAVITY', 'המוח השני', 'conversations_restored.html');

// Known conversation metadata from summaries/build_archive research
const knownMeta = {
  '342f2ae4-ef46-4981-b2c4-48439ec29e67': { title: 'הבהרת מושגים טכניים 2 ו-3 (Voice DNA)', color: '#6366f1' },
  'de1ffdbe-198e-481d-a9be-c75717f06128': { title: 'Finding Conversation Logs', color: '#8b5cf6' },
  'a3092b5a-c10d-47b3-b861-4d9c503d5e06': { title: 'שחזור שיחות אבודות (Restoring Lost Chats)', color: '#ec4899' },
  'a9c9a04a-967b-4b1f-8a16-f9964d7a3a99': { title: 'שחזור מתקדם של שיחות', color: '#f59e0b' },
  'd23210b6-cfda-4a48-ae10-7ef050fa1c01': { title: 'שחזור היסטוריית שיחות (Session actuelle)', color: '#10b981' },
  // Missing ones - listed for reference
  '96b9d4a9-9413-4f1a-8497-91b923d25121': { title: 'שיחה 5 (96b9d4a9) — נמחקה', color: '#ef4444', deleted: true },
  '267a33f3-98d3-4cc2-ac7a-76942b4ed2ae': { title: 'שיחה 6 (267a33f3) — נמחקה', color: '#ef4444', deleted: true },
  '21dfa461-6832-4b14-b9eb-51a557735898': { title: 'שיחה 7 (21dfa461) — נמחקה', color: '#ef4444', deleted: true },
  '25f4336c-d2f4-49de-8313-b889ee92e23c': { title: 'Finding Conversation Logs (25f4336c) — נמחקה', color: '#ef4444', deleted: true },
  '0b5e5c6b-1318-4277-92f8-b8196ee15b8b': { title: 'שיחה 9 (0b5e5c6b) — נמחקה', color: '#ef4444', deleted: true },
  '4d94d6f5-d31b-47ab-a07e-ba9ca599cefc': { title: 'שיחה 10 (4d94d6f5) — נמחקה', color: '#ef4444', deleted: true },
  '5865e7ef-99cf-47c0-bac5-ccde782d59fb': { title: 'Restoring Lost Conversation Data — נמחקה', color: '#ef4444', deleted: true },
};

function cleanContent(raw) {
  if (!raw) return '';
  return raw
    .replace(/<USER_REQUEST>\s*/g, '')
    .replace(/<\/USER_REQUEST>/g, '')
    .replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/g, '')
    .replace(/<USER_SETTINGS_CHANGE>[\s\S]*?<\/USER_SETTINGS_CHANGE>/g, '')
    .replace(/<CONVERSATION_HISTORY>[\s\S]*?<\/CONVERSATION_HISTORY>/g, '')
    .replace(/<conversation_summaries>[\s\S]*?<\/conversation_summaries>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function readTranscript(convId) {
  const files = [
    path.join(brainDir, convId, '.system_generated', 'logs', 'transcript.jsonl'),
    path.join(brainDir, convId, '.system_generated', 'logs', 'overview.txt'),
  ];
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    try {
      const content = fs.readFileSync(f, 'utf8');
      const lines = content.split('\n').filter(l => l.trim());
      const entries = [];
      for (const line of lines) {
        try { entries.push(JSON.parse(line)); } catch(e) {}
      }
      if (entries.length > 0) return entries;
    } catch(e) {}
  }
  return [];
}

function parseTurns(entries) {
  const turns = [];
  for (const entry of entries) {
    if (!entry || !entry.type) continue;
    if (entry.type === 'USER_INPUT' && entry.source === 'USER_EXPLICIT') {
      const cleaned = cleanContent(entry.content || '');
      if (cleaned && cleaned.length > 0) {
        turns.push({ role: 'user', content: cleaned, timestamp: entry.created_at || '' });
      }
    } else if (entry.type === 'PLANNER_RESPONSE' && entry.source === 'MODEL') {
      const content = entry.content || '';
      if (content && content.trim().length > 10) {
        turns.push({ role: 'assistant', content: content.trim(), timestamp: entry.created_at || '' });
      }
    }
  }
  return turns;
}

function formatTimestamp(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
  } catch(e) { return ts; }
}

// Build conversations data
const conversations = [];

// Read all available conversation IDs from brain dir
const availableIds = fs.existsSync(brainDir) ? fs.readdirSync(brainDir) : [];

for (const convId of availableIds) {
  const meta = knownMeta[convId] || { title: convId, color: '#64748b' };
  if (meta.deleted) continue;
  const entries = readTranscript(convId);
  const turns = parseTurns(entries);
  let firstTs = '';
  let lastTs = '';
  if (entries.length > 0) {
    firstTs = entries[0].created_at || '';
    lastTs = entries[entries.length-1].created_at || '';
  }
  conversations.push({ id: convId, meta, turns, firstTs, lastTs, entryCount: entries.length });
}

// Sort by first timestamp
conversations.sort((a, b) => {
  if (!a.firstTs) return 1;
  if (!b.firstTs) return -1;
  return a.firstTs < b.firstTs ? -1 : 1;
});

// List deleted ones
const deletedConvs = Object.entries(knownMeta)
  .filter(([,v]) => v.deleted)
  .map(([id, meta]) => ({ id, meta }));

// Generate HTML
const convListHtml = conversations.map((conv, idx) => `
  <div class="conv-item" onclick="showConv(${idx})" id="conv-item-${idx}">
    <div class="conv-dot" style="background:${conv.meta.color}"></div>
    <div class="conv-info">
      <div class="conv-title">${escapeHtml(conv.meta.title)}</div>
      <div class="conv-meta">${conv.turns.length} הודעות · ${formatTimestamp(conv.firstTs)}</div>
    </div>
  </div>
`).join('');

const deletedListHtml = deletedConvs.map(({id, meta}) => `
  <div class="conv-item deleted">
    <div class="conv-dot" style="background:#ef4444;opacity:0.5"></div>
    <div class="conv-info">
      <div class="conv-title" style="opacity:0.6">${escapeHtml(meta.title)}</div>
      <div class="conv-meta" style="color:#ef4444">⚠️ נמחקה — לא ניתן לשחזר</div>
    </div>
  </div>
`).join('');

const convsData = JSON.stringify(conversations.map(c => ({
  id: c.id,
  title: c.meta.title,
  color: c.meta.color,
  turns: c.turns,
  firstTs: c.firstTs,
  lastTs: c.lastTs,
})));

const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Antigravity — שחזור שיחות</title>
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #0f0f1a;
    --bg2: #1a1a2e;
    --bg3: #16213e;
    --border: #2a2a4a;
    --accent: #6366f1;
    --accent2: #8b5cf6;
    --text: #e2e8f0;
    --text2: #94a3b8;
    --user-bg: #1e293b;
    --ai-bg: #0f172a;
    --radius: 12px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Heebo', sans-serif;
    background: var(--bg);
    color: var(--text);
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  header {
    background: linear-gradient(135deg, var(--bg3) 0%, #0d1117 100%);
    border-bottom: 1px solid var(--border);
    padding: 16px 24px;
    display: flex;
    align-items: center;
    gap: 16px;
    flex-shrink: 0;
  }
  .logo {
    width: 36px; height: 36px;
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-size: 18px;
  }
  header h1 { font-size: 18px; font-weight: 700; }
  header p { font-size: 12px; color: var(--text2); }
  .badge {
    margin-right: auto;
    background: #1e1e3a;
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 4px 12px;
    font-size: 12px;
    color: var(--text2);
  }
  .main {
    display: flex;
    flex: 1;
    overflow: hidden;
  }
  .sidebar {
    width: 300px;
    background: var(--bg2);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    flex-shrink: 0;
  }
  .sidebar-header {
    padding: 16px;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text2);
    font-weight: 600;
  }
  .sidebar-scroll { overflow-y: auto; flex: 1; padding: 8px; }
  .section-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text2);
    padding: 8px 8px 4px;
    font-weight: 600;
  }
  .conv-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s;
    margin-bottom: 2px;
  }
  .conv-item:hover { background: rgba(99,102,241,0.1); }
  .conv-item.active { background: rgba(99,102,241,0.2); border: 1px solid rgba(99,102,241,0.3); }
  .conv-item.deleted { cursor: default; opacity: 0.7; }
  .conv-dot {
    width: 10px; height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .conv-info { flex: 1; min-width: 0; }
  .conv-title {
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .conv-meta { font-size: 11px; color: var(--text2); margin-top: 2px; }
  .chat-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .chat-header {
    padding: 16px 24px;
    border-bottom: 1px solid var(--border);
    background: var(--bg2);
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }
  .chat-header-dot {
    width: 12px; height: 12px;
    border-radius: 50%;
  }
  .chat-title { font-size: 16px; font-weight: 600; }
  .chat-subtitle { font-size: 12px; color: var(--text2); margin-top: 2px; }
  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .msg {
    display: flex;
    gap: 12px;
    max-width: 85%;
    animation: fadeIn 0.2s ease;
  }
  @keyframes fadeIn { from { opacity:0; transform: translateY(4px); } to { opacity:1; transform: none; } }
  .msg.user {
    align-self: flex-end;
    flex-direction: row-reverse;
  }
  .msg-avatar {
    width: 32px; height: 32px;
    border-radius: 8px;
    flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px;
    font-weight: 700;
  }
  .msg.user .msg-avatar {
    background: linear-gradient(135deg, #06b6d4, #3b82f6);
  }
  .msg.assistant .msg-avatar {
    background: linear-gradient(135deg, var(--accent), var(--accent2));
  }
  .msg-bubble {
    background: var(--user-bg);
    border-radius: var(--radius);
    padding: 12px 16px;
    font-size: 14px;
    line-height: 1.6;
    border: 1px solid var(--border);
    white-space: pre-wrap;
    word-break: break-word;
  }
  .msg.user .msg-bubble {
    background: linear-gradient(135deg, #1e293b, #1e3a5f);
    border-color: #2563eb44;
  }
  .msg.assistant .msg-bubble {
    background: var(--ai-bg);
    border-color: #6366f122;
  }
  .msg-ts {
    font-size: 10px;
    color: var(--text2);
    margin-top: 4px;
    text-align: right;
  }
  .msg.user .msg-ts { text-align: left; }
  .msg-content { display: flex; flex-direction: column; }
  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--text2);
    gap: 12px;
    font-size: 14px;
  }
  .empty-icon { font-size: 48px; opacity: 0.4; }
  .stats-bar {
    padding: 8px 24px;
    background: var(--bg3);
    border-top: 1px solid var(--border);
    font-size: 11px;
    color: var(--text2);
    display: flex;
    gap: 16px;
    flex-shrink: 0;
  }
  .stat { display: flex; gap: 4px; align-items: center; }
  .stat span { color: var(--text); font-weight: 600; }
  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
</style>
</head>
<body>
<header>
  <div class="logo">🧠</div>
  <div>
    <h1>Antigravity — שחזור שיחות</h1>
    <p>היסטוריית שיחות ששוחזרה · ${new Date().toLocaleDateString('he-IL')}</p>
  </div>
  <div class="badge">${conversations.length} שיחות שוחזרו · ${deletedConvs.length} אבודות</div>
</header>
<div class="main">
  <div class="chat-panel">
    <div id="chat-header" class="chat-header" style="display:none">
      <div class="chat-header-dot" id="header-dot"></div>
      <div>
        <div class="chat-title" id="header-title"></div>
        <div class="chat-subtitle" id="header-subtitle"></div>
      </div>
    </div>
    <div id="chat-messages" class="chat-messages">
      <div class="empty-state">
        <div class="empty-icon">💬</div>
        <div>בחר שיחה מהרשימה כדי לצפות בה</div>
      </div>
    </div>
    <div class="stats-bar" id="stats-bar" style="display:none">
      <div class="stat">הודעות: <span id="stat-msgs">0</span></div>
      <div class="stat">התחיל: <span id="stat-start">—</span></div>
      <div class="stat">הסתיים: <span id="stat-end">—</span></div>
      <div class="stat">ID: <span id="stat-id">—</span></div>
    </div>
  </div>
  <div class="sidebar">
    <div class="sidebar-header">📂 שיחות</div>
    <div class="sidebar-scroll">
      <div class="section-label">✅ שוחזרו</div>
      ${convListHtml}
      <div class="section-label" style="margin-top:16px">❌ אבודות</div>
      ${deletedListHtml}
    </div>
  </div>
</div>

<script>
const CONVS = ${convsData};

let activeIdx = null;

function formatTs(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
  } catch(e) { return ts; }
}

function showConv(idx) {
  activeIdx = idx;
  const conv = CONVS[idx];
  
  // Update sidebar active state
  document.querySelectorAll('.conv-item').forEach((el, i) => {
    el.classList.toggle('active', i === idx);
  });

  // Update header
  const headerEl = document.getElementById('chat-header');
  headerEl.style.display = 'flex';
  document.getElementById('header-dot').style.background = conv.color;
  document.getElementById('header-title').textContent = conv.title;
  document.getElementById('header-subtitle').textContent = conv.turns.length + ' הודעות · ' + formatTs(conv.firstTs);

  // Update stats
  const statsEl = document.getElementById('stats-bar');
  statsEl.style.display = 'flex';
  document.getElementById('stat-msgs').textContent = conv.turns.length;
  document.getElementById('stat-start').textContent = formatTs(conv.firstTs);
  document.getElementById('stat-end').textContent = formatTs(conv.lastTs);
  document.getElementById('stat-id').textContent = conv.id.substring(0, 8) + '...';

  // Render messages
  const container = document.getElementById('chat-messages');
  if (conv.turns.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><div>אין הודעות זמינות לשיחה זו</div></div>';
    return;
  }

  container.innerHTML = conv.turns.map(turn => {
    const isUser = turn.role === 'user';
    const avatar = isUser ? '👤' : '🤖';
    const content = turn.content.length > 5000 
      ? turn.content.substring(0, 5000) + '\\n\\n[... נחתך - הודעה ארוכה מדי ...]'
      : turn.content;
    return \`<div class="msg \${turn.role}">
      <div class="msg-avatar">\${avatar}</div>
      <div class="msg-content">
        <div class="msg-bubble">\${escHtml(content)}</div>
        <div class="msg-ts">\${formatTs(turn.timestamp)}</div>
      </div>
    </div>\`;
  }).join('');

  container.scrollTop = 0;
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// Auto-select first conv
if (CONVS.length > 0) showConv(0);
</script>
</body>
</html>`;

fs.writeFileSync(outputPath, html, 'utf8');
console.log('✅ Done! Written to:', outputPath);
console.log('📊 Conversations processed:', conversations.length);
conversations.forEach(c => {
  console.log(`  - ${c.meta.title}: ${c.turns.length} turns, ${c.entryCount} entries`);
});
console.log('\n❌ Deleted (unrecoverable):', deletedConvs.length);
deletedConvs.forEach(({id, meta}) => {
  console.log(`  - ${id.substring(0,8)}: ${meta.title}`);
});
