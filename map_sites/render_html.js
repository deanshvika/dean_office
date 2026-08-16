'use strict';
/**
 * תבנית עמוד מפת המוקדים.
 *
 * שפה עיצובית: מפה עירונית. קרקע קרירה בנטייה כחלחלה־ירקרקה (הים),
 * רוויה שמורה כולה לסיכות הסטטוס. פרנק־רוהל לכותרות (הפנים הממוסדות של הדפוס
 * העברי), IBM Plex Sans Hebrew לממשק, Plex Mono לקואורדינטות.
 */

const { esc, STATUS, LEAVING, STATUS_ORDER, statusOf, wazeUrl, gmapsUrl, gradeRange, phoneFmt } = require('./presentation.js');

const FAMILY = { FrankRuhlLibre: '"Frank Ruhl Libre"', PlexHe: '"IBM Plex Sans Hebrew"', PlexMono: '"IBM Plex Mono"' };

const fontFaces = fonts => fonts.map(f => `@font-face{font-family:${FAMILY[f.family]};font-style:normal;font-weight:${f.weight};font-display:swap;src:url(data:font/woff2;base64,${f.b64}) format("woff2");unicode-range:${f.range};}`).join('\n');

// ---------------------------------------------------------------- SVG

function svgMapA(m) {
  const land = m.landParts.join(' ');
  const hot = m.hotParts.join(' ');
  const pins = m.pins.map(p => {
    const l = p.label;
    // אזור לחיצה שקוף מתחת לתווית — בלעדיו רק העיגול לחיץ, והטקסט נראה אינטראקטיבי בלי להיות
    const hit = l.hit ? `<rect class="pin-hit" x="${l.hit.x.toFixed(1)}" y="${l.hit.y.toFixed(1)}" width="${l.hit.w.toFixed(1)}" height="${l.hit.h.toFixed(1)}"/>` : '';
    return `<g class="pin s-${p.st.key}" data-id="${esc(p.id)}" tabindex="0" role="button" aria-label="${esc(p.name)} — ${esc(p.st.label)}">
${hit}<circle class="pin-halo" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="13"/>
<circle class="pin-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="6.5"/>
<text class="pin-label" x="${(p.x + l.dx).toFixed(1)}" y="${(p.y + l.dy).toFixed(1)}" text-anchor="${l.anchor}">${esc(p.name)}</text>
</g>`;
  }).join('\n');
  const notes = m.notes.map(n =>
    `<text class="note n-${n.cls}" x="${n.x.toFixed(1)}" y="${n.y.toFixed(1)}" text-anchor="middle">${esc(n.text)}</text>`).join('\n');

  return `<svg class="map map-a" viewBox="0 0 ${m.W} ${m.H.toFixed(0)}" style="direction:ltr" role="img" aria-label="מפת מוקדי ניקה בתל אביב–יפו">
<rect class="bg-outside" x="0" y="0" width="${m.W}" height="${m.H.toFixed(0)}"/>
<path class="bg-sea" d="${m.seaPath}"/>
<path class="bg-land" d="${land}"/>
<path class="bg-land bg-land-hot" d="${hot}"/>
<path class="line-road" d="${m.ayalon}"/>
<path class="line-river" d="${m.yarkon}"/>
${notes}
${pins}
</svg>`;
}

