'use strict';

const state = {
  items: [],
  selectedId: null,
  previewWidth: 400,
  deduped: false,
};

const $ = (s) => document.querySelector(s);
const fileInput = $('#fileInput');
const chooseBtn = $('#chooseBtn');
const dropZone = $('#dropZone');
const imageList = $('#imageList');
const resultPane = $('#resultPane');
const emptyListHint = $('#emptyListHint');
const emptyState = $('#emptyState');
const previewWidth = $('#previewWidth');
const previewWidthValue = $('#previewWidthValue');
const toastEl = $('#toast');

const UTF8 = new TextDecoder('utf-8', { fatal: false });
const LATIN1 = new TextDecoder('iso-8859-1', { fatal: false });

chooseBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});
fileInput.addEventListener('change', () => addFiles([...fileInput.files]));

for (const evt of ['dragenter', 'dragover']) {
  dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
}
for (const evt of ['dragleave', 'drop']) {
  dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); });
}
dropZone.addEventListener('drop', (e) => addFiles([...e.dataTransfer.files]));

previewWidth.addEventListener('input', () => {
  state.previewWidth = Number(previewWidth.value);
  previewWidthValue.textContent = `${state.previewWidth}px`;
  const img = resultPane.querySelector('.preview-wrap img');
  if (img) img.style.width = `${state.previewWidth}px`;
});

$('#resetBtn').addEventListener('click', resetAll);
$('#dedupeBtn').addEventListener('click', () => {
  state.deduped = !state.deduped;
  $('#dedupeBtn').textContent = state.deduped ? '원본 보기' : '중복 제거';
  renderSelected();
});
$('#copyAllBtn').addEventListener('click', copyAllCurrent);

$('#themeBtn').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'light' : 'dark';
  $('#themeBtn').textContent = dark ? '다크 모드' : '라이트 모드';
  localStorage.setItem('nai-meta-theme', dark ? 'light' : 'dark');
});

(() => {
  const saved = localStorage.getItem('nai-meta-theme');
  const dark = saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('#themeBtn').textContent = dark ? '라이트 모드' : '다크 모드';
})();

async function addFiles(files) {
  const accepted = files.filter(f => /\.(png|webp|jpe?g)$/i.test(f.name) || /^image\/(png|webp|jpeg)$/.test(f.type));
  if (!accepted.length) return toast('지원되는 이미지가 없습니다.');

  for (const file of accepted) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const url = URL.createObjectURL(file);
    const item = { id, file, url, status: 'loading', parsed: null, error: null };
    state.items.push(item);
    if (!state.selectedId) state.selectedId = id;
    renderList();
    renderSelected();
    try {
      item.parsed = await analyzeFile(file, url);
      item.status = 'done';
    } catch (err) {
      console.error(err);
      item.error = err instanceof Error ? err.message : String(err);
      item.status = 'error';
    }
    renderList();
    if (state.selectedId === id) renderSelected();
  }
  fileInput.value = '';
}

function resetAll() {
  for (const item of state.items) URL.revokeObjectURL(item.url);
  state.items = [];
  state.selectedId = null;
  state.deduped = false;
  $('#dedupeBtn').textContent = '중복 제거';
  renderList();
  renderSelected();
}

function renderList() {
  imageList.innerHTML = '';
  $('#imageCount').textContent = state.items.length ? `${state.items.length}장` : '';
  $('#sidebarImageCount').textContent = state.items.length;
  emptyListHint.hidden = state.items.length > 0;
  for (const item of state.items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `image-item${item.id === state.selectedId ? ' active' : ''}`;
    const status = item.status === 'loading' ? '분석 중…' : item.status === 'error' ? '분석 실패' : detectionSummary(item.parsed);
    btn.innerHTML = `<img alt="" src="${item.url}"><span><strong></strong><small></small></span>`;
    btn.querySelector('strong').textContent = item.file.name;
    btn.querySelector('small').textContent = status;
    btn.addEventListener('click', () => { state.selectedId = item.id; renderList(); renderSelected(); });
    imageList.appendChild(btn);
  }
}

