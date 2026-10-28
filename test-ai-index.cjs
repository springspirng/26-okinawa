// Run: node test-ai-index.cjs — no browser, network, or dependencies.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const match = html.match(/<script type="application\/json" id="trip-ai-data">([\s\S]*?)<\/script>/);
assert(match, 'Missing static AI dataset: an AI must read the saved HTML without running JavaScript');
const data = JSON.parse(match[1]);
const start = html.indexOf('const PLACES = [');
const end = html.indexOf('\n];', start) + 3;
const places = JSON.parse(JSON.stringify(vm.runInNewContext(html.slice(start, end) + '\nPLACES')));
const extrasMatch = html.match(/const EXTRA_COLLECTIONS = (\[[\s\S]*?\n\]);/);
const extras = extrasMatch ? JSON.parse(extrasMatch[1]) : [];
const source = [...places, ...extras];
assert.equal(data.entries.length, source.length, 'Every place and non-location product must be indexed');
assert.equal(data.place_count, places.length);
assert.equal(data.product_count, extras.length);
assert.equal(new Set(data.entries.map(p => p.name)).size, data.entries.length);
assert.equal(data.source_sha256, createHash('sha256').update(JSON.stringify(source)).digest('hex'));
for (const p of source) {
  const record = data.entries.find(x => x.name === p.name);
  assert(record, 'Missing entry: ' + p.name);
  for (const [key, value] of Object.entries(p)) assert.deepEqual(record[key], value, p.name + ': ' + key);
  assert(p.area && p.area_basis && Array.isArray(p.tags) && p.tags.length, p.name + ': missing search metadata');
  assert(p.tags.every(t => typeof t === 'string' && t.trim()), p.name + ': invalid tags');
  assert(record.region && Array.isArray(record.nearby_landmarks));
  assert(record.map_url && /^https:\/\/www\.google\.com\/maps(?:\/|\?)/.test(record.map_url), p.name + ': invalid map URL');
  assert(record.verification_status === '未即時查證');
  assert(record.nearby_landmarks.every(x => Number.isFinite(x.distance_km) && x.distance_km <= 2));
}
const get = name => data.entries.find(p => p.name === name);
assert(get('琉球牛乳餅').tags.includes('吃') && get('琉球牛乳餅').tags.includes('喝'));
assert(get("HUU'S COFFEE").tags.includes('喝'));
assert(get('第一牧志公設市場').tags.includes('吃') && get('第一牧志公設市場').tags.includes('逛'));
assert(get('FOREST CAFE By CAVE OKINAWA（冷水變色杯）').tags.includes('買'));
assert(!get('FOREST CAFE By CAVE OKINAWA（冷水變色杯）').tags.includes('喝'), 'A cup sold at a cafe is not a drink recommendation');
assert(get('琉球牛乳餅').nearby_landmarks.some(p => p.name === '第一牧志公設市場'));
const product = data.entries.find(p => p.type === 'product');
assert(product && product.tags.includes('喝') && product.area === '全區・便利商店');
assert(!('lat' in product) && !('lng' in product), 'A chain-store product must not get a made-up pin');
const medicine = data.entries.find(p => p.category === '藥妝' && p.name.includes('酸化マグネシウムE便秘薬'));
assert(medicine, 'Missing requested magnesium-oxide medicine in the AI dataset');
assert.equal(medicine.purchase_status, '待購買');
assert.equal(medicine.area, '全區・藥妝店');
assert(medicine.tags.includes('買') && medicine.tags.includes('藥妝') && !medicine.tags.includes('喝'));
assert(!('lat' in medicine) && !('lng' in medicine));
assert(medicine.map_url.includes(encodeURIComponent('マツモトキヨシ')), 'Medicine must not navigate to 7-Eleven');
assert(medicine.safety_note.includes('腎') && medicine.safety_note.includes('其他瀉藥'));
const shopping = html.match(/<section id="shop">([\s\S]*?)<\/section>/)[1];
const konbini = html.match(/<section id="konbini">([\s\S]*?)<\/section>/)[1];
assert(shopping.includes('酸化マグネシウムE便秘薬') && shopping.includes('待購買商品・藥妝'));
assert(!konbini.includes('酸化マグネシウムE便秘薬'), 'Drugstore products must not leak into convenience-store food');
assert(shopping.includes(medicine.safety_note) && shopping.includes('kenei-pharm.com'));
for (const [name, basis, amount, stop] of [
  ['第一三共 ペラックT錠a 18錠', '每6錠', '750mg', '5～6天'],
  ['大正 パブロン50錠 48錠', '每4錠', '150mg', '5～6次']
]) {
  const p = get(name);
  assert(p && p.category === '藥妝' && p.purchase_status === '待購買' && p.area === '全區・藥妝店', name);
  assert(!('lat' in p) && !('lng' in p));
  assert.equal(source.filter(x => x.name === name).length, 1);
  assert.equal(p.information_checked_on, '2026-10-28');
  assert(p.ingredient_note.includes(basis) && p.ingredient_note.includes(amount) && p.ingredient_note.includes('甘草'));
  assert(p.safety_note.includes('不可自行併用') && p.safety_note.includes('甘草') && (p.safety_note + p.dosage_note).includes(stop));
  assert(p.price_note.includes('官方') && p.price_note.includes('不是沖繩'));
  assert(p.desc.includes('保存') && p.show_to_staff.includes('ありますか'));
  assert(p.references.some(r => r.url.endsWith('.pdf')));
  assert(/^data:image\/jpeg;base64,/.test(p.image_data));
  const image = Buffer.from(p.image_data.split(',')[1], 'base64');
  assert.equal(image.readUInt16BE(0), 0xffd8);
  assert(shopping.includes(p.name) && shopping.includes(p.safety_note) && shopping.includes(p.image_data));
  assert(shopping.includes(p.site) && p.references.every(r => shopping.includes(r.url)));
  assert(!konbini.includes(p.name), 'Medicine must stay in drugstore shopping');
}
assert(get('大正 パブロン50錠 48錠').safety_note.includes('藥劑性過敏症症候群'));
assert(/<section id="ai-index">[\s\S]*?<details[\s\S]*?AI 地區索引/.test(html));
const textBlock = html.match(/<!-- AI-INDEX-TEXT:START -->([\s\S]*?)<!-- AI-INDEX-TEXT:END -->/);
assert(textBlock, 'Missing static plain-text fallback');
assert.equal((textBlock[1].match(/data-ai-entry=/g) || []).length, source.length);
assert(html.includes('id="copy-ai-index"') && html.includes('id="download-ai-index"'));
for (const script of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
  if (!/type="application\/json"/.test(script[1]) && script[2].trim()) new vm.Script(script[2]);
}
console.log(`PASS: ${places.length} places + ${extras.length} products; complete static JSON/text, tags, areas, links and script syntax`);
