// SagarPari static site builder — no dependencies, just Node 18+.
// Run: node build.js   → output goes to ./dist
import fs from "node:fs";
import path from "node:path";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(ROOT, "dist");
const site = JSON.parse(fs.readFileSync(path.join(ROOT, "site.json"), "utf8"));

// ---------- helpers ----------
const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: raw };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (v === "true") v = true;
    else if (v === "false") v = false;
    data[kv[1]] = v;
  }
  return { data, body: m[2] };
}

function inline(s) {
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => {
    // Body images get the same treatment as template images: width/height (no layout
    // shift) and a WebP <picture> twin when one exists. src/alt arrive already escaped.
    const raw = src.replace(/&amp;/g, "&");
    const local = !/^https?:/.test(raw);
    const d = local ? imgDims(raw) : null;
    const w = local ? webpOf(raw) : null;
    const img = `<img src="${src}" alt="${alt}"${d ? ` width="${d.w}" height="${d.h}"` : ""} loading="lazy" decoding="async">`;
    return w ? `<picture><source srcset="${esc(w)}" type="image/webp">${img}</picture>` : img;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => {
    const ext = /^https?:/.test(u);
    return `<a href="${u}"${ext ? ' target="_blank" rel="noopener"' : ""}>${t}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  return s;
}

function markdown(md) {
  const blocks = md.replace(/\r/g, "").trim().split(/\n\s*\n/);
  return blocks
    .map((b) => {
      const lines = b.split("\n");
      const h = b.match(/^(#{2,4})\s+(.*)$/);
      if (h && lines.length === 1) return `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`;
      if (lines.every((l) => /^\s*[-*]\s+/.test(l)))
        return "<ul>" + lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ""))}</li>`).join("") + "</ul>";
      if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l)))
        return "<ol>" + lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ""))}</li>`).join("") + "</ol>";
      if (lines.every((l) => /^>\s?/.test(l)))
        return `<blockquote><p>${inline(lines.map((l) => l.replace(/^>\s?/, "")).join(" "))}</p></blockquote>`;
      return `<p>${lines.map(inline).join("<br>")}</p>`;
    })
    .join("\n");
}

const tz = "America/New_York";
// Dates are formatted per edition (ne-NP or en-US), see buildEdition().
const mkFmt = (loc) => ({
  date: (d) => new Intl.DateTimeFormat(loc, { dateStyle: "long", timeZone: tz }).format(d),
  dateTime: (d) => new Intl.DateTimeFormat(loc, { dateStyle: "long", timeStyle: "short", timeZone: tz }).format(d) + " (ET)",
  num: (n) => new Intl.NumberFormat(loc).format(n),
});

// ---------- images (size + webp twin, no dependencies) ----------
const DEFAULT_IMAGE = "/og-default.png"; // 1200x630 share image for pages without their own
const dimCache = {};
function imgDims(src) {
  if (!src || /^https?:/.test(src)) return null;
  if (src in dimCache) return dimCache[src];
  let d = null;
  try {
    const b = fs.readFileSync(path.join(ROOT, "static", src));
    if (b.toString("ascii", 1, 4) === "PNG") d = { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    else if (b[0] === 0xff && b[1] === 0xd8) {
      // JPEG: walk markers to a Start-Of-Frame segment for width/height.
      let off = 2;
      while (off + 9 < b.length) {
        if (b[off] !== 0xff) break;
        const marker = b[off + 1];
        if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
          d = { w: b.readUInt16BE(off + 7), h: b.readUInt16BE(off + 5) };
          break;
        }
        const len = b.readUInt16BE(off + 2);
        if (len < 2) break;
        off += 2 + len;
      }
    }
  } catch {}
  return (dimCache[src] = d);
}
function webpOf(src) {
  if (!src || /^https?:/.test(src)) return null;
  const w = src.replace(/\.(png|jpe?g)$/i, ".webp");
  return w !== src && fs.existsSync(path.join(ROOT, "static", w)) ? w : null;
}
// <img> with width/height (stops layout jumping) and a small WebP copy when tools/make-webp.py made one.
function picture(src, alt = "", attrs = ' loading="lazy" decoding="async"') {
  const d = imgDims(src), w = webpOf(src);
  const img = `<img src="${esc(src)}" alt="${esc(alt)}"${d ? ` width="${d.w}" height="${d.h}"` : ""}${attrs}>`;
  return w ? `<picture><source srcset="${esc(w)}" type="image/webp">${img}</picture>` : img;
}
const absUrl = (u) => (/^https?:/.test(u) ? u : site.url + u);

function write(rel, html) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}

function copyDir(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    const s = path.join(src, f), d = path.join(dst, f);
    fs.statSync(s).isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

// ---------- load content ----------
function loadDir(dir) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return [];
  return fs
    .readdirSync(full)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const { data, body } = parseFrontmatter(fs.readFileSync(path.join(full, f), "utf8"));
      const slug = data.slug || f.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, "");
      return { ...data, slug, html: markdown(body), file: f };
    });
}

// ---------- editions ----------
// Nepali lives at the site root, English under /en/. English articles live in
// content/en/news and may name their Nepali twin with `ne: <nepali-slug>`; the two
// pages then link to each other (language switch + hreflang).
const EN = site.en || {};
const STR = {
  ne: {
    lang: "ne", locale: "ne-NP", og: "ne_NP", prefix: "",
    name: site.name, brand: "सागरपारि", tagline: site.tagline, description: site.description,
    cats: site.categories,
    nav: "खण्डहरू", home: "गृहपृष्ठ", skip: "मुख्य सामग्रीमा जानुहोस्", now: "अहिलेको समय",
    ny: "न्युयोर्क", ktm: "काठमाडौं", search: "खोज्नुहोस्", breaking: "ब्रेकिङ", latest: "ताजा खबर",
    moreSoon: "थप खबर चाँडै।", seeAll: "सबै हेर्नुहोस्",
    empty: "यहाँ अहिलेसम्म कुनै खबर छैन। नयाँ खबर चाँडै आउँदैछ।",
    searchLabel: "खबर खोज्नुहोस्", searchPh: "जस्तै: ग्रीन कार्ड, ट्याक्स, TPS",
    found: "' वटा खबर भेटियो'", notFound: "'\"'+q.value+'\" सँग मिल्ने खबर भेटिएन। अर्को शब्द प्रयोग गर्नुहोस्।'",
    catTitle: (c) => `${c.name} समाचार`,
    catDesc: (c) => `${c.description} अमेरिकामा बस्ने नेपालीका लागि ${c.name}सम्बन्धी ताजा खबर — सागरपारि।`,
    desk: "सागरपारि डेस्क", read: (n, f) => `${f.num(n)} मिनेट पढाइ`, updated: "अद्यावधिक",
    sources: "स्रोत", share: "सेयर गर्नुहोस्:", related: (c) => `${c.name}का अरू खबर`,
    nfTitle: "पेज भेटिएन", nfBody: `<h1>यो पेज भेटिएन</h1><p>लिंक पुरानो वा गलत हुन सक्छ। <a href="/">गृहपृष्ठमा फर्कनुहोस्</a> र ताजा खबर हेर्नुहोस्।</p>`,
    switchText: "English", switchLang: "en",
  },
  en: {
    lang: "en", locale: "en-US", og: "en_US", prefix: "/en",
    name: EN.name || "SagarPari", brand: "SagarPari", tagline: EN.tagline || "", description: EN.description || "",
    cats: site.categories.map((c) => ({ ...c, ...((EN.categories || {})[c.slug] || {}) })),
    nav: "Sections", home: "Home", skip: "Skip to main content", now: "Current time",
    ny: "New York", ktm: "Kathmandu", search: "Search", breaking: "Breaking", latest: "Latest news",
    moreSoon: "More stories soon.", seeAll: "See all",
    empty: "No stories here yet. New stories are coming soon.",
    searchLabel: "Search stories", searchPh: "e.g. green card, taxes, TPS",
    found: "' stories found'", notFound: "'No stories match \"'+q.value+'\". Try another word.'",
    catTitle: (c) => `${c.name} News`,
    catDesc: (c) => `${c.description} The latest ${c.name.toLowerCase()} news for Nepalis living in the USA — SagarPari.`,
    desk: "SagarPari Desk", read: (n) => `${n} min read`, updated: "Updated",
    sources: "Sources", share: "Share:", related: (c) => `More in ${c.name}`,
    nfTitle: "Page not found", nfBody: `<h1>Page not found</h1><p>The link may be old or wrong. <a href="/en/">Go to the home page</a> for the latest news.</p>`,
    switchText: "नेपाली", switchLang: "ne",
  },
};

function loadEdition(L) {
  const base = L.lang === "ne" ? "content" : "content/en";
  const catBySlug = Object.fromEntries(L.cats.map((c) => [c.slug, c]));
  const posts = loadDir(`${base}/news`)
    .filter((p) => p.draft !== true)
    .map((p) => {
      const date = new Date(p.date);
      if (isNaN(date)) throw new Error(`Bad or missing date in ${base}/news/${p.file}`);
      if (!catBySlug[p.category]) throw new Error(`Unknown category "${p.category}" in ${base}/news/${p.file}`);
      if (!p.title) throw new Error(`Missing title in ${base}/news/${p.file}`);
      return { ...p, date, url: `${L.prefix}/news/${p.slug}/`, cat: catBySlug[p.category] };
    })
    .filter((p) => p.date <= new Date(Date.now() + 60 * 60 * 1000)) // hide scheduled future posts
    .sort((a, b) => b.date - a.date);
  const pages = loadDir(`${base}/pages`).map((p) => ({ ...p, url: `${L.prefix}/${p.slug}/` }));
  return { posts, pages };
}

const ED = { ne: loadEdition(STR.ne), en: loadEdition(STR.en) };

// Twin links: English post `ne: slug` ↔ Nepali post.
{
  const neBySlug = Object.fromEntries(ED.ne.posts.map((p) => [p.slug, p]));
  for (const e of ED.en.posts) {
    const n = e.ne && neBySlug[e.ne];
    if (n) { e.twin = n; n.twin = e; }
  }
  const enPage = Object.fromEntries(ED.en.pages.map((p) => [p.slug, p]));
  for (const n of ED.ne.pages) {
    const e = enPage[n.slug];
    if (e) { e.twin = n; n.twin = e; }
  }
}

// ---------- shared pieces ----------
const coverWave = `<svg class="cover-wave" viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0 20 Q 12.5 8 25 20 T 50 20 T 75 20 T 100 20 T 125 20 T 150 20 T 175 20 T 200 20 V40 H0Z" fill="currentColor"/></svg>`;
const wave = `<svg class="wave" viewBox="0 0 1200 14" preserveAspectRatio="none" aria-hidden="true"><path d="M0 7 Q 25 0 50 7 T 100 7 T 150 7 T 200 7 T 250 7 T 300 7 T 350 7 T 400 7 T 450 7 T 500 7 T 550 7 T 600 7 T 650 7 T 700 7 T 750 7 T 800 7 T 850 7 T 900 7 T 950 7 T 1000 7 T 1050 7 T 1100 7 T 1150 7 T 1200 7" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;

// Google AdSense (pub-8106953949051393) — injected into <head> of every page via layout()
const adsenseHead = `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8106953949051393"
     crossorigin="anonymous"></script>`;

const logoLd = { "@type": "ImageObject", url: `${site.url}/logo.png`, width: 512, height: 512 };
const crumbs = (items) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, u], i) => ({ "@type": "ListItem", position: i + 1, name, item: site.url + u })),
});
const readMins = (p) => Math.max(1, Math.round(p.html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length / 180));

// ---------- build ----------
fs.rmSync(OUT, { recursive: true, force: true });
copyDir(path.join(ROOT, "static"), OUT);

function buildEdition(L, { posts, pages }) {
  const f = mkFmt(L.locale);
  const other = L.lang === "ne" ? STR.en : STR.ne;
  const otherHasNews = ED[other.lang].posts.length > 0;
  const P = L.prefix;
  const homeUrl = `${P}/`;

  const nav = (active) =>
    `<nav class="cats" aria-label="${L.nav}"><ul>
    <li><a href="${homeUrl}"${active === "home" ? ' aria-current="page"' : ""}>${L.home}</a></li>
    ${L.cats
      .map((c) => `<li><a href="${P}/category/${c.slug}/"${active === c.slug ? ' aria-current="page"' : ""}>${esc(c.name)}</a></li>`)
      .join("")}
  </ul></nav>`;

  // alt: URL of the same page in the other language (null = none). Section pages
  // (home, categories, search) always exist in both once the other edition has news.
  function layout({ title, description, url, body, active, ogType = "website", extraHead = "", image, imageAlt, noindex = false, jsonld = [], article, alt }) {
    const fullTitle = title ? `${title} | ${L.name}` : `${L.name} — ${L.tagline}`;
    const canonical = site.url + url;
    const desc = description || L.description;
    const img = image || DEFAULT_IMAGE;
    const ogImage = absUrl(img);
    const ogDims = imgDims(img);
    const ogType2 = /\.png$/i.test(img) ? "image/png" : /\.jpe?g$/i.test(img) ? "image/jpeg" : /\.webp$/i.test(img) ? "image/webp" : null;
    const ld = jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`).join("\n");
    const hreflang = alt
      ? `<link rel="alternate" hreflang="${L.lang}" href="${canonical}">
<link rel="alternate" hreflang="${other.lang}" href="${site.url + alt}">
<link rel="alternate" hreflang="x-default" href="${site.url + (L.lang === "ne" ? url : alt)}">
<meta property="og:locale:alternate" content="${other.og}">`
      : "";
    const switchHref = alt || (otherHasNews ? `${other.prefix}/` : null);
    return `<!doctype html>
<html lang="${L.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="${noindex ? "noindex, follow" : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"}">
<link rel="canonical" href="${canonical}">
${hreflang}
<meta property="og:site_name" content="${esc(L.name)}">
<meta property="og:locale" content="${L.og}">
<meta property="og:title" content="${esc(title || L.name)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="${ogType}">
<meta property="og:image" content="${ogImage}">
${ogType2 ? `<meta property="og:image:type" content="${ogType2}">` : ""}${ogDims ? `<meta property="og:image:width" content="${ogDims.w}">\n<meta property="og:image:height" content="${ogDims.h}">` : ""}
<meta property="og:image:alt" content="${esc(imageAlt || title || L.name)}">
${article ? `<meta property="article:published_time" content="${article.published}">
<meta property="article:modified_time" content="${article.modified}">
<meta property="article:section" content="${esc(article.section)}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title || L.name)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${ogImage}">
<meta name="theme-color" content="#0F3B5F">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
${ld}
<link rel="alternate" type="application/rss+xml" title="${esc(L.name)}" href="${P}/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Khand:wght@500;600;700&family=Mukta:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
${adsenseHead}
${extraHead}
</head>
<body>
<a class="skip" href="#main">${L.skip}</a>
<header class="masthead">
  <div class="wrap mast-row">
    <a class="brand" href="${homeUrl}" aria-label="${esc(L.name)} ${L.home}">
      <span class="brand-name">${L.brand}</span>
      <span class="brand-tag">${esc(L.tagline)}</span>
    </a>
    <p class="today" id="today"></p>
    <div class="clocks" aria-label="${L.now}">
      <div><span class="clock-place">${L.ny}</span><time class="clock" data-tz="America/New_York">--:--</time></div>
      <div><span class="clock-place">${L.ktm}</span><time class="clock" data-tz="Asia/Kathmandu">--:--</time></div>
    </div>
  </div>
  <div class="wrap">${wave}</div>
