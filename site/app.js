import { hbars, stackedHbars, columns, lines, dots, legend, fmtPct, fmtInt, fmtSigned } from "./charts.js";

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const share = (arr, f) => arr.length ? arr.filter(f).length / arr.length : 0;
const startYear = c => 1789 + 2 * (c - 1);
const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
const congressName = c => `${ordinal(c)} Congress (${startYear(c)}–${startYear(c) + 2})`;

// Party colors follow lineage, so a party keeps its color across eras (validated for colorblind separation).
const FAMILY = {
  dem: { label: "Democrat / Jeffersonian lineage", color: "var(--p-dem)" },
  rep: { label: "Republican", color: "var(--p-rep)" },
  whig: { label: "Federalist / Whig lineage", color: "var(--p-whig)" },
  other: { label: "Other parties", color: "var(--p-other)" }
};
const familyOf = name =>
  /^(Democrat|Jackson|Democrat-Republican|Anti-Administration|Jackson Republican|Crawford Republican)$/.test(name) ? "dem" :
  name === "Republican" ? "rep" :
  /Federalist|Pro-Administration|^Adams$|Anti-Jackson|Adams-Clay|National Republican|^Whig$|^Opposition$|^American$/.test(name) ? "whig" : "other";

const TABS = [["demographics", "Demographics"], ["education", "Education"], ["ideology", "Ideology"], ["trends", "Over time"], ["members", "Members"]];

let D, PEOPLE, ROWS, MAXC;
const state = { tab: "demographics", c: 119, chamber: "all", party: "all", st: "all", gender: "all", q: "", sort: "name", dir: 1 };

// ---- Data ----------------------------------------------------------------------------
function decode(raw) {
  PEOPLE = raw.people.map(p => ({
    id: p[0], name: p[1], gender: p[2], born: p[3], wiki: p[4], level: p[5],
    insts: p[6], occs: p[7], rel: p[8], mil: p[9] === 1, lead: p[10], last: p[11] || p[1]
  }));
  ROWS = raw.members.map(m => {
    const party = raw.parties[m[5]];
    return { c: m[0], ch: m[1], p: PEOPLE[m[2]], st: m[3], d: m[4], party, fam: familyOf(party), x: m[6], y: m[7], prior: m[8] };
  });
  MAXC = Math.max(...ROWS.map(r => r.c));
  state.c = MAXC;
}

function match(r, { ignoreCongress = false } = {}) {
  return (ignoreCongress || r.c === state.c) &&
    (state.chamber === "all" || r.ch === state.chamber) &&
    (state.party === "all" || r.party === state.party) &&
    (state.st === "all" || r.st === state.st) &&
    (state.gender === "all" || r.p.gender === state.gender);
}
// One row per person (someone who served in both chambers in one Congress counts once).
const uniquePeople = rows => [...new Map(rows.map(r => [r.p.id, r])).values()];
const selection = () => uniquePeople(ROWS.filter(r => match(r)));
const age = r => r.p.born ? startYear(r.c) - r.p.born : null;

// ---- URL state ----------------------------------------------------------------------------
function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (TABS.some(([k]) => k === h.get("tab"))) state.tab = h.get("tab");
  const c = +h.get("c"); if (c >= 1 && c <= MAXC) state.c = c;
  for (const k of ["chamber", "party", "st", "gender"]) if (h.get(k)) state[k] = h.get(k);
}
function writeHash() {
  const h = new URLSearchParams({ tab: state.tab, c: state.c });
  for (const k of ["chamber", "party", "st", "gender"]) if (state[k] !== "all") h.set(k, state[k]);
  history.replaceState(null, "", "#" + h);
}

