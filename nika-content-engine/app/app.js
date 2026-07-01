'use strict';
// ── לוח הבקרה של NIKA — לוגיקת הטופס + תצוגה חיה ──

let CFG = { items: [], subjects: {}, grades: {}, levels: {}, reflections: {}, days: [] };
let spec = null;
let activeTab = 'beginner';
let previewPage = 'beginner';
const PAGES = ['beginner', 'mid', 'challenge', 'coach_guide'];
const TAB_LABELS = { header: 'כותרת', beginner: 'מתחילים', mid: 'ממשיכים', challenge: 'אתגר', coach_guide: 'מדריך' };

// ── עזרי path ──
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const splitPath = (p) => p.split('.').map((k) => (/^\d+$/.test(k) ? Number(k) : k));
function deepGet(o, p) { return splitPath(p).reduce((a, k) => (a == null ? a : a[k]), o); }
function deepSet(o, p, v) {
  const ks = splitPath(p); let a = o;
  for (let i = 0; i < ks.length - 1; i++) { const k = ks[i]; if (a[k] == null) a[k] = typeof ks[i + 1] === 'number' ? [] : {}; a = a[k]; }
  a[ks[ks.length - 1]] = v;
}
function deepDel(o, p) { const ks = splitPath(p); const parent = ks.slice(0, -1).reduce((a, k) => a[k], o); const last = ks[ks.length - 1]; if (Array.isArray(parent)) parent.splice(last, 1); else delete parent[last]; }