function svgMapB(m) {
  const pins = m.pins.map(p => {
    const l = p.label;
    const hit = l && l.hit ? `<rect class="pin-hit" x="${l.hit.x.toFixed(1)}" y="${l.hit.y.toFixed(1)}" width="${l.hit.w.toFixed(1)}" height="${l.hit.h.toFixed(1)}"/>` : '';
    const text = l ? `<text class="pin-label pin-label-sm" x="${(p.x + l.dx).toFixed(1)}" y="${(p.y + l.dy).toFixed(1)}" text-anchor="${l.anchor}">${esc(p.shortName)}</text>` : '';
    return `<g class="pin pin-sm s-${p.st.key}" data-id="${esc(p.id)}" tabindex="0" role="button" aria-label="${esc(p.shortName)} — ${esc(p.st.label)}">
${hit}<circle class="pin-halo" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="10"/>
<circle class="pin-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.5"/>
${text}</g>`;
  }).join('\n');

  const s = m.scale;
  return `<svg class="map map-b" viewBox="0 0 ${m.W} ${m.H.toFixed(0)}" style="direction:ltr" role="img" aria-label="מפת כלל המוקדים במרכז הארץ">
<rect class="bg-outside" x="0" y="0" width="${m.W}" height="${m.H.toFixed(0)}"/>
<path class="bg-sea" d="${m.seaPath}"/>
<path class="bg-land bg-land-hot" d="${m.taOutline}"/>
<rect class="ta-frame" x="${m.frame.x.toFixed(1)}" y="${m.frame.y.toFixed(1)}" width="${m.frame.w.toFixed(1)}" height="${m.frame.h.toFixed(1)}" rx="3"/>
<text class="note n-area" x="${(m.frame.x + m.frame.w / 2).toFixed(1)}" y="${(m.frame.y - 6).toFixed(1)}" text-anchor="middle">תל אביב–יפו</text>
${pins}
<g class="scalebar">
  <line x1="${s.x.toFixed(1)}" y1="${s.y.toFixed(1)}" x2="${(s.x + s.len).toFixed(1)}" y2="${s.y.toFixed(1)}"/>
  <line x1="${s.x.toFixed(1)}" y1="${(s.y - 3).toFixed(1)}" x2="${s.x.toFixed(1)}" y2="${(s.y + 3).toFixed(1)}"/>
  <line x1="${(s.x + s.len).toFixed(1)}" y1="${(s.y - 3).toFixed(1)}" x2="${(s.x + s.len).toFixed(1)}" y2="${(s.y + 3).toFixed(1)}"/>
  <text x="${(s.x + s.len / 2).toFixed(1)}" y="${(s.y - 6).toFixed(1)}" text-anchor="middle">${s.km} ק״מ</text>
</g>
</svg>`;
}

// ---------------------------------------------------------------- רשימות

function siteRow(s) {
  const st = statusOf(s);
  const coach = s.coach2627 || (s.coachHint ? s.coachHint.replace(/\?$/, '') : '');
  const meta = [s.days, coach || 'ללא מאמן'].filter(Boolean).join(' · ');
  const flag = s.staleCertainty ? '<span class="row-flag" title="רשום מאמן אך הוודאות עדיין ״חסר״">⚠</span>' : '';
  return `<li class="row s-${st.key}" data-id="${esc(s.id)}" data-status="${st.key}">
<button class="row-btn" type="button">
  <span class="row-dot" aria-hidden="true"></span>
  <span class="row-main">
    <span class="row-top"><span class="row-name">${esc(s.shortName)}${flag}</span><span class="chip c-${st.key}">${esc(st.label)}</span></span>
    <span class="row-addr">${esc(s.address || '—')}${s.neighborhood ? ` · ${esc(s.neighborhood)}` : ''}</span>
    <span class="row-meta">${esc(meta)}</span>
  </span>
</button>
</li>`;
}

// ---------------------------------------------------------------- העמוד

