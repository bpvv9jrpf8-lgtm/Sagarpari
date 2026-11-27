# AdSense review readiness — 2026-11-26

**Status reported by owner:** Getting ready / Under review.
**Do not remove the site or resubmit while this review runs.** Google usually checks in days, occasionally 2–4 weeks.

## Critical policy risk: site language
- Nepali is not currently on Google's AdSense supported-language list.
- This repository has substantially more Nepali than English article files.
- **Loading ads only on English URLs does not guarantee approval for a primarily Nepali domain.** Google evaluates the entire site.
- Keep Nepali news for readers, but monetize Nepali pages through clearly labelled direct sponsorship rather than Google-served ads.
- Never hide content from reviewers or switch languages only for the crawler.

## Site-side checklist
- [ ] Confirm AdSense Sites status and any outstanding payments/identity tasks in the account.
- [ ] Check `https://sagarpari.com/ads.txt` publicly returns the authorized AdSense publisher line and the dashboard shows Authorized. Don't assume GitHub file presence means it is live.
- [ ] Confirm the site verification method remains valid (AdSense script, ads.txt, or meta tag).
- [ ] Inspect English edition's original editorial value and attribution: `/en/`.
- [ ] Audit high-risk articles (immigration, legal, taxes, major company allegations) against primary sources; correct or unpublish unsupported claims.
- [ ] Validate About, Contact, Corrections, Privacy and footer links in both languages.
- [ ] Configure Google-certified CMP in AdSense Privacy & messaging before serving personalized ads in EEA/UK/Switzerland as applicable.
- [ ] Validate live security headers and tests before merging hardening PR.
- [ ] Check Search Console indexing, sitemap, robots, mobile performance, and broken links.
- [ ] Document sponsor placements with clear 'Advertisement / Sponsored' labels and editorial separation.

## During review
- Keep the domain live, reachable, and editorially maintained.
- Avoid changing ownership verification, domain structure, or page language to manipulate review.
- Do not publish misleading or unverifiable AI-generated claims.
- Check AdSense Policy center and Sites status; only adjust account settings via the owner.

## After a decision
- **Ready**: enable compliant ad placements on supported-language pages, check consent and ads.txt status.
- **Needs attention**: follow the exact policy reason, resolve the cause and request re-review then.
- **Still Getting ready**: complete any outstanding account tasks and follow Google's review process.

Official references:
- https://support.google.com/adsense/answer/12170222
- https://support.google.com/adsense/answer/81904
- https://support.google.com/adsense/answer/9727
- https://support.google.com/adsense/answer/12131223
- https://support.google.com/adsense/answer/13554116
