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
const fmtDate = (d) => new Intl.DateTimeFormat("ne-NP", { dateStyle: "long", timeZone: tz }).format(d);
const fmtDateTime = (d) =>
  new Intl.DateTimeFormat("ne-NP", { dateStyle: "long", timeStyle: "short", timeZone: tz }).format(d) + " (ET)";

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
const catBySlug = Object.fromEntries(site.categories.map((c) => [c.slug, c]));

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

const posts = loadDir("content/news")
  .filter((p) => p.draft !== true)
  .map((p) => {
    const date = new Date(p.date);
    if (isNaN(date)) throw new Error(`Bad or missing date in ${p.file}`);
    if (!catBySlug[p.category]) throw new Error(`Unknown category "${p.category}" in ${p.file}`);
    if (!p.title) throw new Error(`Missing title in ${p.file}`);
    return { ...p, date, url: `/news/${p.slug}/`, cat: catBySlug[p.category] };
  })
  .filter((p) => p.date <= new Date(Date.now() + 60 * 60 * 1000)) // hide scheduled future posts
  .sort((a, b) => b.date - a.date);

const pages = loadDir("content/pages").map((p) => ({ ...p, url: `/${p.slug}/` }));

// ---------- templates ----------
const nav = (active) =>
  `<nav class="cats" aria-label="खण्डहरू"><ul>
    <li><a href="/"${active === "home" ? ' aria-current="page"' : ""}>गृहपृष्ठ</a></li>
    ${site.categories
      .map((c) => `<li><a href="/category/${c.slug}/"${active === c.slug ? ' aria-current="page"' : ""}>${c.name}</a></li>`)
      .join("")}
  </ul></nav>`;

const coverWave = `<svg class="cover-wave" viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0 20 Q 12.5 8 25 20 T 50 20 T 75 20 T 100 20 T 125 20 T 150 20 T 175 20 T 200 20 V40 H0Z" fill="currentColor"/></svg>`;
const wave = `<svg class="wave" viewBox="0 0 1200 14" preserveAspectRatio="none" aria-hidden="true"><path d="M0 7 Q 25 0 50 7 T 100 7 T 150 7 T 200 7 T 250 7 T 300 7 T 350 7 T 400 7 T 450 7 T 500 7 T 550 7 T 600 7 T 650 7 T 700 7 T 750 7 T 800 7 T 850 7 T 900 7 T 950 7 T 1000 7 T 1050 7 T 1100 7 T 1150 7 T 1200 7" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;

// Google AdSense (pub-8106953949051393) — injected into <head> of every page via layout()
const adsenseHead = `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8106953949051393"
     crossorigin="anonymous"></script>`;

function layout({ title, description, url, body, active, ogType = "website", extraHead = "", image, imageAlt, noindex = false, jsonld = [], article }) {
  const fullTitle = title ? `${title} | ${site.name}` : `${site.name} — ${site.tagline}`;
  const canonical = site.url + url;
  const desc = description || site.description;
  const img = image || DEFAULT_IMAGE;
  const ogImage = absUrl(img);
  const ogDims = imgDims(img);
  const ogType2 = /\.png$/i.test(img) ? "image/png" : /\.jpe?g$/i.test(img) ? "image/jpeg" : /\.webp$/i.test(img) ? "image/webp" : null;
  const ld = jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`).join("\n");
  return `<!doctype html>
<html lang="ne">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="${noindex ? "noindex, follow" : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"}">
<link rel="canonical" href="${canonical}">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:locale" content="ne_NP">
<meta property="og:title" content="${esc(title || site.name)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="${ogType}">
<meta property="og:image" content="${ogImage}">
${ogType2 ? `<meta property="og:image:type" content="${ogType2}">` : ""}${ogDims ? `<meta property="og:image:width" content="${ogDims.w}">\n<meta property="og:image:height" content="${ogDims.h}">` : ""}
<meta property="og:image:alt" content="${esc(imageAlt || title || site.name)}">
${article ? `<meta property="article:published_time" content="${article.published}">
<meta property="article:modified_time" content="${article.modified}">
<meta property="article:section" content="${esc(article.section)}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title || site.name)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${ogImage}">
<meta name="theme-color" content="#0F3B5F">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
${ld}
<link rel="alternate" type="application/rss+xml" title="${esc(site.name)}" href="/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Khand:wght@500;600;700&family=Mukta:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
${adsenseHead}
${extraHead}
</head>
<body>
<a class="skip" href="#main">मुख्य सामग्रीमा जानुहोस्</a>
<header class="masthead">
  <div class="wrap mast-row">
    <a class="brand" href="/" aria-label="${esc(site.name)} गृहपृष्ठ">
      <span class="brand-name">सागरपारि</span>
      <span class="brand-tag">${esc(site.tagline)}</span>
    </a>
    <p class="today" id="today"></p>
    <div class="clocks" aria-label="अहिलेको समय">
      <div><span class="clock-place">न्युयोर्क</span><time class="clock" data-tz="America/New_York">--:--</time></div>
      <div><span class="clock-place">काठमाडौं</span><time class="clock" data-tz="Asia/Kathmandu">--:--</time></div>
    </div>
  </div>
  <div class="wrap">${wave}</div>
