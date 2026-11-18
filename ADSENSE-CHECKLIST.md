# AdSense तयारी — Checklist

तयार गरिएको: २०२६-१०-३० · Branch: `drafts/adsense-prep` (main मा merge गर्न बाँकी — publish भएको छैन)

## ✅ भइसक्यो (यही branch मा)

- `static/ads.txt` — नयाँ बनाइयो। build.js ले `static/` को फाइल जस्ताको तस्तै `dist/` को root मा copy गर्छ, त्यसैले merge पछि **sagarpari.com/ads.txt** मा live हुन्छ। तर अहिले यो **placeholder** हो — असली Publisher ID हाल्न बाँकी (तल हेर्नुहोस्)।
- `content/pages/privacy.md` — AdSense को अनिवार्य खुलासासहित फेरि लेखियो: तेस्रो-पक्ष (Google) ले विज्ञापनका लागि cookie प्रयोग गर्ने कुरा, व्यक्तिमुखी विज्ञापन के हो, र बन्द गर्ने तरिका (Google Ads Settings र aboutads.info का लिंकसहित), analytics, बालबालिका, नीति परिवर्तन र सम्पर्क।
- `content/pages/about.md` — छ वटै खण्ड (अध्यागमन, रोजगारी, पैसा र कर, समुदाय, नेपाल, चर्चामा) को सूची र लिंक थपियो; बाँकी मूल कुरा जस्ताको तस्तै।
- पहिलेदेखि नै तयार: सम्पर्क पेज (/contact/, इमेल info@sagarpari.com छ), सच्याउने नीति (/corrections/), sitemap.xml, robots.txt, HTTPS।
- साइटमा १४१ वटा original खबर — AdSense review का लागि content पर्याप्त छ।

## 🔲 Kries आफैंले गर्नुपर्ने

1. **AdSense खाता खोल्ने** — adsense.google.com मा गएर आफ्नो Google खाताले sign up गर्ने र site का रूपमा **sagarpari.com** थप्ने।
2. **Site verification code हाल्ने** — AdSense ले दिने code (meta tag वा script) पाएपछि Dash लाई दिने; त्यो site को हरेक पेजको `<head>` मा हाल्नुपर्छ (build.js को layout मा थप्नुपर्ने हुन्छ — Dash ले गरिदिन्छ)।
3. **Publisher ID ads.txt मा हाल्ने** — AdSense स्वीकृत/खाता बनेपछि आफ्नो Publisher ID (`pub-` पछिको १६ अङ्क) `static/ads.txt` को placeholder सँग साट्ने। AdSense भित्र Settings → Account information मा ID भेटिन्छ। Dash लाई ID सुनाइदिए पनि हुन्छ — तर ID कहिल्यै सार्वजनिक chat/forum मा नराख्ने।
4. **Review का लागि submit गर्ने** — माथिका २–३ सकेपछि AdSense dashboard बाट site लाई review मा पठाउने। नतिजा आउन केही दिनदेखि २ हप्तासम्म लाग्न सक्छ।
5. **स्वीकृतिपछि** — विज्ञापन unit/Auto ads चलाउने निर्णय गर्ने। ⚠️ आफ्नै साइटका विज्ञापनमा आफैं click कहिल्यै नगर्ने (खाता नै बन्द हुन सक्छ)।

## 🔁 Merge पछि Dash ले verify गर्ने

- sagarpari.com/ads.txt खुलेको र सही ID देखिएको
- sagarpari.com/privacy/ र /about/ नयाँ रूपमा live भएको
- AdSense dashboard मा ads.txt "Found" देखिएको