</header>
<div class="navbar"><div class="wrap nav-row">${nav(active)}${switchHref ? `<a class="lang-switch" href="${switchHref}" hreflang="${other.lang}" lang="${other.lang}">${other === STR.en ? "English" : "नेपाली"}</a>` : ""}<a class="search-link" href="${P}/search/" aria-label="${L.search}"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></a></div></div>
<main id="main" class="wrap">
${body}
</main>
<footer class="foot">
  <div class="wrap foot-grid">
    <div>
      <p class="foot-brand">${L.brand}</p>
      <p>${esc(L.description)}</p>
    </div>
    <ul class="foot-links">
      ${pages.map((p) => `<li><a href="${p.url}">${esc(p.title)}</a></li>`).join("")}
      <li><a href="${P}/search/">${L.search}</a></li>
      <li><a href="${P}/feed.xml">RSS</a></li>
      ${otherHasNews ? `<li><a href="${other.prefix}/" lang="${other.lang}">${other === STR.en ? "English edition" : "नेपाली संस्करण"}</a></li>` : ""}
    </ul>
  </div>
  <div class="wrap foot-small">© ${new Date().getFullYear()} ${esc(L.name)}</div>
</footer>
<script>
(function(){
  var els=document.querySelectorAll('.clock');
  function tick(){els.forEach(function(el){
    try{el.textContent=new Intl.DateTimeFormat('${L.locale}',{hour:'numeric',minute:'2-digit',timeZone:el.dataset.tz}).format(new Date());}catch(e){}
  });}
  tick();setInterval(tick,30000);
  var t=document.getElementById('today');if(t){try{t.textContent=new Intl.DateTimeFormat('${L.locale}',{weekday:'long',year:'numeric',month:'long',day:'numeric',timeZone:'America/New_York'}).format(new Date())}catch(e){}}
})();
</script>
</body>
</html>`;
  }
  const sectionAlt = (u) => (otherHasNews ? other.prefix + u : null);

  const meta = (p) =>
    `<p class="meta"><a class="cat-tag" href="${P}/category/${p.cat.slug}/">${esc(p.cat.name)}</a><time datetime="${p.date.toISOString()}">${f.date(p.date)}</time></p>`;

  // Photo if we have one, otherwise a branded cover in the category colour (no copyright risk).
  const thumb = (p, cls = "", eager = false) =>
    `<a href="${p.url}" class="thumb ${cls}" tabindex="-1" aria-hidden="true" style="--c:${p.cat.color}">${
      p.image
        ? picture(p.image, "", eager ? ' fetchpriority="high" decoding="async"' : undefined)
        : `<span class="cover"><span class="cover-cat">${esc(p.cat.name)}</span>${coverWave}</span>`
    }</a>`;

  const storyItem = (p, opts = {}) => `<li class="story${opts.thumb ? " has-thumb" : ""}">
  ${opts.thumb ? thumb(p, "sm") : ""}
  <div>
    ${meta(p)}
    <h3><a href="${p.url}">${esc(p.title)}</a></h3>
    ${p.summary && !opts.noDek ? `<p class="dek">${esc(p.summary)}</p>` : ""}
  </div>
