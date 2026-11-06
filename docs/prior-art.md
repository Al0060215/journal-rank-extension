# Prior art: journal-level badge injection for academic search results

**Scope:** building a personal Chrome MV3 extension that injects a badge (SCI / 北大核心 / 中科院分区 / IF) beside each paper in academic search results.
**Compiled:** 2026-11-07. **Method:** GitHub REST + code search via authenticated `gh`, shallow clones of 7 repos, direct HTTP against live sites, AMO + Chrome Web Store APIs, reader-proxy renders where the site is an SPA.

## Confidence legend

| Mark | Meaning |
|---|---|
| ✅ | **Verified** — I fetched/cloned/executed it myself and quote the artifact |
| 🟡 | **Inferred** — consistent across ≥2 independent extensions, but not confirmed against live DOM |
| ❌ | **Not found / could not verify** |

Most DOM selectors below are 🟡: the sites are JS-rendered or bot-blocked (ScienceDirect 403, Wiley 403 Cloudflare, PubMed TLS-reset from this network, Springer search served a 3 KB challenge page, Baidu Xueshu 1.5 KB redirect stub). Selectors marked ✅ come from code I cloned and read.

---

## 1. easyScholar (`www.easyscholar.cc`)

**Status:** closed source. No public repo; distribution via 4 stores.

### Verified facts

| Item | Value | Source |
|---|---|---|
| Chrome Web Store version | **15.5**, updated **2026-10-20**, 1.13 MiB, "Offers in-app purchases" | store listing ✅ |
| Firefox (AMO) | **16,887** avg daily users, rating **4.80** (131 reviews), v**15.2**, updated **2026-08-31** | `addons.mozilla.org/api/v5` ✅ |
| Claimed reach | "10W+ users" (site), 100+ datasets | homepage ✅ |
| Extension permissions (Firefox build) | `storage`, `https://*/*`, `http://*/*`, `https://www.tandfonline.com/doi/pdf/*` | AMO manifest ✅ |
| Data-collection declaration | "will not collect or use your data"; not sold to third parties | CWS privacy block ✅ |

**It requests `<all_urls>`** — i.e. it injects everywhere and dispatches on hostname, it does not use per-site `content_scripts.matches`. Same trick as the open-source `swufe` / `ranking-kit` (below). Relevant to your design: it means one code path and no manifest churn when adding sites, at the cost of a scary install prompt.

### Feature list (✅ from official description)

1. **Show journal rank** on Google Scholar, CNKI, PubMed, Web of Science, Scopus, Aminer, ScienceDirect, Wanfang, DBLP, Baidu Xueshu, ReadPaper, ResearchGate, X-MOL, Embase, Find-a-journal, JSTOR, ProQuest, Springer, IEEE Xplore, Semantic Scholar, Wiley, Connected Papers, 云图书馆 (tsgyun), 国科大超星, NSSD, plus **all Google Scholar mirrors** (e.g. `xs2.dailyheadlines.cc`).
2. **Inline translation** — select text, `T` to translate, `Y` to hide; multiple engines (Google / Sogou / Youdao / Caiyun / Niu).
3. **Lightweight reference manager** — "collect" button on paper detail pages, categories.
4. **One-click full-text** — click the logo to jump to PDF (configurable / can be disabled).

### Supported sites — the authoritative list

Taken verbatim from the **download page** (✅ live fetch). Notably it includes **知网空间** at `https://search.cnki.com.cn/Search/Result?theme=...` and **万方** at `https://s.wanfangdata.com.cn/paper?q=...` — those exact URL shapes are useful for your match patterns.

> 知网、谷歌学术、所有谷歌学术镜像、万方、DBLP、Web Of Science、百度学术、Aminer、PubMed、ReadPaper、ScienceDirect、ResearchGate、云图书馆、Embase、Scopus、X-MOL、Find a journal、知网空间、Semantic Scholar、wiley、JSTOR、国科大超星、国家哲学社会科学学术期刊数据库、ProQuest、Springer、IEEExplore、Connected Papers

**❌ 维普 / CQVIP (`cqvip.com`) is NOT in easyScholar's list, and no open-source project I found supports it either.** Grepping all 7 cloned repos for `cqvip|维普` returned zero hits. If you want 维普, you are on your own — see §3.

### Datasets shown

