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
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1" loading="lazy">');
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

function layout({ title, description, url, body, active, ogType = "website", extraHead = "", image }) {
  const fullTitle = title ? `${title} | ${site.name}` : `${site.name} — ${site.tagline}`;
  const canonical = site.url + url;
  const ogImage = image ? (image.startsWith("http") ? image : site.url + image) : "";
  return `<!doctype html>
<html lang="ne">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description || site.description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(title || site.name)}">
<meta property="og:description" content="${esc(description || site.description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="${ogType}">
${ogImage ? `<meta property="og:image" content="${ogImage}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0F3B5F">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="${esc(site.name)}" href="/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Khand:wght@500;600;700&family=Mukta:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
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
const thumb = (p, cls = "") =>
  `<a href="${p.url}" class="thumb ${cls}" tabindex="-1" aria-hidden="true" style="--c:${p.cat.color}">${
    p.image
      ? `<img src="${p.image}" alt="" loading="lazy">`
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
        <article class="lead">
          ${thumb(lead, "lg")}
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
  write("index.html", layout({ url: "/", body, active: "home" }));
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
  write(`category/${c.slug}/index.html`, layout({ title: c.name, description: c.description, url: `/category/${c.slug}/`, body, active: c.slug }));
}

// Articles
for (const p of posts) {
  const related = posts.filter((x) => x.category === p.category && x.slug !== p.slug).slice(0, 4);
  const shareUrl = encodeURIComponent(site.url + p.url);
  const jsonld = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: p.title,
    description: p.summary || "",
    datePublished: p.date.toISOString(),
    dateModified: p.updated ? new Date(p.updated).toISOString() : p.date.toISOString(),
    inLanguage: "ne",
    mainEntityOfPage: site.url + p.url,
    author: { "@type": "Organization", name: p.author || site.name },
    publisher: { "@type": "Organization", name: site.name },
    ...(p.image ? { image: [p.image.startsWith("http") ? p.image : site.url + p.image] } : {}),
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
    ${p.image ? `<figure class="hero-img"><img src="${p.image}" alt="${esc(p.imageAlt || "")}">${p.imageCredit ? `<figcaption>${esc(p.imageCredit)}</figcaption>` : ""}</figure>` : ""}
    <div class="prose">${p.html}</div>
    ${sources.length ? `<aside class="sources"><h2>स्रोत</h2><p>${sources.join("<br>")}</p></aside>` : ""}
    <div class="share">
      <span>सेयर गर्नुहोस्:</span>
      <a href="https://www.facebook.com/sharer/sharer.php?u=${shareUrl}" target="_blank" rel="noopener">Facebook</a>
      <a href="https://wa.me/?text=${shareUrl}" target="_blank" rel="noopener">WhatsApp</a>
      <a href="https://x.com/intent/post?url=${shareUrl}" target="_blank" rel="noopener">X</a>
    </div>
  </article>
  ${related.length ? `<section class="related"><h2 class="section-h">${p.cat.name}का अरू खबर</h2><ul class="story-grid">${related.map((p) => storyItem(p, { thumb: true, noDek: true })).join("")}</ul></section>` : ""}`;
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
      extraHead: `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>`,
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
    body: `<div class="empty"><h1>यो पेज भेटिएन</h1><p>लिंक पुरानो वा गलत हुन सक्छ। <a href="/">गृहपृष्ठमा फर्कनुहोस्</a> र ताजा खबर हेर्नुहोस्।</p></div>`,
  })
);

// RSS
write(
  "feed.xml",
  `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>${esc(site.name)}</title><link>${site.url}/</link><description>${esc(site.description)}</description><language>ne</language>
${posts
  .slice(0, 30)
  .map(
    (p) =>
      `<item><title>${esc(p.title)}</title><link>${site.url}${p.url}</link><guid>${site.url}${p.url}</guid><pubDate>${p.date.toUTCString()}</pubDate><category>${esc(p.cat.name)}</category><description>${esc(p.summary || "")}</description></item>`
  )
  .join("\n")}
</channel></rss>`
);

// Sitemap + robots
const urls = ["/", ...site.categories.map((c) => `/category/${c.slug}/`), ...posts.map((p) => p.url), ...pages.map((p) => p.url)];
write(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `<url><loc>${site.url}${u}</loc></url>`).join("\n")}
</urlset>`
);
write("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${site.url}/sitemap.xml\n`);

console.log(`Built ${posts.length} articles, ${pages.length} pages → dist/`);