function renderSelected() {
  resultPane.innerHTML = '';
  const item = state.items.find(x => x.id === state.selectedId);
  const hasItem = Boolean(item);
  resultPane.hidden = !hasItem;
  emptyState.hidden = hasItem;
  if (!item) return renderList();

  const preview = document.createElement('section');
  preview.className = 'preview-card panel';
  const badges = item.parsed ? item.parsed.sources.map(x => `<span class="badge">${escapeHtml(x)}</span>`).join('') : '';
  const metaSummary = item.parsed ? summaryRows(item) : [];
  preview.innerHTML = `
    <div class="preview-top">
      <div><h2></h2><p>${formatBytes(item.file.size)} · ${escapeHtml(item.file.type || 'image')}</p></div>
      <div class="badges">${badges}</div>
    </div>
    <div class="preview-grid">
      <div class="preview-wrap"><img alt="미리보기" src="${item.url}" style="width:${state.previewWidth}px"></div>
      <aside class="info-box">
        <h3>빠른 정보</h3>
        <dl class="info-list">${metaSummary.map(([k,v]) => `<div class="info-row"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v))}</dd></div>`).join('')}</dl>
      </aside>
    </div>`;
  preview.querySelector('h2').textContent = item.file.name;
  resultPane.appendChild(preview);

  if (item.status === 'loading') return appendField(resultPane, '분석 상태', '메타데이터를 분석 중입니다…');
  if (item.status === 'error') {
    const e = document.createElement('section');
    e.className = 'error-card panel';
    e.textContent = `분석 실패: ${item.error}`;
    resultPane.appendChild(e);
    return;
  }

  const d = displayData(item.parsed, state.deduped);
  const promptGrid = document.createElement('section');
  promptGrid.className = 'fields-grid';
  const metaGrid = document.createElement('section');
  metaGrid.className = 'meta-grid';

  appendField(promptGrid, '긍정 프롬프트', d.positive);
  appendField(promptGrid, '캐릭터 긍정 프롬프트', d.charPositive);
  appendField(promptGrid, '부정 프롬프트', d.negative);
  appendField(promptGrid, '캐릭터 부정 프롬프트', d.charNegative);
  appendField(metaGrid, 'NAI 모델 및 설정', d.settings);
  appendField(metaGrid, 'Stealth PNG 메타데이터', d.stealth);
  appendField(metaGrid, '파일 메타데이터 (Raw)', d.raw);

  resultPane.appendChild(promptGrid);
  resultPane.appendChild(metaGrid);
}

function appendField(parent, title, value) {
  const node = $('#fieldTemplate').content.firstElementChild.cloneNode(true);
  node.querySelector('h3').textContent = title;
  const pre = node.querySelector('.field-value');
  const text = value && String(value).trim() ? String(value) : '정보를 찾을 수 없습니다.';
  pre.textContent = text;
  if (!value || !String(value).trim()) pre.classList.add('empty-value');
  node.querySelector('.copy-btn').addEventListener('click', () => copyText(value || ''));
  parent.appendChild(node);
}

function summaryRows(item) {
  if (!item.parsed) return [['상태', item.status === 'loading' ? '분석 중' : '대기 중']];
  const parsed = item.parsed;
  const settings = extractSettingsMap(parsed.settingsText);
  return [
    ['감지 방식', detectionSummary(parsed)],
    ['모델', settings['Model / Source'] || '-'],
    ['Sampler', settings['Sampler'] || '-'],
    ['Steps', settings['Steps'] || '-'],
    ['CFG', settings['CFG / Scale'] || '-'],
    ['Seed', settings['Seed'] || '-'],
  ];
}

