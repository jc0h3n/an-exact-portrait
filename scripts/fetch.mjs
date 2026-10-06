// Downloads the raw sources into raw/. Run: node scripts/fetch.mjs
// Sources (all free to reuse):
//   - unitedstates/congress-legislators (public domain): names, gender, birthdays, terms
//   - Voteview (voteview.com): membership per Congress, party codes, DW-NOMINATE ideology scores
//   - Wikidata (CC0): education, occupations, religion, military service
import { mkdirSync, writeFileSync } from "node:fs";

const UA = "an-exact-portrait/1.0 (https://github.com/jc0h3n/an-exact-portrait; open-data build script)";
mkdirSync("raw", { recursive: true });

const files = {
  "legislators-current.json": "https://unitedstates.github.io/congress-legislators/legislators-current.json",
  "legislators-historical.json": "https://unitedstates.github.io/congress-legislators/legislators-historical.json",
  "HSall_members.csv": "https://voteview.com/static/data/out/members/HSall_members.csv",
  "HSall_parties.csv": "https://voteview.com/static/data/out/parties/HSall_parties.csv"
};

const label = v => `OPTIONAL { ${v} rdfs:label ${v}Label FILTER(lang(${v}Label)="en") }`;
const sparql = {
  "wd-education.json": `SELECT ?bg ?school ?schoolLabel ?degreeLabel ?parentLabel ?endYear WHERE {
    ?p wdt:P1157 ?bg; p:P69 ?st. ?st ps:P69 ?school.
    OPTIONAL { ?st pq:P512 ?degree. ${label("?degree")} }
    OPTIONAL { ?st pq:P582 ?end. BIND(YEAR(?end) AS ?endYear) }
    OPTIONAL { ?school wdt:P749 ?parent. ${label("?parent")} }
    ${label("?school")}
  }`,
  "wd-occupation.json": `SELECT ?bg ?xLabel WHERE { ?p wdt:P1157 ?bg; wdt:P106 ?x. ${label("?x")} }`,
  "wd-religion.json": `SELECT ?bg ?xLabel WHERE { ?p wdt:P1157 ?bg; wdt:P140 ?x. ${label("?x")} }`,
  "wd-military.json": `SELECT ?bg ?xLabel WHERE { ?p wdt:P1157 ?bg; wdt:P241 ?x. ${label("?x")} }`
};

async function get(url, accept) {
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(url, { headers: { "User-Agent": UA, ...(accept && { Accept: accept }) } });
    if (r.ok) return r;
    if (attempt >= 3) throw new Error(`${r.status} ${r.statusText} for ${url.slice(0, 120)}`);
    await new Promise(res => setTimeout(res, 5000 * attempt));
  }
}

for (const [name, url] of Object.entries(files)) {
  const r = await get(url);
  writeFileSync(`raw/${name}`, Buffer.from(await r.arrayBuffer()));
  console.log("saved", name);
}
for (const [name, q] of Object.entries(sparql)) {
  const r = await get("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q), "application/sparql-results+json");
  const rows = (await r.json()).results.bindings.map(b => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])));
  writeFileSync(`raw/${name}`, JSON.stringify(rows));
  console.log("saved", name, rows.length, "rows");
}

// ---- Race and ethnicity (Wikipedia categories) and national benchmarks -------------------------------------------
// Members' Wikipedia articles carry categories such as "African-American United States senators" and "Hispanic and
// Latino American members of the United States Congress". Only categories that bear on race, ethnicity or LGBTQ
// identity are kept. Benchmarks (Census, BLS) go to data/benchmarks.json, which is committed: if a source fails,
// the last good copy is kept.
import { readFileSync, existsSync } from "node:fs";
import { wikiCategories, population, education, veterans, occupations } from "./benchmarks.mjs";
const RELEVANT = /american|hispanic|latin|asian|native|black|african|afro|descent|lgbt|gay|lesbian|bisexual|emigrants|hawaiian|pacific|samoan|chamorro|cherokee|navajo|choctaw|chickasaw|muscogee|ojibwe|lakota|osage|seminole|pueblo|comanche|kiowa|lumbee|chicano/i;
const step = async (name, fn) => { try { await fn(); } catch (e) { console.warn(`! ${name} failed, keeping the last good copy: ${e.message}`); } };
await step("Wikipedia categories", async () => {
  const titles = [...new Set([...JSON.parse(readFileSync("raw/legislators-current.json", "utf8")), ...JSON.parse(readFileSync("raw/legislators-historical.json", "utf8"))]
    .map(l => l.id.wikipedia).filter(Boolean))];
  const cats = await wikiCategories(titles, { pause: 250 });
  const kept = Object.fromEntries(Object.entries(cats).map(([t, cs]) => [t, cs.filter(c => RELEVANT.test(c))]));
  writeFileSync("data/wp-categories.json", JSON.stringify(kept));
  console.log("saved Wikipedia categories for", Object.keys(kept).length, "of", titles.length, "articles");
});
const bench = existsSync("data/benchmarks.json") ? JSON.parse(readFileSync("data/benchmarks.json", "utf8")) : {};
await step("Census population", async () => { bench.population = await population(); });
await step("Census education", async () => { bench.education = await education(); });
await step("BLS veterans", async () => { bench.veterans = await veterans(); });
await step("BLS occupations", async () => { bench.bls = await occupations({ workforce: "Total, 16 years and over", lawyers: "Lawyers" }); });
bench.fetched = new Date().toISOString().slice(0, 10);
writeFileSync("data/benchmarks.json", JSON.stringify(bench, null, 1) + "\n");
console.log("benchmarks:", Object.keys(bench).join(", "));
