// Run after editing PLACES / EXTRA_COLLECTIONS: node sync-ai-index.cjs
// Read-only stale check: node sync-ai-index.cjs --check
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const file = path.join(__dirname, 'index.html');
const original = fs.readFileSync(file, 'utf8');
const start = original.indexOf('const PLACES = [');
const end = original.indexOf('\n];', start) + 3;
assert(start >= 0 && end > start, 'PLACES not found');
const places = JSON.parse(JSON.stringify(vm.runInNewContext(original.slice(start, end) + '\nPLACES', {}, { timeout:1000 })));
const extraMatch = original.match(/const EXTRA_COLLECTIONS = (\[[\s\S]*?\n\]);/);
assert(extraMatch, 'EXTRA_COLLECTIONS not found');
const products = JSON.parse(extraMatch[1]);
const source = [...places, ...products];
assert.equal(new Set(source.map(p => p.name)).size, source.length, 'Duplicate collection names');
const regions = {
  '那霸':'那霸', '那霸・機場':'那霸', '名護':'北部', '本部':'北部', '今歸仁・本部':'北部', '古宇利島':'北部', '國頭・山原':'北部', '恩納':'北部',
  '讀谷':'中部', '北谷・美國村':'中部', '宇流麻':'中部', '沖繩市':'中部', '北中城・來客夢':'中部', '宜野灣':'中部',
  '浦添':'南部', '西原・宜野灣':'中南部交界', '南風原・那霸東':'南部', '南城':'南部', '豐見城':'南部', '豐見城・糸滿':'南部', '糸滿':'南部', '全區・便利商店':'全區', '全區・藥妝店':'全區'
};
const aliases = {
  '那霸':['那覇','Naha'], '那霸・機場':['那覇空港','那霸機場','Naha Airport','OKA'], '名護':['名戶','Nago'], '本部':['Motobu','美麗海','備瀨','瀨底'],
  '今歸仁・本部':['今帰仁','Nakijin','Motobu'], '古宇利島':['古宇利','Kouri'], '國頭・山原':['国頭','やんばる','Yanbaru','Kunigami'],
  '恩納':['Onna'], '讀谷':['読谷','Yomitan'], '北谷・美國村':['北谷','美國村','アメリカンビレッジ','Chatan','American Village'],
  '宇流麻':['うるま','Uruma','石川','海中道路'], '沖繩市':['沖縄市','胡屋','Koza','Okinawa City'], '北中城・來客夢':['北中城','來客夢','ライカム','Rycom'],
  '宜野灣':['宜野湾','Ginowan'], '浦添':['Urasoe'], '西原・宜野灣':['西原','宜野湾','Nishihara','Ginowan'], '南風原・那霸東':['南風原','Haebaru'],
  '南城':['南城市','Nanjo'], '豐見城':['豊見城','Tomigusuku','瀨長島','瀬長島'], '豐見城・糸滿':['豐見城','豊見城','糸滿','糸満','系滿','豐崎','Tomigusuku','Itoman'],
  '糸滿':['糸満','系滿','Itoman'], '全區・便利商店':['7-11','7-Eleven','セブンイレブン','超商','便利商店'],
  '全區・藥妝店':['藥妝','ドラッグストア','松本清','マツモトキヨシ','唐吉訶德']
};
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl = value => /^https?:\/\//.test(value || '') ? esc(value) : '';
const detailFields = { ingredient_note:'成分', dosage_note:'官方標示用法（非個人用藥建議）', safety_note:'重要用藥注意', price_note:'參考價', purchase_tip:'購買提示', show_to_staff:'給店員看' };
const productDetails = p => Object.entries(detailFields).filter(([key]) => p[key]).map(([key,label]) => `<p><b>${label}：</b>${esc(p[key])}</p>`).join('');
const referenceLinks = p => (p.references || []).map(r => `<a href="${safeUrl(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a>`).join(' · ');
const distance = (a,b) => {
  const rad = x => x * Math.PI / 180;
  const h = Math.sin(rad(b.lat-a.lat)/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lng-a.lng)/2)**2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1,h)));
};
const landmarks = places.filter(p => ['spot','hotel','airport'].includes(p.type));
const entries = source.map(p => {
  assert(regions[p.area] && p.area_basis && Array.isArray(p.tags) && p.tags.length, 'Add area / area_basis / tags: ' + p.name);
  if (p.type !== 'product') assert(Number.isFinite(p.lat) && Number.isFinite(p.lng), 'Missing coordinates: ' + p.name);
  const near = p.type === 'product' ? [] : landmarks.filter(x => x.name !== p.name)
    .map(x => ({name:x.name, distance_km:distance(p,x)})).filter(x => x.distance_km <= 2)
    .sort((a,b) => a.distance_km-b.distance_km).slice(0,3).map(x => ({...x,distance_km:+x.distance_km.toFixed(2)}));
  return {...p, id:'oki-' + createHash('sha256').update(p.type + ':' + p.name).digest('hex').slice(0,12), region:regions[p.area],
    map_url:p.gmap || 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(p.type === 'product' ? (p.category === '藥妝' ? 'ドラッグストア 沖縄' : '7-Eleven 沖縄') : p.name + ' 沖縄'),
    nearby_landmarks:near, coordinate_status:p.type === 'product' ? '未指定分店，無圖釘' : '原手冊概略圖釘，未重新地理查證', verification_status:'未即時查證'};
});
const sourceHash = createHash('sha256').update(JSON.stringify(source)).digest('hex');
const oldMatch = original.match(/<script type="application\/json" id="trip-ai-data">([\s\S]*?)<\/script>/);
const old = oldMatch ? JSON.parse(oldMatch[1]) : null;
const indexedOn = old?.source_sha256 === sourceHash ? old.indexed_on : new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date());
const areaNames = [...new Set(entries.map(p => p.area))].sort((a,b) => a.localeCompare(b,'zh-Hant'));
const areaIndex = areaNames.map(area => ({area,region:regions[area],aliases:aliases[area] || [],count:entries.filter(p => p.area === area).length,entry_ids:entries.filter(p => p.area === area).map(p => p.id)}));
const guide = [
  '這是旅伴已收藏的候選資料，不是即時店家或營業狀態查證。先按area_index選區，再用tags找吃／喝／玩／逛／買；細分地點可比對店名、note、desc及nearby_landmarks。',
  '區域只是搜尋群組，別名是區域檢索提示，不表示該區每筆都在同一商圈或可步行到達；原收藏的跨區／概略位置仍保留。',
  'nearby_landmarks是以原圖釘計算、2公里內最多3個參考點的直線距離，不是道路距離或交通時間。圖釘可能不準，導航用map_url。',
  'indexed_on僅為索引整理日期，不是店家資訊更新／核實日期。價格、營業時間、公休、預約與商品庫存以note/desc原文限制為準；沒有寫的就是未知。',
  '無指定分店商品依分類放在全區・便利商店或全區・藥妝店，不能保證每家門市有賣；來源連結只供補充，回答一般區域問題不用逐一開啟。',
  '需要回答現在是否營業、當日公休、庫存或即時車程時才另外查證。不要把既有候選或舊AI建議當成已確定的每日行程。'
];
const data = {schema_version:1,title:'沖繩旅遊收藏・AI地區索引',indexed_on:indexedOn,source_sha256:sourceHash,place_count:places.length,product_count:products.length,total_count:entries.length,
  usage:guide,area_index:areaIndex,entries};