function extractSettingsMap(text) {
  const out = {};
  if (!text) return out;
  for (const line of String(text).split(/\n+/)) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

function displayData(parsed, dedupe) {
  const positive = dedupe ? dedupePrompt(parsed.positive) : parsed.positive;
  const negative = dedupe ? dedupePrompt(parsed.negative) : parsed.negative;
  const charPositive = parsed.charPositive.map((x, i) => {
    const prompt = dedupe ? dedupePrompt(x.prompt) : x.prompt;
    return formatCharacter(i, prompt, x.centers);
  }).join('\n\n');
  const charNegative = parsed.charNegative.map((x, i) => {
    const prompt = dedupe ? dedupePrompt(x.prompt) : x.prompt;
    return formatCharacter(i, prompt, x.centers);
  }).join('\n\n');
  return {
    positive,
    negative,
    charPositive,
    charNegative,
    settings: parsed.settingsText,
    stealth: parsed.stealthText,
    raw: parsed.rawText,
  };
}

function formatCharacter(i, prompt, centers) {
  const pos = Array.isArray(centers) && centers.length
    ? ` @ ${centers.map(p => `(${fmtNum(p.x)}, ${fmtNum(p.y)})`).join(', ')}`
    : '';
  return `#${i + 1}${pos}\n${prompt || ''}`.trim();
}

function fmtNum(n) { return Number.isFinite(Number(n)) ? Number(n).toFixed(3).replace(/0+$/, '').replace(/\.$/, '') : '?'; }

async function copyAllCurrent() {
  const item = state.items.find(x => x.id === state.selectedId);
  if (!item?.parsed) return toast('복사할 정보가 없습니다.');
  const d = displayData(item.parsed, state.deduped);
  const blocks = [
    ['긍정 프롬프트', d.positive],
    ['캐릭터 긍정 프롬프트', d.charPositive],
    ['부정 프롬프트', d.negative],
    ['캐릭터 부정 프롬프트', d.charNegative],
    ['NAI 모델 및 설정', d.settings],
    ['Stealth PNG 메타데이터', d.stealth],
  ].filter(([, v]) => v && String(v).trim()).map(([k, v]) => `[${k}]\n${v}`);
  await copyText(blocks.join('\n\n'));
}

async function copyText(text) {
  if (!text) return toast('복사할 정보가 없습니다.');
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  toast('복사했습니다.');
}

let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1300);
}

async function analyzeFile(file, url) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffType(bytes, file.type);
  const fileMeta = {};
  const fileSources = [];

  if (type === 'png') {
    Object.assign(fileMeta, await parsePngChunks(bytes));
    if (Object.keys(fileMeta).length) fileSources.push('PNG chunks');
  } else if (type === 'webp') {
    const exif = parseWebPExif(bytes);
    Object.assign(fileMeta, exif);
    if (Object.keys(exif).length) fileSources.push('WebP EXIF');
  } else if (type === 'jpeg') {
    const exif = parseJpegExif(bytes);
    Object.assign(fileMeta, exif);
    if (Object.keys(exif).length) fileSources.push('JPEG EXIF');
  }

  let stealth = [];
  try {
    stealth = await extractStealthCandidates(url);
  } catch (e) {
    console.warn('stealth extraction failed', e);
  }

  const sources = [...fileSources, ...stealth.map(s => s.signature)];
  const candidates = [];
  if (Object.keys(fileMeta).length) candidates.push({ origin: 'file', data: fileMeta, raw: fileMeta });
  for (const s of stealth) candidates.push({ origin: s.signature, data: parsePossiblyJson(s.text), raw: s.text });

  const normalized = candidates.map(normalizeCandidate);
  const best = chooseBest(normalized);
  const combined = mergeNormalized(normalized);

  const rawObj = Object.keys(fileMeta).length ? fileMeta : null;
  const rawText = rawObj ? pretty(rawObj) : '';
  const stealthText = stealth.length
    ? stealth.map(s => `[${s.signature}]\n${prettyMaybe(s.text)}`).join('\n\n')
    : '';

  return {
    sources: sources.length ? [...new Set(sources)] : ['메타데이터 없음'],
    positive: combined.positive || best?.positive || '',
    negative: combined.negative || best?.negative || '',
    charPositive: combined.charPositive.length ? combined.charPositive : (best?.charPositive || []),
    charNegative: combined.charNegative.length ? combined.charNegative : (best?.charNegative || []),
    settingsText: buildSettings(normalized, fileMeta),
    stealthText,
    rawText,
  };
}

function sniffType(b, mime='') {
  if (b.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v)) return 'png';
  if (b.length >= 12 && ascii(b,0,4)==='RIFF' && ascii(b,8,4)==='WEBP') return 'webp';
  if (b.length >= 2 && b[0]===0xff && b[1]===0xd8) return 'jpeg';
  if (/png/i.test(mime)) return 'png';
  if (/webp/i.test(mime)) return 'webp';
  if (/jpe?g/i.test(mime)) return 'jpeg';
  return 'unknown';
}

