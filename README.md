# सागरपारि (SagarPari)

अमेरिकामा बस्ने नेपालीका लागि खबर — https://sagarpari.com

## Kasari chalcha

- `content/news/` — khabar (Markdown file)
- `content/pages/` — About, Contact, Privacy jasta page
- `site.json` — site ko naam, category
- `static/` — CSS, logo
- `node build.js` — website `dist/` ma banauchha

## Naya khabar publish garne

1. Claude le har bihana naya khabar ko **Pull Request** banauchha
2. GitHub ma PR kholera padhnus
3. Thik bhaye **Merge** thichnus → 1–2 minute ma website ma aauchha
4. Thik nabhaye **Close** garnus

## Cloudflare setting (Workers)

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Setting `wrangler.jsonc` ma chha (website `dist/` folder bata)