`SCI分区(Clarivate)`, `SCI影响因子(Clarivate)`, `SCI分区(中科院)`, `SCI期刊预警(中科院)`, `CCF`, `南大核心`, `北大核心`, `CSCD`, `EI`, `A&HCI`, `中国科技核心期刊`, `学术期刊指南(ABS)`, `SSCI`, `FMS`, `JCI`, `FT50`, `UTD24`, plus ~15 university lists (西南财经、复旦、上交、央财、厦大、人大、西南交大、对外经贸、西电、山财、重大、河海、新疆大学、中国地质、川大、浙大、长江大学 …). Plus a user-generated "custom dataset community" of 100+ lists (NSFC 管理学部, ABDC 2022, 吉大, 南开 2009, 各类预警名单 …).

### Badge appearance (✅ from official screenshots)

I pulled the store screenshots and read them:

- **Google Scholar** — small **inline pills sitting on the title line, immediately to the right of the paper title**, one pill per active dataset, e.g. `swufe A` `sju B` `fudan A` `cufe A`. White bold text on a saturated background, fully rounded ends, ~12 px font, ~18 px tall, small left margin. Colour is **per-dataset**, not per-rank (SWUFE = dark maroon, SJU = orange, Fudan = gold, CUFE = green).
- **CNKI** — same pill, placed **in the 来源 (source) column directly under the journal name**, e.g. `swufe A+` in magenta/pink under 中国社会科学.

So the visual grammar is `[dataset-abbr] [rank]` in a coloured pill; it is *not* an IF number by default and there is no icon/logo. Cheap to reproduce in ~15 lines of CSS.

### Free vs paid

The pricing block renders as **three tiers** (✅ structure; ❌ prices — they are not in the static HTML or the reader-rendered DOM, they appear to be JS/injected, so I refuse to quote a number):

| | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| Concurrent browsers | 1 | 2 | 3 |
| Datasets shown | 13 classic | 46 | 46 |
| Reference manager / translate / full-text | ✅ | ✅ | ✅ |
| Custom datasets | — | 5 | 15 |
| Backend rank lookup | — | 15 queries/day | unlimited |
| SCI 小类分区 (sub-category) | — | — | ✅ |

Practically: **free tier = 13 datasets**, which does include the big ones (SCI/中科院/IF/CCF/北大核心/南大核心 per the description) — the paywall gates breadth and the `小类分区` detail, not the headline metrics.

---

## 2. Open-source equivalents (every repo below was fetched and its metadata read from the GitHub API)

Ranked by adoption. Star counts and push dates are as of **2026-11-07**.