async function parsePngChunks(bytes) {
  const out = {};
  if (bytes.length < 8) return out;
  let off = 8;
  while (off + 12 <= bytes.length) {
    const len = readU32BE(bytes, off); off += 4;
    const type = ascii(bytes, off, 4); off += 4;
    if (len > bytes.length - off - 4) break;
    const data = bytes.subarray(off, off + len); off += len + 4; // skip CRC
    try {
      if (type === 'tEXt') {
        const z = data.indexOf(0);
        if (z > -1) out[LATIN1.decode(data.subarray(0,z))] = LATIN1.decode(data.subarray(z+1));
      } else if (type === 'zTXt') {
        const z = data.indexOf(0);
        if (z > -1 && z + 2 <= data.length) {
          const key = LATIN1.decode(data.subarray(0,z));
          const text = UTF8.decode(await decompress(data.subarray(z+2), 'deflate'));
          out[key] = text;
        }
      } else if (type === 'iTXt') {
        const parsed = await parseITXt(data);
        if (parsed) out[parsed.key] = parsed.text;
      } else if (type === 'eXIf') {
        Object.assign(out, parseTiff(data));
      }
    } catch (e) { console.warn('chunk parse failed', type, e); }
    if (type === 'IEND') break;
  }
  return out;
}

async function parseITXt(data) {
  let p = 0;
  const z1 = indexOfZero(data, p); if (z1 < 0) return null;
  const key = UTF8.decode(data.subarray(p, z1)); p = z1 + 1;
  if (p + 2 > data.length) return null;
  const flag = data[p++]; p++; // method
  const z2 = indexOfZero(data, p); if (z2 < 0) return null; p = z2 + 1; // language
  const z3 = indexOfZero(data, p); if (z3 < 0) return null; p = z3 + 1; // translated keyword
  const payload = data.subarray(p);
  const textBytes = flag === 1 ? await decompress(payload, 'deflate') : payload;
  return { key, text: UTF8.decode(textBytes) };
}

async function decompress(bytes, format) {
  if (typeof DecompressionStream === 'undefined') throw new Error('이 브라우저는 압축 메타데이터 해제를 지원하지 않습니다.');
  const ds = new DecompressionStream(format);
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function extractStealthCandidates(url) {
  const img = await loadImage(url);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const found = [];
  for (const mode of ['alpha', 'rgb']) {
    const one = await readStealth(pixels, canvas.width, canvas.height, mode);
    if (one) found.push(one);
  }
  return found;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지 디코딩 실패'));
    img.src = url;
  });
}

async function readStealth(data, width, height, mode) {
  const bitsPerPixel = mode === 'alpha' ? 1 : 3;
  const capacity = width * height * bitsPerPixel;
  const sigBits = 15 * 8;
  if (capacity < sigBits + 32) return null;

  const signature = readBitBytes(data, width, height, mode, 0, 15);
  const sig = UTF8.decode(signature);
  const valid = mode === 'alpha'
    ? new Set(['stealth_pnginfo', 'stealth_pngcomp'])
    : new Set(['stealth_rgbinfo', 'stealth_rgbcomp']);
  if (!valid.has(sig)) return null;

  const lenStart = sigBits;
  const bitLength = readBitsAsU32(data, width, height, mode, lenStart);
  if (!Number.isFinite(bitLength) || bitLength < 0) return null;
  if (bitLength > capacity - lenStart - 32) return null;
  if (bitLength > 64 * 1024 * 1024 * 8) return null;

  const byteLen = Math.floor(bitLength / 8);
  let payload = readBitBytes(data, width, height, mode, lenStart + 32, byteLen);
  if (sig.endsWith('comp')) payload = await decompress(payload, 'gzip');
  return { signature: sig, text: UTF8.decode(payload) };
}

function bitAt(data, width, height, mode, bitIndex) {
  if (mode === 'alpha') {
    const pixel = bitIndex;
    const x = Math.floor(pixel / height);
    const y = pixel % height;
    if (x >= width) return 0;
    return data[(y * width + x) * 4 + 3] & 1;
  }
  const pixel = Math.floor(bitIndex / 3);
  const ch = bitIndex % 3;
  const x = Math.floor(pixel / height);
  const y = pixel % height;
  if (x >= width) return 0;
  return data[(y * width + x) * 4 + ch] & 1;
}

function readBitBytes(data, width, height, mode, startBit, byteLen) {
  const out = new Uint8Array(byteLen);
  for (let i = 0; i < byteLen; i++) {
    let v = 0;
    for (let b = 0; b < 8; b++) v = (v << 1) | bitAt(data, width, height, mode, startBit + i*8 + b);
    out[i] = v;
  }
  return out;
}