function renderHtml(d) {
  const { mapA, mapB, fonts, all, taActive, active, gaps, taGaps, daysLeft, taByCluster, outside, data } = d;

  const counts = {};
  for (const k of STATUS_ORDER) counts[k] = all.filter(s => statusOf(s).key === k).length;
  const legendItems = STATUS_ORDER.map(k => {
    const label = k === 'leaving' ? LEAVING.label : Object.values(STATUS).find(v => v.key === k).label;
    return `<button class="lg c-${k}" type="button" data-filter="${k}" aria-pressed="false">
<span class="lg-dot"></span><span class="lg-txt">${esc(label)}</span><span class="lg-n">${counts[k]}</span></button>`;
  }).join('');

  const payload = Object.fromEntries(all.map(s => [s.id, {
    n: s.shortName, full: s.name, city: s.city, nb: s.neighborhood || '', addr: s.address || '',
    days: s.days || '', hours: s.hours || '', prog: s.program || '', scope: s.scope || '',
    cLast: s.coachLastYear || '', c2627: s.coach2627 || '', hint: s.coachHint || '',
    cert: statusOf(s).label, ck: statusOf(s).key, next: s.nextStep || '', note: s.note || '',
    st: s.status || '', conf: s.conflicts || [], stale: !!s.staleCertainty, lat: s.lat, lon: s.lon,
    waze: wazeUrl(s), gm: gmapsUrl(s), src: s.source || '', ver: s.verifiedBy || '',
    phone: phoneFmt(s.phone), grades: gradeRange(s.gradeFrom, s.gradeTo),
  }]));

  // שורות שהסנכרון מילא בהן מאמן אך עמודת הוודאות נשארה "חסר" — עבודה פתוחה בגיליון
  const stale = all.filter(s => s.staleCertainty);
  const staleBanner = stale.length ? `<div class="notice">
<span class="notice-mark" aria-hidden="true">⚠</span>
<div><b>${stale.length} מוקדים מציגים מאמן ובכל זאת מסומנים ״חסר״.</b>
בגיליון המוקדים מולא שם מאמן, אבל עמודת הוודאות לא עודכנה אחריו. המפה צובעת לפי עמודת הוודאות, ולכן הם נשארים אדומים.
צריך לעבור עליהם בגיליון ולקבוע ודאי או משוער: ${stale.map(s => esc(s.shortName)).join(' · ')}</div>
</div>` : '';

  const clusterBlocks = taByCluster.map(g => `<section class="cluster">
<h3 class="cluster-h">${esc(g.cluster)}<span class="cluster-n">${g.list.length}</span></h3>
<ul class="rows">${g.list.map(siteRow).join('')}</ul>
</section>`).join('');

  const outsideBlock = `<section class="cluster">
<h3 class="cluster-h">לפי עיר, מצפון לדרום<span class="cluster-n">${outside.length}</span></h3>
<ul class="rows">${outside.map(siteRow).join('')}</ul>
</section>`;

  return `<title>מפת מוקדי ניקה</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
${fontFaces(fonts)}

:root{
  --ground:#E9EFF0; --surface:#FFFFFF; --surface-2:#F3F7F8;
  --line:#CFD9DC; --line-soft:#E2E9EB;
  --ink:#14212A; --ink-2:#485C66; --ink-3:#788992;
  --accent:#0D7A84; --accent-soft:#E0F0F1;
  --sea:#BCD5DD; --land:#E4EAE9; --land-hot:#D2E1DF; --outside:#DBE2E3;
  --river:#89B7C8; --road:#C8C0B2;
  --sure:#2C7A4C; --maybe:#A9711A; --asked:#5350C4; --gap:#BC3B37; --leaving:#8A9298;
  --shadow:0 1px 2px rgba(20,33,42,.06), 0 6px 20px rgba(20,33,42,.06);
  --r:10px;
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --ground:#0D1316; --surface:#151E22; --surface-2:#1A2429;
    --line:#2A383E; --line-soft:#212D33;
    --ink:#E2EAEC; --ink-2:#9FB0B7; --ink-3:#73858D;
    --accent:#4CBDC7; --accent-soft:#123037;
    --sea:#0C242E; --land:#212D31; --land-hot:#2A3B3E; --outside:#161F23;
    --river:#2C5D73; --road:#3B382F;
    --sure:#5CBC80; --maybe:#D6A148; --asked:#8A87E4; --gap:#E2706B; --leaving:#6B777E;
    --shadow:0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.3);
  }
}
:root[data-theme="dark"]{
  --ground:#0D1316; --surface:#151E22; --surface-2:#1A2429;
  --line:#2A383E; --line-soft:#212D33;
  --ink:#E2EAEC; --ink-2:#9FB0B7; --ink-3:#73858D;
  --accent:#4CBDC7; --accent-soft:#123037;
  --sea:#0C242E; --land:#212D31; --land-hot:#2A3B3E; --outside:#161F23;
  --river:#2C5D73; --road:#3B382F;
  --sure:#5CBC80; --maybe:#D6A148; --asked:#8A87E4; --gap:#E2706B; --leaving:#6B777E;
  --shadow:0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.3);
}

*{box-sizing:border-box}
body{
  margin:0; background:var(--ground); color:var(--ink);
  font-family:${FAMILY.PlexHe},"Segoe UI",system-ui,sans-serif;
  font-size:15px; line-height:1.55; direction:rtl;
  -webkit-font-smoothing:antialiased;
}
.wrap{max-width:1220px; margin:0 auto; padding:28px 20px 56px; display:flex; flex-direction:column; gap:22px}

/* ── כותרת ── */
.head{display:flex; flex-direction:column; gap:14px}
h1{
  font-family:${FAMILY.FrankRuhlLibre},Georgia,serif; font-weight:700;
  font-size:clamp(1.85rem,1.3rem+1.7vw,2.55rem); line-height:1.15; margin:0;
  letter-spacing:-.01em; text-wrap:balance;
}
.sub{margin:0; color:var(--ink-2); max-width:62ch; font-size:.95rem}
.stats{display:flex; flex-wrap:wrap; gap:10px}
.stat{
  background:var(--surface); border:1px solid var(--line-soft); border-radius:var(--r);
  padding:10px 14px; display:flex; flex-direction:column; gap:1px; min-width:118px; box-shadow:var(--shadow);
}
.stat b{font-size:1.5rem; font-weight:600; line-height:1.1; font-variant-numeric:tabular-nums}
.stat span{font-size:.73rem; color:var(--ink-3); letter-spacing:.04em}
.stat.urgent b{color:var(--gap)}
.stat.clock b{color:var(--accent)}

/* ── מקרא / מסנן ── */
.legend{display:flex; flex-wrap:wrap; gap:7px; align-items:center}
.legend-lead{font-size:.78rem; color:var(--ink-3); letter-spacing:.04em; margin-inline-end:2px}
.lg{
  display:inline-flex; align-items:center; gap:7px; cursor:pointer;
  background:var(--surface); border:1px solid var(--line); border-radius:100px;
  padding:5px 11px 5px 8px; font:inherit; font-size:.82rem; color:var(--ink-2);
  transition:border-color .15s, background .15s, color .15s;
}
.lg:hover{border-color:var(--ink-3)}
.lg[aria-pressed="true"]{background:var(--accent-soft); border-color:var(--accent); color:var(--ink)}
.lg-dot{width:9px; height:9px; border-radius:50%; background:var(--c); flex:none}
.lg-n{font-family:${FAMILY.PlexMono},monospace; font-size:.72rem; color:var(--ink-3); font-variant-numeric:tabular-nums}
.c-sure{--c:var(--sure)} .c-maybe{--c:var(--maybe)} .c-asked{--c:var(--asked)}
.c-gap{--c:var(--gap)} .c-leaving{--c:var(--leaving)}

/* ── הודעת אי-התאמה ── */
.notice{
  display:flex; gap:10px; align-items:flex-start; font-size:.85rem; line-height:1.5;
  padding:11px 14px; border-radius:var(--r);
  background:color-mix(in srgb, var(--maybe) 11%, var(--surface));
  border:1px solid color-mix(in srgb, var(--maybe) 42%, transparent);
}
.notice-mark{color:var(--maybe); font-size:1rem; line-height:1.35; flex:none}
.notice b{font-weight:600}
.row-flag{color:var(--maybe); margin-inline-start:5px; font-size:.8em}

/* ── במה ── */
.stage{display:grid; grid-template-columns:minmax(0,1fr) 330px; gap:18px; align-items:start}
@media (max-width:920px){.stage{grid-template-columns:minmax(0,1fr)}}
.card{background:var(--surface); border:1px solid var(--line-soft); border-radius:14px; box-shadow:var(--shadow); overflow:hidden}
.card-h{
  display:flex; justify-content:space-between; align-items:baseline; gap:10px;
  padding:12px 16px; border-bottom:1px solid var(--line-soft);
}
.card-h h2{
  font-family:${FAMILY.FrankRuhlLibre},Georgia,serif; font-size:1.12rem; font-weight:700; margin:0;
}
.card-h .hint{font-size:.75rem; color:var(--ink-3)}
.map-pad{padding:10px}

/* ── מפות ── */
.map{display:block; width:100%; height:auto}
.bg-outside{fill:var(--outside)}
.bg-sea{fill:var(--sea)}
.bg-land{fill:var(--land); stroke:var(--outside); stroke-width:.6}
.bg-land-hot{fill:var(--land-hot)}
.line-river{fill:none; stroke:var(--river); stroke-width:2.2; stroke-linecap:round; stroke-linejoin:round}
.line-road{fill:none; stroke:var(--road); stroke-width:2; stroke-linecap:round}
.note{font-size:9.5px; font-weight:400; letter-spacing:.06em; pointer-events:none}
.n-water{fill:var(--river)}
.n-area{fill:var(--ink-3)}
.n-out{fill:var(--ink-3); opacity:.62; font-size:8.5px}
.n-road{fill:var(--road); font-size:8.5px; letter-spacing:.1em}
.ta-frame{fill:none; stroke:var(--accent); stroke-width:1.2; stroke-dasharray:4 3; opacity:.8}
.scalebar line{stroke:var(--ink-3); stroke-width:1}
.scalebar text{font-size:8.5px; fill:var(--ink-3); letter-spacing:.04em}

.pin{cursor:pointer; outline:none}
.pin-hit{fill:transparent}
.pin-halo{fill:var(--c); opacity:0; transition:opacity .15s}
.pin-dot{fill:var(--c); stroke:var(--surface); stroke-width:2.2; transition:r .12s}
.pin-label{font-size:10.5px; font-weight:600; fill:var(--ink); paint-order:stroke; stroke:var(--surface); stroke-width:2.4px; stroke-linejoin:round; pointer-events:none}
.s-sure{--c:var(--sure)} .s-maybe{--c:var(--maybe)} .s-asked{--c:var(--asked)}
.s-gap{--c:var(--gap)} .s-leaving{--c:var(--leaving)}
.pin-label-sm{font-size:9.5px; font-weight:600}
.pin:hover .pin-halo, .pin:focus-visible .pin-halo{opacity:.22}
.pin:focus-visible .pin-dot{stroke:var(--accent); stroke-width:3}
.pin.sel .pin-halo{opacity:.28}
.pin.sel .pin-dot{r:8.5; stroke-width:3}
.pin.dim{opacity:.16}
.pin.dim .pin-label{display:none}
.map-b .pin.sel .pin-dot{r:6.5}

/* ── פאנל פרטים ── */
.rail{position:sticky; top:16px; display:flex; flex-direction:column; gap:12px}
@media (max-width:920px){.rail{position:static}}
.detail{padding:16px}
.detail .empty{color:var(--ink-3); font-size:.88rem; margin:0}
.d-name{font-family:${FAMILY.FrankRuhlLibre},Georgia,serif; font-size:1.3rem; font-weight:700; margin:0 0 2px; line-height:1.2}
.d-where{font-size:.83rem; color:var(--ink-3); margin:0 0 12px}
.d-chip{display:inline-flex; align-items:center; gap:6px; font-size:.78rem; border-radius:100px; padding:3px 10px; background:var(--surface-2); border:1px solid var(--line); margin-bottom:12px}
.d-chip .lg-dot{width:8px;height:8px}
.d-grid{display:grid; grid-template-columns:auto 1fr; gap:6px 12px; font-size:.86rem; margin:0}
.d-grid dt{color:var(--ink-3); font-size:.78rem; padding-top:2px}
.d-grid dd{margin:0}
.d-mono{font-family:${FAMILY.PlexMono},monospace; font-size:.78rem; font-variant-numeric:tabular-nums; color:var(--ink-2)}
.d-warn{
  margin-top:12px; padding:9px 11px; border-radius:8px; font-size:.79rem; line-height:1.45;
  background:color-mix(in srgb, var(--maybe) 12%, transparent);
  border:1px solid color-mix(in srgb, var(--maybe) 35%, transparent); color:var(--ink);
}
.d-nav{display:flex; gap:8px; margin-top:14px}
.btn{
  flex:1; text-align:center; text-decoration:none; font:inherit; font-size:.83rem; font-weight:600;
  padding:8px 10px; border-radius:8px; border:1px solid var(--line); color:var(--ink); background:var(--surface-2);
  transition:border-color .15s, background .15s;
}
.btn:hover{border-color:var(--accent); background:var(--accent-soft)}
.btn-p{background:var(--accent); border-color:var(--accent); color:#fff}
.btn-p:hover{background:var(--accent); filter:brightness(1.08)}
.d-src{margin-top:12px; padding-top:10px; border-top:1px solid var(--line-soft); font-size:.72rem; color:var(--ink-3); line-height:1.45}

/* ── רשימות ── */
.block{display:flex; flex-direction:column; gap:12px}
.block-h{
  font-family:${FAMILY.FrankRuhlLibre},Georgia,serif; font-size:1.35rem; font-weight:700; margin:6px 0 0;
  padding-bottom:8px; border-bottom:1px solid var(--line);
}
.metro{display:grid; grid-template-columns:minmax(0,1fr) 340px; gap:14px; align-items:start}
@media (max-width:920px){.metro{grid-template-columns:minmax(0,1fr)}}
/* עמודות ולא grid — כרטיסי האשכולות בגבהים שונים מאוד (5 מוקדים מול 1),
   ופריסת grid משאירה חורים בגודל כרטיס שלם */
.lists{column-count:3; column-gap:14px}
@media (max-width:1040px){.lists{column-count:2}}
@media (max-width:700px){.lists{column-count:1}}
.lists .cluster{break-inside:avoid; margin-bottom:14px}
.cluster{background:var(--surface); border:1px solid var(--line-soft); border-radius:14px; box-shadow:var(--shadow); overflow:hidden}
.cluster-h{
  display:flex; justify-content:space-between; align-items:center; margin:0;
  padding:11px 15px; font-size:.85rem; font-weight:600; letter-spacing:.02em;
  border-bottom:1px solid var(--line-soft); background:var(--surface-2);
}
.cluster-n{font-family:${FAMILY.PlexMono},monospace; font-size:.75rem; color:var(--ink-3)}
.rows{list-style:none; margin:0; padding:0}
.row + .row{border-top:1px solid var(--line-soft)}
.row.hide{display:none}
.row-btn{
  width:100%; display:grid; grid-template-columns:auto minmax(0,1fr); gap:10px; align-items:start;
  background:none; border:0; font:inherit; color:inherit; text-align:start; cursor:pointer;
  padding:10px 14px; transition:background .12s;
}
.row-btn:hover{background:var(--surface-2)}
.row.sel .row-btn{background:var(--accent-soft)}
.row-btn:focus-visible{outline:2px solid var(--accent); outline-offset:-2px}
.row-dot{width:9px; height:9px; border-radius:50%; background:var(--c); flex:none; margin-top:6px}
.s-sure .row-dot{background:var(--sure)} .s-maybe .row-dot{background:var(--maybe)}
.s-asked .row-dot{background:var(--asked)} .s-gap .row-dot{background:var(--gap)}
.s-leaving .row-dot{background:var(--leaving)}
.row-main{display:flex; flex-direction:column; gap:1px; min-width:0}
.row-top{display:flex; align-items:center; gap:8px; justify-content:space-between}
.row-name{font-weight:600; font-size:.9rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
.row-addr{font-size:.74rem; color:var(--ink-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
.row-meta{font-size:.74rem; color:var(--ink-2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
.chip{font-size:.68rem; padding:2px 8px; border-radius:100px; white-space:nowrap; color:#fff; background:var(--c); flex:none}
.chip.c-sure{background:var(--sure)} .chip.c-maybe{background:var(--maybe)}
.chip.c-asked{background:var(--asked)} .chip.c-gap{background:var(--gap)}
.chip.c-leaving{background:var(--leaving)}

/* ── תחתית ── */
.foot{font-size:.75rem; color:var(--ink-3); line-height:1.6; border-top:1px solid var(--line); padding-top:16px}
.foot b{color:var(--ink-2); font-weight:600}
.foot ul{margin:6px 0 0; padding-inline-start:18px}

@media (prefers-reduced-motion:reduce){*{transition:none !important; animation:none !important}}
</style>

<div class="wrap">

<header class="head">
  <div>
    <h1>איפה אנחנו עובדים בתל אביב</h1>
    <p class="sub">${active.length} מוקדים פעילים בשנת 26/27, ועוד ${all.length - active.length} שעוזבים, ממופים לפי מיקום גאוגרפי מדויק. הצבע מראה איפה השיבוץ עוד פתוח.</p>
  </div>
  <div class="stats">
    <div class="stat"><b>${taActive.length}</b><span>מוקדים בת״א</span></div>
    <div class="stat urgent"><b>${taGaps.length} מתוך ${taActive.length}</b><span>מהם בלי מאמן ודאי</span></div>
    <div class="stat"><b>${active.length}</b><span>מוקדים פעילים בסך הכל</span></div>
    <div class="stat clock"><b>${daysLeft}</b><span>ימים ליעד 23.8</span></div>
  </div>
</header>

<div class="legend">
  <span class="legend-lead">סינון לפי ודאות השיבוץ</span>
  ${legendItems}
</div>
${staleBanner}

<div class="stage">
  <div class="card">
    <div class="card-h">
      <h2>תל אביב–יפו</h2>
      <span class="hint">לחיצה על מוקד פותחת את הפרטים</span>
    </div>
    <div class="map-pad">${svgMapA(mapA)}</div>
  </div>

  <aside class="rail">
    <div class="card detail" id="detail">
      <p class="empty">בחר מוקד במפה או ברשימה כדי לראות כתובת, ימים ושעות, מאמן וניווט.</p>
    </div>
  </aside>
</div>

<section class="block">
  <h2 class="block-h">מוקדי תל אביב לפי אזור נסיעה</h2>
  <div class="lists">${clusterBlocks}</div>
</section>

<section class="block">
  <h2 class="block-h">מחוץ לעיר</h2>
  <div class="metro">
    <div class="card">
      <div class="card-h"><h2>מרכז הארץ</h2><span class="hint">המסגרת המקווקוות = תחום המפה של תל אביב</span></div>
      <div class="map-pad">${svgMapB(mapB)}</div>
    </div>
    ${outsideBlock}
  </div>
</section>

<footer class="foot">
  <b>מקורות המיקום.</b>
  <ul>
    <li>מוקדי תל אביב–יפו: שכבת GIS של עיריית תל אביב–יפו, ״בתי ספר תשפ״ז״ — כתובת רשמית וקואורדינטת ITM לכל בית ספר. שם השכונה נקבע בהצלבה מול שכבת השכונות של העירייה.</li>
    <li>מוקדים מחוץ לעיר: מאגר ״קואורדינטות מוסדות חינוך״ של משרד החינוך ב-data.gov.il, בהתאמה לפי סמל מוסד. כתובות הרחוב הושלמו בגיאוקודינג הפוך מ-OpenStreetMap.</li>
    <li>קו החוף, הירקון ונתיבי איילון: OpenStreetMap.</li>
    <li>הרוסטר, הימים, השעות והמאמנים: גיליון המוקדים (מסונכרן מהגיליון של חן צור) וגיליון השיבוץ, גיבוי 4.8.2026.</li>
  </ul>
  <p><b>הערה על סתירות.</b> שני הגיליונות אינם מסונכרנים. במקומות שבהם גיליון השיבוץ מציין מאמן וגיליון המוקדים מסמן ״חסר״, שני הערכים מוצגים בכרטיס המוקד ומסומנים.</p>
</footer>

</div>

<script>
const SITES = ${JSON.stringify(payload)};
const detail = document.getElementById('detail');
const pins = [...document.querySelectorAll('.pin')];
const rows = [...document.querySelectorAll('.row')];
let selected = null;
const filters = new Set();

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const line = (k, v) => v ? '<dt>' + k + '</dt><dd>' + esc(v) + '</dd>' : '';

function render(id) {
  const s = SITES[id];
  if (!s) return;
  const conflicts = (s.conf || []).map(c => '<div class="d-warn">⚠ ' + esc(c) + '</div>').join('');
  detail.innerHTML =
    '<h3 class="d-name">' + esc(s.n) + '</h3>' +
    '<p class="d-where">' + esc([s.addr, s.nb && s.nb !== s.addr ? s.nb : '', s.city].filter(Boolean).join(' · ')) + '</p>' +
    '<span class="d-chip c-' + s.ck + '"><span class="lg-dot"></span>' + esc(s.cert) +
      (s.st === 'עוזב' ? ' · עוזב' : '') + '</span>' +
    '<dl class="d-grid">' +
      line('ימים', s.days) + line('שעות', s.hours) +
      line('תוכנית', s.prog) + line('היקף', s.scope) +
      line('מאמן אשתקד', s.cLast) +
      line('מאמן 26/27', s.c2627 || (s.hint ? s.hint + ' (רמז)' : '')) +
      line('כיתות', s.grades) + line('טלפון', s.phone) +
      line('השלב הבא', s.next) + line('הערה', s.note) +
    '</dl>' +
    conflicts +
    '<div class="d-nav">' +
      '<a class="btn btn-p" href="' + s.waze + '" target="_blank" rel="noopener">ניווט ב-Waze</a>' +
      '<a class="btn" href="' + s.gm + '" target="_blank" rel="noopener">Google Maps</a>' +
    '</div>' +
    '<div class="d-src"><span class="d-mono">' + s.lat.toFixed(5) + ', ' + s.lon.toFixed(5) + '</span><br>' +
      esc(s.src) + (s.ver ? '<br>' + esc(s.ver) : '') + '</div>';
}

function select(id) {
  selected = id;
  pins.forEach(p => p.classList.toggle('sel', p.dataset.id === id));
  rows.forEach(r => r.classList.toggle('sel', r.dataset.id === id));
  render(id);
}

function applyFilter() {
  const on = filters.size > 0;
  pins.forEach(p => {
    const k = [...p.classList].find(c => c.startsWith('s-'))?.slice(2);
    p.classList.toggle('dim', on && !filters.has(k));
  });
  rows.forEach(r => r.classList.toggle('hide', on && !filters.has(r.dataset.status)));
}

pins.forEach(p => {
  p.addEventListener('click', () => select(p.dataset.id));
  p.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(p.dataset.id); }
  });
});
rows.forEach(r => r.querySelector('.row-btn').addEventListener('click', () => {
  select(r.dataset.id);
  if (window.matchMedia('(max-width:920px)').matches) detail.scrollIntoView({ behavior: 'smooth', block: 'center' });
}));
document.querySelectorAll('.lg').forEach(b => b.addEventListener('click', () => {
  const k = b.dataset.filter;
  filters.has(k) ? filters.delete(k) : filters.add(k);
  b.setAttribute('aria-pressed', filters.has(k));
  applyFilter();
}));
</script>
`;
}

module.exports = { renderHtml };