| Repo | ★ | Last push | License | Sites adapted | Data source |
|---|---|---|---|---|---|
| [WenyanLiu/CCFrank4dblp](https://github.com/WenyanLiu/CCFrank4dblp) | **804** | 2026-05-26 | MIT | dblp, **Google Scholar** (search + citations), **Web of Science**, Connected Papers, Semantic Scholar | bundled CCF tables (`data/ccfRank*.js`) + live dblp search API |
| [hnshhslsh/show-rank](https://github.com/hnshhslsh/show-rank) | **242** | 2023-10-07 | MIT | IEEE Xplore, ACM DL, dblp, Google Scholar, SpringerLink, Engineering Village | bundled CCF + dblp API (a fork of CCFrank's approach) |
| [museremarkable/swufe_ccf_show_ranking](https://github.com/museremarkable/swufe_ccf_show_ranking) | **50** | 2021-12-14 | AGPL-3.0 | Springer, DBLP, IEEE, ACM, Google Scholar, **CNKI**, **Baidu Xueshu**, **PubMed**, WoS, Aminer, Bing, Microsoft Academic, ReadPaper | bundled JS tables (CCF, SCI 基础版/升级版, IF, 北大核心, 南大核心, CSCD, CSSCI, 复旦/上交/厦大/人大/西财/央财/… ) — 123 MB checkout |
| [ShutterZor/ranking-kit](https://github.com/ShutterZor/ranking-kit) | **20** | 2023-05-12 | AGPL-3.0 | CNKI, Google Scholar, WoS (old+new), Baidu Xueshu, PubMed, Aminer, Bing, dblp, ReadPaper, IEEE, ACM, Springer | same bundled-table lineage; self-described "丐版 easyScholar" |
| [riponcm/LitRank](https://github.com/riponcm/LitRank) | 18 | 2026-10-28 | NOASSERTION | Google Scholar only | SJR / Scimago quartiles |
| [LSX-s-Software/CCF-Rank-Safari](https://github.com/LSX-s-Software/CCF-Rank-Safari) | 12 | 2026-05-24 | none | Springer, DBLP, IEEE, ACM (Safari port of the above family) | bundled CCF |
| [PolarisLight/Journal-Conference-Rank-Assistant](https://github.com/PolarisLight/Journal-Conference-Rank-Assistant) | 2 | 2026-10-11 | **none** | **the widest list of any OSS project**: Scholar, PubMed, **CNKI**, **Wanfang**, **Baidu Xueshu**, Aminer, Semantic Scholar, OpenAlex, arXiv, ResearchGate, dblp + ~30 publishers (Springer, ScienceDirect, Wiley, T&F, SAGE, OUP, CUP, MDPI, Frontiers, PLOS, BMC, Emerald, Science, Cell, APS, AIP, IOP, ACS, RSC, JAMA, NEJM, Lancet, BMJ, Karger, De Gruyter, Hindawi, LWW, SIAM, ASM …) | **encrypted shards bundled in the extension** (`catalog-shard-*.encrypted.json`, ~4.5 MB) + Crossref + NCBI eutils |
| [cuiwang/cnki-Scholar](https://github.com/cuiwang/cnki-Scholar) | 0 | 2025-06-18 | none | **CNKI only** | remote JSON: `https://gitee.com/kailangge/cnki-journals/raw/main/cnki_journals.json` (**9.4 MB, verified HTTP 200**) |
| [beibeihk/cnki-journal-filter](https://github.com/beibeihk/cnki-journal-filter) | 0 | 2026-05-24 | none | **CNKI only** (filter/annotate) | local list |
| [bpiwowar/venue-rank](https://github.com/bpiwowar/venue-rank) | 0 | 2026-06-02 | none | Scholar, dblp, HAL | OpenAlex API + bundled journal/conference JSON |
| [jgy0/scholar-rank-extension](https://github.com/jgy0/scholar-rank-extension) | 1 | 2026-05-26 | MIT | Google Scholar only | bundled CCF (vendored from CCFrank) |

### Which ones are actually worth reading

**Read these three, in this order:**

1. **CCFrank4dblp** — the only high-star project that is *alive* (2026-05), MV3, and covers **WoS**. Cleanest code of the bunch. Its weakness is that it resolves the venue by **querying dblp by title+author** rather than reading the venue off the page — clever for dblp/Scholar, useless for Chinese databases.
2. **hnshhslsh/show-rank** — best reference for **publisher-side adapters** (IEEE / ACM / Springer / EI), because those selectors are per-site and short. But it's MV2 and stale since 2023.
3. **PolarisLight/Journal-Conference-Rank-Assistant** — despite 2 stars, this is the single most useful artifact for your purpose: it is MV3, and it contains a **per-site venue/title/container resolver for every site you named except 维普**. Treat it as a selector cheatsheet, not as a dependency — **it has no license file**, so copying code verbatim is legally murky. Read it, don't fork it.

**Deliberately deprioritised:** `swufe` and `ranking-kit` are the same codebase lineage (identical file list, 2021 vs 2023). They're AGPL-3.0 and MV2, and they ship ~120 MB of vendored ranking JS. Useful for their CNKI/PubMed *selectors*, not for their architecture.

**Also exists (verified, but Zotero/desktop, not browser):** `redleafnew/zotero-updateifsE` (932★, AGPL, easyScholar-backed), `MuiseDestiny/zotero-style`, `SiriusXT/Zotero-Scholar-Rank`, `GroundbreakerLhy/CCF-Rank` (Zotero). `hitfyd/ShowJCR` (553★, GPL-3.0, active) is a **desktop Qt/C++ journal-lookup tool**, not a browser extension — easy to mistake for one.

**Could not search:** Gitee. `search.gitee.com` timed out through the reader proxy and the public API returned empty without a token. The only Gitee artifact I verified is the data file in the table above.

---

## 3. DOM / selector notes per site

Legend: ✅ = quoted from code I cloned · 🟡 = consistent across ≥2 independent extensions, not live-verified · ❌ = no source found.

### 3.1 Google Scholar — best-understood, highest confidence

**Row container** ✅ (CCFrank4dblp, `js/scholar.js`; identical in show-rank `site/scholar.js`, PolarisLight, jgy0, venue-rank):

```js
$("#gs_res_ccl_mid > div > div.gs_ri")
```
PolarisLight generalises to `.gs_r` filtered by "has a `.gs_rt` child", because `.gs_r` is also used for non-result rows (the "create alert" row):

```js
[...document.querySelectorAll(".gs_r")].filter(n => n.querySelector(".gs_rt, .gsc_a_at"))
```

**Title** ✅ `h3 > a` inside `.gs_ri`; equivalently `.gs_rt` (PolarisLight: `container.querySelector(".gsc_a_at, .gs_rt")`).

**Venue / author / year** ✅ — **there is no dedicated venue element.** The whole string lives in `div.gs_a`, and every extension parses it:

```js
let data = $(this).find("div.gs_a").text().replace(/[\,\-\…]/g, "").split(" ");
let author = data[1];          // 2nd token
let year   = data.slice(-3)[0]; // 3rd-from-last token
```

Format is `Author1, Author2 - Journal Name, 2019 - publisher.com`; splitting on `,`/`-`/`…` and taking the middle chunk is the established (fragile but working) heuristic. **This is the one place where a real parser beats a selector** — journal names legitimately contain commas (`Journal of A, B and C`).

**Injection point** ✅ `node.after(badge)` where `node` is the `<a>` inside `h3` — this is exactly why easyScholar's badges appear on the title line in §1.

**Author profile page** (`/citations`) ✅:
```js
"tr.gsc_a_tr"                       // rows
"td.gsc_a_t a" / ".gsc_a_at"        // title
"td.gsc_a_t .gs_gray"               // grays[0]=authors, grays[1]=venue  <-- venue is index 1
"td.gsc_a_y"                        // year
"#gsc_a_b"                          // the <tbody> to observe
```

**Venue on the author page is much easier than on search** — `grays[1]` is the journal name in its own element. Prefer it if you support both views.

### 3.2 Web of Science — ✅ from CCFrank, the only credible source

```js
$(".summary-source-title-link[lang='en']")   // source link, English
$(".summary-source-title[lang='en']")        // source title, English
$("[name='conf_title']")                     // conference title (WoS conf records)
```
Inject with `node.after(...)`, and guard idempotency with `if (!node.next().hasClass("ccf-rank"))`.

**Dynamic loading** ✅ — CCFrank does **not** rely on a pure observer here; it polls:
```js
setInterval(() => wos.appendRanks(), 700);
$(window).bind("popstate", () => wos.appendRanks());
```
That 700 ms interval is strong evidence that WoS's Angular router defeats naive `MutationObserver`+`pushState` handling. Copy the belt-and-braces approach.

⚠️ `lang='en'` matters: WoS renders both localized and English titles; matching without it duplicates badges.

⚠️ There is a *new* WoS UI in some tenants (`app-jcr-overlay`, per `ranking-kit`'s `newwebofscience.js`) — that file is 2023 vintage and looks like a stub. Treat new-WoS as **unverified**.

### 3.3 CNKI 知网 (`kns.cnki.net`)

**Row** 🟡 — two independent sources converge on the result table:
```js
".result-table-list tbody tr"        // 新版 kns8 列表模式  (PolarisLight, beibeihk)
"#gridTable table tbody tr"          // older grid layout
"td.name"                            // title cell
```
**Venue cell — this is the good part** ✅ (swufe `zhiwang.js`, the cleanest CNKI adapter):
```js
$("td.source a")     // the 来源 column link; insert badge with result.after(span)
```
PolarisLight, independently:
```js
container.querySelector('td.source a, .source a, [data-field="source"] a')
```
**So for CNKI the venue is a first-class element with a stable class — much easier than Scholar.** `td.name a` / `a.fz14` gives the title.

**CNKI caveats:** the site is an Angular SPA on `kns.cnki.net`/`kns8.cnki.net`; `kns.cnki.cn` also exists (beibeihk matches it). `cuiwang/cnki-Scholar` matches `*://*.cnki.net/*` and debounces its observer by 500 ms then adds a random 1–3 s delay before processing — an explicit anti-rate-limit measure worth imitating.

**知网空间** (`search.cnki.com.cn/Search/Result?theme=...`, the older 知网空间 search): ❌ **no selector source found.** easyScholar supports it (it's on the download page), but nothing open-source does. Budget a manual DOM session.

### 3.4 万方 (`s.wanfangdata.com.cn`) — 🟡 single source

```js
// PolarisLight
rows:   ".normal-list-item, .result-item, .paper-item"
title:  ".title a, a.title, a[href*='d.wanfangdata.com.cn/periodical/']"
venue:  ".source a, .periodical a, .journal a, [class*='magazine'] a"
        // fallback: ".source, .periodical, .journal, [class*='magazine']"
```
Only one implementation backs this, and it is defensive (4 fallbacks) — a tell that the author was guessing too. **Verify manually.** The URL pattern `d.wanfangdata.com.cn/periodical/` in the title anchor is the most stable anchor here.

### 3.5 维普 (`cqvip.com`) — ❌ nothing exists

Not in easyScholar, not in any of the 7 cloned repos, not in the wider GitHub scan. You will be writing this from scratch. Practical expectation: 维普 search is at `qikan.cqvip.com` / `www.cqvip.com` and renders results server-side-ish; the journal name is in a `刊名` column. Plan for a manual inspection pass and treat it as the highest-effort site in your list.

### 3.6 百度学术 (`xueshu.baidu.com`)

Two generations of selectors, 🟡:

```js
// swufe/baiduxueshu.js  (older DOM — "result" + sc_info)
$("div.result").each(...)
  venue: result.find("div.sc_info span:eq(1) a").attr("title")   // "《期刊名》" with book-title marks
  title: result.find("h3.t a")
  // strip 《 》 then .toUpperCase() before lookup

// PolarisLight (newer DOM)
rows:  ".paper-wrap.result, .sc_default_result"
title: ".paper-title a, h3.t a, .t a, a[href*='/usercenter/paper/show']"
venue: ".paper-info, .sc_info"
```
The `《…》` wrapper on the `title` attribute of the venue anchor is a convenient, high-signal anchor if it still exists. ⚠️ Baidu changes this DOM often; assume breakage.

### 3.7 PubMed — 🟡 (2 independent implementations agree)

```js
rows:  "article.full-docsum"
title: "a.docsum-title"
venue: ".docsum-journal-citation"        // PolarisLight
       "span.full-journal-citation"      // swufe; then .split(".")[0] to get the abbreviation
```
⚠️ **The venue here is an abbreviation** (`Nat Med`, `J Biol Chem`). Both projects carry a big NIH-abbreviation→full-name map (`abb.NIHnameEn`) because PubMed gives you no full title in list view. **Budget for this mapping table** — it is the single biggest data-engineering item on the PubMed path. Article pages are easy by contrast: `citation_journal_title` meta tag (✅ used by venue-rank).

### 3.8 ScienceDirect / SpringerLink / Wiley / IEEE Xplore

None of these can be verified from this network (403 / Cloudflare challenge / Angular SPA). Three complementary strategies exist:

**(a) Per-site, hardcoded** ✅ show-rank — short and precise, MV2 era:

```js
// SpringerLink search results
$("#results-list > li > p.meta > span.enumeration > a")
// IEEE Xplore search results
$(".description > a")
$(".description > div:nth-child(1) > a")   // alternate layout
// ACM DL
$(".issue-item__detail > a")
```
`span.enumeration` is Springer's "journal name" span — semantically named, good sign. IEEE's `.description > a` is generic and probably the weakest selector in this whole report.

**(b) Generic publisher heuristic** ✅ PolarisLight — one code path for ~30 publishers:

```js
PUBLISHER_RESULT_SELECTOR = [
  "article[data-test*='article']", "article[data-testid*='article']",
  ".search-result-item", ".search__item", ".result-item", ".results-item",
  ".article-listing", ".issue-item", ".rank-assistant-publication",
  "li.app-card-open", "li[class*='search-result']"
].join(", ");

PUBLISHER_TITLE_LINK_SELECTOR = [
  "a[href*='/article/']", "a[href*='/article?']", "a[href*='/articles/']",
  "a[href*='/doi/']", "a[href*='/document/']", "a[href*='/science/article/']",
  "a[href*='/content/']"
].join(", ");

// venue
"[data-test*='journal'], [data-testid*='journal'], [data-test*='publication'],
 [data-testid*='publication'], .publication-title, .journal-title, .meta__journal,
 .result-journal, .search-result__publication,
 [id^='article-result-'][id$='-journal-name'], a[href*='/journal/'], a[href*='/journals/']"
// ...then reject matches inside ".references, #references, [role='doc-bibliography']"
```
The `a[href*='/journal/']` and `[id^='article-result-'][id$='-journal-name']` anchors are the durable ideas: **the journal link URL is far more stable than any class name**, and it doubles as the lookup key. The reference-section exclusion is essential — publisher pages are full of cited-journal names.

**(c) Metadata fallback** ✅ — on article/detail pages, use Highwire meta tags instead of the DOM:
```js
meta[name="citation_journal_title"]
meta[name="citation_issn"]              // ideal lookup key — ISSN is unambiguous
meta[name="citation_publication_date"]
meta[name="citation_title"]
```
This is strictly better than DOM scraping for detail pages, and *ISSN is the right primary key* for your whole database.

---

## 4. Public / unofficial APIs

### 4.1 easyScholar Open API — ✅ exists, ✅ live-tested

```
GET https://www.easyscholar.cc/open/getPublicationRank?secretKey=<KEY>&publicationName=<NAME>
```

I called it directly:

```json
// no key
{"code":40005,"msg":"密钥不能为空","data":null}
// bad key
{"code":40002,"msg":"Key错误","data":null}
```
Both HTTP 200 with an error `code` in the body — **so you must check `code`, not the HTTP status.**

Documented shape (✅ from `luxiangze/easyscholar-journal-lookup` `docs/easyscholar-api.md`, which transcribes the official console page):

- Auth: a **`SecretKey`**, obtainable from the easyScholar console. **It cannot be rotated** — the doc says so explicitly. That is a serious operational risk: if you embed a key in a public extension it is burned forever.
- Rate limit: **2 req/s hard cap**.
- Response: `{code, msg, data:{customRank:{rankInfo:[{uuid,abbName,oneRankText,twoRankText,...}], rank:[...]}, officialRank...}}` — note `rank` is encoded as `"<uuid>&&&<levelIndex>"` strings, which is genuinely awkward to consume.
- The doc explicitly frames this as distinct from the *membership* API and "currently free to use".

**Is using it appropriate?** For a *personal* extension: yes, and it's the cheapest path — one key in `chrome.storage`, one endpoint, 30+ datasets for free. For anything you publish: the non-rotatable key makes it a non-starter; you'd need each user to supply their own key (which is what `luxiangze/Paperlib-sciif-extension` and `redleafnew/zotero-updateifsE` do) or you'd be redistributing a credential.

⚠️ **CORS is the real blocker.** I did not verify `Access-Control-Allow-Origin` on `/open/getPublicationRank`. Since your content script runs on `scholar.google.com`, a direct `fetch` needs CORS headers; the robust design is **fetch from the MV3 service worker with `host_permissions: ["https://www.easyscholar.cc/*"]`** and message-pass results to the content script. Do this regardless — it also lets you implement the 2 req/s throttle and the cache in one place.

### 4.2 Other endpoints seen in the wild

| Endpoint | Used by | Auth | Verdict |
|---|---|---|---|
| `https://dblp.org/search/publ/api?q=...&format=json` | CCFrank, show-rank | none | ✅ public, CORS-friendly, good for CS venues. **CCFrank appends `&app=CCFrank4dblp_<version>`** — be that polite. |
| `https://api.crossref.org/works`, `/journals/{issn}` | PolarisLight | none | ✅ free, `mailto` polite-pool. Best source for **ISSN + canonical title**; not for rankings. |
| `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi` | PolarisLight | none (optional `api_key`) | ✅ free; resolves PubMed abbreviation → full journal title. **Solves §3.7's abbreviation problem without shipping a table.** |
| `https://api.openalex.org/*` | venue-rank | none | ✅ free; has SJR/quartile-ish metadata and ISSNs. |
| `https://gitee.com/kailangge/cnki-journals/raw/main/cnki_journals.json` | cnki-Scholar | none | ✅ **verified: HTTP 200, 9.4 MB**. Community CNKI tag dataset. Unversioned raw URL though — cache it, don't hotlink it per page. |
| LetPub (`letpub.com.cn`) | nothing in this space | — | ⚠️ There is **no API**. Everything that touches it is a scraper (`kakarotto-yang/letpub` GPL-3.0, `robinfang/letpub_crawler`, several 2026 crawler repos). It has no robots-friendly endpoint, it rate-limits/blocks, and its ToS prohibits automated collection. **Building a personal one-off lookup is defensible; shipping a scraper in an extension is not.** |
| 中科院分区表 (`fenqubiao`) | nothing | — | ⚠️ The official 分区表 is a **licensed, login-gated product** (apps at `fenqubiao.com`). There is no public API. All the open projects that "have 中科院分区" ship **bundled static tables scraped at build time** (e.g. `hitfyd/ShowJCR` ships 2025 升级版; swufe/ranking-kit ship `sciZhongBaseRankingName.js` + `sciZhongUpRankingName.js`). That is copyright-sensitive redistribution — fine for private use, risky to publish. |

**Bottom line for a personal build:** easyScholar API (own key) + Crossref/OpenAlex for ISSN resolution + NCBI eutils for PubMed abbreviations gets you ~90 % coverage with zero scraping. Ship a small bundled fallback table for 北大核心/南大核心 (no API exists for these at all).

---

## 5. Practical MV3 gotchas

### 5.1 Match patterns — you must enumerate Google's ccTLDs

`scholar.google.*` is **not a valid match pattern** (Chrome allows `*` only as the entire host, or as a `*.` prefix). Verified: **CCFrank4dblp and show-rank each list exactly 78 distinct `scholar.google.<tld>` entries** out of 86 total matches. Generate that list; don't hand-write it.

Prefer `content_scripts.matches` for injection and keep `host_permissions` for *fetch targets only* — CCFrank does exactly this (`host_permissions: ["*://dblp.org/*"]` while injecting into 86 URLs). Shipping `https://*/*` in `host_permissions` (as easyScholar does) triggers the "read and change all your data" prompt and, since MV3, is also a Web Store review flag.

### 5.2 CORS

- Content-script `fetch`/`XHR` cross-origin is **not** free in MV3. CCFrank's working MV3 code does `new XMLHttpRequest()` from a content script on `scholar.google.com` straight to `https://dblp.org/search/publ/api` and relies on `host_permissions` for dblp — ✅ that pattern ships and works.
- Still, **do the network in the service worker**: it centralises throttling (easyScholar's 2 req/s), the cache, and hides your key from page-adjacent code. Content script → `chrome.runtime.sendMessage` → SW `fetch` → response.

### 5.3 CSP / Trusted Types

- Google Scholar's live CSP (✅ observed header): `object-src 'none'; base-uri 'self'; script-src 'nonce-…' 'strict-dynamic' 'report-sample' 'unsafe-eval' 'unsafe-inline' https: http:`. **No `require-trusted-types-for`** and **no `style-src`** — so `innerHTML` and `el.style.*` are both fine today. Do not depend on that: Google flips Trusted Types on its properties without notice. Use `document.createElement` + `textContent`.
- IEEE Xplore (✅): `content-security-policy: upgrade-insecure-requests` — harmless.
- Content scripts run in an **isolated world**, so the page's `script-src` does **not** block your JS — but it *does* block any `<script>` or inline handler you inject into the page, and Trusted Types (if enabled) *does* apply to your writes into the page document.
- **ScienceDirect and Wiley returned 403 / Cloudflare challenge to curl** — expect the extension to run behind bot-detection; be conservative with request volume from those tabs.

### 5.4 MutationObserver + SPA routing

Observed, working patterns:
- **Debounce everything.** venue-rank: `MutationObserver` on `document.body` (`childList, subtree`) with a `scheduled` flag + 300 ms `setTimeout`. `cnki-Scholar`: 500 ms debounce, then a **random 1–3 s** delay before processing (deliberate jitter, anti-rate-limit).
- **Idempotency is mandatory**, or you get badge spam on every mutation. Three idioms in use: a class on the inserted node (`ccf-rank`, checked via `node.next().hasClass(...)`), a marker attribute on the row (`PROCESSED` / `data-srf-*` in jgy0), or a class on the row (`ccf-ranked`).
- **Observers alone are not enough on WoS** — CCFrank adds a **700 ms `setInterval`** plus a `popstate` handler. `ranking-kit` and `show-rank` use 2 s / polling too. For Angular/AngularJS sites (WoS, CNKI, IEEE, ScienceDirect) assume `history.pushState` navigation and poll or patch `history`.
- Guard the observer with a "is this route one I care about" check (`location.pathname`), as CCFrank does (`/scholar` vs `/citations`).

### 5.5 Shadow DOM — nobody does it, and that's a mistake for your sites

✅ I grepped all 7 clones for `attachShadow`: **zero hits**. Every project injects bare `<span>`/`<div>` into the host page and ships a global stylesheet via `content_scripts.css`.

That works on Scholar, and it *will* break on CNKI / WoS / IEEE / ScienceDirect, which have aggressive global CSS (`td`, `a`, `span`, `* { font-size }` rules). The cheap fix for a personal extension:

```js
const host = document.createElement("span");
host.style.cssText = "all:initial;display:inline-block";   // reset inherited styles
const root = host.attachShadow({ mode: "open" });          // isolate badge styles
root.innerHTML = `<style>:host{all:initial} .b{...}</style><span class="b">…</span>`;
node.after(host);
```
Caveats: `:host` styling only, no inherited font, and you must set `all: initial` on the host itself; and Shadow DOM does **not** protect you from the page's `MutationObserver` seeing your host element (so idempotency still applies). Also `content_scripts.css` does **not** pierce a shadow root — inline the `<style>` inside the shadow tree, or use `chrome.scripting.insertCSS` (also can't pierce).

### 5.6 Other MV3 specifics

- **No remote code.** You cannot load a rank table from a CDN as a script. Fetch JSON at runtime and cache in `chrome.storage.local` (5 MB default; `unlimitedStorage` if you ship CNKI's 9.4 MB table). easyScholar/`cnki-Scholar` both ship/stream large JSON — you'll want `unlimitedStorage` + a versioned cache key.
- **Service worker is killed after ~30 s idle.** Don't hold state in SW globals; persist to `chrome.storage`. Do the throttling queue there but re-hydrate it.
- **`chrome.storage.sync` is 100 KB total / 8 KB per item** — options only. Rank tables → `local`.
- **Cannot use `eval`/`new Function`.** jQuery (used by most of the projects above) is fine, but it's 90 KB of dead weight for what is really 20 lines of DOM work — all the MV3-era projects I read (CCFrank, venue-rank, jgy0, PolarisLight) are jQuery-free except CCFrank, which still bundles it for legacy reasons.
- **`document_start` vs `document_end`:** CCFrank uses default (`document_idle`); beibeihk pins `document_end`. For CNKI's Angular app, `document_start` + observer is more reliable than waiting for `load`.

---

## Recommended build order

1. **Google Scholar first.** Best selectors (§3.1), highest payoff, and the `div.gs_a` parse is a solved problem — but write a real tokenizer, not `.split(" ")[1]`.
2. **CNKI second.** `td.source a` is a gift (§3.3). Handle `kns.cnki.net` + `kns8.cnki.net` + `kns.cnki.cn`, debounce 500 ms + jitter.
3. **Publisher pages via `citation_*` meta tags** (§3.8c) rather than DOM scraping — one adapter for ScienceDirect/Springer/Wiley/IEEE detail pages, keyed on **ISSN**.
4. **PubMed** — only after you've solved abbreviation→full-name, ideally via NCBI eutils rather than a bundled table.
5. **WoS** — copy CCFrank's selectors + its 700 ms poll verbatim (§3.2); don't try to be clever.
6. **维普 / 万方 / 百度学术** — all three are 🟡 or ❌. Reserve a manual DOM-inspection session per site; expect 维普 to be from zero.

**Data layer:** ISSN as primary key → Crossref/OpenAlex to normalise → easyScholar API (your own key, ≤2 req/s, SW-side) for rankings → `chrome.storage.local` cache keyed by ISSN with a schema version. That sidesteps name-matching entirely for the English sites and leaves only the Chinese DBs needing name-based lookup.

---

## Appendix: sources

**Cloned and read (all verified to exist):**
`WenyanLiu/CCFrank4dblp` · `hnshhslsh/show-rank` · `museremarkable/swufe_ccf_show_ranking` · `ShutterZor/ranking-kit` · `PolarisLight/Journal-Conference-Rank-Assistant` · `bpiwowar/venue-rank` · `cuiwang/cnki-Scholar` · `beibeihk/cnki-journal-filter` · `jgy0/scholar-rank-extension`

**Fetched pages:**
- https://www.easyscholar.cc/ (homepage, features, pricing structure)
- https://www.easyscholar.cc/download (authoritative supported-site + dataset list)
- https://chromewebstore.google.com/detail/easyscholar/njgedjcccpcfmjecccaajkjiphpddfji (v15.5, 2026-10-20, in-app purchases)
- https://addons.mozilla.org/en-US/firefox/addon/easyscholar/ (16,887 users, 4.80/131, v15.2)
- https://www.easyscholar.cc/open/getPublicationRank (called directly; error codes quoted)
- https://raw.githubusercontent.com/luxiangze/easyscholar-journal-lookup/HEAD/docs/easyscholar-api.md (API transcription)

**Store screenshots read (badge appearance):** `lh3.googleusercontent.com/8EPm2fL8…` (Google Scholar) and `…/6Cw3lz8O…` (CNKI), both 1280×800.

**Explicitly unverified:** all CSP claims except Google Scholar + IEEE Xplore; every selector marked 🟡; easyScholar's actual price numbers; Gitee project landscape; new-WoS DOM; 维普 anything.
