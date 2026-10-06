// Joins the raw sources into site/data/congress.json. Run after fetch.mjs: node scripts/build.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { raceFromCategories } from "./benchmarks.mjs";

const read = f => readFileSync(`raw/${f}`, "utf8");
const json = f => JSON.parse(read(f));

function parseCSV(text) {
  const rows = []; let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter(r => r.length === head.length).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

// ---- People (congress-legislators) -----------------------------------------
const legislators = [...json("legislators-current.json"), ...json("legislators-historical.json")];
const people = new Map(); // bioguide -> record
for (const l of legislators) {
  const n = l.name;
  const name = n.official_full || [n.first, n.middle, n.last, n.suffix].filter(Boolean).join(" ");
  people.set(l.id.bioguide, {
    id: l.id.bioguide, name, last: n.last,
    gender: l.bio?.gender || null,
    born: l.bio?.birthday ? +l.bio.birthday.slice(0, 4) : null,
    wikipedia: l.id.wikipedia || null,
    leadership: (l.leadership_roles || []).map(r => r.title),
    edu: [], occ: new Set(), rel: null, military: false
  });
}

// ---- Wikidata enrichment -----------------------------------------------------
const K12 = /primary school|elementary school|high school|grammar school|public school|preparatory|prep school|^.*academy$/i;
const SERVICE_ACADEMY = /United States (Military|Naval|Air Force|Coast Guard|Merchant Marine) Academy/;
const SYSTEM = /system|board of regents|department of|community colleges|higher education|faculty of arts|^state university of new york$|^city university of new york$|^university of california$|^california state university$|^university of north carolina$/i;
const SUBUNIT = /school|college of|law center|faculty|institute of|^yale college$|^harvard college$/i;
const ALIASES = { "President and Fellows of Harvard College": "Harvard University", "Yale College": "Yale University", "Harvard College": "Harvard University", "Columbia College": "Columbia University" };
const IVY = new Set(["Harvard University", "Yale University", "Princeton University", "Columbia University",
  "University of Pennsylvania", "Brown University", "Dartmouth College", "Cornell University"]);

function institution(school, parent) {
  let p = parent && parent.replace(/^Trustees of (the )?/, "");
  if (p && ALIASES[p]) p = ALIASES[p];
  if (p && !SYSTEM.test(p) && /university|college/i.test(p) && SUBUNIT.test(school)) return p;
  return ALIASES[school] || school;
}

// Highest education on record. Degree labels win; school names fill in when no degree is listed.
const LEVELS = ["Doctorate or MD", "Law degree", "Master's", "College", "Not recorded"];
function levelOf(degree, school) {
  const d = (degree || "").toLowerCase(), s = school.toLowerCase();
  if (/juris doctor|bachelor of laws|master of laws|legum|law degree|^law$/.test(d)) return 1;
  if (/doctor|doctorate|ph\.?d/.test(d)) return 0;
  if (/master|postgraduate|mba/.test(d)) return 2;
  if (d) return 3;
  if (/law school|school of law|college of law|law center|law department/.test(s)) return 1;
  if (/medical|school of medicine|college of medicine/.test(s)) return 0;
  if (/business school|school of business|graduate school|school of government|school of public|school of international/.test(s)) return 2;
  return 3;
}

const wdEdu = json("wd-education.json");
const eduSeen = new Set();
for (const r of wdEdu) {
  const p = people.get(r.bg); if (!p || !r.schoolLabel || /^Q\d+$/.test(r.schoolLabel)) continue;
  if (K12.test(r.schoolLabel) && !SERVICE_ACADEMY.test(r.schoolLabel)) continue;
  const inst = institution(r.schoolLabel, r.parentLabel);
  const key = `${r.bg}|${r.schoolLabel}|${r.degreeLabel || ""}`;
  if (eduSeen.has(key)) continue; eduSeen.add(key);
  p.edu.push({ school: r.schoolLabel, inst, level: levelOf(r.degreeLabel, r.schoolLabel), degree: r.degreeLabel || null });
}

const OCC = [
  ["Law", /^(lawyer|judge|jurist|prosecutor|law clerk|advocate|jurisprudence|attorney|barrister|solicitor|district attorney)$/],
  ["Business & finance", /^(businessperson|business executive|banker|entrepreneur|real estate agent|merchant|accountant|consultant|executive|insurance broker|stockbroker|chief executive officer|salesperson|manufacturer|industrialist|investor|financier|business magnate|small business owner)$/],
  ["Military", /^(military officer|military personnel|soldier|naval officer|brigadegeneral|colonel|major general|army officer|captain|general officer|military leader|lieutenant)$/i],
  ["Education & academia", /^(teacher|university teacher|professor|educator|school superintendent|head teacher|academic administrator|academic staff|adjunct professor|lecturer|historian|political scientist|economist|academic|school teacher|principal)$/],
  ["Media & writing", /^(journalist|writer|editor|publisher|radio personality|author|newspaper editor|reporter|screenwriter|autobiographer|television presenter|columnist|broadcaster|poet|novelist)$/],
  ["Agriculture", /^(farmer|rancher|cattle rancher|planter|agriculturalist|agronomist|plantation owner)$/],
  ["Medicine & health", /^(physician|surgeon|dentist|pharmacist|nurse|veterinarian|psychologist|optometrist|physical therapist)$/],
  ["Science & engineering", /^(engineer|civil engineer|scientist|chemist|physicist|surveyor|architect|computer scientist|astronaut|inventor)$/],
  ["Sports & entertainment", /^(american football player|baseball player|basketball player|actor|athlete|ice hockey player|boxer|musician|singer|television actor|film actor)$/i],
  ["Labor", /^(trade unionist|labor union leader|union leader)$/],
  ["Clergy", /^(pastor|minister|clergyman|priest|rabbi|preacher|missionary|theologian|cleric)$/],
  ["Law enforcement", /^(police officer|sheriff|fbi agent|firefighter)$/i]
];
for (const r of json("wd-occupation.json")) {
  const p = people.get(r.bg); if (!p || !r.xLabel) continue;
  const hit = OCC.find(([, re]) => re.test(r.xLabel));
  if (hit) p.occ.add(hit[0]);
}
for (const r of json("wd-military.json")) {
  const p = people.get(r.bg); if (p) p.military = true;
}
for (const p of people.values()) if (p.occ.has("Military")) p.military = true;

const REL = [
  ["Catholic", /catholic/i],
  ["Jewish", /juda|jewish/i],
  ["Latter-day Saint", /latter-day|mormon/i],
  ["Orthodox Christian", /orthodox/i],
  ["Unitarian or Universalist", /unitarian|universalist/i],
  ["Muslim", /islam|muslim/i],
  ["Hindu", /hindu/i],
  ["Buddhist", /buddh/i],
  ["Nonreligious or deist", /atheism|irreligion|agnostic|deism|secular/i],
  ["Christian (unspecified)", /^christianity$|^christian$/i],
  ["Protestant", /lutheran|episcopal|congregational|method|presbyter|baptist|protestant|anglican|united church of christ|quaker|friends|churches? of christ|disciples|adventist|reformed|evangelical|restoration|assemblies of god|pentecost|christian science|nazarene|moravian|mennonite|brethren/i]
];
for (const r of json("wd-religion.json")) {
  const p = people.get(r.bg); if (!p || !r.xLabel || p.rel) continue;
  const hit = REL.find(([, re]) => re.test(r.xLabel));
  if (hit) p.rel = hit[0];
}

// ---- Race and ethnicity from Wikipedia categories (a lower bound) --------------------------------------------
const RACES = ["White or not recorded", "Black", "Hispanic", "Asian American", "Native American", "Pacific Islander", "Multiracial"];
const wpCats = existsSync("data/wp-categories.json") ? JSON.parse(readFileSync("data/wp-categories.json", "utf8")) : {};
for (const p of people.values()) {
  const cats = p.wikipedia && wpCats[p.wikipedia];
  p.race = cats ? raceFromCategories(cats) : null;
}

// ---- Membership per Congress (Voteview) -----------------------------------------
const partyNames = {};
for (const r of parseCSV(read("HSall_parties.csv"))) partyNames[r.party_code] = r.party_name;
const PARTY_SHORT = { "Democratic Party": "Democrat", "Republican Party": "Republican", "Independent": "Independent" };
const partyName = code => {
  const n = partyNames[code] || `Party ${code}`;
  return PARTY_SHORT[n] || n.replace(/ Party$/, "");
};

const rows = new Map(); // congress|chamber|bioguide -> row (last listing wins: party switchers)
let missingPerson = 0;
for (const r of parseCSV(read("HSall_members.csv"))) {
  if (r.chamber === "President" || !r.bioguide_id) continue;
  const c = +r.congress;
  if (!people.has(r.bioguide_id)) {
    missingPerson++;
    const [last, first = ""] = r.bioname.split(", ");
    const nice = s => s.toLowerCase().replace(/\b\w/g, m => m.toUpperCase());
    people.set(r.bioguide_id, { id: r.bioguide_id, name: `${first} ${nice(last)}`.trim(), last: nice(last), gender: null, born: null, wikipedia: null, leadership: [], edu: [], occ: new Set(), rel: null, military: false });
  }
  const p = people.get(r.bioguide_id);
  if (!p.born && r.born) p.born = Math.floor(+r.born);
  rows.set(`${c}|${r.chamber}|${r.bioguide_id}`, {
    c, ch: r.chamber === "Senate" ? "S" : "H", id: r.bioguide_id, st: r.state_abbrev,
    d: r.district_code === "0" ? null : +r.district_code, party: partyName(r.party_code),
    x: r.nominate_dim1 === "" ? null : +r.nominate_dim1, y: r.nominate_dim2 === "" ? null : +r.nominate_dim2
  });
}

// Tenure: how many Congresses each person had served before this one (either chamber).
const byPerson = new Map();
for (const m of rows.values()) {
  if (!byPerson.has(m.id)) byPerson.set(m.id, new Set());
  byPerson.get(m.id).add(m.c);
}

// ---- Output --------------------------------------------------------------------
const used = new Set([...rows.values()].map(m => m.id));
const personList = [...people.values()].filter(p => used.has(p.id)).sort((a, b) => a.id.localeCompare(b.id));
const pIndex = new Map(personList.map((p, i) => [p.id, i]));
const insts = [...new Set(personList.flatMap(p => p.edu.map(e => e.inst)))].sort();
const iIndex = new Map(insts.map((s, i) => [s, i]));
const OCC_NAMES = OCC.map(([n]) => n);
const REL_NAMES = REL.map(([n]) => n);
const parties = [...new Set([...rows.values()].map(m => m.party))].sort();
const partyIdx = new Map(parties.map((p, i) => [p, i]));

const out = {
  generated: new Date().toISOString().slice(0, 10),
  sources: {
    "congress-legislators": "https://github.com/unitedstates/congress-legislators",
    voteview: "https://voteview.com/data",
    wikidata: "https://www.wikidata.org"
  },
  races: RACES,
  benchmarks: { ...(existsSync("data/benchmarks.json") ? JSON.parse(readFileSync("data/benchmarks.json", "utf8")) : {}),
    religion: JSON.parse(readFileSync("data/religion.json", "utf8")), aba: JSON.parse(readFileSync("data/aba.json", "utf8")) },
  levels: LEVELS, occupations: OCC_NAMES, religions: REL_NAMES, parties, institutions: insts, ivy: insts.map(s => IVY.has(s) ? 1 : 0),
  // people: [bioguide, name, gender(M/F/null), born, wikipedia, highestLevel, [instIdx...], [occIdx...], relIdx|-1, military 0/1, [leadership...], lastName,
  //          raceIdx|-1 (-1: no Wikipedia categories checked), raceBits (black 1, hispanic 2, asian 4, native 8, pacific 16, lgbtq 32)]
  people: personList.map(p => {
    const highest = p.edu.length ? Math.min(...p.edu.map(e => e.level)) : LEVELS.length - 1;
    return [p.id, p.name, p.gender, p.born, p.wikipedia, highest,
      [...new Set(p.edu.map(e => iIndex.get(e.inst)))], [...p.occ].map(o => OCC_NAMES.indexOf(o)),
      p.rel ? REL_NAMES.indexOf(p.rel) : -1, p.military ? 1 : 0, p.leadership, p.last,
      p.race ? RACES.indexOf(p.race.group) : -1,
      p.race ? (p.race.black ? 1 : 0) | (p.race.hispanic ? 2 : 0) | (p.race.asian ? 4 : 0) | (p.race.native ? 8 : 0) | (p.race.pacific ? 16 : 0) | (p.race.lgbtq ? 32 : 0) : 0];
  }),
  // members: [congress, chamber H/S, personIdx, state, district|null, partyIdx, nominate1|null, nominate2|null, priorCongresses]
  members: [...rows.values()].sort((a, b) => a.c - b.c || a.ch.localeCompare(b.ch) || a.st.localeCompare(b.st))
    .map(m => {
      const prior = [...byPerson.get(m.id)].filter(c => c < m.c).length;
      return [m.c, m.ch, pIndex.get(m.id), m.st, m.d, partyIdx.get(m.party), m.x, m.y, prior];
    })
};

mkdirSync("site/data", { recursive: true });
writeFileSync("site/data/congress.json", JSON.stringify(out));

// ---- Coverage report -------------------------------------------------------------
const report = c => {
  const ms = out.members.filter(m => m[0] === c), ps = ms.map(m => out.people[m[2]]);
  const pct = f => Math.round(100 * ps.filter(f).length / ps.length) + "%";
  return `Congress ${c}: ${ms.length} seats | gender ${pct(p => p[2])} | born ${pct(p => p[3])} | education ${pct(p => p[5] < 4)} | occupation ${pct(p => p[7].length)} | religion ${pct(p => p[8] >= 0)} | military ${pct(p => p[9])} | ideology ${Math.round(100 * ms.filter(m => m[6] !== null).length / ms.length)}%`;
};
console.log(`people ${out.people.length}, seats ${out.members.length}, institutions ${insts.length}, parties ${parties.length}, added from Voteview only: ${missingPerson}`);
for (const c of [1, 30, 60, 80, 100, 110, 119]) console.log(report(c));
const cur = out.members.filter(m => m[0] === 119).map(m => out.people[m[2]]);
const sh = f => Math.round(1000 * cur.filter(f).length / cur.length) / 10 + "%";
console.log(`119th race (Wikipedia): checked ${sh(p => p[12] >= 0)}, Black ${sh(p => p[13] & 1)}, Hispanic ${sh(p => p[13] & 2)}, Asian ${sh(p => p[13] & 4)}, Native ${sh(p => p[13] & 8)}, LGBTQ ${sh(p => p[13] & 32)}`);
console.log("size:", Math.round(JSON.stringify(out).length / 1024), "KB");
