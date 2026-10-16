# SagarPari — news site for Nepalis living in the USA

Static site. `node build.js` turns `content/` into `dist/`. No npm dependencies. Hosted on Cloudflare Pages (build command `node build.js`, output `dist`).

## Adding an article

Create `content/news/YYYY-MM-DD-short-english-slug.md`:

```
---
title: नेपालीमा शीर्षक (६०–७० अक्षरभित्र)
date: 2026-10-16T08:00:00-04:00
category: immigration | jobs | money | community | nepal
summary: एक–दुई वाक्यको सारांश (१६० अक्षरभित्र, SEO description पनि यही)
source: USCIS
sourceUrl: https://www.uscis.gov/...
source1: (optional second source)
sourceUrl1: ...
image: (optional, only images we have rights to)
imageAlt: ...
imageCredit: ...
author: सागरपारि डेस्क
draft: false
---

Body in simple Markdown: paragraphs, ## headings, - lists, **bold**, [links](url), > quotes.
```

A future `date` hides the post until that time (rebuild needed). `draft: true` hides it.

## Editorial rules (must follow)

- Write in clear, simple Nepali (Devanagari). Audience: Nepalis in the USA reading on phones.
- Every article must be **original writing** in our own words. Never copy or closely paraphrase another outlet's text. Short quotes only, attributed.
- Every article must cite at least one real, checkable source with a working URL. Verify every fact (names, numbers, dates) against the source before writing.
- Immigration, legal, tax topics: use **official primary sources** only (uscis.gov, state.gov, dhs.gov, irs.gov, federalregister.gov, Nepal embassy, court documents). Add a closing line: "यो कानुनी सल्लाह होइन। आफ्नो केसका लागि मान्यताप्राप्त इमिग्रेसन वकिलसँग सल्लाह लिनुहोस्।"
- No rumours, no unverified social-media claims, no clickbait titles that the article doesn't support.
- Crime/accident stories: don't name private individuals unless officials have publicly named them; no graphic detail.
- Never invent quotes, people, events or statistics. If unsure, leave it out.
- Length: 250–600 words. Lead with what changed and who it affects.
- Don't use images unless we have rights (own photos, official government images that are public domain, or properly licensed).

## Daily automation workflow

A scheduled task drafts 2–4 articles each morning on a new branch `drafts/YYYY-MM-DD`, runs `node build.js` to make sure it builds, and opens a pull request titled `खबर ड्राफ्ट: YYYY-MM-DD`. The owner reviews on GitHub and merges to publish. Never push articles straight to `main`.