// ── field builders ──
const fText = (label, path, val) => `<div class="fld"><label>${label}</label><input type="text" data-path="${path}" value="${esc(val)}"></div>`;
const fArea = (label, path, val, vtype) => `<div class="fld"><label>${label}</label><textarea data-path="${path}"${vtype ? ` data-vtype="${vtype}"` : ''}>${esc(vtype === 'lines' ? (val || []).join('\n') : val)}</textarea></div>`;
const fNum = (label, path, val) => `<div class="fld"><label>${label}</label><input type="number" data-path="${path}" data-vtype="num" value="${val ?? ''}"></div>`;
const fCsvNum = (label, path, val) => `<div class="fld"><label>${label}</label><input type="text" data-path="${path}" data-vtype="csvnum" value="${(val || []).join(', ')}"><div class="hint">מספרים מופרדים בפסיק</div></div>`;
const fCsv = (label, path, val) => `<div class="fld"><label>${label}</label><input type="text" data-path="${path}" data-vtype="csv" value="${(val || []).join(', ')}"></div>`;
function fSelect(label, path, val, options, restructure) {
  const opts = options.map((o) => `<option value="${o.value}"${o.value === val ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
  return `<div class="fld"><label>${label}</label><select data-path="${path}"${restructure ? ' data-restructure="1"' : ''}>${opts}</select></div>`;
}
const itemOpts = () => CFG.items.map((i) => ({ value: i.key, label: `${i.he} (${i.en})` }));
const fItem = (label, path, val) => fSelect(label, path, val, itemOpts());

// ── task editor ──
const TASK_TYPES = [
  { value: 'count', label: 'ספירה (בחר מספר)' },
  { value: 'compare', label: 'השוואה (יותר/פחות)' },
  { value: 'arith', label: 'חיבור/חיסור' },
  { value: 'equalize', label: 'השלמה לשוויון' },
  { value: 'write_count', label: 'ספירה וכתיבה' },
  { value: 'match', label: 'התאמה (קו למספר)' },
  { value: 'word_picture', label: 'מילה ↔ תמונה (שפה/אנגלית)' },
  { value: 'text', label: 'טקסט חופשי' },
  { value: 'find_count', label: 'בונוס: מצא כמות' },
];
function defaultTask(type) {
  switch (type) {
    case 'count': return { type: 'count', item: 'bottle', count: 5, options: [4, 5, 6] };
    case 'compare': return { type: 'compare', item: 'bottle', a: 4, b: 3, ask: 'more', prompt: '' };
    case 'arith': return { type: 'arith', op: 'addition', a: { item: 'bottle', count: 4 }, b: { item: 'bottle', count: 3 }, result: 7, prompt: '' };
    case 'equalize': return { type: 'equalize', item: 'ball', a: 4, b: 3, answer: 1, prompt: '' };
    case 'write_count': return { type: 'write_count', groups: [{ item: 'bottle', count: 5, line: 'יש ___' }] };
    case 'match': return { type: 'match', prompt: 'חברו בקו בין כל קבוצה למספר.', pairs: [{ item: 'bottle', count: 2, label: 'קבוצה א׳' }, { item: 'bottle', count: 4, label: 'קבוצה ב׳' }], numbers: [2, 4] };
    case 'word_picture': return { type: 'word_picture', item: 'bottle', word: '', distractors: ['ball', 'flag'] };
    case 'find_count': return { type: 'find_count', target: 5, text: 'מצאו ציור אחד שבו יש בדיוק 5 פריטים.' };
    default: return { type: 'text', text: '' };
  }
}
function taskFields(t, base) {
  switch (t.type) {
    case 'count': return fItem('פריט', `${base}.item`, t.item) + `<div class="row">${fNum('כמות מצוירת', `${base}.count`, t.count)}${fCsvNum('אפשרויות (ריק=אוטומטי)', `${base}.options`, t.options)}</div>`;
    case 'compare': return fItem('פריט', `${base}.item`, t.item) + `<div class="row">${fNum('קבוצה א׳', `${base}.a`, t.a)}${fNum('קבוצה ב׳', `${base}.b`, t.b)}</div>` + fSelect('שואלים על', `${base}.ask`, t.ask, [{ value: 'more', label: 'יותר' }, { value: 'less', label: 'פחות' }]) + fText('שאלה (רשות)', `${base}.prompt`, t.prompt);
    case 'arith': return fSelect('פעולה', `${base}.op`, t.op, [{ value: 'addition', label: 'חיבור +' }, { value: 'subtraction', label: 'חיסור −' }]) + `<div class="row">${fItem('פריט א׳', `${base}.a.item`, t.a.item)}${fNum('כמות א׳', `${base}.a.count`, t.a.count)}</div>` + `<div class="row">${fItem('פריט ב׳', `${base}.b.item`, t.b.item)}${fNum('כמות ב׳', `${base}.b.count`, t.b.count)}</div>` + fNum('תוצאה', `${base}.result`, t.result) + fText('שאלה (רשות)', `${base}.prompt`, t.prompt);
    case 'equalize': return fItem('פריט', `${base}.item`, t.item) + `<div class="row">${fNum('קבוצה א׳', `${base}.a`, t.a)}${fNum('קבוצה ב׳', `${base}.b`, t.b)}${fNum('להוסיף (=א−ב)', `${base}.answer`, t.answer)}</div>` + fText('שאלה (רשות)', `${base}.prompt`, t.prompt);
    case 'write_count': return groupsEditor(t.groups, `${base}.groups`);
    case 'match': return fText('הוראה', `${base}.prompt`, t.prompt) + pairsEditor(t.pairs, `${base}.pairs`) + fCsvNum('מספרים (יש להתאים לכמויות)', `${base}.numbers`, t.numbers);
    case 'word_picture': {
      const dist = (t.distractors || []).map((d, i) =>
        `<div class="row" style="align-items:flex-end;gap:6px"><div style="flex:1">${fSelect('מסיח ' + (i + 1), `${base}.distractors.${i}`, d, itemOpts())}</div><button class="mini del" data-action="del" data-path="${base}.distractors.${i}" style="margin-bottom:12px">✕</button></div>`).join('');
      return fItem('פריט נכון (התמונה הנכונה)', `${base}.item`, t.item)
        + fText('מילה מוצגת (רשות; ריק = מהבנק המנוקד)', `${base}.word`, t.word || '')
        + `<label style="display:block;font-weight:700;font-size:13px;margin:6px 0 2px">מסיחים (תמונות שגויות)</label>`
        + dist + `<button class="mini add" data-action="addDistractor" data-path="${base}.distractors">+ הוסף מסיח</button>`;
    }
    case 'find_count': return `<div class="row">${fNum('כמות יעד', `${base}.target`, t.target)}</div>` + fText('טקסט', `${base}.text`, t.text);
    default: return fText('טקסט', `${base}.text`, t.text) + (t.title !== undefined ? fText('כותרת (רשות)', `${base}.title`, t.title) : '');
  }
}
function groupsEditor(groups, base) {
  return (groups || []).map((g, i) => `<div class="card"><div class="card-head"><span class="tag lime">קבוצה ${i + 1}</span><span class="sp"></span><button class="mini del" data-action="del" data-path="${base}.${i}">מחק</button></div><div class="row">${fItem('פריט', `${base}.${i}.item`, g.item)}${fNum('כמות', `${base}.${i}.count`, g.count)}</div>${fText('שורה (עם ___ )', `${base}.${i}.line`, g.line)}</div>`).join('') + `<button class="mini add" data-action="addGroup" data-path="${base}">+ הוסף קבוצה</button>`;
}
function pairsEditor(pairs, base) {
  return (pairs || []).map((g, i) => `<div class="card"><div class="card-head"><span class="tag blue">זוג ${i + 1}</span><span class="sp"></span><button class="mini del" data-action="del" data-path="${base}.${i}">מחק</button></div><div class="row">${fItem('פריט', `${base}.${i}.item`, g.item)}${fNum('כמות', `${base}.${i}.count`, g.count)}</div>${fText('תווית', `${base}.${i}.label`, g.label)}</div>`).join('') + `<button class="mini add" data-action="addPair" data-path="${base}">+ הוסף זוג</button>`;
}
function taskCard(t, base, opts = {}) {
  const rm = opts.removable ? `<button class="mini del" data-action="del" data-path="${base}">✕ הסר</button>` : '';
  const title = opts.title || `משימה ${opts.index + 1}`;
  return `<div class="card"><div class="card-head"><span class="tag">${title}</span>
    <span class="sp"></span>${fSelectInline('סוג', `${base}.type`, t.type, TASK_TYPES, true)}${rm}</div>
    ${taskFields(t, base)}</div>`;
}
const fSelectInline = (label, path, val, options, restructure) => `<select class="mini" data-path="${path}"${restructure ? ' data-restructure="1"' : ''} title="${label}">${options.map((o) => `<option value="${o.value}"${o.value === val ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;

// ── page forms ──
function headerForm() {
  const s = spec;
  return `<div class="sectitle">פרטי היום</div>
    ${fText('מזהה יום (day_id)', 'day_id', s.day_id)}
    <div class="row">${fSelect('תחום', 'subject', s.subject, Object.entries(CFG.subjects).map(([v, l]) => ({ value: v, label: l })), true)}${fSelect('שכבה', 'audience', s.audience, Object.entries(CFG.grades).map(([v, l]) => ({ value: v, label: l })), true)}</div>
    ${fText('תווית יום', 'day_label', s.day_label)}
    ${fText('כותרת', 'title', s.title)}
    ${fText('מיומנות ליבה', 'core_skill', s.core_skill)}
    <div class="row">${fText('עולם תוכן', 'theme', s.theme)}${fText('ערך מוביל', 'leading_value', s.leading_value)}</div>
    <div class="hint">ניקוד: ${s.niqqud ? 'מנוקד' : 'ללא ניקוד'} (נגזר אוטומטית מתחום+שכבה)</div>`;
}
function studentForm(key) {
  const pg = spec.pages[key]; const B = `pages.${key}`;
  const reflBoxes = Object.entries(CFG.reflections).map(([k, l]) =>
    `<label style="display:inline-flex;align-items:center;gap:5px;margin-inline-end:12px;font-size:13px"><input type="checkbox" class="reflectbox" data-reflect="${B}.success_reflection" data-key="${k}"${(pg.success_reflection || []).includes(k) ? ' checked' : ''}> ${esc(l)}</label>`).join('');
  return `<div class="sectitle">עמוד ${TAB_LABELS[key]}</div>
    ${fArea('פתיח', `${B}.intro`, pg.intro)}
    ${fArea('מה עושים? (הוראה)', `${B}.instruction`, pg.instruction)}
    <div class="sectitle">דוגמה (פתורה)</div>${taskCard(pg.example, `${B}.example`, { title: 'דוגמה' })}
    <div class="sectitle">משימות</div>
    ${(pg.tasks || []).map((t, i) => taskCard(t, `${B}.tasks.${i}`, { index: i, removable: true })).join('')}
    <button class="mini add" data-action="addTask" data-page="${key}">+ הוסף משימה</button>
    <div class="sectitle" style="margin-top:14px">בדיקה מהירה</div>${taskCard(pg.quick_check, `${B}.quick_check`, { title: 'בדיקה מהירה' })}
    <div class="sectitle">בונוס</div>${taskCard(pg.bonus, `${B}.bonus`, { title: 'בונוס' })}
    ${fArea('מסר מחזק', `${B}.encouraging_message`, pg.encouraging_message)}
    <div class="fld"><label>היום הצלחתי כי</label><div>${reflBoxes}</div></div>
    ${fArea('פוטר', `${B}.footer`, pg.footer)}`;
}
function coachForm() {
  const c = spec.pages.coach_guide; const B = 'pages.coach_guide';
  const overview = (c.pages_overview || []).map((o, i) => `<div class="card"><div class="card-head"><span class="tag">${TAB_LABELS[o.level] || o.level}</span></div>${fText('קהל יעד', `${B}.pages_overview.${i}.audience`, o.audience)}${fArea('נקודות (שורה לכל אחת)', `${B}.pages_overview.${i}.points`, o.points, 'lines')}</div>`).join('');
  return `<div class="sectitle">דף מדריך/ה</div>
    ${fArea('מטרת היום (שורה לכל אחת)', `${B}.daily_goal`, c.daily_goal, 'lines')}
    <div class="row">${fText('הערך המוביל — שם', `${B}.leading_value.name`, c.leading_value?.name)}</div>
    ${fArea('הערך המוביל — הסבר', `${B}.leading_value.text`, c.leading_value?.text)}
    <div class="sectitle">איך עובדים עם הדפים</div>${overview}
    ${fArea('איך לתווך? (שורה לכל אחת)', `${B}.how_to_mediate`, c.how_to_mediate, 'lines')}
    ${fArea('התאמות למתקשים', `${B}.adaptations`, c.adaptations, 'lines')}
    ${fArea('מסיים מהר', `${B}.fast_finishers`, c.fast_finishers, 'lines')}
    ${fText('מסר למדריך — פתיח', `${B}.coach_message.lead`, c.coach_message?.lead)}
    ${fCsv('מסר — ערכים (פסיק)', `${B}.coach_message.values`, c.coach_message?.values)}
    ${fArea('משפטים לומר לילדים', `${B}.phrases`, c.phrases, 'lines')}
    ${fCsv('מקרא תחתון (פסיק)', `${B}.footer_legend`, c.footer_legend)}`;
}

// ── render form ──
function renderForm() {
  const form = document.getElementById('form');
  form.innerHTML = activeTab === 'header' ? headerForm()
    : activeTab === 'coach_guide' ? coachForm()
      : studentForm(activeTab);
}
function renderTabs() {
  document.getElementById('tabs').innerHTML = ['header', ...PAGES].map((t) =>
    `<button class="tab${t === activeTab ? ' active' : ''}" data-tab="${t}">${TAB_LABELS[t]}</button>`).join('');
}
function renderChips() {
  document.getElementById('pageChips').innerHTML = PAGES.map((t) =>
    `<button class="chip${t === previewPage ? ' active' : ''}" data-page="${t}">${TAB_LABELS[t]}</button>`).join('');
}

// ── live preview + validation ──
let timer = null;
function schedule() { clearTimeout(timer); timer = setTimeout(refresh, 350); }
async function refresh() {
  syncDerived();
  let r;
  try {
    const res = await fetch('/api/render', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(spec) });
    r = await res.json();
  } catch (e) { setBanner(false, [{ page: 'server', msg: 'שגיאת שרת: ' + e.message }]); return; }
  const html = (r.html && r.html[previewPage]) || (r.html && r.html.error) || '<em style="padding:2rem;display:block">אין תצוגה</em>';
  document.getElementById('preview').srcdoc = html;
  const v = r.validation || { pass: false, errors: [] };
  setBanner(v.pass, v.errors, v.warn);
  document.getElementById('pdfBtn').disabled = !v.pass;
}
function setBanner(pass, errors = [], warn = []) {
  const b = document.getElementById('valBanner');
  if (pass) {
    b.className = 'banner ok';
    b.innerHTML = `✔ תקין — מוכן להפקה${warn && warn.length ? ` (${warn.length} אזהרות)` : ''}`;
  } else {
    b.className = 'banner fail';
    b.innerHTML = `✗ יש ${errors.length} בעיות לתיקון:<ul>${errors.slice(0, 8).map((e) => `<li>[${esc(e.page)}] ${esc(e.msg)}</li>`).join('')}</ul>`;
  }
}
function syncDerived() {
  spec.niqqud = spec.subject !== 'math' && spec.audience === 'grade_1';
}

// ── events ──
function parseVal(el) {
  const vt = el.dataset.vtype;
  if (vt === 'num') return el.value === '' ? null : Number(el.value);
  if (vt === 'csvnum') return el.value.split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));
  if (vt === 'csv') return el.value.split(',').map((s) => s.trim()).filter(Boolean);
  if (vt === 'lines') return el.value.split('\n').map((s) => s.trim()).filter(Boolean);
  return el.value;
}
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.path && !el.dataset.restructure) { deepSet(spec, el.dataset.path, parseVal(el)); schedule(); }
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.classList && el.classList.contains('reflectbox')) {
    const path = el.dataset.reflect;
    const chosen = Array.from(document.querySelectorAll(`.reflectbox[data-reflect="${path}"]`)).filter((x) => x.checked).map((x) => x.dataset.key);
    deepSet(spec, path, chosen); schedule(); return;
  }
  if (el.dataset && el.dataset.restructure) {
    const path = el.dataset.path;
    if (path.endsWith('.type')) { const base = path.slice(0, -5); deepSet(spec, base, defaultTask(el.value)); }
    else deepSet(spec, path, el.value);
    renderForm(); schedule(); return;
  }
});
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action],[data-tab],[data-page]');
  if (!el) return;
  if (el.dataset.tab) { activeTab = el.dataset.tab; if (PAGES.includes(activeTab)) { previewPage = activeTab; renderChips(); } renderTabs(); renderForm(); refresh(); return; }
  if (el.classList.contains('chip') && el.dataset.page) { previewPage = el.dataset.page; renderChips(); refresh(); return; }
  const act = el.dataset.action;
  if (act === 'addTask') { deepGet(spec, `pages.${el.dataset.page}.tasks`).push(defaultTask('count')); renderForm(); schedule(); }
  else if (act === 'addGroup') { deepGet(spec, el.dataset.path).push({ item: 'bottle', count: 3, line: 'יש ___' }); renderForm(); schedule(); }
  else if (act === 'addPair') { const arr = deepGet(spec, el.dataset.path); arr.push({ item: 'ball', count: 3, label: 'קבוצה' }); renderForm(); schedule(); }
  else if (act === 'addDistractor') { deepGet(spec, el.dataset.path).push('ball'); renderForm(); schedule(); }
  else if (act === 'del') { deepDel(spec, el.dataset.path); renderForm(); schedule(); }
});

// ── toolbar ──
function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2200); }
async function loadDay(id) {
  const res = await fetch('/api/day/' + encodeURIComponent(id));
  if (!res.ok) { toast('היום לא נמצא'); return; }
  spec = await res.json(); activeTab = 'beginner'; previewPage = 'beginner';
  renderTabs(); renderChips(); renderForm(); refresh();
}
document.getElementById('loadBtn').onclick = () => loadDay(document.getElementById('dayList').value);
document.getElementById('newBtn').onclick = () => { spec = newDay(); activeTab = 'header'; previewPage = 'beginner'; renderTabs(); renderChips(); renderForm(); refresh(); };
document.getElementById('saveBtn').onclick = async () => {
  const res = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(spec) });
  const r = await res.json();
  if (r.saved) { toast('נשמר: ' + r.saved); if (!CFG.days.includes(spec.day_id)) { CFG.days.push(spec.day_id); fillDays(); } }
  else toast('שגיאה: ' + (r.error || 'שמירה נכשלה'));
};
document.getElementById('pdfBtn').onclick = async () => {
  const res = await fetch('/api/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(spec) });
  if (!res.ok) { toast('הוולידציה נכשלה — תקן את השגיאות'); return; }
  const blob = await res.blob();
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (spec.day_id || 'nika_day') + '.pdf'; a.click();
  toast('ה-PDF ירד ✔');
};

function fillDays() {
  document.getElementById('dayList').innerHTML = CFG.days.map((d) => `<option value="${d}">${d}</option>`).join('');
}
function studentPageTemplate(level) {
  return { level, intro: '', instruction: '', example: defaultTask('count'), tasks: [defaultTask('count')], encouraging_message: '', quick_check: defaultTask('write_count'), success_reflection: ['tried', 'improved', 'persevered'], bonus: { type: 'text', text: '' }, footer: '' };
}
function newDay() {
  return {
    day_id: 'grade_1_math_dayN', subject: 'math', audience: 'grade_1', niqqud: false,
    day_label: 'יום ? – ...', title: 'כותרת חדשה?', core_skill: '', theme: '', leading_value: '',
    pages: {
      beginner: studentPageTemplate('beginner'), mid: studentPageTemplate('mid'), challenge: studentPageTemplate('challenge'),
      coach_guide: { daily_goal: [''], leading_value: { name: '', text: '' }, pages_overview: [{ level: 'beginner', audience: '', points: [''] }, { level: 'mid', audience: '', points: [''] }, { level: 'challenge', audience: '', points: [''] }], how_to_mediate: [''], adaptations: [''], fast_finishers: [''], coach_message: { lead: '', values: [''] }, phrases: [''], footer_legend: [''] },
    },
  };
}

// ── init ──
(async function init() {
  CFG = await (await fetch('/api/config')).json();
  fillDays();
  const start = CFG.days.includes('grade_1_math_day_1') ? 'grade_1_math_day_1' : CFG.days[0];
  if (start) { document.getElementById('dayList').value = start; await loadDay(start); }
  else { spec = newDay(); renderTabs(); renderChips(); renderForm(); refresh(); }
})();