const json = JSON.stringify(data,null,2).replace(/</g,'\\u003c');
const text = areaIndex.map(group => `<details class="ai-area"><summary>${esc(group.region)}・${esc(group.area)}（${group.count} 筆）</summary>\n<p>區域別名：${esc(group.aliases.join('、'))}；僅供搜尋，非步行圈。</p>\n<ul>\n` + entries.filter(p => p.area === group.area).map(p => {
  const near = p.nearby_landmarks.map(x => `${x.name} ${x.distance_km}km`).join('、');
  const links = [p.site ? `<a href="${safeUrl(p.site)}" target="_blank" rel="noopener">來源／網站</a>` : '', `<a href="${safeUrl(p.map_url)}" target="_blank" rel="noopener">Google 地圖${p.type === 'product' ? '（搜尋門市）' : ''}</a>`, ...(p.blogs || []).map(b => `<a href="${safeUrl(b.u)}" target="_blank" rel="noopener">${esc(b.t)}（${esc(b.s)}）</a>`)].filter(Boolean).join(' · ');
  return `<li data-ai-entry="${p.id}"><h4>${esc(p.name)}</h4><p>標籤：${esc(p.tags.join('／'))}${p.rec ? '；推薦：'+esc(p.rec) : ''}</p><p>${esc(p.note || '')}</p><p>${esc(p.desc || '')}</p>${productDetails(p)}<p>${referenceLinks(p)}</p><p>位置依據：${esc(p.area_basis)}${p.type !== 'product' ? `；概略座標：${p.lat}, ${p.lng}` : ''}${near ? '；附近參考（直線距離）：'+esc(near) : ''}；營業與價格未即時查證。</p><p>${links}</p></li>`;
}).join('\n') + '\n</ul>\n</details>').join('\n');
const section = `<!-- AI-INDEX:START -->
<section id="ai-index">
  <div class="sec-head"><div class="ic">🧭</div><div><h2>AI 地區索引</h2></div><p>${places.length} 個地點＋${products.length} 項商品收藏，依區域與吃／喝／玩／逛／買整理</p></div>
  <p class="pool-hint">把這份 HTML 交給 AI，再說「我們現在在牧志，附近有什麼吃喝逛買？」即可先查內建收藏。索引整理：${esc(indexedOn)}，不代表店家資料已重新查證。</p>
  <div class="pool-bar"><button type="button" class="pchip" id="copy-ai-index">複製 AI 資料</button><button type="button" class="pchip" id="download-ai-index">下載 AI 資料 JSON</button><span id="ai-index-status" role="status" aria-live="polite"></span></div>
  <details class="card ai-index"><summary>AI 地區索引・${entries.length} 筆完整收藏（展開查看）</summary>
    <p>單檔內建靜態文字與JSON，讀取不需要執行JavaScript，也不需要逐一打開來源。區域與圖釘為概略分類；營業時間、公休、價格及庫存未即時查證。</p>
    <ul>${guide.map(x => '<li>'+esc(x)+'</li>').join('')}</ul>
    <!-- AI-INDEX-TEXT:START -->
${text}
    <!-- AI-INDEX-TEXT:END -->
  </details>
</section>
<script type="application/json" id="trip-ai-data">${json}</script>
<!-- AI-INDEX:END -->`;
let html = original;
if (html.includes('<!-- AI-INDEX:START -->')) html = html.replace(/<!-- AI-INDEX:START -->[\s\S]*?<!-- AI-INDEX:END -->/,section);
else {
  const anchor = '<!-- ============ 行李 ============ -->';
  assert.equal(html.split(anchor).length,2);html = html.replace(anchor,section+'\n\n'+anchor);
  html = html.replace('<a href="#pack">行李</a>', '<a href="#ai-index">AI 索引</a>\n      <a href="#pack">行李</a>');
  html = html.replace('</style>', '.ai-index{overflow-wrap:anywhere}.ai-index summary{cursor:pointer;font-weight:700}.ai-area{margin:16px 0}.ai-area>ul{padding-left:1.2em}.ai-area li{border-top:1px solid var(--line);padding:12px 0}.ai-area h4{margin:0}.ai-area p{font-size:.85rem;margin:.4em 0}#ai-index-status{font-size:.82rem;color:var(--ink-soft)}\n</style>');
}
const productImage = p => /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(p.image_data || '') ? `<img src="${p.image_data}" alt="${esc(p.name)} 官方商品包裝圖" loading="lazy" style="display:block;max-width:180px;width:100%;height:220px;object-fit:contain;margin:12px auto">` : '';
const renderProduct = p => `<div class="card" style="border-left:5px solid var(--coral);margin-top:14px">${productImage(p)}<h3 style="margin:0 0 8px;font-size:1.05rem">${p.category === '藥妝' ? '💊' : '🍵'} ${esc(p.name)}</h3><p>${esc(p.note)}</p><p>${esc(p.desc)}</p>${p.category === '藥妝' ? '<details><summary>查看成分、用法、注意事項與購買提示</summary>'+productDetails(p)+'</details>' : productDetails(p)}<p><a href="${safeUrl(p.site)}" target="_blank" rel="noopener">${p.category === '藥妝' ? '官方產品資訊' : 'Threads 來源'}</a> · ${referenceLinks(p)}</p></div>`;
// Drugstore: thumbnail grid; tap opens native <dialog> with the full card.
const renderDrugTile = p => `<div><button type="button" onclick="this.nextElementSibling.showModal()" style="width:100%;height:100%;background:#fff;border:1px solid var(--line);border-radius:12px;padding:8px;cursor:pointer;font:inherit;text-align:center">${p.image_data ? `<img src="${p.image_data}" alt="" loading="lazy" style="display:block;width:100%;height:110px;object-fit:contain">` : '<div style="height:110px;display:grid;place-items:center;font-size:2.4rem">💊</div>'}<span style="display:block;margin-top:6px;font-size:.82rem;font-weight:700;line-height:1.3">${esc(p.name)}</span></button><dialog style="max-width:min(92vw,640px);width:100%;border:none;border-radius:14px;padding:0" onclick="if(event.target===this)this.close()"><form method="dialog" style="position:sticky;top:0;text-align:right;background:#fff;padding:6px 8px 0"><button aria-label="關閉" style="font-size:1.4rem;border:none;background:none;cursor:pointer">✕</button></form><div style="padding:0 16px 16px">${renderProduct(p).replace('<details>','<details open>')}</div></dialog></div>`;
const productHtml = products.filter(p => p.category !== '藥妝').map(renderProduct).join('\n');
assert(html.includes('<!-- EXTRA-COLLECTIONS:START -->'));html = html.replace(/<!-- EXTRA-COLLECTIONS:START -->[\s\S]*?<!-- EXTRA-COLLECTIONS:END -->/,'<!-- EXTRA-COLLECTIONS:START -->\n'+productHtml+'\n<!-- EXTRA-COLLECTIONS:END -->');
const drugstoreHtml = '<!-- DRUGSTORE-PRODUCTS:START -->\n<div id="drugstore-products"><h3>待購買商品・藥妝</h3><p class="pool-hint">依指定商品收藏，未確認門市庫存；藥品須先確認是否適合使用。</p>'+'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-top:12px">'+products.filter(p => p.category === '藥妝').map(renderDrugTile).join('\n')+'</div></div>\n<!-- DRUGSTORE-PRODUCTS:END -->';
if (html.includes('<!-- DRUGSTORE-PRODUCTS:START -->')) html = html.replace(/<!-- DRUGSTORE-PRODUCTS:START -->[\s\S]*?<!-- DRUGSTORE-PRODUCTS:END -->/,drugstoreHtml);
else { const anchor = '<div class="pool" id="poolShop"></div>'; assert.equal(html.split(anchor).length,2); html = html.replace(anchor,anchor+'\n'+drugstoreHtml); }
if (!html.includes('<!-- AI-INDEX-ACTIONS:START -->')) html = html.replace('</body>', `<!-- AI-INDEX-ACTIONS:START -->
<script>
// Independent of the map/CDN: static AI data and export still work if Leaflet is unavailable.
(() => {
  const raw = document.getElementById('trip-ai-data').textContent;
  const status = document.getElementById('ai-index-status');
  document.getElementById('copy-ai-index').addEventListener('click', async () => {
    try {
      try { await navigator.clipboard.writeText(raw); }
      catch (_) {
        const focus = document.activeElement, text = document.createElement('textarea');
        text.value = raw; text.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(text); text.select();
        let copied; try { copied = document.execCommand('copy'); } finally { text.remove(); focus?.focus(); }
        if (!copied) throw new Error('Copy unavailable');
      }
      status.textContent = '已複製完整AI資料，可直接貼給AI。';
    } catch (_) { status.textContent = '無法複製，請改用下載AI資料JSON。'; }
  });
  document.getElementById('download-ai-index').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([raw],{type:'application/json;charset=utf-8'}));
    const a = document.createElement('a'); a.href = url; a.download = 'okinawa-ai-index.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url),1000); status.textContent = '已送出JSON下載，可連同所在區域交給AI。';
  });
})();
</script>
<!-- AI-INDEX-ACTIONS:END -->
</body>`);
if (process.argv.includes('--check')) {
  assert.equal(html,original,'AI index is stale: run node sync-ai-index.cjs');
  console.log(`PASS: AI index is current (${entries.length} entries, ${areaIndex.length} search areas)`);
} else if (html === original) console.log('AI index already current; no files changed');
else { assert.equal(fs.readFileSync(file,'utf8'),original,'HTML changed externally; stop');fs.writeFileSync(file,html);console.log(`Updated ${entries.length} entries in ${areaIndex.length} search areas`); }