function readBitsAsU32(data, width, height, mode, startBit) {
  let v = 0;
  for (let i=0;i<32;i++) v = (v * 2) + bitAt(data,width,height,mode,startBit+i);
  return v >>> 0;
}

function parseWebPExif(bytes) {
  const out = {};
  if (bytes.length < 12 || ascii(bytes,0,4)!=='RIFF' || ascii(bytes,8,4)!=='WEBP') return out;
  let p = 12;
  while (p + 8 <= bytes.length) {
    const type = ascii(bytes,p,4); const len = readU32LE(bytes,p+4); p += 8;
    if (p + len > bytes.length) break;
    if (type === 'EXIF') Object.assign(out, parseExifPayload(bytes.subarray(p,p+len)));
    p += len + (len & 1);
  }
  return out;
}

function parseJpegExif(bytes) {
  const out = {};
  let p = 2;
  while (p + 4 <= bytes.length && bytes[p] === 0xff) {
    const marker = bytes[p+1]; p += 2;
    if (marker === 0xd9 || marker === 0xda) break;
    if (p + 2 > bytes.length) break;
    const len = (bytes[p] << 8) | bytes[p+1];
    if (len < 2 || p + len > bytes.length) break;
    const seg = bytes.subarray(p+2, p+len);
    if (marker === 0xe1 && ascii(seg,0,6) === 'Exif\0\0') Object.assign(out, parseTiff(seg.subarray(6)));
    p += len;
  }
  return out;
}

function parseExifPayload(data) {
  if (ascii(data,0,6) === 'Exif\0\0') return parseTiff(data.subarray(6));
  return parseTiff(data);
}

function parseTiff(data) {
  const out = {};
  if (data.length < 8) return out;
  const endian = ascii(data,0,2);
  const le = endian === 'II';
  if (!le && endian !== 'MM') return out;
  const u16 = (o) => le ? data[o] | (data[o+1]<<8) : (data[o]<<8) | data[o+1];
  const u32 = (o) => le
    ? (data[o] + data[o+1]*256 + data[o+2]*65536 + data[o+3]*16777216) >>> 0
    : (data[o]*16777216 + data[o+1]*65536 + data[o+2]*256 + data[o+3]) >>> 0;
  if (u16(2) !== 42) return out;
  const ifd0 = u32(4);
  let exifPtr = null;

  const parseIfd = (offset, isExif=false) => {
    if (offset + 2 > data.length) return;
    const count = u16(offset);
    for (let i=0;i<count;i++) {
      const e = offset + 2 + i*12;
      if (e + 12 > data.length) break;
      const tag = u16(e), type = u16(e+2), n = u32(e+4);
      const sizePer = ({1:1,2:1,3:2,4:4,7:1})[type] || 1;
      const total = n * sizePer;
      const valueOff = total <= 4 ? e+8 : u32(e+8);
      if (valueOff + total > data.length) continue;
      const raw = data.subarray(valueOff, valueOff + total);
      if (!isExif && tag === 0x8769) { exifPtr = u32(e+8); continue; }
      const map = {0x010d:'DocumentName',0x010e:'Description',0x0131:'Software',0x013b:'Artist',0x8298:'Copyright'};
      if (map[tag]) out[map[tag]] = decodeExifText(raw, type);
      if (isExif && tag === 0x9286) out.Comment = decodeUserComment(raw);
    }
  };
  parseIfd(ifd0, false);
  if (exifPtr != null) parseIfd(exifPtr, true);
  return out;
}

function decodeExifText(raw, type) {
  if (type === 2) return LATIN1.decode(trimZero(raw));
  return UTF8.decode(trimZero(raw));
}
function decodeUserComment(raw) {
  if (raw.length >= 8) {
    const prefix = ascii(raw,0,8);
    const body = trimZero(raw.subarray(8));
    if (prefix.startsWith('ASCII')) return LATIN1.decode(body);
    if (prefix.startsWith('UNICODE')) {
      try { return new TextDecoder('utf-16be').decode(body); } catch { return UTF8.decode(body); }
    }
  }
  return UTF8.decode(trimZero(raw));
}

