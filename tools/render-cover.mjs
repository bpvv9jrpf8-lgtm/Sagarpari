// Render an SVG illustration to a 1200x675 PNG cover (dev-only helper, not used by build.js).
// Usage: PW=$(node -p "require.resolve('playwright')") node tools/render-cover.mjs in.svg static/images/YYYY-MM-DD-slug.png
import { createRequire } from "module";
import { readFileSync } from "fs";
const { chromium } = createRequire(import.meta.url)(process.env.PW || "playwright");
const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error("usage: render-cover.mjs in.svg out.png"); process.exit(1); }
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 675 } });
await page.setContent(`<html><body style="margin:0">${readFileSync(src, "utf8")}</body></html>`);
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 675 } });
await browser.close();
console.log("wrote", out);