</li>`;

  const headlineItem = (p) => `<li class="headline"><a href="${p.url}">${esc(p.title)}</a><span class="when">${f.date(p.date)}</span></li>`;
  const emptyState = `<div class="empty"><p>${L.empty}</p></div>`;

  // ---------- structured data ----------
  const aboutPage = pages.find((p) => p.slug === "about");
  const orgLd = {
    "@context": "https://schema.org",
    "@type": "NewsMediaOrganization",
    "@id": `${site.url}/#org`,
    name: site.name,
    alternateName: "SagarPari",
    url: `${site.url}/`,
    logo: logoLd,
    description: L.description,
    ...(aboutPage ? { publishingPrinciples: site.url + aboutPage.url } : {}),
    ...(pages.find((p) => p.slug === "corrections") ? { correctionsPolicy: `${site.url}${P}/corrections/` } : {}),
  };

  // Home
  {
    const [lead, ...rest] = posts;
    const seconds = rest.slice(0, 2);
    const latest = rest.slice(2, 10);
    const recentBreaking = posts.find((p) => p.breaking === true && Date.now() - p.date < 48 * 3600 * 1000);
    const blocks = L.cats
      .map((c) => ({ c, list: posts.filter((p) => p.category === c.slug && p !== lead) }))
      .filter((b) => b.list.length);
    const body = lead
      ? `${recentBreaking ? `<a class="breaking" href="${recentBreaking.url}"><span class="breaking-tag">${L.breaking}</span><span>${esc(recentBreaking.title)}</span></a>` : ""}
      <section class="front">
        <h1 class="sr">${esc(L.name)} — ${esc(L.tagline)}</h1>
        <article class="lead">
          ${thumb(lead, "lg", true)}
          ${meta(lead)}
          <h2><a href="${lead.url}">${esc(lead.title)}</a></h2>
          ${lead.summary ? `<p class="dek">${esc(lead.summary)}</p>` : ""}
        </article>
        ${seconds.length ? `<div class="seconds">${seconds
          .map((p) => `<article class="second">${thumb(p)}${meta(p)}<h3><a href="${p.url}">${esc(p.title)}</a></h3></article>`)
          .join("")}</div>` : ""}
        <aside class="latest" aria-labelledby="latest-h">
          <h2 id="latest-h" class="section-h">${L.latest}</h2>
          ${latest.length ? `<ol class="headline-list">${latest.map(headlineItem).join("")}</ol>` : `<p class="muted">${L.moreSoon}</p>`}
        </aside>
      </section>
      ${blocks
        .map(
          ({ c, list }) => `<section class="block" style="--c:${c.color}">
        <header class="block-h"><h2><a href="${P}/category/${c.slug}/">${esc(c.name)}</a></h2><a class="more" href="${P}/category/${c.slug}/">${L.seeAll}</a></header>
        <div class="block-body">
          <article class="block-lead">${thumb(list[0])}<h3><a href="${list[0].url}">${esc(list[0].title)}</a></h3>${list[0].summary ? `<p class="dek">${esc(list[0].summary)}</p>` : ""}</article>
          ${list.length > 1 ? `<ul class="story-list">${list.slice(1, 5).map((p) => storyItem(p, { thumb: true, noDek: true })).join("")}</ul>` : ""}
        </div>
      </section>`
        )
        .join("")}`
      : emptyState;
    const homeLd = [
      orgLd,
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "@id": `${site.url}${homeUrl}#website`,
        name: L.name,
        alternateName: "SagarPari",
        url: `${site.url}${homeUrl}`,
        inLanguage: L.lang,
        description: L.description,
        publisher: { "@id": `${site.url}/#org` },
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${site.url}${P}/search/?q={search_term_string}` },
          "query-input": "required name=search_term_string",
        },
      },
    ];
    write(`${P.slice(1)}${P ? "/" : ""}index.html`, layout({ url: homeUrl, body, active: "home", jsonld: homeLd, alt: sectionAlt("/") }));
  }

  // Search page + index
  write(
    `${P.slice(1)}${P ? "/" : ""}search.json`,
    JSON.stringify(posts.map((p) => ({ t: p.title, s: p.summary || "", u: p.url, c: p.cat.name, d: f.date(p.date) })))
  );
  write(
    `${P.slice(1)}${P ? "/" : ""}search/index.html`,
    layout({
      title: L.search,
      url: `${P}/search/`,
      noindex: true,
      alt: sectionAlt("/search/"),
      body: `<header class="page-h"><h1>${L.search}</h1></header>
    <form class="search-form" role="search" onsubmit="return false">
      <label for="q" class="sr">${L.searchLabel}</label>
      <input id="q" type="search" placeholder="${esc(L.searchPh)}" autocomplete="off">
    </form>
    <p id="search-status" class="muted" aria-live="polite"></p>
    <ul id="results" class="story-grid"></ul>
    <script>
    (function(){
      var q=document.getElementById('q'),out=document.getElementById('results'),st=document.getElementById('search-status'),data=[];
      function e(s){return s.replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
      function run(){var v=q.value.trim().toLowerCase();if(!v){out.innerHTML='';st.textContent='';return}
        var r=data.filter(function(x){return (x.t+' '+x.s+' '+x.c).toLowerCase().indexOf(v)>-1});
        st.textContent=r.length?r.length+${L.found}:${L.notFound};
        out.innerHTML=r.map(function(x){return '<li class="story"><p class="meta"><span class="cat-tag">'+e(x.c)+'</span><span>'+e(x.d)+'</span></p><h3><a href="'+x.u+'">'+e(x.t)+'</a></h3><p class="dek">'+e(x.s)+'</p></li>'}).join('')}
      fetch('${P}/search.json').then(function(r){return r.json()}).then(function(d){data=d;var p=new URLSearchParams(location.search).get('q');if(p){q.value=p}run()});
      q.addEventListener('input',run);q.focus();
    })();
    </script>`,
    })
  );

  // Category pages
  for (const c of L.cats) {
    const list = posts.filter((p) => p.category === c.slug);
    const body = `<header class="page-h"><h1>${esc(c.name)}</h1><p class="muted">${esc(c.description || "")}</p></header>
    ${list.length ? `<ul class="story-grid">${list.map((p) => storyItem(p, { thumb: true })).join("")}</ul>` : emptyState}`;
    write(
      `${P.slice(1)}${P ? "/" : ""}category/${c.slug}/index.html`,
      layout({
        title: L.catTitle(c),
        description: L.catDesc(c),
        url: `${P}/category/${c.slug}/`,
        body,
        active: c.slug,
        // Empty sections stay out of Google until they have stories.
        noindex: list.length === 0,
        alt: sectionAlt(`/category/${c.slug}/`),
        jsonld: [crumbs([[L.home, homeUrl], [c.name, `${P}/category/${c.slug}/`]])],
      })
    );
  }

  // Articles
  for (const p of posts) {
    const related = posts.filter((x) => x.category === p.category && x.slug !== p.slug).slice(0, 4);
    // Thin categories: top the page up with a latest-news strip so every article
    // still recirculates readers to more stories (pageviews/session).
    const moreNews = related.length < 4 ? posts.filter((x) => x.slug !== p.slug && !related.includes(x)).slice(0, 6) : [];
    const shareUrl = encodeURIComponent(site.url + p.url);
    const published = p.date.toISOString();
    const modified = p.updated && !isNaN(new Date(p.updated)) ? new Date(p.updated).toISOString() : published;
    const jsonld = {
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      headline: p.title,
      description: p.summary || "",
      datePublished: published,
      dateModified: modified,
      inLanguage: L.lang,
      articleSection: p.cat.name,
      isAccessibleForFree: true,
      mainEntityOfPage: { "@type": "WebPage", "@id": site.url + p.url },
      ...(p.twin ? { [L.lang === "en" ? "translationOfWork" : "workTranslation"]: { "@id": site.url + p.twin.url } } : {}),
      image: (() => {
        const src = p.image || DEFAULT_IMAGE;
        const d = imgDims(src);
        return [d ? { "@type": "ImageObject", url: absUrl(src), width: d.w, height: d.h } : absUrl(src)];
      })(),
      author: {
        "@type": "Organization",
        name: p.author || L.desk,
        url: aboutPage ? site.url + aboutPage.url : `${site.url}${homeUrl}`,
      },
      publisher: { "@type": "NewsMediaOrganization", "@id": `${site.url}/#org`, name: site.name, logo: logoLd },
    };
    const sources = [];
    for (let i = 0; i < 5; i++) {
      const n = p[`source${i || ""}`], u = p[`sourceUrl${i || ""}`];
      if (n) sources.push(u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(n)}</a>` : esc(n));
    }
    const twinNote = p.twin
      ? `<p class="twin-note" lang="${other.lang}"><a href="${p.twin.url}" hreflang="${other.lang}">${other.lang === "en" ? "Read this story in English →" : "यो खबर नेपालीमा पढ्नुहोस् →"}</a></p>`
      : "";
    const body = `<article class="article">
    <header>
      ${meta(p)}
      <h1>${esc(p.title)}</h1>
      ${p.summary ? `<p class="standfirst">${esc(p.summary)}</p>` : ""}
      <p class="byline">${esc(p.author || L.desk)} · ${f.dateTime(p.date)} · ${L.read(readMins(p), f)}${p.updated ? ` · ${L.updated}: ${f.date(new Date(p.updated))}` : ""}</p>
      ${twinNote}
    </header>
    ${p.image ? `<figure class="hero-img">${picture(p.image, p.imageAlt || p.title, ' fetchpriority="high" decoding="async"')}${p.imageCredit ? `<figcaption>${esc(p.imageCredit)}</figcaption>` : ""}</figure>` : ""}
    <div class="prose">${p.html}</div>
    ${sources.length ? `<aside class="sources"><h2>${L.sources}</h2><p>${sources.join("<br>")}</p></aside>` : ""}
    <div class="share">
      <span>${L.share}</span>
      <a href="https://www.facebook.com/sharer/sharer.php?u=${shareUrl}" target="_blank" rel="noopener">Facebook</a>
      <a href="https://wa.me/?text=${shareUrl}" target="_blank" rel="noopener">WhatsApp</a>
      <a href="https://x.com/intent/post?url=${shareUrl}" target="_blank" rel="noopener">X</a>
    </div>
  </article>
  ${related.length ? `<section class="related"><h2 class="section-h">${esc(L.related(p.cat))}</h2><ul class="story-grid">${related.map((p) => storyItem(p, { thumb: true, noDek: true })).join("")}</ul></section>` : ""}
  ${moreNews.length ? `<section class="related"><h2 class="section-h">${L.latest}</h2><ol class="headline-list">${moreNews.map(headlineItem).join("")}</ol></section>` : ""}`;
    write(
      `${P.slice(1)}${P ? "/" : ""}news/${p.slug}/index.html`,
      layout({
        title: p.title,
        description: p.summary,
        url: p.url,
        body,
        active: p.category,
        ogType: "article",
        image: p.image,
        imageAlt: p.imageAlt,
        article: { published, modified, section: p.cat.name },
        alt: p.twin ? p.twin.url : null,
        jsonld: [jsonld, crumbs([[L.home, homeUrl], [p.cat.name, `${P}/category/${p.cat.slug}/`], [p.title, p.url]])],
      })
    );
  }

  // Static pages
  for (const p of pages) {
    const body = `<article class="article"><header><h1>${esc(p.title)}</h1></header><div class="prose">${p.html}</div></article>`;
    write(`${P.slice(1)}${P ? "/" : ""}${p.slug}/index.html`, layout({ title: p.title, description: p.description, url: p.url, body, alt: p.twin ? p.twin.url : null }));
  }

  // 404 (Nepali one is the site-wide fallback; English one lives at /en/404.html)
  write(`${P.slice(1)}${P ? "/" : ""}404.html`, layout({ title: L.nfTitle, url: `${P}/404.html`, noindex: true, body: `<div class="empty">${L.nfBody}</div>` }));

  // RSS
  const lastBuild = (posts[0] ? posts[0].date : new Date()).toUTCString();
  const enclosure = (p) => {
    if (!p.image || /^https?:/.test(p.image)) return "";
    try {
      const size = fs.statSync(path.join(ROOT, "static", p.image)).size;
      const mt = /\.jpe?g$/i.test(p.image) ? "image/jpeg" : /\.webp$/i.test(p.image) ? "image/webp" : "image/png";
      return `<enclosure url="${site.url}${esc(p.image)}" length="${size}" type="${mt}"/>`;
    } catch {
      return "";
    }
  };
  write(
    `${P.slice(1)}${P ? "/" : ""}feed.xml`,
    `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>${esc(L.name)}</title><link>${site.url}${homeUrl}</link><description>${esc(L.description)}</description><language>${L.lang}</language>
<atom:link href="${site.url}${P}/feed.xml" rel="self" type="application/rss+xml"/>
<lastBuildDate>${lastBuild}</lastBuildDate>
<image><url>${site.url}/logo.png</url><title>${esc(L.name)}</title><link>${site.url}${homeUrl}</link></image>
${posts
  .slice(0, 50)
  .map(
    (p) =>
      `<item><title>${esc(p.title)}</title><link>${site.url}${p.url}</link><guid isPermaLink="true">${site.url}${p.url}</guid><pubDate>${p.date.toUTCString()}</pubDate><category>${esc(p.cat.name)}</category><description>${esc(p.summary || "")}</description>${enclosure(p)}</item>`
  )
  .join("\n")}
</channel></rss>`
  );
}

buildEdition(STR.ne, ED.ne);
if (ED.en.posts.length) buildEdition(STR.en, ED.en);

// ---------- sitemaps + robots (both editions) ----------
const iso = (d) => d.toISOString();
const postMod = (p) => (p.updated && !isNaN(new Date(p.updated)) ? new Date(p.updated) : p.date);
const newest = (list) => (list.length ? iso(postMod(list.reduce((a, b) => (postMod(a) > postMod(b) ? a : b)))) : null);
const entries = [];
for (const L of [STR.ne, STR.en]) {
  const { posts, pages } = ED[L.lang];
  if (!posts.length) continue;
  entries.push(
    { u: `${L.prefix}/`, mod: newest(posts) },
    ...L.cats
      .map((c) => ({ list: posts.filter((p) => p.category === c.slug), c }))
      .filter(({ list }) => list.length)
      .map(({ c, list }) => ({ u: `${L.prefix}/category/${c.slug}/`, mod: newest(list) })),
    ...posts.map((p) => ({ u: p.url, mod: iso(postMod(p)), img: p.image })),
    ...pages.map((p) => ({ u: p.url, mod: null }))
  );
}
write(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries
  .map(
    (e) =>
      `<url><loc>${site.url}${e.u}</loc>${e.mod ? `<lastmod>${e.mod}</lastmod>` : ""}${
        e.img ? `<image:image><image:loc>${esc(absUrl(e.img))}</image:loc></image:image>` : ""
      }</url>`
  )
  .join("\n")}
</urlset>`
);

// Google News sitemap: only articles from the last 2 days (Google's rule), max 1000.
const newsPosts = [...ED.ne.posts.map((p) => [p, "ne"]), ...ED.en.posts.map((p) => [p, "en"])]
  .filter(([p]) => Date.now() - p.date < 2 * 24 * 3600 * 1000)
  .slice(0, 1000);
write(
  "news-sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${newsPosts
  .map(
    ([p, lang]) =>
      `<url><loc>${site.url}${p.url}</loc><news:news><news:publication><news:name>${esc(STR[lang].name)}</news:name><news:language>${lang}</news:language></news:publication><news:publication_date>${iso(p.date)}</news:publication_date><news:title>${esc(p.title)}</news:title></news:news></url>`
  )
  .join("\n")}
</urlset>`
);
write(
  "robots.txt",
  `User-agent: *\nAllow: /\nDisallow: /search.json\nDisallow: /en/search.json\n\nSitemap: ${site.url}/sitemap.xml\nSitemap: ${site.url}/news-sitemap.xml\n`
);

console.log(`Built ${ED.ne.posts.length} Nepali + ${ED.en.posts.length} English articles, ${ED.ne.pages.length + ED.en.pages.length} pages → dist/`);