function normalizeCandidate(c) {
  const root = c.data && typeof c.data === 'object' ? c.data : {};
  const commentRaw = firstDefined(root.Comment, root.comment, root.parameters);
  let comment = parsePossiblyJson(commentRaw);
  if (comment && typeof comment === 'object' && typeof comment.Comment === 'string') {
    const nested = parsePossiblyJson(comment.Comment);
    if (nested && typeof nested === 'object') comment = { ...comment, ...nested };
  }
  const obj = comment && typeof comment === 'object' ? comment : {};

  const v4p = obj?.v4_prompt?.caption || root?.v4_prompt?.caption || {};
  const v4n = obj?.v4_negative_prompt?.caption || root?.v4_negative_prompt?.caption || {};
  const positive = firstString(v4p.base_caption, root.Description, root.description, obj.prompt, obj.input, root.prompt);
  const negative = firstString(v4n.base_caption, obj.negative_prompt, obj.uc, root.negative_prompt, root.uc);
  const charPositive = normalizeChars(v4p.char_captions || obj.char_captions || []);
  const charNegative = normalizeChars(v4n.char_captions || obj.negative_char_captions || []);

  return { origin:c.origin, root, obj, positive, negative, charPositive, charNegative, score: scoreCandidate({positive,negative,charPositive,charNegative,obj,root}) };
}

function normalizeChars(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(x => ({ prompt: firstString(x?.char_caption, x?.prompt, x?.caption), centers: Array.isArray(x?.centers) ? x.centers : [] })).filter(x => x.prompt);
}

function scoreCandidate(x) {
  let s = 0;
  if (x.positive) s += 5;
  if (x.negative) s += 4;
  s += x.charPositive.length * 3 + x.charNegative.length * 3;
  if (Object.keys(x.obj || {}).length) s += 1;
  return s;
}
function chooseBest(xs) { return [...xs].sort((a,b)=>b.score-a.score)[0] || null; }
function mergeNormalized(xs) {
  const ordered = [...xs].sort((a,b)=>b.score-a.score);
  const out = { positive:'', negative:'', charPositive:[], charNegative:[] };
  for (const x of ordered) {
    if (!out.positive && x.positive) out.positive = x.positive;
    if (!out.negative && x.negative) out.negative = x.negative;
    if (!out.charPositive.length && x.charPositive.length) out.charPositive = x.charPositive;
    if (!out.charNegative.length && x.charNegative.length) out.charNegative = x.charNegative;
  }
  return out;
}