</header>
<div class="navbar"><div class="wrap nav-row">${nav(active)}<a class="search-link" href="/search/" aria-label="खोज्नुहोस्"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></a></div></div>
<main id="main" class="wrap">
${body}
</main>
<footer class="foot">
  <div class="wrap foot-grid">
    <div>
      <p class="foot-brand">सागरपारि</p>
      <p>${esc(site.description)}</p>
    </div>
    <ul class="foot-links">
      ${pages.map((p) => `<li><a href="${p.url}">${esc(p.title)}</a></li>`).join("")}
      <li><a href="/search/">खोज्नुहोस्</a></li>
      <li><a href="/feed.xml">RSS</a></li>
    </ul>
  </div>
  <div class="wrap foot-small">© ${new Date().getFullYear()} ${esc(site.name)}</div>
</footer>
<script>
(function(){
  var els=document.querySelectorAll('.clock');
  function tick(){els.forEach(function(el){
    try{el.textContent=new Intl.DateTimeFormat('ne-NP',{hour:'numeric',minute:'2-digit',timeZone:el.dataset.tz}).format(new Date());}catch(e){}
  });}
  tick();setInterval(tick,30000);
  var t=document.getElementById('today');if(t){try{t.textContent=new Intl.DateTimeFormat('ne-NP',{weekday:'long',year:'numeric',month:'long',day:'numeric',timeZone:'America/New_York'}).format(new Date())}catch(e){}}
})();
</script>
</body>
</html>`;
}

const readMins = (p) => Math.max(1, Math.round(p.html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length / 180));
const neNum = (n) => new Intl.NumberFormat("ne-NP").format(n);

const meta = (p) =>
  `<p class="meta"><a class="cat-tag" href="/category/${p.cat.slug}/">${p.cat.name}</a><time datetime="${p.date.toISOString()}">${fmtDate(p.date)}</time></p>`;

// Photo if we have one, otherwise a branded cover in the category colour (no copyright risk).
const thumb = (p, cls = "", eager = false) =>
  `<a href="${p.url}" class="thumb ${cls}" tabindex="-1" aria-hidden="true" style="--c:${p.cat.color}">${
    p.image
      ? picture(p.image, "", eager ? ' fetchpriority="high" decoding="async"' : undefined)
      : `<span class="cover"><span class="cover-cat">${p.cat.name}</span>${coverWave}</span>`
  }</a>`;

const storyItem = (p, opts = {}) => `<li class="story${opts.thumb ? " has-thumb" : ""}">
  ${opts.thumb ? thumb(p, "sm") : ""}
  <div>
    ${meta(p)}
    <h3><a href="${p.url}">${esc(p.title)}</a></h3>
    ${p.summary && !opts.noDek ? `<p class="dek">${esc(p.summary)}</p>` : ""}
  </div>
