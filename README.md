# An Exact Portrait

https://jc0h3n.github.io/an-exact-portrait/

> A legislature "should be in miniature an exact portrait of the people at large."
> John Adams, *Thoughts on Government*, 1776

Who serves in the U.S. Congress: demographics, education, careers and voting ideology for every member since 1789. Inspired by UC San Diego China Data Lab's [CCP Elite](https://chinadatalab.ucsd.edu/elites/) dashboard.

**Views**

- **Demographics**: age, birth decade, experience, women by party, careers before Congress, religion
- **Education**: highest education on record, Ivy League and law school shares, most-attended schools by party
- **Ideology**: DW-NOMINATE left–right scores for every member, by party and in two dimensions
- **Over time**: every Congress from 1789 to today (women, age, lawyers, Ivy League, military service, newcomers, party polarization)
- **Members**: a searchable, sortable table with CSV download

Filter any view by Congress, chamber, party, state and gender. The URL keeps your filters, so links are shareable.

## Data

| Source | Used for | License |
|---|---|---|
| [unitedstates/congress-legislators](https://github.com/unitedstates/congress-legislators) | Names, gender, birth dates, Wikipedia links | Public domain |
| [Voteview](https://voteview.com/data) | Membership in each Congress, party, DW-NOMINATE scores | Free to use with citation |
| [Wikidata](https://www.wikidata.org) | Education, careers, religion, military service | CC0 |
| [Wikipedia](https://en.wikipedia.org) categories | Members' race and ethnicity (e.g. "African-American United States senators") | CC BY-SA |
| [U.S. Census Bureau](https://www.census.gov/programs-surveys/popest.html) population estimates | Sex, race, ethnicity and age of U.S. adults | Public domain |
| [Census Current Population Survey](https://www.census.gov/topics/education/educational-attainment/data/tables.html) | Educational attainment of adults 25+ | Public domain |
| [Bureau of Labor Statistics](https://www.bls.gov/cps/) | Veterans as a share of adults | Public domain |
| [ABA National Lawyer Population Survey](https://www.americanbar.org/about_the_aba/profession_statistics/) | Number of lawyers (entered by hand in `data/aba.json`) | Cited |
| [Pew Religious Landscape Study](https://www.pewresearch.org/religious-landscape-study/) | Religion of U.S. adults (entered by hand in `data/religion.json`) | Cited |

Wikidata is crowd-edited and incomplete, especially for members who served before 1900. Every chart states how many members it covers, and "military service on record" is a lower bound. Race and ethnicity come from Wikipedia categories and are also a lower bound: a member without such a category is counted as white or not recorded.

The "Compared with the country" tab sets each Congress against U.S. adults. The weekly job saves the benchmark figures in `data/`, so if a government site is down the last good copy is used.

Voteview citation: Lewis, Jeffrey B., Keith Poole, Howard Rosenthal, Adam Boche, Aaron Rudkin, and Luke Sonnet. *Voteview: Congressional Roll-Call Votes Database.* https://voteview.com/

## Privacy

The site is static. It loads no fonts, analytics, trackers or third-party scripts, and the browser only ever requests files from this site.

## Running it locally

Requires Node.js 20 or newer. No packages to install.

```
npm run data    # download sources into raw/ and build site/data/congress.json
npm run serve   # http://localhost:8080
```

A GitHub Action rebuilds the data and redeploys the site on every push and every Monday; the Monday run commits refreshed benchmarks back to `data/`.