function buildSettings(xs, fileMeta) {
  const best = chooseBest(xs);
  const obj = best?.obj || {};
  const root = best?.root || fileMeta || {};
  const pairs = [];
  const push = (label, ...vals) => { const v = firstDefined(...vals); if (v !== undefined && v !== null && v !== '') pairs.push([label, v]); };
  push('Model / Source', root.Source, root.source, obj.model, obj.source);
  push('Software', root.Software, root.software);
  push('Generation time', root['Generation time'], root.generation_time);
  push('Sampler', obj.sampler);
  push('Noise schedule', obj.noise_schedule);
  push('Steps', obj.steps);
  push('CFG / Scale', obj.scale, obj.cfg_scale);
  push('CFG rescale', obj.cfg_rescale);
  push('Seed', obj.seed);
  push('Width', obj.width);
  push('Height', obj.height);
  push('Params version', obj.params_version);
  push('UC preset', obj.ucPreset, obj.uc_preset);
  push('Quality toggle', obj.qualityToggle, obj.quality_toggle);
  push('SMEA', obj.sm);
  push('SMEA dynamic', obj.sm_dyn);
  push('Dynamic thresholding', obj.dynamic_thresholding);
  push('Variety / skip CFG above sigma', obj.skip_cfg_above_sigma);
  push('Use coords', obj.use_coords, obj?.v4_prompt?.use_coords);
  push('Use order', obj?.v4_prompt?.use_order);
  push('Signed hash', obj.signed_hash);
  if (!pairs.length) return '';
  return pairs.map(([k,v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n');
}

function parsePossiblyJson(v) {
  if (v == null) return {};
  if (typeof v === 'object') return v;
  if (typeof v !== 'string') return v;
  let cur = v.trim();
  for (let i=0;i<3;i++) {
    if (!(cur.startsWith('{') || cur.startsWith('[') || (cur.startsWith('"') && cur.endsWith('"')))) break;
    try {
      const next = JSON.parse(cur);
      if (typeof next === 'string') cur = next.trim(); else return next;
    } catch { break; }
  }
  return v;
}

function dedupePrompt(text) {
  if (!text || typeof text !== 'string') return text || '';
  const parts = splitTopLevelCommas(text);
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const cleaned = p.trim().replace(/\s+/g, ' ');
    if (!cleaned) continue;
    const key = cleaned.toLocaleLowerCase();
    if (!seen.has(key)) { seen.add(key); out.push(cleaned); }
  }
  return out.join(', ');
}

function splitTopLevelCommas(text) {
  const out=[]; let cur=''; let quote=null; let esc=false; let depth=0;
  const opens = new Set(['{','[','(']);
  const closes = new Set(['}',']',')']);
  for (const ch of text) {
    if (esc) { cur+=ch; esc=false; continue; }
    if (ch==='\\') { cur+=ch; esc=true; continue; }
    if (quote) { cur+=ch; if (ch===quote) quote=null; continue; }
    if (ch==='"' || ch==="'") { quote=ch; cur+=ch; continue; }
    if (opens.has(ch)) { depth++; cur+=ch; continue; }
    if (closes.has(ch)) { depth=Math.max(0,depth-1); cur+=ch; continue; }
    if (ch===',' && depth===0) { out.push(cur); cur=''; continue; }
    cur+=ch;
  }
  out.push(cur); return out;
}

function detectionSummary(p) {
  if (!p) return '';
  if (p.sources.includes('메타데이터 없음')) return '메타데이터 없음';
  return p.sources.join(' + ');
}
function prettyMaybe(s) { const p = parsePossiblyJson(s); return typeof p === 'object' ? pretty(p) : String(s); }
function pretty(v) { try { return JSON.stringify(v, null, 2); } catch { return String(v); } }
function firstDefined(...xs) { return xs.find(x => x !== undefined && x !== null && x !== ''); }
function firstString(...xs) { const v = xs.find(x => typeof x === 'string' && x.trim()); return v ? v.trim() : ''; }
function readU32BE(b,o) { return (b[o]*16777216 + b[o+1]*65536 + b[o+2]*256 + b[o+3]) >>> 0; }
function readU32LE(b,o) { return (b[o] + b[o+1]*256 + b[o+2]*65536 + b[o+3]*16777216) >>> 0; }
function ascii(b,o,n) { let s=''; for (let i=0;i<n && o+i<b.length;i++) s += String.fromCharCode(b[o+i]); return s; }
function indexOfZero(b,start) { for (let i=start;i<b.length;i++) if (b[i]===0) return i; return -1; }
function trimZero(b) { let e=b.length; while (e>0 && b[e-1]===0) e--; return b.subarray(0,e); }
function formatBytes(n) { const u=['B','KB','MB','GB']; let i=0,v=n; while(v>=1024&&i<u.length-1){v/=1024;i++;} return `${v.toFixed(i?1:0)} ${u[i]}`; }
function escapeHtml(s) { return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }


/* ---------- Profile photo cropper ---------- */
const profilePhotoBtn = $('#profilePhotoBtn');
const profilePhotoInput = $('#profilePhotoInput');
const profilePhotoImage = $('#profilePhotoImage');
const profilePhotoPlaceholder = $('#profilePhotoPlaceholder');
const photoCropModal = $('#photoCropModal');
const cropCanvas = $('#cropCanvas');
const cropCtx = cropCanvas?.getContext('2d');
const cropZoom = $('#cropZoom');
const cropCloseBtn = $('#cropCloseBtn');
const cropCancelBtn = $('#cropCancelBtn');
const cropSaveBtn = $('#cropSaveBtn');

const cropState = {
  img: null,
  baseScale: 1,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  dragging: false,
  lastX: 0,
  lastY: 0,
};

function loadSavedProfilePhoto() {
  const saved = localStorage.getItem('yammo-meta-profile-photo');
  if (!saved || !profilePhotoImage) return;
  profilePhotoImage.src = saved;
  profilePhotoImage.hidden = false;
  if (profilePhotoPlaceholder) profilePhotoPlaceholder.hidden = true;
}

profilePhotoBtn?.addEventListener('click', () => profilePhotoInput?.click());

profilePhotoInput?.addEventListener('change', () => {
  const file = profilePhotoInput.files?.[0];
  if (!file) return;
  if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
    toast('PNG / JPG / WebP 이미지만 사용할 수 있습니다.');
    profilePhotoInput.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => openCropper(img);
    img.onerror = () => toast('이미지를 불러오지 못했습니다.');
    img.src = String(reader.result);
  };
  reader.readAsDataURL(file);
  profilePhotoInput.value = '';
});

function openCropper(img) {
  if (!cropCanvas || !cropCtx || !photoCropModal) return;
  cropState.img = img;
  cropState.zoom = 1;
  cropState.offsetX = 0;
  cropState.offsetY = 0;
  cropState.dragging = false;
  cropZoom.value = '1';
  const cw = cropCanvas.width;
  const ch = cropCanvas.height;
  cropState.baseScale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
  photoCropModal.hidden = false;
  document.body.style.overflow = 'hidden';
  drawCrop();
}

function closeCropper() {
  if (!photoCropModal) return;
  photoCropModal.hidden = true;
  document.body.style.overflow = '';
  cropState.dragging = false;
}

function drawCrop() {
  if (!cropCtx || !cropCanvas || !cropState.img) return;
  const img = cropState.img;
  const scale = cropState.baseScale * cropState.zoom;
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const x = (cropCanvas.width - dw) / 2 + cropState.offsetX;
  const y = (cropCanvas.height - dh) / 2 + cropState.offsetY;

  cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
  cropCtx.fillStyle = '#e9e9e7';
  cropCtx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
  cropCtx.drawImage(img, x, y, dw, dh);

  cropCtx.save();
  cropCtx.strokeStyle = 'rgba(255,255,255,.88)';
  cropCtx.lineWidth = 2;
  cropCtx.strokeRect(1, 1, cropCanvas.width - 2, cropCanvas.height - 2);
  cropCtx.restore();
}

cropZoom?.addEventListener('input', () => {
  cropState.zoom = Number(cropZoom.value);
  drawCrop();
});

cropCanvas?.addEventListener('pointerdown', (e) => {
  if (!cropState.img) return;
  cropState.dragging = true;
  cropState.lastX = e.clientX;
  cropState.lastY = e.clientY;
  cropCanvas.classList.add('dragging');
  cropCanvas.setPointerCapture?.(e.pointerId);
});

cropCanvas?.addEventListener('pointermove', (e) => {
  if (!cropState.dragging) return;
  const rect = cropCanvas.getBoundingClientRect();
  const sx = cropCanvas.width / rect.width;
  const sy = cropCanvas.height / rect.height;
  cropState.offsetX += (e.clientX - cropState.lastX) * sx;
  cropState.offsetY += (e.clientY - cropState.lastY) * sy;
  cropState.lastX = e.clientX;
  cropState.lastY = e.clientY;
  drawCrop();
});

function stopCropDrag(e) {
  cropState.dragging = false;
  cropCanvas?.classList.remove('dragging');
  if (e?.pointerId != null) cropCanvas?.releasePointerCapture?.(e.pointerId);
}
cropCanvas?.addEventListener('pointerup', stopCropDrag);
cropCanvas?.addEventListener('pointercancel', stopCropDrag);

cropCloseBtn?.addEventListener('click', closeCropper);
cropCancelBtn?.addEventListener('click', closeCropper);
photoCropModal?.querySelector('[data-close-crop]')?.addEventListener('click', closeCropper);

cropSaveBtn?.addEventListener('click', () => {
  if (!cropCanvas || !profilePhotoImage) return;
  const out = document.createElement('canvas');
  out.width = 256;
  out.height = 256;
  const outCtx = out.getContext('2d');
  outCtx.drawImage(cropCanvas, 0, 0, 256, 256);
  const dataUrl = out.toDataURL('image/jpeg', 0.9);
  localStorage.setItem('yammo-meta-profile-photo', dataUrl);
  profilePhotoImage.src = dataUrl;
  profilePhotoImage.hidden = false;
  if (profilePhotoPlaceholder) profilePhotoPlaceholder.hidden = true;
  closeCropper();
  toast('프로필 이미지를 저장했습니다.');
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && photoCropModal && !photoCropModal.hidden) closeCropper();
});

loadSavedProfilePhoto();