</li>`;

const headlineItem = (p) => `<li class="headline"><a href="${p.url}">${esc(p.title)}</a><span class="when">${fmtDate(p.date)}</span></li>`;

const emptyState = `<div class="empty"><p>यहाँ अहिलेसम्म कुनै खबर छैन। नयाँ खबर चाँडै आउँदैछ।</p></div>`;

// ---------- structured data (Google rich results) ----------
const aboutPage = pages.find((p) => p.slug === "about");
const logoLd = { "@type": "ImageObject", url: `${site.url}/logo.png`, width: 512, height: 512 };
const orgLd = {
  "@context": "https://schema.org",
  "@type": "NewsMediaOrganization",
  "@id": `${site.url}/#org`,
  name: site.name,
  alternateName: "SagarPari",
  url: `${site.url}/`,
  logo: logoLd,
  description: site.description,
  ...(aboutPage ? { publishingPrinciples: site.url + aboutPage.url } : {}),
  ...(pages.find((p) => p.slug === "corrections") ? { correctionsPolicy: `${site.url}/corrections/` } : {}),
};
const crumbs = (items) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, u], i) => ({ "@type": "ListItem", position: i + 1, name, item: site.url + u })),
});

// ---------- build ----------
fs.rmSync(OUT, { recursive: true, force: true });
copyDir(path.join(ROOT, "static"), OUT);

// Home
{
  const [lead, ...rest] = posts;
  const seconds = rest.slice(0, 2);
  const latest = rest.slice(2, 10);
  const recentBreaking = posts.find((p) => p.breaking === true && Date.now() - p.date < 48 * 3600 * 1000);
  const blocks = site.categories
    .map((c) => ({ c, list: posts.filter((p) => p.category === c.slug && p !== lead) }))
    .filter((b) => b.list.length);
  const body = lead
    ? `${recentBreaking ? `<a class="breaking" href="${recentBreaking.url}"><span class="breaking-tag">ब्रेकिङ</span><span>${esc(recentBreaking.title)}</span></a>` : ""}
      <section class="front">
        <h1 class="sr">${esc(site.name)} — ${esc(site.tagline)}</h1>
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
          <h2 id="latest-h" class="section-h">ताजा खबर</h2>
          ${latest.length ? `<ol class="headline-list">${latest.map(headlineItem).join("")}</ol>` : `<p class="muted">थप खबर चाँडै।</p>`}
        </aside>
      </section>
      ${blocks
        .map(
          ({ c, list }) => `<section class="block" style="--c:${c.color}">
        <header class="block-h"><h2><a href="/category/${c.slug}/">${c.name}</a></h2><a class="more" href="/category/${c.slug}/">सबै हेर्नुहोस्</a></header>
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
      "@id": `${site.url}/#website`,
      name: site.name,
      alternateName: "SagarPari",
      url: `${site.url}/`,
      inLanguage: "ne",
      description: site.description,
      publisher: { "@id": `${site.url}/#org` },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${site.url}/search/?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
  ];
  write("index.html", layout({ url: "/", body, active: "home", jsonld: homeLd }));
}

// Search page + index
write(
  "search.json",
  JSON.stringify(posts.map((p) => ({ t: p.title, s: p.summary || "", u: p.url, c: p.cat.name, d: fmtDate(p.date) })))
);
write(
  "search/index.html",
  layout({
    title: "खोज्नुहोस्",
    url: "/search/",
    noindex: true,
    body: `<header class="page-h"><h1>खोज्नुहोस्</h1></header>
    <form class="search-form" role="search" onsubmit="return false">
      <label for="q" class="sr">खबर खोज्नुहोस्</label>
      <input id="q" type="search" placeholder="जस्तै: ग्रीन कार्ड, ट्याक्स, TPS" autocomplete="off">
    </form>
    <p id="search-status" class="muted" aria-live="polite"></p>
    <ul id="results" class="story-grid"></ul>
    <script>
    (function(){
      var q=document.getElementById('q'),out=document.getElementById('results'),st=document.getElementById('search-status'),data=[];
      function e(s){return s.replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
      function run(){var v=q.value.trim().toLowerCase();if(!v){out.innerHTML='';st.textContent='';return}
        var r=data.filter(function(x){return (x.t+' '+x.s+' '+x.c).toLowerCase().indexOf(v)>-1});
        st.textContent=r.length?r.length+' वटा खबर भेटियो':'"'+q.value+'" सँग मिल्ने खबर भेटिएन। अर्को शब्द प्रयोग गर्नुहोस्।';
        out.innerHTML=r.map(function(x){return '<li class="story"><p class="meta"><span class="cat-tag">'+e(x.c)+'</span><span>'+e(x.d)+'</span></p><h3><a href="'+x.u+'">'+e(x.t)+'</a></h3><p class="dek">'+e(x.s)+'</p></li>'}).join('')}
      fetch('/search.json').then(function(r){return r.json()}).then(function(d){data=d;var p=new URLSearchParams(location.search).get('q');if(p){q.value=p}run()});
      q.addEventListener('input',run);q.focus();
    })();
    </script>`,
  })
);