// ---- Controls -----------------------------------------------------------------------------
function renderControls() {
  $("tabs").innerHTML = TABS.map(([k, label]) =>
    `<button class="link${state.tab === k ? " on" : ""}" data-tab="${k}">${label}</button>`).join(' <span>/</span> ');
  const cs = $("f-congress");
  if (!cs.options.length) cs.innerHTML = Array.from({ length: MAXC }, (_, i) => MAXC - i)
    .map(c => `<option value="${c}">${congressName(c)}</option>`).join("");
  cs.value = state.c;
  // Party and state lists depend on the chosen Congress (and on "Over time", all Congresses).
  const pool = ROWS.filter(r => state.tab === "trends" || r.c === state.c);
  const parties = count(pool.map(r => r.party));
  if (state.party !== "all" && !parties.some(([p]) => p === state.party)) parties.push([state.party, 0]);
  $("f-party").innerHTML = `<option value="all">All parties</option>` +
    parties.map(([p, n]) => `<option value="${esc(p)}">${esc(p)}${state.tab === "trends" ? "" : ` (${n})`}</option>`).join("");
  $("f-party").value = state.party;
  const states = [...new Set(pool.map(r => r.st))].sort();
  if (state.st !== "all" && !states.includes(state.st)) states.push(state.st);
  $("f-state").innerHTML = `<option value="all">All states</option>` + states.map(s => `<option>${s}</option>`).join("");
  $("f-state").value = state.st;
  $("f-chamber").value = state.chamber; $("f-gender").value = state.gender;
  $("f-congress").disabled = state.tab === "trends";
}
const count = arr => Object.entries(arr.reduce((a, k) => (a[k] = (a[k] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1]);

// ---- Shared pieces ---------------------------------------------------------------------------
const tile = (label, value, sub = "") => `<div class="tile"><div class="label">${label}</div><div class="value">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`;
const chart = (id, title, note = "", wide = false) => `<section class="chart${wide ? " wide" : ""}"><h2>${title}</h2>${note ? `<p class="note">${note}</p>` : ""}<div class="body" id="${id}"></div></section>`;
const coverage = (n, total, what) => `${what} on record for ${fmtInt(n)} of ${fmtInt(total)} members (${fmtPct(n / (total || 1))}).`;

function summary(sel) {
  if (!sel.length) return `<p class="summary">No members match these filters in the ${congressName(state.c)}.</p>`;
  const parties = count(sel.map(r => r.party)).map(([p, n]) => `${fmtInt(n)} ${esc(p)}${n === 1 ? "" : p.endsWith("s") ? "" : "s"}`);
  const where = [state.chamber === "H" ? "the House" : state.chamber === "S" ? "the Senate" : "", state.st !== "all" ? `from ${state.st}` : ""].filter(Boolean).join(" ");
  return `<p class="summary"><b>${fmtInt(sel.length)} ${state.gender === "F" ? "women" : state.gender === "M" ? "men" : "members"}</b> served ${where ? `in ${where} ` : ""}in the ${congressName(state.c)}: ${parties.slice(0, 4).join(", ")}${parties.length > 4 ? `, and ${parties.length - 4} smaller parties` : ""}.</p>`;
}
const partySegments = rows => Object.keys(FAMILY).map(f => ({ key: FAMILY[f].label, value: rows.filter(r => r.fam === f).length, color: FAMILY[f].color }));
const familyKeys = rows => Object.keys(FAMILY).filter(f => rows.some(r => r.fam === f)).map(f => {
  const names = [...new Set(rows.filter(r => r.fam === f).map(r => r.party))];
  return { label: names.length <= 2 ? names.join(", ") : FAMILY[f].label, color: FAMILY[f].color };
});

// ---- Views --------------------------------------------------------------------------------------
function demographics(sel) {
  const ages = sel.map(age).filter(a => a != null);
  const women = sel.filter(r => r.p.gender === "F").length;
  const withOcc = sel.filter(r => r.p.occs.length), withRel = sel.filter(r => r.p.rel >= 0);
  $("view").innerHTML = summary(sel) + `
    <div class="tiles">
      ${tile("Members", fmtInt(sel.length))}
      ${tile("Women", fmtPct(women / sel.length), `${fmtInt(women)} members`)}
      ${tile("Median age", ages.length ? Math.round(median(ages)) : "–", `at the start of the Congress`)}
      ${tile("Newcomers", fmtPct(share(sel, r => r.prior === 0)), "first Congress ever")}
      ${tile("Military service", fmtPct(share(sel, r => r.p.mil)), "on record (a lower bound)")}
    </div>
    <div class="grid2">
      ${chart("c-age", "Age at the start of the Congress", "Members per five-year age band. Hover a column for the count.")}
      ${chart("c-born", "Birth decade", "Members born in each decade.")}
      ${chart("c-tenure", "Experience", "Congresses served before this one, in either chamber. Each Congress is two years.")}
      ${chart("c-gender", "Women by party", "Share of each party's members who are women.")}
      ${chart("c-occ", "Careers before Congress", coverage(withOcc.length, sel.length, "Careers are") + " Members can have more than one. Political offices are left out.")}
      ${chart("c-rel", "Religion", coverage(withRel.length, sel.length, "Religion is") + " Shares are of members with a known religion.")}
    </div>`;
  const bands = [];
  for (let a = 25; a <= 90; a += 5) bands.push({ lo: a, hi: a + 4 });
  bands[0].lo = 0; bands.at(-1).hi = 200;
  columns($("c-age"), bands.map(b => {
    const n = ages.filter(a => a >= b.lo && a <= b.hi).length;
    const label = b.lo === 0 ? "<30" : b.hi === 200 ? "90+" : `${b.lo}`;
    return { label, value: n, tip: `<b>Age ${b.lo === 0 ? "under 30" : b.hi === 200 ? "90 and over" : `${b.lo}–${b.hi}`}</b><br>${n} members` };
  }), { labelEvery: 2 });
  const decades = sel.filter(r => r.p.born).map(r => Math.floor(r.p.born / 10) * 10);
  if (decades.length) {
    const d0 = Math.min(...decades), d1 = Math.max(...decades), bins = [];
    for (let d = d0; d <= d1; d += 10) { const n = decades.filter(x => x === d).length; bins.push({ label: `${d}s`, value: n, tip: `<b>Born in the ${d}s</b><br>${n} members` }); }
    columns($("c-born"), bins, { labelEvery: bins.length > 8 ? 2 : 1 });
  }
  const tenure = [];
  for (let k = 0; k <= 15; k++) {
    const n = sel.filter(r => k === 15 ? r.prior >= 15 : r.prior === k).length;
    tenure.push({ label: k === 15 ? "15+" : String(k), value: n, tip: `<b>${k === 15 ? "15 or more" : k} prior Congress${k === 1 ? "" : "es"}</b><br>${n} members` });
  }
  columns($("c-tenure"), tenure, { labelEvery: 3 });
  const byParty = count(sel.map(r => r.party)).slice(0, 5);
  hbars($("c-gender"), byParty.map(([p]) => {
    const rows = sel.filter(r => r.party === p);
    return { label: p, value: share(rows, r => r.p.gender === "F"), n: rows.length, w: rows.filter(r => r.p.gender === "F").length };
  }), { max: 1, tipText: i => `<b>${esc(i.label)}</b><br>${i.w} of ${i.n} members are women (${fmtPct(i.value)})` });
  barsFromCounts($("c-occ"), withOcc.flatMap(r => r.p.occs.map(o => D.occupations[o])), withOcc.length);
  barsFromCounts($("c-rel"), withRel.map(r => D.religions[r.p.rel]), withRel.length);
}

function barsFromCounts(el, values, denom, top = 12) {
  if (!denom) { el.innerHTML = `<p class="muted">No data for this selection.</p>`; return; }
  hbars(el, count(values).slice(0, top).map(([label, n]) => ({ label, value: n / denom, n })),
    { tipText: i => `<b>${esc(i.label)}</b><br>${i.n} of ${denom} members (${fmtPct(i.value)})` });
}

const SERVICE = /United States (Military|Naval|Air Force|Coast Guard|Merchant Marine) Academy/;
function education(sel) {
  const known = sel.filter(r => r.p.level < D.levels.length - 1);
  const inst = i => D.institutions[i];
  $("view").innerHTML = summary(sel) + `
    <div class="tiles">
      ${tile("Education on record", fmtPct(known.length / (sel.length || 1)), `${fmtInt(known.length)} members`)}
      ${tile("Ivy League", fmtPct(share(sel, r => r.p.insts.some(i => D.ivy[i]))), "attended at least one")}
      ${tile("Law degree", fmtPct(share(sel, r => r.p.level === 1)), "or attended law school")}
      ${tile("Graduate degree", fmtPct(share(sel, r => r.p.level <= 2)), "law, master's, doctorate or MD")}
      ${tile("Service academy", fmtPct(share(sel, r => r.p.insts.some(i => SERVICE.test(inst(i))))), "West Point, Annapolis, etc.")}
    </div>
    <div class="grid2">
      ${chart("c-level", "Highest education on record", "Based on degrees and schools listed in Wikidata. Older records rarely list degrees, so “College” can mean attended or graduated.")}
      ${chart("c-schools", "Most-attended schools", "Members who attended each school, by party. Law and graduate schools count toward their university.")}
    </div>`;
  hbars($("c-level"), D.levels.map((label, i) => {
    const n = sel.filter(r => r.p.level === i).length;
    return { label, value: n / (sel.length || 1), n };
  }), { tipText: i => `<b>${esc(i.label)}</b><br>${i.n} members (${fmtPct(i.value)})` });
  const schools = count(sel.flatMap(r => r.p.insts.map(inst))).slice(0, 15);
  if (!schools.length) { $("c-schools").innerHTML = `<p class="muted">No schools on record for this selection.</p>`; return; }
  stackedHbars($("c-schools"), schools.map(([s]) => ({
    label: s, segments: partySegments(sel.filter(r => r.p.insts.some(i => inst(i) === s)))
  })), familyKeys(sel));
}

function ideology(sel) {
  const scored = sel.filter(r => r.x != null && r.y != null);
  const parties = count(scored.map(r => r.party));
  const main = parties.slice(0, 4).map(([p]) => p);
  const rows = main.map(p => ({ key: p, label: p }));
  const tipFor = r => `<b>${esc(r.p.name)}</b><br>${esc(r.party)}, ${r.st}${r.ch === "H" && r.d ? `-${r.d}` : ""} · ${r.ch === "S" ? "Senate" : "House"}<br>Left–right score: ${fmtSigned(r.x)}`;
  $("view").innerHTML = summary(sel) + `
    <p class="dek">These are DW-NOMINATE scores from Voteview. They place each member by how they voted, from −1 (most liberal) to +1 (most conservative) on the main left–right dimension. The second dimension picks up issues that cut across parties, such as civil rights votes in the mid-1900s. ${scored.length < sel.length ? `${sel.length - scored.length} members have no score, usually because they cast too few votes or were non-voting delegates.` : ""}</p>
    <div class="tiles">
      ${main.slice(0, 3).map(p => tile(`${esc(p)} median`, fmtSigned(median(scored.filter(r => r.party === p).map(r => r.x))), `${scored.filter(r => r.party === p).length} members`)).join("")}
      ${main.length >= 2 ? tile("Gap between the two largest parties", Math.abs(median(scored.filter(r => r.party === main[0]).map(r => r.x)) - median(scored.filter(r => r.party === main[1]).map(r => r.x))).toFixed(2), "difference in medians") : ""}
    </div>
    <div class="grid2">
      ${chart("c-strip", "Left–right score by party", "Each dot is one member. Hover for names.", true)}
      ${chart("c-scatter", "Both dimensions", "Left–right score across, second dimension up and down.", true)}
    </div>`;
  if (!scored.length) { $("c-strip").innerHTML = `<p class="muted">No scores for this selection.</p>`; return; }
  const inMain = scored.filter(r => main.includes(r.party));
  dots($("c-strip"), inMain.map(r => ({ x: r.x, row: r.party, color: FAMILY[r.fam].color, tip: tipFor(r) })),
    { strip: true, rows, xTitle: "← more liberal · more conservative →" });
  $("c-scatter").insertAdjacentHTML("afterbegin", legend(familyKeys(scored)));
  const holder = document.createElement("div"); $("c-scatter").appendChild(holder);
  dots(holder, scored.map(r => ({ x: r.x, y: r.y, color: FAMILY[r.fam].color, tip: tipFor(r) + `<br>Second dimension: ${fmtSigned(r.y)}` })),
    { xTitle: "← more liberal · more conservative →", yTitle: "Second dimension" });
}

function trends() {
  const rows = ROWS.filter(r => match(r, { ignoreCongress: true }));
  const byC = new Map();
  for (const r of rows) { if (!byC.has(r.c)) byC.set(r.c, []); byC.get(r.c).push(r); }
  for (const [c, rs] of byC) byC.set(c, uniquePeople(rs));
  const cs = [...byC.keys()].sort((a, b) => a - b);
  const series = (f, { minN = 5 } = {}) => cs.map(c => { const rs = byC.get(c); return rs.length >= minN ? { x: startYear(c), y: f(rs), n: rs.length } : null; }).filter(Boolean);
  const xLabel = (year, long) => long ? congressName((year - 1789) / 2 + 1) : String(year);
  const opts = { marker: startYear(state.c), xLabel };
  const ink = "var(--bar)";
  $("view").innerHTML = `<p class="summary">Every Congress from the 1st (1789) to the ${ordinal(MAXC)}${state.chamber !== "all" || state.party !== "all" || state.st !== "all" || state.gender !== "all" ? ", for the filters above" : ""}. Hover a chart to read any Congress.</p>
    <div class="grid2">
      ${state.gender === "all" ? chart("t-women", "Women", "Share of members who are women.") : ""}
      ${chart("t-age", "Median age", "At the start of each Congress.")}
      ${chart("t-law", "Lawyers", "Members with a law career or law degree on record.")}
      ${chart("t-ivy", "Ivy League", "Members who attended an Ivy League school.")}
      ${chart("t-mil", "Military service on record", "A lower bound: older records especially miss service.")}
      ${chart("t-new", "Newcomers", "Members serving their first Congress.")}
      ${chart("t-ideo", "Party medians, left–right", "Median DW-NOMINATE score of each party lineage. The widening gap since the 1970s is polarization.", true)}
    </div>`;
  if (!cs.length) { $("view").insertAdjacentHTML("beforeend", `<p class="muted">No members match these filters.</p>`); return; }
  if (state.gender === "all") lines($("t-women"), [{ label: "Women", color: ink, points: series(rs => share(rs, r => r.p.gender === "F")) }], { ...opts, yMin: 0 });
  lines($("t-age"), [{ label: "Median age", color: ink, points: series(rs => median(rs.map(age).filter(a => a != null))) }], { ...opts, yFormat: v => Math.round(v) });
  lines($("t-law"), [{ label: "Lawyers", color: ink, points: series(rs => share(rs, r => r.p.level === 1 || r.p.occs.includes(0))) }], { ...opts, yMin: 0, yMax: 1 });
  lines($("t-ivy"), [{ label: "Ivy League", color: ink, points: series(rs => share(rs, r => r.p.insts.some(i => D.ivy[i]))) }], { ...opts, yMin: 0 });
  lines($("t-mil"), [{ label: "Military service", color: ink, points: series(rs => share(rs, r => r.p.mil)) }], { ...opts, yMin: 0 });
  lines($("t-new"), [{ label: "Newcomers", color: ink, points: series(rs => share(rs, r => r.prior === 0)) }], { ...opts, yMin: 0 });
  const ideo = Object.keys(FAMILY).filter(f => f !== "other").map(f => ({
    label: FAMILY[f].label, color: FAMILY[f].color,
    points: series(rs => { const xs = rs.filter(r => r.fam === f && r.x != null).map(r => r.x); return xs.length >= 10 ? median(xs) : null; }, { minN: 1 }).filter(p => p.y != null)
  })).filter(s => s.points.length);
  lines($("t-ideo"), ideo, { ...opts, yFormat: v => fmtSigned(v, 1), height: 260 });
}

const LEVEL_SHORT = ["Doctorate/MD", "Law", "Master's", "College", "–"];
const COLS = [
  ["name", "Name", r => r.p.last || r.p.name],
  ["party", "Party", r => r.party],
  ["seat", "Seat", r => `${r.st}${r.ch === "H" && r.d ? "-" + String(r.d).padStart(2, "0") : ""}`],
  ["chamber", "Chamber", r => r.ch],
  ["age", "Age", r => age(r) ?? -1, true],
  ["prior", "Prior Congresses", r => r.prior, true],
  ["edu", "Education", r => r.p.level],
  ["score", "Left–right", r => r.x ?? 9, true]
];
function members(sel) {
  const q = state.q.trim().toLowerCase();
  const inst = i => D.institutions[i];
  let rows = sel.filter(r => !q || r.p.name.toLowerCase().includes(q) || r.party.toLowerCase().includes(q) || r.st.toLowerCase() === q ||
    r.p.insts.some(i => inst(i).toLowerCase().includes(q)));
  const col = COLS.find(c => c[0] === state.sort) || COLS[0];
  rows = rows.sort((a, b) => { const x = col[2](a), y = col[2](b); return (x < y ? -1 : x > y ? 1 : 0) * state.dir; });
  $("view").innerHTML = summary(sel) + `
    <div class="table-tools">
      <input type="search" id="q" placeholder="Search names, parties, states or schools…" value="${esc(state.q)}" aria-label="Search members">
      <span class="muted">${fmtInt(rows.length)} shown</span>
      <button class="link" id="csv">Download CSV</button>
    </div>
    <div class="table-wrap"><table>
      <thead><tr>${COLS.map(([k, label, , num]) => `<th class="${num ? "num" : ""}"><button class="link" data-sort="${k}">${label}${state.sort === k ? (state.dir > 0 ? " ↑" : " ↓") : ""}</button></th>`).join("")}<th>Schools</th><th>Career</th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td>${r.p.wiki ? `<a href="https://en.wikipedia.org/wiki/${encodeURIComponent(r.p.wiki.replace(/ /g, "_"))}" rel="noreferrer">${esc(r.p.name)}</a>` : esc(r.p.name)}</td>
        <td><i class="key" style="background:${FAMILY[r.fam].color}"></i>${esc(r.party)}</td>
        <td>${COLS[2][2](r)}</td><td>${r.ch === "S" ? "Senate" : "House"}</td>
        <td class="num">${age(r) ?? "–"}</td><td class="num">${r.prior}</td>
        <td>${LEVEL_SHORT[r.p.level]}</td><td class="num">${r.x != null ? fmtSigned(r.x) : "–"}</td>
        <td>${esc(r.p.insts.slice(0, 3).map(inst).join("; "))}</td>
        <td>${esc(r.p.occs.map(o => D.occupations[o]).join("; "))}</td></tr>`).join("")}</tbody>
    </table></div>`;
  $("q").addEventListener("input", e => { state.q = e.target.value; const pos = e.target.selectionStart; members(selection()); $("q").focus(); $("q").setSelectionRange(pos, pos); });
  $("csv").addEventListener("click", () => downloadCSV(rows));
}

function downloadCSV(rows) {
  const head = ["bioguide_id", "name", "party", "state", "district", "chamber", "gender", "birth_year", "age_at_start", "prior_congresses",
    "highest_education", "schools", "careers", "religion", "military_service_on_record", "nominate_dim1", "nominate_dim2"];
  const cell = v => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [head.join(",")].concat(rows.map(r => [r.p.id, r.p.name, r.party, r.st, r.d, r.ch === "S" ? "Senate" : "House", r.p.gender, r.p.born, age(r), r.prior,
    D.levels[r.p.level], r.p.insts.map(i => D.institutions[i]).join("; "), r.p.occs.map(o => D.occupations[o]).join("; "),
    r.p.rel >= 0 ? D.religions[r.p.rel] : "", r.p.mil ? "yes" : "", r.x, r.y].map(cell).join(",")));
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `congress-${state.c}-members.csv` });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- Wiring ----------------------------------------------------------------------------------------
function render() {
  renderControls(); writeHash();
  if (state.tab === "trends") return trends();
  const sel = selection();
  ({ demographics, education, ideology, members })[state.tab](sel);
}

document.addEventListener("click", e => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.tab) { state.tab = t.dataset.tab; render(); }
  else if (t.dataset.sort) { state.dir = state.sort === t.dataset.sort ? -state.dir : 1; state.sort = t.dataset.sort; members(selection()); }
  else if (t.id === "reset") { Object.assign(state, { chamber: "all", party: "all", st: "all", gender: "all", q: "" }); render(); }
});
$("home").addEventListener("click", e => { e.preventDefault(); Object.assign(state, { tab: "demographics", c: MAXC, chamber: "all", party: "all", st: "all", gender: "all", q: "" }); render(); });
const bind = (id, key, num) => $(id).addEventListener("change", e => { state[key] = num ? +e.target.value : e.target.value; render(); });
bind("f-congress", "c", true); bind("f-chamber", "chamber"); bind("f-party", "party"); bind("f-state", "st"); bind("f-gender", "gender");
addEventListener("hashchange", () => { if (D) { readHash(); render(); } });
let resizeTimer;
addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (["ideology", "trends"].includes(state.tab)) render(); }, 200); });

fetch("data/congress.json").then(r => r.json()).then(raw => {
  D = raw; decode(raw); readHash();
  $("generated").textContent = `Data built ${raw.generated}.`;
  render();
}).catch(err => { $("view").innerHTML = `<p>Couldn't load the data file (${esc(err.message)}). If you opened this file directly, serve the folder instead, for example with <code>node scripts/serve.mjs</code>.</p>`; });