// Category pages
for (const c of site.categories) {
  const list = posts.filter((p) => p.category === c.slug);
  const body = `<header class="page-h"><h1>${c.name}</h1><p class="muted">${esc(c.description || "")}</p></header>
    ${list.length ? `<ul class="story-grid">${list.map((p) => storyItem(p, { thumb: true })).join("")}</ul>` : emptyState}`;
  write(
    `category/${c.slug}/index.html`,
    layout({
      title: `${c.name} समाचार`,
      description: `${c.description} अमेरिकामा बस्ने नेपालीका लागि ${c.name}सम्बन्धी ताजा खबर — सागरपारि।`,
      url: `/category/${c.slug}/`,
      body,
      active: c.slug,
      jsonld: [crumbs([["गृहपृष्ठ", "/"], [c.name, `/category/${c.slug}/`]])],
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
    inLanguage: "ne",
    articleSection: p.cat.name,
    isAccessibleForFree: true,
    mainEntityOfPage: { "@type": "WebPage", "@id": site.url + p.url },
    image: (() => {
      const src = p.image || DEFAULT_IMAGE;
      const d = imgDims(src);
      return [d ? { "@type": "ImageObject", url: absUrl(src), width: d.w, height: d.h } : absUrl(src)];
    })(),
    author: {
      "@type": "Organization",
      name: p.author || "सागरपारि डेस्क",
      url: aboutPage ? site.url + aboutPage.url : `${site.url}/`,
    },
    publisher: { "@type": "NewsMediaOrganization", "@id": `${site.url}/#org`, name: site.name, logo: logoLd },
  };
  const sources = [];
  for (let i = 0; i < 5; i++) {
    const n = p[`source${i || ""}`], u = p[`sourceUrl${i || ""}`];
    if (n) sources.push(u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(n)}</a>` : esc(n));
  }
  const body = `<article class="article">
    <header>
      ${meta(p)}
      <h1>${esc(p.title)}</h1>
      ${p.summary ? `<p class="standfirst">${esc(p.summary)}</p>` : ""}
      <p class="byline">${esc(p.author || "सागरपारि डेस्क")} · ${fmtDateTime(p.date)} · ${neNum(readMins(p))} मिनेट पढाइ${p.updated ? ` · अद्यावधिक: ${fmtDate(new Date(p.updated))}` : ""}</p>
    </header>
    ${p.image ? `<figure class="hero-img">${picture(p.image, p.imageAlt || p.title, ' fetchpriority="high" decoding="async"')}${p.imageCredit ? `<figcaption>${esc(p.imageCredit)}</figcaption>` : ""}</figure>` : ""}
    <div class="prose">${p.html}</div>
    ${sources.length ? `<aside class="sources"><h2>स्रोत</h2><p>${sources.join("<br>")}</p></aside>` : ""}
    <div class="share">
      <span>सेयर गर्नुहोस्:</span>
      <a href="https://www.facebook.com/sharer/sharer.php?u=${shareUrl}" target="_blank" rel="noopener">Facebook</a>
      <a href="https://wa.me/?text=${shareUrl}" target="_blank" rel="noopener">WhatsApp</a>
      <a href="https://x.com/intent/post?url=${shareUrl}" target="_blank" rel="noopener">X</a>
    </div>
  </article>
  ${related.length ? `<section class="related"><h2 class="section-h">${p.cat.name}का अरू खबर</h2><ul class="story-grid">${related.map((p) => storyItem(p, { thumb: true, noDek: true })).join("")}</ul></section>` : ""}
  ${moreNews.length ? `<section class="related"><h2 class="section-h">ताजा खबर</h2><ol class="headline-list">${moreNews.map(headlineItem).join("")}</ol></section>` : ""}`;
  write(
    `news/${p.slug}/index.html`,
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
      jsonld: [jsonld, crumbs([["गृहपृष्ठ", "/"], [p.cat.name, `/category/${p.cat.slug}/`], [p.title, p.url]])],
    })
  );
}

// Static pages
for (const p of pages) {
  const body = `<article class="article"><header><h1>${esc(p.title)}</h1></header><div class="prose">${p.html}</div></article>`;
  write(`${p.slug}/index.html`, layout({ title: p.title, description: p.description, url: p.url, body }));
}

// 404
write(
  "404.html",
  layout({
    title: "पेज भेटिएन",
    url: "/404.html",
    noindex: true,
    body: `<div class="empty"><h1>यो पेज भेटिएन</h1><p>लिंक पुरानो वा गलत हुन सक्छ। <a href="/">गृहपृष्ठमा फर्कनुहोस्</a> र ताजा खबर हेर्नुहोस्।</p></div>`,
  })
);

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
  "feed.xml",
  `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>${esc(site.name)}</title><link>${site.url}/</link><description>${esc(site.description)}</description><language>ne</language>
<atom:link href="${site.url}/feed.xml" rel="self" type="application/rss+xml"/>
<lastBuildDate>${lastBuild}</lastBuildDate>
<image><url>${site.url}/logo.png</url><title>${esc(site.name)}</title><link>${site.url}/</link></image>
${posts
  .slice(0, 50)
  .map(
    (p) =>
      `<item><title>${esc(p.title)}</title><link>${site.url}${p.url}</link><guid isPermaLink="true">${site.url}${p.url}</guid><pubDate>${p.date.toUTCString()}</pubDate><category>${esc(p.cat.name)}</category><description>${esc(p.summary || "")}</description>${enclosure(p)}</item>`
  )
  .join("\n")}
</channel></rss>`
);

// Sitemaps + robots
const iso = (d) => d.toISOString();
const postMod = (p) => (p.updated && !isNaN(new Date(p.updated)) ? new Date(p.updated) : p.date);
const newest = (list) => (list.length ? iso(postMod(list.reduce((a, b) => (postMod(a) > postMod(b) ? a : b)))) : null);
const entries = [
  { u: "/", mod: newest(posts) },
  ...site.categories.map((c) => ({ u: `/category/${c.slug}/`, mod: newest(posts.filter((p) => p.category === c.slug)) })),
  ...posts.map((p) => ({ u: p.url, mod: iso(postMod(p)), img: p.image })),
  ...pages.map((p) => ({ u: p.url, mod: null })),
];
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
const newsPosts = posts.filter((p) => Date.now() - p.date < 2 * 24 * 3600 * 1000).slice(0, 1000);
write(
  "news-sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${newsPosts
  .map(
    (p) =>
      `<url><loc>${site.url}${p.url}</loc><news:news><news:publication><news:name>${esc(site.name)}</news:name><news:language>ne</news:language></news:publication><news:publication_date>${iso(p.date)}</news:publication_date><news:title>${esc(p.title)}</news:title></news:news></url>`
  )
  .join("\n")}
</urlset>`
);
write(
  "robots.txt",
  `User-agent: *\nAllow: /\nDisallow: /search.json\n\nSitemap: ${site.url}/sitemap.xml\nSitemap: ${site.url}/news-sitemap.xml\n`
);

console.log(`Built ${posts.length} articles, ${pages.length} pages → dist/`);
