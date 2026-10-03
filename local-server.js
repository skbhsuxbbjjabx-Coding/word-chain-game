const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const os = require('os');

const PORT = 3000;

function findDataDir() {
  const candidates = [
    path.join(__dirname, 'data'),
    path.join(process.cwd(), 'data'),
    path.join(__dirname, '..', 'data'),
    path.join('/var/task', 'data')
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.existsSync(path.join(p, 'kr_korean.csv'))) {
        return p;
      }
    } catch (e) {}
  }
  return path.join(process.cwd(), 'data');
}
const DATA_DIR = findDataDir();

console.log('⚡ [WordChain AI v4.0] 서버 초기화 시작 (Minimax 2수앞 지능 엔진 & 끄투 배틀 시스템)...');

// 1. 두음법칙 엔진 (국립국어원 한글 맞춤법 제10항 및 제11항 정방향 규정만 적용, 역방향 원천 차단)
function getDueumVariants(char) {
  if (!char || typeof char !== 'string') return [char];
  const code = char.charCodeAt(0) - 0xAC00;
  if (code < 0 || code > 11171) return [char];

  const initial = Math.floor(code / 588);
  const medial = Math.floor((code % 588) / 28);
  const final = code % 28;
  const variants = [char];

  // [한글 맞춤법 제10항] ㄴ 두음법칙
  // 단어 첫머리의 '냐, 녀, 녜, 뇨, 뉴, 니' -> '야, 여, 예, 요, 유, 이' 변환만 허용 (초성 ㄴ -> ㅇ)
  // * 역방향(ㄴ -> ㄹ: 예: '니' -> '리'('리튬'))은 일체 금지!
  if (initial === 2) {
    if ([2, 3, 6, 7, 12, 17, 20].includes(medial)) {
      variants.push(String.fromCharCode(0xAC00 + (11 * 588) + (medial * 28) + final));
    }
  }
  // [한글 맞춤법 제11항] ㄹ 두음법칙
  // 1) '랴, 려, 례, 료, 류, 리' -> '야, 여, 예, 요, 유, 이' 변환 허용 (초성 ㄹ -> ㅇ)
  // 2) '라, 로, 루, 르, 래, 뢰...' -> '나, 노, 누, 느, 내, 뇌...' 변환 허용 (초성 ㄹ -> ㄴ)
  else if (initial === 5) {
    if ([2, 3, 6, 7, 12, 17, 20].includes(medial)) {
      variants.push(String.fromCharCode(0xAC00 + (11 * 588) + (medial * 28) + final));
    } else {
      variants.push(String.fromCharCode(0xAC00 + (2 * 588) + (medial * 28) + final));
    }
  }
  // * ㅇ -> ㄹ/ㄴ 역방향 변환은 절대 불허 (한글 맞춤법 위배 차단)

  return [...new Set(variants)];
}


// ⭐ 현대에 쓰이지 않는 옛말(사어/고어) 및 단독 외래 인명 블랙리스트 (입거웆, 슘페터 등 원천 차단)
const ARCHAIC_BLACKLIST = new Set([
  '입거웆', '입거웇', '이웆', '가웆', '가늣', '모믈늣', '버들늣', '늣', '븟', '게웆다', '뉘웇다',
  '슘페터', '귄나르손', '무뤂'
]);

// 끝말잇기 표준 룰 불허 품사 (체언인 명사/대명사/수사 외의 품사 철저 배제)
const invalidParts = new Set([
  '어미', '접사', '조사', '인명', '지명', '성씨', '인물',
  '동사', '형용사', '보조동사', '보조형용사', '부사', '감탄사'
]);

// 명사 중 '-다'로 끝나는 합법 표준 명사 화이트리스트
const NOUN_DA_WHITELIST = new Set([
  '사이다', '소다', '판다', '고다', '마다', '보다', '간다'
]);

// 2. 고품질 사전 데이터 인덱싱 & 품사 매핑
const wordInfoMap = new Map();
const startMap = new Map();
const endMap = new Map();

console.time('📖 52만 공인 사전 데이터 로드');

// 1) kr_korean.csv로부터 정확한 품사(명사, 동사, 형용사 등) 색인 구축
const posMap = new Map();
try {
  const csvPath = path.join(DATA_DIR, 'kr_korean.csv');
  if (fs.existsSync(csvPath)) {
    const buf = fs.readFileSync(csvPath);
    let lineStart = 0;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] === 10) { // \n
        const line = buf.toString('utf8', lineStart, i).trim();
        lineStart = i + 1;
        if (!line) continue;
        const comma = line.indexOf(',');
        if (comma !== -1) {
          const raw = line.slice(0, comma).replace(/[^\uAC00-\uD7A3]/g, '');
          const pos = line.slice(comma + 1).trim();
          if (raw.length >= 2 && !posMap.has(raw)) {
            posMap.set(raw, pos);
          }
        }
      }
    }
  }
} catch (csvErr) {
  console.warn('[품사 CSV 사전 로드 경고]', csvErr.message);
}

// 2) 41.8만 공인 사전 데이터 색인 (끝말잇기 표준 체언만 정밀 선별)
let loadedFromJson = false;
try {
  const rawData = require('./data/dictionary.json');
  for (const [s, wordList] of Object.entries(rawData)) {
    for (const w of wordList) {
      if (!w || /\s/.test(w) || ARCHAIC_BLACKLIST.has(w) || /[뎡죵픠돓늣븟늧옄읓앛뤂]/.test(w)) continue;
      const part = posMap.get(w);
      if (part && invalidParts.has(part)) continue;
      // 끝말잇기 표준 룰: 용언(동사/형용사) 기본형 '-다' 엄격 차단 (명사 화이트리스트 제외)
      if (w.endsWith('다') && !NOUN_DA_WHITELIST.has(w)) continue;
      const finalPart = part || '명사';
      const isPure = !w.includes('-') && !w.includes('^');
      const item = { word: w, isPure, part: finalPart, raw: w };
      wordInfoMap.set(w, item);
      if (!startMap.has(s)) startMap.set(s, []);
      startMap.get(s).push(item);
      const e = w[w.length - 1];
      if (!endMap.has(e)) endMap.set(e, []);
      endMap.get(e).push(item);
    }
  }
  loadedFromJson = true;
} catch (e1) {
  const jsonPath = path.join(DATA_DIR, 'dictionary.json');
  if (fs.existsSync(jsonPath)) {
    try {
      const rawData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      for (const [s, wordList] of Object.entries(rawData)) {
        for (const w of wordList) {
          if (!w || /\s/.test(w) || ARCHAIC_BLACKLIST.has(w) || /[뎡죵픠돓늣븟늧옄읓앛뤂]/.test(w)) continue;
          const part = posMap.get(w);
          if (part && invalidParts.has(part)) continue;
          if (w.endsWith('다') && !NOUN_DA_WHITELIST.has(w)) continue;
          const finalPart = part || '명사';
          const isPure = !w.includes('-') && !w.includes('^');
          const item = { word: w, isPure, part: finalPart, raw: w };
          wordInfoMap.set(w, item);
          if (!startMap.has(s)) startMap.set(s, []);
          startMap.get(s).push(item);
          const e = w[w.length - 1];
          if (!endMap.has(e)) endMap.set(e, []);
          endMap.get(e).push(item);
        }
      }
      loadedFromJson = true;
    } catch (err) {
      console.warn('[사전 JSON 로드 실패, CSV 폴백]', err.message);
    }
  }
}

if (!loadedFromJson) {
  function loadDictionary(filename) {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) {
      console.warn(`[사전 로드 경고] 파일을 찾을 수 없습니다: ${filePath}`);
      return;
    }
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        const parts = line.split(',');
        const raw = parts[0] || '';
        const part = parts[1] || '명사';

        if (invalidParts.has(part)) continue;
        if (/\s/.test(raw) || raw.includes(' ')) continue;

        const clean = raw.replace(/[^\uAC00-\uD7A3]/g, '');
        if (!clean || clean.length < 2 || ARCHAIC_BLACKLIST.has(clean)) continue;
        if (clean.endsWith('다') && !NOUN_DA_WHITELIST.has(clean)) continue;

        const isPure = !raw.includes('-') && !raw.includes('^');

        const existing = wordInfoMap.get(clean);
        if (!existing || (!existing.isPure && isPure)) {
          wordInfoMap.set(clean, { word: clean, isPure, part, raw });
        }
      }
    } catch (err) {
      console.error(`[사전 읽기 오류] ${filename}:`, err.message);
    }
  }

  loadDictionary('kr_korean.csv');
  loadDictionary('kp_korean.csv');

  for (const item of wordInfoMap.values()) {
    const s = item.word[0];
    const e = item.word[item.word.length - 1];

    if (!startMap.has(s)) startMap.set(s, []);
    startMap.get(s).push(item);

    if (!endMap.has(e)) endMap.set(e, []);
    endMap.get(e).push(item);
  }
}

// 3) kr_korean.csv(posMap)에 등재된 유효 표준 체언(명사 등) 중 미등록 단어 전수 색인 통합
for (const [w, part] of posMap.entries()) {
  if (wordInfoMap.has(w)) continue;
  if (!w || w.length < 2 || /\s/.test(w) || ARCHAIC_BLACKLIST.has(w) || /[뎡죵픠돓늣븟늧옄읓앛뤂]/.test(w)) continue;
  if (part && invalidParts.has(part)) continue;
  if (w.endsWith('다') && !NOUN_DA_WHITELIST.has(w)) continue;

  const isPure = !w.includes('-') && !w.includes('^');
  const item = { word: w, isPure, part: part || '명사', raw: w };
  wordInfoMap.set(w, item);
  const s = w[0];
  const e = w[w.length - 1];
  if (!startMap.has(s)) startMap.set(s, []);
  startMap.get(s).push(item);
  if (!endMap.has(e)) endMap.set(e, []);
  endMap.get(e).push(item);
}

console.timeEnd('📖 52만 공인 사전 데이터 로드');
console.log(`✅ 탑재된 총 유효 한국어 단어 수: ${wordInfoMap.size.toLocaleString()}개 (정확한 품사 매핑 완료)`);

function registerDynamicWord(word, part = '명사') {
  if (!word || word.length < 2 || /\s/.test(word) || ARCHAIC_BLACKLIST.has(word)) return;
  if (wordInfoMap.has(word)) return;
  const isPure = !word.includes('-') && !word.includes('^');
  const item = { word, isPure, part, raw: word };
  wordInfoMap.set(word, item);
  const s = word[0];
  const e = word[word.length - 1];

  if (!startMap.has(s)) startMap.set(s, []);
  startMap.get(s).push(item);

  if (!endMap.has(e)) endMap.set(e, []);
  endMap.get(e).push(item);
}

// ⭐ [네이버 국어사전 공인 방언 및 핵심 어휘 영구 탑재]
registerDynamicWord('윰라대왕', '명사');
if (wordInfoMap.has('윰라대왕')) {
  const item = wordInfoMap.get('윰라대왕');
  item.naverMeaning = '‘염라대왕’의 방언 (강원)';
  item.source = '네이버 국어사전';
  item.naverLink = 'https://ko.dict.naver.com/#/entry/koko/44ff94fd43d740e496ed51da143926ba';
}
registerDynamicWord('스케치북', '명사');

// ⭐ [동적 차수(Out-Degree) 계산 엔진]: usedWords(이미 사용된 단어)를 완벽히 반영
function getDynamicOutDegree(char, usedWords = null) {
  if (!char || typeof char !== 'string') return 0;
  const vars = getDueumVariants(char);
  let count = 0;
  for (let vi = 0; vi < vars.length; vi++) {
    const list = startMap.get(vars[vi]);
    if (!list) continue;
    if (!usedWords || usedWords.size === 0) {
      count += list.length;
    } else {
      for (let i = 0; i < list.length; i++) {
        if (!usedWords.has(list[i].word)) count++;
      }
    }
  }
  return count;
}

function getOutDegree(char) {
  return getDynamicOutDegree(char, null);
}

// ⭐ [절대 한방 종결 음절]: '릇', '늣', '녘', '쁨', '듐', '옄', '엌', '값' 등 현대 국어에서 반격이 불가능한 한방 글자 전수 정의
const ABSOLUTE_KILLING_CHARS = new Set([
  '녘', '쁨', '듐', '늧', '릇', '릎', '탉', '값', '옄', '엌', '헿', '흗', '늣', '픔', '튬', '뮴', '켓', '틱', '넷', '텝', '슘', '븀', '퓸', '큠', '콬', '톸'
]);

// ⭐ [정적 킬러 음절 사전 인덱스 생성]: 한글 전체 음절 중 시작 단어가 전무(0개)한 음절 집합
const staticTerminalCharSet = new Set();
for (let code = 0xAC00; code <= 0xD7A3; code++) {
  const ch = String.fromCharCode(code);
  const vars = getDueumVariants(ch);
  const total = vars.reduce((acc, v) => acc + (startMap.get(v)?.length || 0), 0);
  if (total === 0) staticTerminalCharSet.add(ch);
}
// ⭐ '릇', '늧', '늣' 등 절대 한방 글자는 무조건 정적 킬러 음절에 100% 영구 포함! ('은그릇' 피격 자살수 원천 방지)
for (const ch of ABSOLUTE_KILLING_CHARS) {
  staticTerminalCharSet.add(ch);
}
console.log(`🎯 사전 인덱싱된 정적 한방(반격 불가) 음절 수: ${staticTerminalCharSet.size.toLocaleString()}개`);

// ⭐ [동적 킬러 음절 집합 조회]: 사용된 단어들로 인해 추가로 시작 단어가 0개가 된 음절까지 $O(1)$ 감지
function getTerminalCharSet(usedWords = null) {
  const set = new Set(staticTerminalCharSet);
  if (usedWords && usedWords.size > 0) {
    for (const w of usedWords) {
      if (!w) continue;
      const s = w[0];
      const vars = getDueumVariants(s);
      for (let vi = 0; vi < vars.length; vi++) {
        const v = vars[vi];
        if (!set.has(v) && getDynamicOutDegree(v, usedWords) === 0) {
          set.add(v);
        }
      }
    }
  }
  return set;
}

// ⭐ [단어 즉시 한방 여부 엄격 판정]: 상대가 이 단어를 냈을 때 내가 다음 수를 둘 수 있는지(0개면 상대 한방) 판정
function isWordInstantKill(word, currentUsed = null) {
  if (!word || word.length < 2) return false;
  const endChar = word[word.length - 1];
  if (staticTerminalCharSet.has(endChar) || ABSOLUTE_KILLING_CHARS.has(endChar)) return true;
  const vars = getDueumVariants(endChar);
  for (let vi = 0; vi < vars.length; vi++) {
    const list = startMap.get(vars[vi]);
    if (!list) continue;
    for (let i = 0; i < list.length; i++) {
      if (!currentUsed || !currentUsed.has(list[i].word)) {
        return false;
      }
    }
  }
  return true;
}

// 3. 공인 국어사전 실시간 검색 엔진 (네이버 국어사전 공식 API3 실시간 전수 연동)
const naverCache = new Map();
const MAX_CACHE_SIZE = 10000;

naverCache.set('윰라대왕', {
  isVerified: true,
  word: '윰라대왕',
  source: '네이버 국어사전',
  partOfSpeech: '명사',
  meanings: ['‘염라대왕’의 방언 (강원)'],
  link: 'https://ko.dict.naver.com/#/entry/koko/44ff94fd43d740e496ed51da143926ba'
});

// 주요 공인 필수 어휘 사전 캐시 즉시 예열 (네트워크 지연 0초 보장)
const PRELOAD_WORDS = [
  ['해질녘', '명사', '해가 질 무렵.', '표준국어대사전'],
  ['새벽녘', '명사', '새벽 무렵.', '표준국어대사전'],
  ['황혼녘', '명사', '해가 지고 어스레한 무렵.', '표준국어대사전'],
  ['동녘', '명사', '동쪽이 있는 방향이나 쪽.', '표준국어대사전'],
  ['서녘', '명사', '서쪽이 있는 방향이나 쪽.', '표준국어대사전'],
  ['남녘', '명사', '남쪽이 있는 방향이나 쪽.', '표준국어대사전'],
  ['북녘', '명사', '북쪽이 있는 방향이나 쪽.', '표준국어대사전'],
  ['기쁨', '명사', '마음이 흡족하여 즐거운 느낌이나 상태.', '표준국어대사전'],
  ['슬픔', '명사', '슬픈 마음이나 느낌.', '표준국어대사전'],
  ['아픔', '명사', '육체적인 고통이나 괴로움, 또는 슬픔이나 괴로움.', '표준국어대사전'],
  ['산기슭', '명사', '산의 비탈이 끝나는 아랫부분.', '표준국어대사전'],
  ['눈시울', '명사', '눈 가장자리를 따라 속눈썹이 난 곳.', '표준국어대사전'],
  ['알루미늄', '명사', '은백색의 가볍고 무른 금속 원소 (원소 기호 Al, 원자 번호 13).', '표준국어대사전'],
  ['나트륨', '명사', '알칼리 금속의 하나로 은백색의 매우 무른 원소 (원소 기호 Na, 원자 번호 11).', '표준국어대사전'],
  ['마그네슘', '명사', '알칼리 토금속의 하나로 은백색의 가벼운 금속 원소 (원소 기호 Mg, 원자 번호 12).', '표준국어대사전'],
  ['칼륨', '명사', '알칼리 금속의 하나로 은백색의 매우 무른 원소 (원소 기호 K, 원자 번호 19).', '표준국어대사전'],
  ['칼슘', '명사', '알칼리 토금속의 하나로 은백색의 결정성 금속 원소 (원소 기호 Ca, 원자 번호 20).', '표준국어대사전'],
  ['헬륨', '명사', '비활성 기체의 하나 (원소 기호 He, 원자 번호 2).', '표준국어대사전'],
  ['리튬', '명사', '알칼리 금속의 하나로 가장 가벼운 고체 원소 (원소 기호 Li, 원자 번호 3).', '표준국어대사전'],
  ['부엌', '명사', '음식을 만들거나 밥을 짓는 방.', '표준국어대사전'],
  ['암탉', '명사', '암컷인 닭.', '표준국어대사전'],
  ['수탉', '명사', '수컷인 닭.', '표준국어대사전'],
  ['무릎', '명사', '넓적다리와 정강이뼈 사이의 관절 부분.', '표준국어대사전'],
  ['그릇', '명사', '음식이나 물건 따위를 담는 세간.', '표준국어대사전'],
  ['포켓', '명사', '옷에 물건을 넣을 수 있도록 덧붙인 주머니.', '표준국어대사전'],
  ['로켓', '명사', '자체 추진제로 추진되는 비행체.', '표준국어대사전'],
  ['티켓', '명사', '탈것을 타거나 공연장 따위에 들어갈 수 있는 표.', '표준국어대사전'],
  ['라켓', '명사', '테니스, 배드민턴 따위에서 공을 치는 데 쓰는 용구.', '표준국어대사전']
];

for (const [pw, ppos, pmean, psource] of PRELOAD_WORDS) {
  naverCache.set(pw, {
    isVerified: true,
    word: pw,
    source: `네이버 국어사전 (${psource})`,
    partOfSpeech: ppos,
    meanings: [pmean],
    link: `https://ko.dict.naver.com/#/search?query=${encodeURIComponent(pw)}`
  });
}

// 구체적인 실제 사전 뜻풀이인지 엄격 검증
function isRealMeaning(text) {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;
  const fakePhrases = [
    '등재되지 않은',
    '사전 미등재',
    '뜻이 등재되지',
    '공식 등재된 표준',
    '공인 표제어입니다',
    '유효 표준 표제어',
    '표준 표제어만 유효'
  ];
  for (const phrase of fakePhrases) {
    if (trimmed.includes(phrase)) return false;
  }
  return true;
}

function getUnverifiedResult(word) {
  return {
    word,
    displayEntry: word,
    isVerified: false,
    source: '공인 국어사전 미등재 단어',
    totalMatches: 0,
    partOfSpeech: '미상',
    meanings: [],
    message: `「${word}」은(는) 네이버 국어사전에 구체적인 뜻풀이가 등재되지 않은 단어입니다.`,
    link: `https://ko.dict.naver.com/#/search?query=${encodeURIComponent(word)}`,
    naverResults: []
  };
}

// 네이버 국어사전 실시간 쿼리 함수 (실제 공인 사전에 등재되고 구체적인 뜻풀이가 존재하는 유효 표제어만 100% 검증)
async function queryNaverDictionary(queryWord, timeoutMs = 3500) {
  if (!queryWord) return null;
  const rawInput = String(queryWord).trim();

  // 1글자 이상 유효 한글 추출 (1자 단어도 사전 검색 완벽 허용!)
  const clean = rawInput.replace(/[^\uAC00-\uD7A3]/g, '');
  if (!clean || clean.length === 0) return getUnverifiedResult(queryWord);

  if (naverCache.has(clean)) {
    return naverCache.get(clean);
  }

  const encoded = encodeURIComponent(clean);
  let apiResult = null;
  const naverResults = []; // 네이버 사전 실제 검색 결과 목록 전체

  try {
    const apiUrl = `https://ko.dict.naver.com/api3/koko/search?query=${encoded}&m=pc`;
    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://ko.dict.naver.com/',
        'Accept': 'application/json, text/plain, */*'
      },
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (res.ok) {
      const data = await res.json();
      const listMap = data?.searchResultMap?.searchResultListMap || {};
      const officialItems = listMap.WORD?.items || [];
      const openItems = listMap.OPEN?.items || [];
      const combinedItems = [...officialItems, ...openItems];

      // 검색된 모든 네이버 사전 항목 파싱하여 naverResults 목록 구축
      for (const item of combinedItems) {
        const entryRaw = (item.handleEntry || item.expEntry || item.expEntryRaw || '')
          .replace(/<[^>]+>/g, '')
          .replace(/[0-9]/g, '')
          .trim();
        const rawClean = entryRaw.replace(/[-^ㆍ·\s\(\)]/g, '').replace(/[^\uAC00-\uD7A3]/g, '').trim();

        let itemPos = '명사';
        const itemMeans = [];
        if (item.meansCollector && item.meansCollector.length > 0) {
          for (const mc of item.meansCollector) {
            if (mc.partOfSpeech) itemPos = mc.partOfSpeech;
            for (const m of (mc.means || [])) {
              const val = (m.value || '').replace(/<[^>]+>/g, '').trim();
              if (val && isRealMeaning(val) && !itemMeans.includes(val)) {
                itemMeans.push(val);
              }
            }
          }
        }
        if (itemMeans.length === 0) {
          const fb = item.abstractContent?.value || item.abstractContent || item.expAbstract || item.etcExplain;
          if (fb && typeof fb === 'string') {
            const cleanFb = fb.replace(/<[^>]+>/g, '').trim();
            if (cleanFb && isRealMeaning(cleanFb) && !itemMeans.includes(cleanFb)) {
              itemMeans.push(cleanFb);
            }
          }
        }

        const sourceName = item.sourceDictnameKO 
          ? `네이버 국어사전 (${item.sourceDictnameKO})` 
          : (item.sourceDictname ? `네이버 국어사전 (${item.sourceDictname})` : '네이버 국어사전');

        const itemLink = item.destinationLink
          ? (item.destinationLink.startsWith('http') ? item.destinationLink : `https://ko.dict.naver.com/${item.destinationLink}`)
          : `https://ko.dict.naver.com/#/search?query=${encoded}`;

        if (itemMeans.length > 0) {
          naverResults.push({
            entry: entryRaw || clean,
            cleanWord: rawClean || clean,
            partOfSpeech: itemPos,
            meanings: itemMeans,
            source: sourceName,
            link: itemLink,
            isExactMatch: rawClean === clean
          });
        }
      }

      // ⭐ [철저한 표제어 일치 검증]: 오직 검색어와 완전히 일치하거나 띄어쓰기만 제거했을 때 일치하는 단어만 채택!
      // (검색어와 다른 엉뚱한 첫 번째 결과를 끌어오는 엉터리 폴백 완전 삭제 -> 없는 단어 통과 버그 100% 원천 차단)
      let bestMatch = naverResults.find(r => r.isExactMatch && r.meanings.length > 0);
      if (!bestMatch) {
        bestMatch = naverResults.find(r => r.cleanWord === clean && r.meanings.length > 0);
      }

      // ⭐ 네이버 국어사전에 실제로 표제어와 뜻풀이가 등재되어 있으면 '옛말/고어'('션믈' 등)라도 100% 인정!
      if (bestMatch && bestMatch.meanings.length > 0) {
        apiResult = {
          word: clean,
          displayEntry: bestMatch.entry,
          isVerified: true,
          isArchaic: false,
          source: bestMatch.source,
          totalMatches: naverResults.length,
          partOfSpeech: bestMatch.partOfSpeech || '명사',
          meanings: bestMatch.meanings.slice(0, 5),
          link: bestMatch.link,
          naverResults
        };
        registerDynamicWord(clean, bestMatch.partOfSpeech || '명사');
      }
    }
  } catch (err) {
    // 네트워크 타임아웃
  }

  // 네이버 검색에서 결과를 찾았으면 캐시 후 반환
  if (apiResult) {
    if (naverCache.size >= MAX_CACHE_SIZE) {
      const firstKey = naverCache.keys().next().value;
      naverCache.delete(firstKey);
    }
    naverCache.set(clean, apiResult);
    return apiResult;
  }
  // 네이버 국어사전 검색 결과에 유효한 뜻이 없으면 무조건 미등재 판정!
  const unverified = getUnverifiedResult(clean);
  naverCache.set(clean, unverified);
  return unverified;
}

// 3-2. ⭐ 국어사전식 파트 분할 검색 엔진 (앞에 들어가는 단어, 끝에 들어가는 단어, 중간 포함, 음절 일치)
function searchMatchingWords(query, limitPerCategory = 45) {
  if (!query || typeof query !== 'string') {
    return { exact: null, prefix: [], prefixTotal: 0, suffix: [], suffixTotal: 0, contains: [], containsTotal: 0, charMatch: [], charMatchTotal: 0, flat: [], totalMatches: 0 };
  }
  const clean = query.trim().replace(/[^\uAC00-\uD7A3]/g, '');
  if (!clean) {
    return { exact: null, prefix: [], prefixTotal: 0, suffix: [], suffixTotal: 0, contains: [], containsTotal: 0, charMatch: [], charMatchTotal: 0, flat: [], totalMatches: 0 };
  }

  const queryChars = new Set(clean.split(''));
  let exact = null;
  const prefix = [];
  const suffix = [];
  const contains = [];
  const charMatch = [];
  const flat = [];
  const seen = new Set();

  for (const item of wordInfoMap.values()) {
    const word = item.word;
    if (seen.has(word)) continue;

    const endChar = word[word.length - 1];
    const outCount = getOutDegree(endChar);
    const wordObj = {
      word,
      part: item.part || '명사',
      isPure: item.isPure,
      length: word.length,
      endChar,
      outCount,
      isKilling: outCount === 0,
      statusText: outCount === 0 ? '한방' : (outCount <= 3 ? '외통수' : (outCount <= 20 ? '압박' : '안전'))
    };

    // 1) 완전 일치 (100% 동일)
    if (word === clean) {
      seen.add(word);
      wordObj.matchType = 'EXACT';
      wordObj.matchBadge = '🎯 100% 완전 일치';
      exact = wordObj;
      flat.push(wordObj);
    }
    // 2) 앞에 들어가는 단어 (접두사 일치)
    else if (word.startsWith(clean)) {
      seen.add(word);
      wordObj.matchType = 'PREFIX';
      wordObj.matchBadge = '📌 시작 일치';
      prefix.push(wordObj);
      flat.push(wordObj);
    }
    // 3) 끝에 들어가는 단어 (접미사 일치)
    else if (word.endsWith(clean)) {
      seen.add(word);
      wordObj.matchType = 'SUFFIX';
      wordObj.matchBadge = '📎 끝 일치';
      suffix.push(wordObj);
      flat.push(wordObj);
    }
    // 4) 중간에 들어가는 단어 (포함 일치)
    else if (word.includes(clean)) {
      seen.add(word);
      wordObj.matchType = 'CONTAINS';
      wordObj.matchBadge = '🔍 중간 포함';
      contains.push(wordObj);
      flat.push(wordObj);
    }
    // 5) 한 글자라도 일치 (음절 일치)
    else {
      let matchedCount = 0;
      for (const ch of queryChars) {
        if (word.includes(ch)) matchedCount++;
      }
      if (matchedCount > 0) {
        seen.add(word);
        wordObj.matchType = 'CHAR_MATCH';
        wordObj.matchBadge = `💡 ${matchedCount}글자 일치`;
        wordObj.matchedCount = matchedCount;
        charMatch.push(wordObj);
        flat.push(wordObj);
      }
    }
  }

  // 짧은 단어 및 순수 어휘 우선 정렬
  const sorter = (a, b) => (b.isPure ? 1 : 0) - (a.isPure ? 1 : 0) || a.length - b.length;
  prefix.sort(sorter);
  suffix.sort(sorter);
  contains.sort(sorter);
  charMatch.sort((a, b) => (b.matchedCount || 0) - (a.matchedCount || 0) || sorter(a, b));

  const totalMatches = (exact ? 1 : 0) + prefix.length + suffix.length + contains.length + charMatch.length;

  return {
    exact,
    prefix: prefix.slice(0, limitPerCategory),
    prefixTotal: prefix.length,
    suffix: suffix.slice(0, limitPerCategory),
    suffixTotal: suffix.length,
    contains: contains.slice(0, limitPerCategory),
    containsTotal: contains.length,
    charMatch: charMatch.slice(0, limitPerCategory),
    charMatchTotal: charMatch.length,
    flat: flat.slice(0, 100),
    totalMatches
  };
}

// 상대방 되받아칠 단어 정밀 분석 헬퍼
function getRebuttalAnalysis(endChar, counterPlan = [], usedWords = null) {
  const variants = getDueumVariants(endChar);
  const candidates = [];

  for (const v of variants) {
    if (startMap.has(v)) {
      const list = startMap.get(v);
      for (let i = 0; i < list.length; i++) {
        if (!usedWords || !usedWords.has(list[i].word)) {
          candidates.push(list[i]);
        }
      }
    }
  }

  candidates.sort((a, b) => {
    const aPure = a.isPure ? 1 : 0;
    const bPure = b.isPure ? 1 : 0;
    if (bPure !== aPure) return bPure - aPure;
    return a.word.length - b.word.length;
  });

  const totalCount = candidates.length;
  const pureList = candidates.filter(c => c.isPure);
  const pureCount = pureList.length;

  const displaySamples = (pureList.length > 0 ? pureList : candidates).slice(0, 10).map(c => c.word);

  const counterAnalysis = (counterPlan || []).map(cp => ({
    opponentWord: cp.oppWord || cp.opp,
    myBestCounter: cp.myCounter || cp.counter
  }));

  return {
    endChar,
    variants,
    isDueumApplied: variants.length > 1,
    totalCount,
    pureCount,
    status: totalCount === 0 ? 'IMPOSSIBLE' : (totalCount <= 3 ? 'TRAPPED' : (totalCount <= 20 ? 'PRESSURE' : 'OPEN')),
    statusText: totalCount === 0 
      ? '💥 반격 불가 (상대방 단어 0개 / 100% 필승!)'
      : (totalCount <= 3 ? `⚔️ 외통수 포위 (상대방 선택지 ${totalCount}개뿐)` : `선택지 ${totalCount}개`),
    samples: displaySamples,
    counterAnalysis
  };
}

// ============================================================================
// ⭐ 4. 완벽한 4단계 계층적 지능 의사결정 엔진 (Hierarchical 4-Tier Decision Engine)
// ============================================================================
// 유저 요구사항 엄격 준수:
// 1순위: 일단 한방으로 끝나는 거 우선 생각 (상대 반격 0개)
// 2순위: 없으면 반격해도 한방인 단어 생각 (2수 앞 필승 외통수: 상대 모든 반격에 100% 한방 카운터 존재)
// 3순위: 없으면 거의 한방급인 단어 생각 (상대 선택지 1~4개 극소 & 자살수 없음)
// 4순위: 없으면 쓸 수라도 있는 단어 생각 (자살수 없는 안전한 단어)
// 절대 규칙: 한방 당하는 단어(상대에게 한방을 내주는 자살수)는 철저히 회피!
// ============================================================================

const FOREIGN_NAMES_SET = new Set(['해리슨', '윌슨', '존슨', '앤더슨', '잭슨', '톰슨', '파킨슨', '클린턴', '워싱턴', '뉴턴', '에디슨', '로빈슨', '마이컬슨', '스티븐슨', '제퍼슨']);
const ICONIC_WORDS = new Set([
  '해질녘', '새벽녘', '황혼녘', '동녘', '서녘', '남녘', '북녘',
  '기쁨', '슬픔', '아픔', '괴로움', '외로움', '그리움', '산기슭', '눈시울',
  '알루미늄', '나트륨', '마그네슘', '칼륨', '칼슘', '헬륨', '리튬', '베릴륨', '바나듐', '티타늄',
  '크로뮴', '스칸듐', '갈륨', '게르마늄', '셀레늄', '루비듐', '스트론튬', '이트륨', '지르코늄',
  '나이오븀', '몰리브데넘', '루테늄', '로듐', '팔라듐', '인듐', '카드뮴', '세슘', '바륨', '탄탈럼',
  '텅스텐', '레늄', '오스뮴', '이리듐', '백금', '탈륨', '폴로늄', '라듐', '악티늄', '토륨', '우라늄', '플루토늄',
  '포켓', '라켓', '로켓', '자켓', '마켓', '티켓', '패킷', '피켓', '바스켓',
  '부엌', '암탉', '수탉', '씨탉', '무릎', '그릇', '나릇', '윰라대왕',
  '인공지능', '알고리즘', '컴퓨터', '빅데이터', '데이터', '네트워크', '대한민국', '끝말잇기'
]);

// ⭐ [사전-AI-배틀 실시간 일원화] 글자(또는 두음 변이)로 시작하는 단어가 로컬 사전에 부족할 때 네이버 사전을 실시간 조회하여 동기화
async function ensureCharWordsFromNaver(char) {
  if (!char || typeof char !== 'string') return;
  const variants = getDueumVariants(char);

  for (const v of variants) {
    const existing = startMap.get(v) || [];
    // 이미 3개 이상 충분히 있으면 스킵 (불필요한 외부 네트워크 지연 차단)
    if (existing.length >= 3) continue;

    try {
      const encoded = encodeURIComponent(v);
      const apiUrl = `https://ko.dict.naver.com/api3/koko/search?query=${encoded}&m=pc`;
      const res = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Referer': 'https://ko.dict.naver.com/',
          'Accept': 'application/json, text/plain, */*'
        },
        signal: AbortSignal.timeout(1500)
      });

      if (res.ok) {
        const data = await res.json();
        const listMap = data?.searchResultMap?.searchResultListMap || {};
        const officialItems = listMap.WORD?.items || [];

        for (const item of officialItems) {
          const entryRaw = (item.handleEntry || item.expEntry || '')
            .replace(/<[^>]+>/g, '')
            .replace(/[0-9]/g, '')
            .trim();

          if (/\s/.test(entryRaw)) continue;

          const isItemArchaic = (item.meansCollector || []).some(mc =>
            (mc.means || []).some(m => m.subjectGroup === '옛말' || m.subjectGroup === '옛' || (m.value || '').includes('옛말') || (m.value || '').includes('고어'))
          );
          if (isItemArchaic) continue;

          const raw = entryRaw
            .replace(/[-^ㆍ·\(\)]/g, '')
            .replace(/[^\uAC00-\uD7A3]/g, '')
            .trim();

          if (raw.startsWith(v) && raw.length >= 2) {
            let part = '명사';
            if (item.meansCollector?.[0]?.partOfSpeech) {
              part = item.meansCollector[0].partOfSpeech;
            }
            registerDynamicWord(raw, part);
          }
        }
      }
    } catch (err) {
      // 네트워크 일시 오류 또는 타임아웃 무시
    }
  }
}

// ⭐ 초고성능 Minimax 심층 수읽기 & 다계층 지능 의사결정 엔진
async function findUltimateBestWord(inputChar, options = {}) {
  await ensureCharWordsFromNaver(inputChar);

  const usedWords = options.usedWords instanceof Set ? options.usedWords : new Set(options.usedWords || []);
  const terminalSet = getTerminalCharSet(usedWords);
  const variants = getDueumVariants(inputChar);

  let candidateItems = [];
  for (let vi = 0; vi < variants.length; vi++) {
    const list = startMap.get(variants[vi]);
    if (list) {
      for (let li = 0; li < list.length; li++) {
        if (!usedWords.has(list[li].word)) {
          candidateItems.push(list[li]);
        }
      }
    }
  }

  if (candidateItems.length === 0) {
    return null;
  }

  // 5대 티어 버킷
  const tier1_instantKill = []; // 1순위: 즉시 한방 (상대 반격 0개)
  const tier2_forcedWin = [];   // 2순위: 반격해도 한방 (2수 앞 필승 외통수)
  const tier3_nearKill = [];    // 3순위: 거의 한방급 (상대 선택지 1~4개 극소 & 자살수 없음)
  const tier4_safePlay = [];    // 4순위: 쓸 수라도 있는 단어 (자살수 없는 안전한 단어)
  const tier5_desperate = [];   // 5순위: 최후의 발악 (모든 단어가 자살수인 극단적 상황)

  for (let ci = 0; ci < candidateItems.length; ci++) {
    const item = candidateItems[ci];
    const word = item.word;
    const endChar = word[word.length - 1];

    // 내부 품질 점수 (품사, 길이, 순수어, 대표 공인어)
    let qualityScore = 0;
    const pos = item.part || '명사';
    if (pos === '명사' || pos.includes('명사') || pos === '수사' || pos === '대명사') {
      qualityScore += 60000;
    } else if (word.endsWith('다')) {
      qualityScore -= 120000; // 끝말잇기에서 동사/형용사 기본형 배제
    }

    if (item.isPure) qualityScore += 35000;
    if (word.length === 2) qualityScore += 90000;
    else if (word.length === 3) qualityScore += 70000;
    else if (word.length === 4) qualityScore += 20000;
    else if (word.length >= 5) qualityScore -= (word.length * 45000);

    // ⭐ 일상 대표 공인 단어 최우선 장려
    if (ICONIC_WORDS.has(word)) qualityScore += 300000;
    // 명사 가산점
    if (pos === '명사') qualityScore += 50000;
    // 방언/북한어보다 현대 표준어 강력 우대
    if (pos.includes('방언') || pos.includes('북한')) qualityScore -= 120000;

    if (FOREIGN_NAMES_SET.has(word) || (/^[가-힣]{3,}$/.test(word) && word.endsWith('슨') && word !== '이순신')) {
      qualityScore -= 500000;
    }

    // ------------------------------------------------------------------------
    // 🥇 1순위: 즉시 한방 단어 (O(1) 킬러 음절 인덱스 검사)
    // ------------------------------------------------------------------------
    if (terminalSet.has(endChar)) {
      let score = 1000000 + qualityScore;
      if (ABSOLUTE_KILLING_CHARS.has(endChar)) score += 50000;

      tier1_instantKill.push({
        word,
        item,
        length: word.length,
        isPure: item.isPure,
        part: item.part,
        startChar: word[0],
        endChar,
        outCount: 0,
        tier: 1,
        tierName: '💥 1순위: 즉시 승리 한방 단어',
        tierBadgeClass: 'tier-1',
        tierIcon: '💥',
        score,
        counterPlan: [],
        minimax: {
          type: 'WIN_1_STEP',
          score,
          brief: `💥 [1수 즉시 승리] 끝글자 '${endChar}'(으)로 시작하는 단어가 국어사전에 단 0개(전무)입니다!`,
          rebuttalCount: 0,
          samples: [],
          counterPlan: []
        }
      });
      continue;
    }

    // 상대방의 가능한 다음 수 계산
    const endVars = getDueumVariants(endChar);
    const oppMoves = [];
    const nextUsed = new Set(usedWords);
    nextUsed.add(word);

    for (let vi = 0; vi < endVars.length; vi++) {
      const list = startMap.get(endVars[vi]);
      if (list) {
        for (let li = 0; li < list.length; li++) {
          if (!nextUsed.has(list[li].word)) {
            oppMoves.push(list[li]);
          }
        }
      }
    }
    const oppCount = oppMoves.length;

    // 만약 다음 단어가 실제로 0개면 (동적 한방)
    if (oppCount === 0) {
      let score = 1000000 + qualityScore;
      tier1_instantKill.push({
        word,
        item,
        length: word.length,
        isPure: item.isPure,
        part: item.part,
        startChar: word[0],
        endChar,
        outCount: 0,
        tier: 1,
        tierName: '💥 1순위: 즉시 승리 한방 단어',
        tierBadgeClass: 'tier-1',
        tierIcon: '💥',
        score,
        counterPlan: [],
        minimax: {
          type: 'WIN_1_STEP',
          score,
          brief: `💥 [1수 즉시 승리] 끝글자 '${endChar}'(으)로 시작하는 단어가 모두 소진되어 0개입니다!`,
          rebuttalCount: 0,
          samples: [],
          counterPlan: []
        }
      });
      continue;
    }

    // 상대방의 즉시 한방 역공(자살수) 확인: 상대의 반격 어휘 중 나를 즉사시키는 한방 단어(은그릇, 은시안화칼륨 등) 전수 감지
    const oppKillingMoves = [];
    for (let oi = 0; oi < oppMoves.length; oi++) {
      const oppWord = oppMoves[oi].word;
      if (isWordInstantKill(oppWord, nextUsed)) {
        oppKillingMoves.push(oppMoves[oi]);
        if (oppKillingMoves.length >= 5) break;
      }
    }
    const hasSuicideRisk = oppKillingMoves.length > 0;

    // ------------------------------------------------------------------------
    // 🥈 2순위: 2수 앞 필승 외통수 단어 (Deep 2-Ply Minimax Forced Win)
    // 조건: 자살수가 없고, 상대방의 모든 반격에 대해 AI가 100% 한방 카운터를 보유!
    // ------------------------------------------------------------------------
    let killerCounterCount = 0;
    const counterPlan = [];

    if (!hasSuicideRisk && oppCount >= 1 && oppCount <= 25) {
      for (let oi = 0; oi < oppMoves.length; oi++) {
        const opp = oppMoves[oi];
        const oppEnd = opp.word[opp.word.length - 1];
        const oppEndVars = getDueumVariants(oppEnd);
        const afterOppUsed = new Set(nextUsed);
        afterOppUsed.add(opp.word);

        let foundMyKillingCounter = null;

        for (let ovi = 0; ovi < oppEndVars.length; ovi++) {
          const myNextList = startMap.get(oppEndVars[ovi]);
          if (!myNextList) continue;

          for (let mi = 0; mi < myNextList.length; mi++) {
            const myNext = myNextList[mi];
            if (afterOppUsed.has(myNext.word)) continue;
            const myNextEnd = myNext.word[myNext.word.length - 1];

            // AI의 카운터 단어가 한방 단어인지 즉시 확인
            if (terminalSet.has(myNextEnd)) {
              foundMyKillingCounter = myNext.word;
              break;
            }
          }
          if (foundMyKillingCounter) break;
        }

        if (foundMyKillingCounter) {
          counterPlan.push({ oppWord: opp.word, myCounter: foundMyKillingCounter });
          killerCounterCount++;
        }
      }

      if (killerCounterCount === oppCount) {
        let score = 600000 - (oppCount * 3000) + qualityScore;
        tier2_forcedWin.push({
          word,
          item,
          length: word.length,
          isPure: item.isPure,
          part: item.part,
          startChar: word[0],
          endChar,
          outCount: oppCount,
          tier: 2,
          tierName: '⚔️ 2순위: 반격해도 한방인 외통수 단어',
          tierBadgeClass: 'tier-2',
          tierIcon: '⚔️',
          score,
          counterPlan,
          minimax: {
            type: 'WIN_2_STEP',
            score,
            brief: `⚔️ [2수 앞 필승 외통수] 상대가 어떤 반격을 하든 다음 턴 100% 한방(예: 「${counterPlan[0].oppWord}」 ➔ 「${counterPlan[0].myCounter}」)으로 즉시 격파합니다!`,
            rebuttalCount: oppCount,
            samples: oppMoves.slice(0, 6).map(o => o.word),
            counterPlan
          }
        });
        continue;
      }
    }

    // ------------------------------------------------------------------------
    // 🥉 3순위: 거의 한방급 치명타 (3수 수읽기 압박)
    // 조건 1: 상대 반격 선택지가 1~4개로 극히 좁음
    // 조건 2: 또는 상대 선택지의 75% 이상에 한방 카운터가 포진되어 강력 포위
    // ------------------------------------------------------------------------
    const killerRatio = oppCount > 0 ? (killerCounterCount / oppCount) : 0;
    if (!hasSuicideRisk && (oppCount <= 4 || (oppCount <= 12 && killerRatio >= 0.75))) {
      let score = 350000 - (oppCount * 8000) + Math.round(killerRatio * 50000) + qualityScore;
      const pressureDesc = oppCount <= 4
        ? `상대방의 되받아칠 단어가 국어사전 전체에서 단 ${oppCount}개뿐으로 상대를 질식시키는 강력한 포위망입니다.`
        : `상대 선택지 ${oppCount}개 중 무려 ${killerCounterCount}개(${Math.round(killerRatio * 100)}%)를 한방 카운터로 완벽 봉쇄합니다.`;

      tier3_nearKill.push({
        word,
        item,
        length: word.length,
        isPure: item.isPure,
        part: item.part,
        startChar: word[0],
        endChar,
        outCount: oppCount,
        tier: 3,
        tierName: '🔥 3순위: 거의 한방급 치명타 단어',
        tierBadgeClass: 'tier-3',
        tierIcon: '🔥',
        score,
        counterPlan: counterPlan.slice(0, 5),
        minimax: {
          type: 'NEAR_KILL',
          score,
          brief: `🔥 [거의 한방급 치명타] ${pressureDesc}`,
          rebuttalCount: oppCount,
          samples: oppMoves.slice(0, 6).map(o => o.word),
          counterPlan: counterPlan.slice(0, 5)
        }
      });
      continue;
    }

    // ------------------------------------------------------------------------
    // 🏅 4순위: 안전하게 쓸 수 있는 방어 및 랠리 단어
    // 조건: 상대에게 한방 역공(자살수)을 허용하지 않고 게임을 이어감
    // ------------------------------------------------------------------------
    if (!hasSuicideRisk) {
      let score = 150000 - (oppCount * 40) + qualityScore;
      tier4_safePlay.push({
        word,
        item,
        length: word.length,
        isPure: item.isPure,
        part: item.part,
        startChar: word[0],
        endChar,
        outCount: oppCount,
        tier: 4,
        hasSuicideRisk: false,
        tierName: '🛡️ 4순위: 안전하게 쓸 수 있는 방어 단어',
        tierBadgeClass: 'tier-4',
        tierIcon: '🛡️',
        score,
        counterPlan: [],
        minimax: {
          type: 'SAFE_RALLY',
          score,
          brief: `🛡️ [안전 방어] 상대에게 한방 역공을 원천 차단하고 안정적으로 전세를 이어가는 안전한 정수입니다.`,
          rebuttalCount: oppCount,
          samples: oppMoves.slice(0, 8).map(o => o.word),
          counterPlan: []
        }
      });
    } else {
      // 5순위: 자살수 위험 단어 (모든 단어가 자살수인 최악의 상황일 때만 고려)
      let score = -250000 - (oppKillingMoves.length * 15000) + (oppCount * 20) + qualityScore;
      tier5_desperate.push({
        word,
        item,
        length: word.length,
        isPure: item.isPure,
        part: item.part,
        startChar: word[0],
        endChar,
        outCount: oppCount,
        tier: 5,
        hasSuicideRisk: true,
        tierName: '⚠️ 5순위: 위기 탈출 차선책 단어 (한방 주의)',
        tierBadgeClass: 'tier-5',
        tierIcon: '⚠️',
        score,
        counterPlan: [],
        minimax: {
          type: 'DANGEROUS',
          score,
          brief: `⚠️ 상대방에게 한방 역공(예: 「${oppKillingMoves[0].word}」)을 허용할 위험이 있으나 현재 상황에서 최선의 응수입니다.`,
          rebuttalCount: oppCount,
          samples: oppMoves.slice(0, 8).map(o => o.word),
          counterPlan: []
        }
      });
    }
  }

  // --------------------------------------------------------------------------
  // 🎯 계층적 우선순위 결정: 난이도별 가중치 (쉬움, 중간, 어려움, 헬)
  // --------------------------------------------------------------------------
  const diffRaw = String(options.difficulty || 'hell').toLowerCase();
  let diff = 'hell';
  if (diffRaw === 'easy' || diffRaw === '쉬움') diff = 'easy';
  else if (diffRaw === 'normal' || diffRaw === '중간') diff = 'normal';
  else if (diffRaw === 'hard' || diffRaw === '어려움') diff = 'hard';

  const noFirstTurnKill = !!options.noFirstTurnKill;

  let tierBuckets;
  if (diff === 'easy') {
    // [쉬움]: 플레이어가 편하게 이어갈 수 있도록 안전 수(반격 선택지 많은 단어) 우선 추천! 한방 및 2수 외통수 완전 배제
    tier4_safePlay.sort((a, b) => b.outCount - a.outCount || b.score - a.score);
    tierBuckets = [
      { list: tier4_safePlay, num: 4 },
      { list: tier3_nearKill, num: 3 },
      { list: tier5_desperate, num: 5 },
      { list: tier2_forcedWin, num: 2 },
      { list: tier1_instantKill, num: 1 }
    ];
  } else if (diff === 'normal') {
    // [중간]: 균형 있는 랠리와 안전 수 우선, 1순위 한방은 후순위로 미뤄 흥미진진한 승부 유도
    tier4_safePlay.sort((a, b) => b.score - a.score);
    tierBuckets = [
      { list: tier4_safePlay, num: 4 },
      { list: tier3_nearKill, num: 3 },
      { list: tier2_forcedWin, num: 2 },
      { list: tier5_desperate, num: 5 },
      { list: tier1_instantKill, num: 1 }
    ];
  } else if (diff === 'hard') {
    // [어려움]: 2수 앞 외통수 및 치명타 우선, 강력한 수 구사
    tierBuckets = noFirstTurnKill ? [
      { list: tier4_safePlay, num: 4 },
      { list: tier3_nearKill, num: 3 },
      { list: tier2_forcedWin, num: 2 },
      { list: tier5_desperate, num: 5 },
      { list: tier1_instantKill, num: 1 }
    ] : [
      { list: tier1_instantKill, num: 1 },
      { list: tier2_forcedWin, num: 2 },
      { list: tier3_nearKill, num: 3 },
      { list: tier4_safePlay, num: 4 },
      { list: tier5_desperate, num: 5 }
    ];
  } else {
    // [헬]: 100% 무자비한 최고 지능 Minimax
    // 한방제외(noFirstTurnKill) 모드 시: 한방 단어(반격 0개)를 철저히 배제하고 안전 수와 압박 수로 랠리 형성!
    const nonKillingBuckets = [
      { list: tier4_safePlay, num: 4 },
      { list: tier3_nearKill, num: 3 },
      { list: tier2_forcedWin, num: 2 },
      { list: tier5_desperate, num: 5 }
    ];
    tierBuckets = noFirstTurnKill ? (
      nonKillingBuckets.some(b => b.list.length > 0)
        ? nonKillingBuckets
        : [{ list: tier1_instantKill, num: 1 }]
    ) : [
      { list: tier1_instantKill, num: 1 },
      { list: tier2_forcedWin, num: 2 },
      { list: tier3_nearKill, num: 3 },
      { list: tier4_safePlay, num: 4 },
      { list: tier5_desperate, num: 5 }
    ];
  }

  let best = null;
  let bestDict = null;
  let chosenTierNumber = 1;
  let chosenTierList = [];

  // ⭐ [최적의 단어 및 대안 선별: 네이버 국어사전 실시간 유효 뜻풀이 100% 필수 검증]
  // 뜻이 없거나 사전 미등재, 옛말인 단어는 "없다고 판단하고 나오지 않게 필터링 걸러내기"
  for (const bucket of tierBuckets) {
    if (bucket.list.length === 0) continue;
    bucket.list.sort((a, b) => b.score - a.score || a.length - b.length);

    // 상위 후보 중 실제 네이버 사전 뜻이 확실하게 존재하는 단어를 탐색
    for (const cand of bucket.list.slice(0, 15)) {
      if (ARCHAIC_BLACKLIST.has(cand.word)) continue;

      let dict = naverCache.get(cand.word);
      if (!dict) {
        dict = await queryNaverDictionary(cand.word, 2500);
      }

      // 사전에 실제 뜻이 없거나 옛말이면 필터링 (없다고 판단하여 제외)
      if (!dict || !dict.isVerified || dict.isArchaic) continue;
      if (!dict.meanings || dict.meanings.length === 0 || !isRealMeaning(dict.meanings[0])) continue;

      best = cand;
      bestDict = dict;
      chosenTierNumber = bucket.num;
      chosenTierList = bucket.list;
      break;
    }
    if (best) break;
  }

  // 1순위 후보 티어에서 못 찾았을 경우 전체 리스트에서 유효한 단어 탐색
  if (!best || !bestDict) {
    const allFallbackCandidates = [
      ...tier1_instantKill, ...tier2_forcedWin, ...tier3_nearKill, ...tier4_safePlay, ...tier5_desperate
    ];
    for (const cand of allFallbackCandidates.slice(0, 20)) {
      if (ARCHAIC_BLACKLIST.has(cand.word)) continue;
      let dict = naverCache.get(cand.word);
      if (!dict) {
        dict = await queryNaverDictionary(cand.word, 2500);
      }
      if (!dict || !dict.isVerified || dict.isArchaic) continue;
      if (!dict.meanings || dict.meanings.length === 0 || !isRealMeaning(dict.meanings[0])) continue;

      best = cand;
      bestDict = dict;
      chosenTierNumber = cand.tier || 1;
      chosenTierList = allFallbackCandidates;
      break;
    }
  }

  if (!best || !bestDict) {
    return null;
  }

  // ⭐ 대안 후보군 선별: 상대에게 한방(은그릇 등)을 헌납하는 자살수 단어(hasSuicideRisk)는 100% 영구 배제!
  const candidateTiers = noFirstTurnKill
    ? [...chosenTierList, ...tier4_safePlay, ...tier3_nearKill, ...tier2_forcedWin]
    : [...chosenTierList, ...tier1_instantKill, ...tier2_forcedWin, ...tier3_nearKill, ...tier4_safePlay];
  const allCandidates = candidateTiers.filter(c => c.word !== best.word && (!noFirstTurnKill || c.outCount > 0) && !c.hasSuicideRisk);

  const seenAltWords = new Set([best.word]);
  const uniqueAlternatives = [];
  const altDicts = [];

  for (const alt of allCandidates) {
    if (seenAltWords.has(alt.word)) continue;
    seenAltWords.add(alt.word);

    let dict = naverCache.get(alt.word);
    if (!dict) {
      dict = await queryNaverDictionary(alt.word, 2000);
    }
    // 대안 단어도 실제 뜻풀이가 없으면 없다고 판단하고 걸러냄!
    if (!dict || !dict.isVerified || dict.isArchaic) continue;
    if (!dict.meanings || dict.meanings.length === 0 || !isRealMeaning(dict.meanings[0])) continue;

    uniqueAlternatives.push(alt);
    altDicts.push(dict);
    if (uniqueAlternatives.length >= 3) break;
  }

  const rebuttal = getRebuttalAnalysis(best.endChar, best.counterPlan, usedWords);

  // 4대 선정 근거 브리핑
  let strongestReason = '';
  let optimalReason = '';
  let bestReason = '';
  let supremeReason = '';

  const realMeaningSnippet = bestDict.meanings[0] ? `네이버 국어사전 공식 뜻: "${bestDict.meanings[0]}"` : '네이버 국어사전에 등재된 유효 표준 어휘입니다.';

  if (chosenTierNumber === 1) {
    strongestReason = `끝글자 '${best.endChar}'(으)로 시작하는 한국어 단어가 국어사전에 정확히 0개로 상대방을 즉시 100% 격파합니다.`;
    optimalReason = `불필요한 장기전 없이 단 1수로 승리를 완벽히 확정짓는 최우선 [1순위 즉시 한방]입니다.`;
    bestReason = realMeaningSnippet;
    supremeReason = `${best.length}글자의 완성도 높은 어휘로, 실전에서 즉시 인정받는 최고의 한방 단어입니다.`;
  } else if (chosenTierNumber === 2) {
    const oppSampleStr = best.counterPlan?.slice(0, 3).map(cp => `「${cp.oppWord}」➔「${cp.myCounter}」`).join(', ') || '';
    strongestReason = `상대방의 다음 선택지를 단 ${best.outCount}개로 완전히 포위합니다.`;
    optimalReason = `상대가 어떤 반격을 하든 다음 턴에 100% 한방 단어(${oppSampleStr})로 격파하는 [2순위 2수 앞 필승 외통수]입니다.`;
    bestReason = realMeaningSnippet;
    supremeReason = `상대의 모든 패를 꿰뚫어 보고 다음 턴의 승리를 설계하는 가장 지능적인 수 싸움입니다.`;
  } else if (chosenTierNumber === 3) {
    strongestReason = `상대방이 되받아칠 수 있는 단어가 국어사전 전체에서 단 ${best.outCount}개뿐인 [3순위 거의 한방급] 치명타입니다.`;
    optimalReason = `상대에게 나를 한방으로 보내는 역공 어휘가 전혀 없어 상대방을 완벽히 질식시킵니다.`;
    bestReason = realMeaningSnippet;
    supremeReason = `상대에게 패착이나 타임오버를 강제하여 주도권을 확실하게 쥐어오는 결정구입니다.`;
  } else if (chosenTierNumber === 4) {
    strongestReason = `상대의 한방 역공(자살수)을 원천 차단하고 안정적으로 전세를 이어가는 [4순위 안전 방어]입니다.`;
    optimalReason = `위험한 수를 철저히 회피하면서 다음 기회를 도모하는 가장 현명하고 단단한 수입니다.`;
    bestReason = realMeaningSnippet;
    supremeReason = `${best.length}글자의 직관적이고 품격 있는 어휘로 안전하게 랠리를 장악합니다.`;
  } else {
    strongestReason = `상대의 공격 기회를 최소화하고 위기를 벗어나는 [5순위 차선책 방어]입니다.`;
    optimalReason = `불리한 상황 속에서도 최선의 방어를 펼치며 상대의 실수를 유도합니다.`;
    bestReason = realMeaningSnippet;
    supremeReason = `위기를 넘기고 반격의 기회를 노리는 전략적 수입니다.`;
  }

  return {
    queryChar: inputChar,
    variants,
    ultimateWord: {
      word: best.word,
      length: best.length,
      partOfSpeech: bestDict?.partOfSpeech || best.part,
      endChar: best.endChar,
      outCount: best.outCount,
      tierInfo: {
        tierNumber: chosenTierNumber,
        tierName: best.tierName,
        tierBadgeClass: best.tierBadgeClass,
        tierIcon: best.tierIcon
      },
      minimax: best.minimax,
      rebuttal,
      strongestReason,
      optimalReason,
      bestReason,
      supremeReason,
      naverMeaning: bestDict.meanings[0],
      naverMeanings: bestDict.meanings,
      source: bestDict.source || '네이버 국어사전',
      naverLink: bestDict.link || `https://ko.dict.naver.com/#/search?query=${encodeURIComponent(best.word)}`
    },
    alternatives: uniqueAlternatives.map((alt, idx) => ({
      word: alt.word,
      length: alt.length,
      part: altDicts[idx]?.partOfSpeech || alt.part,
      endChar: alt.endChar,
      outCount: alt.outCount,
      tierName: alt.tierName,
      tierBadgeClass: alt.tierBadgeClass,
      rebuttalSummary: alt.outCount === 0 ? '반격 불가 (0개)' : `반격 ${alt.outCount}개`,
      meaning: altDicts[idx]?.meanings?.[0] || ''
    }))
  };
}

// 6. 자연어 질문 지능형 파서
function parseUserTargetChar(message) {
  if (!message || typeof message !== 'string') return '';
  const trimmed = message.trim();

  // 1) 따옴표로 묶인 단어/음절: '슨', "해", '해질녘', '나트륨'
  const quoteMatch = trimmed.match(/['"‘“]([가-힣]+)['"’”]/);
  if (quoteMatch) {
    const q = quoteMatch[1];
    return q.length === 1 ? q : q[q.length - 1];
  }

  // 2) 질문성 조사 및 보조 어휘 먼저 정규화 제거
  const normalized = trimmed
    .replace(/(?:끝말잇기|첫\s*턴|첫\s*글자|최적수|브리핑|알려달라고\s*했는데|알려달라|알려달라고|알려줘|추천해줘|추천|말해줘|어때|다음\s*단어|다음|시작하는\s*단어|시작하는|시작|단어|글자|뭐있어|뭐야|가르쳐줘|가르쳐|해줘|알려|있어|받아칠|받아치는|받아치기|어떻게\s*받아쳐|어떻게\s*해|어떻게\s*이어|이어갈|이을|대응할|공격할|방어할)/g, ' ')
    .trim();

  // 3) 남은 토큰들 중 가장 핵심이 되는 한글 단어 추출
  let tokens = normalized.match(/[가-힣]+/g) || [];
  if (tokens.length > 0) {
    let firstToken = tokens[0];
    // 조사(으로/로/은/는/이/가/을/를/와/과/도) 제거
    const stripped = firstToken.replace(/(?:으로|로|은|는|이|가|을|를|와|과|도)$/, '');
    if (stripped) firstToken = stripped;
    return firstToken.length === 1 ? firstToken : firstToken[firstToken.length - 1];
  }

  return '';
}

// 7. AI브리핑 & 전략 참모 (1순위 한방 -> 2순위 외통수 -> 3순위 안전수 -> 4순위 차선책 및 흐름 모드)
async function generateAiChatResponse(message, history = [], options = {}) {
  const trimmed = message.trim();
  const flowMode = !!options.flowMode;
  const opponentWordMode = options.opponentWordMode !== false; // 기본값: 상대방 단어 적기 모드 ON
  const briefedWords = Array.isArray(options.briefedWords) ? options.briefedWords : [];
  const usedWords = flowMode && briefedWords.length > 0 ? new Set(briefedWords) : new Set();
  const noFirstTurnKill = options.noFirstTurnKill !== undefined ? !!options.noFirstTurnKill : true;

  if (trimmed.includes('안녕') || trimmed.includes('반가워')) {
    return {
      text: `안녕하세요! ⚡ **끝말잇기 AI브리핑**입니다.\n\n네이버 국어사전 전수 어휘를 바탕으로 **4단계 지능 의사결정**을 제공합니다:\n\n1. 💥 **1순위 (한방 단어 위주)**: 상대 반격 0개로 즉시 승리하는 필승 단어\n2. ⚔️ **2순위 (되받아칠 단어 거의 없는 단어)**: 상대 반격 1~3개뿐인 치명타/외통수\n3. 🛡️ **3순위 (한방에 당하지 않는 단어)**: 상대 한방을 완벽히 피하는 안전 수\n4. ⚠️ **4순위 (할 수라도 있는 단어)**: 자살수를 감수하고 이어가는 차선책\n\n📝 **상대방 단어 적기 모드 안내**:\n• **앞글자만(1자) 입력** (예: *'기'*): **[내 턴]** 최적의 필승 수 즉시 추천!\n• **풀네임(2자 이상) 입력** (예: *'비행기'*): **[상대 턴]**으로 자동 인식하여 상대 단어 검증 및 카운터 반격 수 브리핑!\n\n지금 바로 앞글자나 단어를 입력해보세요!`
    };
  }

  if (trimmed.includes('두음') || trimmed.includes('두음법칙')) {
    return {
      text: `📖 **국립국어원 표준 두음법칙 안내 (제10항·제11항 정방향만 적용)**:\n\n1. **ㄴ 두음법칙 (제10항)**: '냐, 녀, 녜, 뇨, 뉴, 니' → **'야, 여, 예, 요, 유, 이'** (초성 ㄴ → ㅇ)\n   * 역방향(니 → 리: '리튬' 등)은 엄격히 차단됩니다!\n2. **ㄹ 두음법칙 (제11항)**:\n   - '랴, 려, 례, 료, 류, 리' → **'야, 여, 예, 요, 유, 이'** (초성 ㄹ → ㅇ)\n   - '라, 로, 루, 르, 래, 뢰...' → **'나, 노, 누, 느, 내, 뇌...'** (초성 ㄹ → ㄴ)\n\n알고리즘이 정방향 두음법칙을 완벽 계산하여 최적의 단어를 찾아냅니다!`
    };
  }

  // ⭐ 질문성 자연어 문장 여부 감지 (질문 문장은 단어 자동 인식에서 제외하고 자연어 질의로 처리)
  const isQuestionSentence = /(?:알려줘|알려달라|알려|추천|어때|뭐있어|뭐야|가르쳐|해줘|이어|받아|단어|글자|첫\s*턴|첫턴|뜻|검색)/.test(trimmed);

  let cleanText = trimmed;
  let forceOpponentTurn = false;
  let forceMyTurn = false;

  if (cleanText.startsWith('상대턴') || cleanText.startsWith('상대방') || cleanText.startsWith('상대')) {
    forceOpponentTurn = true;
    cleanText = cleanText.replace(/^(?:상대턴|상대방|상대)\s*/, '');
  } else if (cleanText.startsWith('내턴') || cleanText.startsWith('내 턴') || cleanText.startsWith('나의턴') || cleanText.startsWith('내 차례')) {
    forceMyTurn = true;
    cleanText = cleanText.replace(/^(?:내턴|내\s*턴|나의턴|내\s*차례)\s*/, '');
  }

  // ⭐ 띄어쓰기(공백) 검증 (단, 질문 문장은 허용)
  if (/\s/.test(cleanText) && !isQuestionSentence) {
    return {
      text: `⚠️ **[끝말잇기 룰 안내]**\n\n입력하신 **「${trimmed}」**에는 띄어쓰기(공백)가 포함되어 있습니다.\n\n끝말잇기 공식 규칙상 **띄어쓰기가 없는 한 단어(단일어 또는 합성명사)**만 유효하므로 게임에서 인정되지 않습니다.`
    };
  }

  const pureKorean = cleanText.replace(/[^가-힣]/g, '');

  // --------------------------------------------------------------------------
  // 🎯 [상대방 단어 적기 모드] 앞글자만 입력 -> [내 턴], 풀네임 입력 -> [상대 턴] 자동인식
  // --------------------------------------------------------------------------
  if (opponentWordMode && !isQuestionSentence && pureKorean.length > 0) {
    const oppStartCharParam = options.opponentStartChar ? String(options.opponentStartChar).trim() : null;

    // 1) 앞글자만 입력 (1글자) 또는 명시적 내턴: [내 턴] 자동인식!
    if (pureKorean.length === 1 || forceMyTurn) {
      const myStartChar = pureKorean.length === 1 ? pureKorean : (pureKorean[0] || '기');
      // ⭐ 한방제외 모드 토글 스위치 설정값 그대로 100% 적용! (텍스트 검사 일체 배제)
      const isFirstTurnIntent = !!noFirstTurnKill;
      const analysis = await findUltimateBestWord(myStartChar, {
        usedWords,
        difficulty: 'hell', // ⭐ AI브리핑은 배틀 난이도(쉬움 등)와 무관하게 언제나 최고 지능(hell) 고정!
        noFirstTurnKill: isFirstTurnIntent
      });

      if (!analysis || !analysis.ultimateWord) {
        return {
          text: `🤔 아쉽게도 현재 국어사전에서 '${myStartChar}'(으)로 시작하는 유효한 단어를 찾을 수 없습니다. (사전에 없는 음절이거나 끝말잇기 한방 글자일 가능성이 높습니다)`,
          opponentWordMode: true
        };
      }

      const ultimate = analysis.ultimateWord;
      const tierNum = ultimate.tierInfo?.tierNumber || 1;

      let speech = '';
      if (ultimate.word === '윰라대왕' || myStartChar === '륨' || myStartChar === '늄' || myStartChar === '윰') {
        speech = `🛡️ **'${myStartChar}'**(은)는 두음법칙(한글 맞춤법 제10항·제11항)에 따라 **'윰'**으로 변환하여 이어갈 수 있습니다!\n\n` +
                 `국어사전 전체에서 '윰'으로 시작하는 단어는 네이버 국어사전 공인 표제어인 **「${ultimate.word}」**(강원 방언) 단 1개만 존재합니다!\n\n` +
                 `상대방의 '나트륨'이나 '알루미늄' 공격을 무력화하고 주도권을 가져오는 **유일무이한 회심의 방어 카드**입니다!\n\n` +
                 `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
      } else if (isFirstTurnIntent && ultimate.outCount > 0) {
        speech = `🛡️ **'${myStartChar}'**(으)로 이어질 **[한방제외 모드 추천 단어]**는 바로 **「${ultimate.word}」**입니다!\n\n` +
                 `한방제외 룰에 따라 즉시 끝나는 한방 단어를 쓰지 않고, 상대에게 한방 역공을 허용하지 않으면서 주도권을 확고히 잡는 최적의 단어입니다!\n\n` +
                 `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
      } else if (tierNum === 1) {
        speech = `💥 **'${myStartChar}'**(으)로 시작할 **[1순위: 즉시 승리 한방 단어]**는 단연 **「${ultimate.word}」**입니다!\n\n` +
                 `끝글자 **'${ultimate.endChar}'**(으)로 시작하는 단어가 국어사전에 **정확히 0개**이므로, 내가 이 단어를 내는 순간 상대방은 어떠한 반격도 하지 못하고 **즉시 100% 승리(한방)**합니다!\n\n` +
                 `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
      } else if (tierNum === 2) {
        speech = `⚔️ **'${myStartChar}'**(으)로 시작할 **[2순위: 2수 앞 필승 외통수 단어]**는 바로 **「${ultimate.word}」**입니다!\n\n` +
                 `상대방의 다음 선택지가 국어사전 전체에서 단 **${ultimate.outCount}개**(${ultimate.minimax.samples.slice(0, 3).join(', ')})뿐이며, 다음 턴 100% 한방으로 격파하는 **필승 2수 앞 덫**입니다!\n\n` +
                 `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
      } else if (tierNum === 3) {
        speech = `🔥 **'${myStartChar}'**(으)로 시작할 **[3순위: 반격 봉쇄 치명타 단어]**는 바로 **「${ultimate.word}」**입니다!\n\n` +
                 `상대방의 다음 선택지가 국어사전 전체에서 단 **${ultimate.outCount}개**(${ultimate.minimax.samples.slice(0, 3).join(', ')})뿐인 치명적 포위망으로 상대의 반격을 원천 봉쇄합니다!\n\n` +
                 `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
      } else if (tierNum === 4) {
        speech = `🛡️ **'${myStartChar}'**(으)로 시작할 **[4순위: 한방단어에 당하지 않는 안전 단어]**로 **「${ultimate.word}」**을(를) 추천합니다!\n\n` +
                 `상대의 한방 역공(자살수)을 원천 차단하면서 안정적으로 주도권을 쥐고 랠리를 이어가는 최선의 안전 수입니다.\n\n` +
                 `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
      } else {
        speech = `⚠️ **'${myStartChar}'**(으)로 시작할 **[5순위: 위기 탈출 차선책 단어]**로 **「${ultimate.word}」**을(를) 추천합니다!\n\n` +
                 `상대의 역공 위험이 다소 있으나 현재 상황에서 최선의 응수로 위기를 넘기는 수입니다.\n\n` +
                 `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
      }

      const isDirectWin = ultimate.outCount === 0;
      const nextPrompt = isDirectWin
        ? `\n\n👑 **[필승 완승 경고]** 내가 낸 **「${ultimate.word}」**의 끝글자 **'${ultimate.endChar}'**(으)로 상대가 낼 수 있는 단어가 국어사전에 **전무(0개)**하여 게임이 즉시 승리로 끝납니다!`
        : `\n\n👉 내가 **「${ultimate.word}」**(으)로 공격했습니다!\n상대방이 다음 끝글자 **'${ultimate.endChar}'**(으)로 어떤 단어로 받아쳤나요? 상대방이 낸 단어를 풀네임으로 입력해주세요!`;

      const fullText = `🎯 **[내 턴: 시작 글자 '${myStartChar}']**\n\n` +
                       `내가 둘 차례입니다! 시작 글자 **'${myStartChar}'**(으)로 상대방을 압도할 **최적의 필승 수**를 브리핑합니다:\n\n` +
                       speech +
                       nextPrompt;

      const newBriefed = flowMode ? [...briefedWords, ultimate.word] : [...briefedWords];

      return {
        text: fullText,
        analysis,
        hasUltimateCard: true,
        turnType: 'myTurn',
        briefedWord: ultimate.word,
        briefedWords: newBriefed,
        tierNumber: tierNum,
        flowMode,
        opponentWordMode: true,
        isAwaitingOpponentWord: !isDirectWin,
        opponentStartChar: ultimate.endChar,
        nextTargetChar: ultimate.endChar
      };
    }

    // 2) 풀네임 단어 입력 (2글자 이상): [상대 턴] 자동인식!
    if (pureKorean.length >= 2 || forceOpponentTurn) {
      const opponentWord = pureKorean;

      // 상대방 단어 네이버 국어사전 정밀 검증 (네이버 사전에 있는 단어는 옛말이라도 전수 100% 인정!)
      const oppDict = await queryNaverDictionary(opponentWord);
      if (!oppDict || !oppDict.isVerified) {
        if (oppDict && oppDict.isSpacedWord) {
          return {
            text: `⚠️ **[끝말잇기 룰 안내]**\n\n상대방이 낸 **「${opponentWord}」**은(는) 국어사전에 **‘${oppDict.spacedEntry || opponentWord}’**(으)로 띄어쓰기가 포함되어 등재된 구/복합표현입니다.\n\n끝말잇기 공식 규칙상 **띄어쓰기가 없는 한 단어**만 인정되므로 상대방이 낸 올바른 단어를 다시 입력해주세요!`,
            flowMode,
            opponentWordMode: true,
            isAwaitingOpponentWord: true,
            opponentStartChar: oppStartCharParam || opponentWord[0]
          };
        }
        return {
          text: `🤔 **「${opponentWord}」**은(는) 네이버 국어사전에 등재되지 않은 단어입니다.\n\n상대방이 낸 올바른 표준 단어를 다시 입력해주세요!`,
          flowMode,
          opponentWordMode: true,
          isAwaitingOpponentWord: true,
          opponentStartChar: oppStartCharParam || opponentWord[0]
        };
      }

      // 사용자가 방금 AI가 추천해준 본인의 공격 단어를 그대로 다시 입력한 경우 친절히 안내
      if (briefedWords.length > 0 && opponentWord === briefedWords[briefedWords.length - 1]) {
        const lastChar = opponentWord[opponentWord.length - 1];
        return {
          text: `💡 **「${opponentWord}」**은(는) 방금 내가 공격한 단어입니다!\n\n상대방이 끝글자 **'${lastChar}'**(으)로 어떤 단어로 받아쳤는지, **상대방이 낸 단어**를 풀네임으로 입력해주세요! (예: '${lastChar}'(으)로 시작하는 상대방 단어)`,
          flowMode,
          opponentWordMode: true,
          isAwaitingOpponentWord: true,
          opponentStartChar: lastChar
        };
      }

      // 이미 사용된 단어인지 확인 (흐름 모드 ON 시)
      if (flowMode && usedWords.has(opponentWord)) {
        return {
          text: `⚠️ **[중복 단어 경고]**\n\n**「${opponentWord}」**은(는) 이번 대결 흐름에서 이미 사용된 단어입니다.\n\n상대방이 낸 다른 단어를 입력해주세요!`,
          flowMode,
          opponentWordMode: true,
          isAwaitingOpponentWord: true,
          opponentStartChar: oppStartCharParam || opponentWord[0]
        };
      }

      // 직전 턴 제시어와 다른 경우 부드러운 안내
      let startCharNotice = '';
      if (oppStartCharParam) {
        const allowedStarts = getDueumVariants(oppStartCharParam);
        if (!allowedStarts.includes(opponentWord[0])) {
          const dueumNote = allowedStarts.length > 1 ? ` (두음법칙 허용: '${allowedStarts.join("', '")}')` : '';
          startCharNotice = `*(참고: 직전 차례 제시어 '${oppStartCharParam}'${dueumNote} 대신 새로운 단어 「${opponentWord}」 접수)*\n\n`;
        }
      }

      // 상대방 단어의 끝글자로 내가 반격할 최적의 수 탐색!
      const oppEndChar = opponentWord[opponentWord.length - 1];
      const newUsedWords = new Set([...usedWords, opponentWord]);
      const analysis = await findUltimateBestWord(oppEndChar, {
        usedWords: newUsedWords,
        difficulty: 'hell', // ⭐ AI브리핑은 배틀 난이도와 무관하게 언제나 최고 지능(hell) 고정!
        noFirstTurnKill: false
      });

      if (!analysis || !analysis.ultimateWord) {
        return {
          text: `${startCharNotice}🎉 **[플레이어 완승!]**\n\n상대방이 **「${opponentWord}」**(으)로 냈으나, 끝글자 **'${oppEndChar}'**(으)로 시작하는 단어가 국어사전에 더 이상 없습니다!\n\n상대방이 치명적인 자살수를 두었으므로 플레이어의 승리입니다!`,
          opponentWord,
          turnType: 'opponentTurn',
          briefedWords: flowMode ? [...briefedWords, opponentWord] : [...briefedWords],
          flowMode,
          opponentWordMode: true,
          isAwaitingOpponentWord: false,
          opponentStartChar: null
        };
      }

      const ultimate = analysis.ultimateWord;
      const tierNum = ultimate.tierInfo?.tierNumber || 1;

      let speech = '';
      if (ultimate.word === '윰라대왕' || oppEndChar === '륨' || oppEndChar === '늄' || oppEndChar === '윰') {
        speech = `🛡️ **'${oppEndChar}'**(은)는 두음법칙(한글 맞춤법 제10항·제11항)에 따라 **'윰'**으로 변환하여 이어갈 수 있습니다!\n\n` +
                 `국어사전 전체에서 '윰'으로 시작하는 단어는 네이버 국어사전 공인 표제어인 **「${ultimate.word}」**(강원 방언) 단 1개만 존재합니다!\n\n` +
                 `상대방의 '나트륨'이나 '알루미늄' 공격을 무력화하고 주도권을 가져오는 **유일무이한 회심의 방어 카드**입니다!\n\n` +
                 `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
      } else if (tierNum === 1) {
        speech = `💥 **'${oppEndChar}'**(으)로 이어질 **[1순위: 즉시 승리 한방 단어]**는 단연 **「${ultimate.word}」**입니다!\n\n` +
                 `끝글자 **'${ultimate.endChar}'**(으)로 시작하는 단어가 국어사전에 **정확히 0개**이므로, 내가 이 단어를 내는 순간 상대방은 어떠한 반격도 하지 못하고 **즉시 100% 승리(한방)**합니다!\n\n` +
                 `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
      } else if (tierNum === 2) {
        speech = `⚔️ **'${oppEndChar}'**(으)로 이어질 **[2순위: 2수 앞 필승 외통수 단어]**는 바로 **「${ultimate.word}」**입니다!\n\n` +
                 `상대방의 다음 선택지가 국어사전 전체에서 단 **${ultimate.outCount}개**(${ultimate.minimax.samples.slice(0, 3).join(', ')})뿐이며, 다음 턴 100% 한방으로 격파하는 **필승 2수 앞 덫**입니다!\n\n` +
                 `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
      } else if (tierNum === 3) {
        speech = `🔥 **'${oppEndChar}'**(으)로 이어질 **[3순위: 반격 봉쇄 치명타 단어]**는 바로 **「${ultimate.word}」**입니다!\n\n` +
                 `상대방의 다음 선택지가 국어사전 전체에서 단 **${ultimate.outCount}개**(${ultimate.minimax.samples.slice(0, 3).join(', ')})뿐인 치명적 포위망으로 상대의 반격을 원천 봉쇄합니다!\n\n` +
                 `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
      } else if (tierNum === 4) {
        speech = `🛡️ **'${oppEndChar}'**(으)로 이어질 **[4순위: 한방단어에 당하지 않는 안전 단어]**로 **「${ultimate.word}」**을(를) 추천합니다!\n\n` +
                 `상대의 한방 역공(자살수)을 원천 차단하면서 안정적으로 주도권을 쥐고 랠리를 이어가는 최선의 안전 수입니다.\n\n` +
                 `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
      } else {
        speech = `⚠️ **'${oppEndChar}'**(으)로 이어갈 **[5순위: 위기 탈출 차선책 단어]**로 **「${ultimate.word}」**을(를) 추천합니다!\n\n` +
                 `상대의 역공 위험이 다소 있으나 현재 상황에서 최선의 응수로 위기를 넘기는 수입니다.\n\n` +
                 `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
      }

      const isDirectWin = ultimate.outCount === 0;
      const nextPrompt = isDirectWin
        ? `\n\n👑 **[필승 완승 경고]** 내가 반격한 **「${ultimate.word}」**의 끝글자 **'${ultimate.endChar}'**(으)로 상대가 낼 수 있는 단어가 국어사전에 **전무(0개)**하여 상대방은 100% 패배합니다!`
        : `\n\n👉 내가 **「${ultimate.word}」**(으)로 반격했습니다!\n상대방이 다음 끝글자 **'${ultimate.endChar}'**(으)로 어떤 단어로 받아쳤나요? 상대방의 다음 단어를 풀네임으로 입력해주세요!`;

      const fullText = `${startCharNotice}⚔️ **[상대방 턴: 「${opponentWord}」 접수 ➔ 반격 제시어: '${oppEndChar}']**\n\n` +
                       `상대방이 **「${opponentWord}」**(으)로 공격해 왔습니다!\n` +
                       `상대방을 격파할 **최적의 필승 반격 수**를 브리핑합니다:\n\n` +
                       speech +
                       nextPrompt;

      const newBriefed = flowMode ? [...briefedWords, opponentWord, ultimate.word] : [...briefedWords];

      return {
        text: fullText,
        analysis,
        hasUltimateCard: true,
        turnType: 'opponentTurn',
        briefedWord: ultimate.word,
        opponentWord: opponentWord,
        briefedWords: newBriefed,
        tierNumber: tierNum,
        flowMode,
        opponentWordMode: true,
        isAwaitingOpponentWord: !isDirectWin,
        opponentStartChar: ultimate.endChar,
        nextTargetChar: ultimate.endChar
      };
    }
  }

  // ⭐ 사용자가 특정 글자 없이 "첫 턴 추천 단어 알려줘" 같은 일반적 첫 턴 질문을 한 경우
  const isGeneralFirstTurnQuery = /(?:첫\s*턴|첫턴|시작\s*단어|시작할\s*단어)/.test(trimmed);
  const targetChar = parseUserTargetChar(trimmed);

  if (isGeneralFirstTurnQuery && !targetChar) {
    if (noFirstTurnKill) {
      return {
        text: `🛡️ **[첫 턴 한방제외 모드 추천 전략]**\n\n` +
              `첫 번째 턴에는 즉시 한방 단어를 사용하지 않고, 랠리를 안정적으로 이어가며 주도권을 장악하는 단어가 가장 좋습니다!\n\n` +
              `✨ **추천 1위**: **「기러기」** (끝글자 '기' ➔ 상대 반격 시 다음 턴 '기쁨' 등 1순위 한방 역공 덫!)\n` +
              `✨ **추천 2위**: **「대한민국」** (공인 4음절 표제어 ➔ 끝글자 '국'으로 이어지며 안전한 랠리 형성)\n` +
              `✨ **추천 3위**: **「구름」** (끝글자 '름' ➔ 정방향 두음법칙 '음'으로 유도하여 상대 압박)\n\n` +
              `특정 시작 글자(예: *'기'*, *'하'*, *'마'* 등)로 시작하고 싶으시다면 해당 글자를 입력해주세요!`,
        flowMode,
        opponentWordMode: false,
        hasUltimateCard: false
      };
    } else {
      return {
        text: `💥 **[첫 턴 즉시 승리 한방 단어]**\n\n` +
              `첫 번째 턴 한방 허용 룰에서는 단 1수로 상대방의 반격을 0개로 만들어 즉시 승리하는 단어가 최고입니다!\n\n` +
              `💀 **1순위**: **「산기슭」** (끝글자 '슭'으로 시작하는 단어 사전에 **0개** ➔ 즉시 승리!)\n` +
              `💀 **2순위**: **「새벽녘」** (끝글자 '녘'으로 시작하는 단어 사전에 **0개** ➔ 즉시 승리!)\n` +
              `💀 **3순위**: **「기쁨」** (끝글자 '쁨'으로 시작하는 단어 사전에 **0개** ➔ 즉시 승리!)\n\n` +
              `특정 시작 글자(예: *'기'*, *'사'*, *'새'* 등)의 한방 단어가 궁금하시면 글자를 입력해주세요!`,
        flowMode,
        opponentWordMode: false,
        hasUltimateCard: false
      };
    }
  }

  // ⭐ 단어 자체의 뜻/사전 검증 직접 질의 처리 (예: "비행기 뜻", "산기슭 사전검색")
  const isDictLookupQuery = /(?:뜻|사전|검색|유효|의미)/.test(trimmed);
  const lookupWord = cleanText.replace(/(?:뜻|사전|검색|유효|의미|알려줘|알려|말해줘|말해|뭐야|뭐임|이란|\s)+/g, '').replace(/[^가-힣]/g, '');
  if (isDictLookupQuery && lookupWord.length >= 2) {
    const dict = await queryNaverDictionary(lookupWord);
    if (dict && dict.isVerified && !dict.isArchaic) {
      const endC = lookupWord[lookupWord.length - 1];
      const reb = getRebuttalAnalysis(endC);
      const isKill = reb.totalCount === 0;
      return {
        text: `📚 **[단어 사전 정보: 「${lookupWord}」]**\n\n` +
              `• **품사**: ${dict.partOfSpeech || '명사'}\n` +
              `• **출처**: ${dict.source || '네이버 국어사전'}\n` +
              `• **사전 뜻**: ${dict.meanings?.[0] || '네이버 국어사전 실시간 표준 뜻풀이'}\n` +
              `• **끝말잇기 판정**: ${isKill ? '💥 **즉시 승리 한방 단어** (상대 반격 0개)' : `🛡️ **유효 단어** (상대 반격 어휘 ${reb.totalCount}개)`}\n\n` +
              `🔗 [네이버 국어사전 원문 보기](${dict.link || `https://ko.dict.naver.com/#/search?query=${encodeURIComponent(lookupWord)}`})`,
        flowMode,
        opponentWordMode: false,
        hasUltimateCard: false
      };
    }
  }

  if (targetChar) {
    // ⭐ 한방제외 모드 토글 스위치 설정값 그대로 100% 적용! (텍스트 검사 일체 배제)
    const isFirstTurnIntent = !!options.noFirstTurnKill;
    const analysis = await findUltimateBestWord(targetChar, { 
      usedWords, 
      difficulty: 'hell', // ⭐ AI브리핑은 배틀 난이도와 무관하게 언제나 최고 지능(hell) 고정!
      noFirstTurnKill: isFirstTurnIntent
    });

    if (!analysis || !analysis.ultimateWord) {
      const pureWord = trimmed.replace(/[^가-힣]/g, '');
      if (pureWord.length >= 2) {
        const selfDict = await queryNaverDictionary(pureWord);
        // 네이버 사전에 등재된 단어는 옛말/방언 포함 100% 인정
        if (selfDict && selfDict.isSpacedWord) {
          return {
            text: `⚠️ **[끝말잇기 룰 안내]**\n\n**「${pureWord}」**은(는) 국어사전에 **‘${selfDict.spacedEntry || pureWord}’**(으)로 띄어쓰기가 포함되어 등재된 구/복합표현입니다.\n\n끝말잇기 공식 규칙상 **띄어쓰기가 들어간 말(구, 관용구, 복합표현)은 단어가 아니므로 인정되지 않습니다.** 반드시 붙여 쓰는 한 단어만 사용해 주세요!`
          };
        }

        if (selfDict && selfDict.isVerified && selfDict.meanings && selfDict.meanings.length > 0) {
          const directEndChar = pureWord[pureWord.length - 1];
          const directRebuttal = getRebuttalAnalysis(directEndChar);
          const isDirectKilling = directRebuttal.totalCount === 0;

          return {
            text: `👑 **「${pureWord}」**은(는) 네이버 국어사전에 공인 등재된 **${isDirectKilling ? '절대 승리 한방 단어' : '공인 유효 표제어'}**입니다!\n\n` +
                  (isDirectKilling
                    ? `끝글자 **'${directEndChar}'**(으)로 시작하는 단어가 국어사전에 **정확히 0개**이므로, 실전 끝말잇기 배틀에서 이 단어를 내는 순간 상대방은 어떠한 반격도 하지 못하고 즉시 패배합니다!\n\n`
                    : `끝글자 **'${directEndChar}'**(으)로 상대방이 반격 가능한 단어가 사전에 ${directRebuttal.totalCount}개 존재합니다.\n\n`) +
                  `📚 **공인 사전 공식 뜻**: ${selfDict.meanings[0]} (${selfDict.source})`,
            hasUltimateCard: true,
            briefedWord: pureWord,
            briefedWords: flowMode ? [...briefedWords, pureWord] : [],
            tierNumber: isDirectKilling ? 1 : 3,
            flowMode,
            analysis: {
              targetChar: pureWord[0],
              ultimateWord: {
                word: pureWord,
                endChar: directEndChar,
                naverMeaning: selfDict.meanings[0],
                source: selfDict.source,
                outCount: directRebuttal.totalCount,
                tierInfo: {
                  tierNumber: isDirectKilling ? 1 : 3,
                  name: isDirectKilling ? '1순위 한방 단어' : '공인 등재 단어',
                  desc: isDirectKilling ? '상대 반격 0개 절대 필승' : '네이버 국어사전 등재 어휘'
                },
                minimax: {
                  samples: directRebuttal.samples || []
                }
              }
            }
          };
        }
      }

      return {
        text: `🤔 아쉽게도 현재 국어사전에서 '${targetChar}'(으)로 시작하는 유효한 단어를 찾을 수 없습니다. (사전에 없는 음절이거나 끝말잇기 한방 글자일 가능성이 높습니다)`,
        flowMode
      };
    }

    const ultimate = analysis.ultimateWord;
    const tierNum = ultimate.tierInfo?.tierNumber || 1;

    let speech = '';
    // ⭐ '륨'/'늄'/'윰' 특수 브리핑: 윰라대왕 안내
    if (ultimate.word === '윰라대왕' || targetChar === '륨' || targetChar === '늄' || targetChar === '윰') {
      speech = `🛡️ **'${targetChar}'**(은)는 두음법칙(한글 맞춤법 제10항·제11항)에 따라 **'윰'**으로 변환하여 이어갈 수 있습니다!\n\n` +
               `국어사전 전체에서 '윰'으로 시작하는 단어는 네이버 국어사전 공인 표제어인 **「${ultimate.word}」**(강원 방언) 단 1개만 존재합니다!\n\n` +
               `상대방의 '나트륨'이나 '알루미늄' 공격을 무력화하고 랠리를 이어가는 **유일무이한 회심의 방어 카드**입니다!\n\n` +
               `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
    } else if (isFirstTurnIntent && ultimate.outCount > 0) {
      speech = `🛡️ **'${targetChar}'**(으)로 이어질 **[한방제외 모드 추천 단어]**는 바로 **「${ultimate.word}」**입니다!\n\n` +
               `한방제외 룰에 따라 즉시 끝나는 한방 단어를 쓰지 않고, 상대에게 한방 역공을 허용하지 않으면서 주도권을 확고히 잡는 최적의 단어입니다!\n\n` +
               `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
    } else if (tierNum === 1) {
      speech = `💥 **'${targetChar}'**(으)로 이어질 **[1순위: 즉시 승리 한방 단어]**는 단연 **「${ultimate.word}」**입니다!\n\n` +
               `끝글자 **'${ultimate.endChar}'**(으)로 시작하는 단어가 국어사전에 **정확히 0개**이므로, 상대방은 어떤 반격도 하지 못하고 **단 1수로 즉시 100% 승리(한방)**합니다!\n\n` +
               `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
    } else if (tierNum === 2) {
      speech = `⚔️ **'${targetChar}'**(으)로 이어질 **[2순위: 2수 앞 필승 외통수 단어]**는 바로 **「${ultimate.word}」**입니다!\n\n` +
               `1순위 즉시 한방 단어가 없어 선택했습니다. 상대방의 다음 선택지가 국어사전 전체에서 단 **${ultimate.outCount}개**(${ultimate.minimax.samples.slice(0, 3).join(', ')})뿐이며, 다음 턴 100% 한방으로 격파하는 **필승 2수 앞 덫**입니다!\n\n` +
               `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
    } else if (tierNum === 3) {
      speech = `🔥 **'${targetChar}'**(으)로 이어질 **[3순위: 반격 봉쇄 치명타 단어]**는 바로 **「${ultimate.word}」**입니다!\n\n` +
               `상대방의 다음 선택지가 국어사전 전체에서 단 **${ultimate.outCount}개**(${ultimate.minimax.samples.slice(0, 3).join(', ')})뿐인 치명적 포위망으로 상대의 숨통을 조입니다!\n\n` +
               `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
    } else if (tierNum === 4) {
      speech = `🛡️ **'${targetChar}'**(으)로 이어질 **[4순위: 한방단어에 당하지 않는 안전 단어]**로 **「${ultimate.word}」**을(를) 추천합니다!\n\n` +
               `상대의 한방 역공(자살수)을 원천 차단하면서 안정적으로 주도권을 쥐고 랠리를 이어가는 최선의 안전 수입니다.\n\n` +
               `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
    } else {
      speech = `⚠️ **'${targetChar}'**(으)로 이어갈 **[5순위: 위기 탈출 차선책 단어]**로 **「${ultimate.word}」**을(를) 추천합니다!\n\n` +
               `상대의 역공 위험이 다소 있으나 현재 상황에서 최선의 응수로 위기를 넘기는 수입니다.\n\n` +
               `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
    }

    if (pureKorean.length >= 2) {
      speech = `🎯 단어 **「${pureKorean}」**의 끝글자 **'${targetChar}'**(으)로 이어갈 최적의 수입니다:\n\n` + speech;
    }

    return {
      text: speech,
      analysis,
      hasUltimateCard: true,
      briefedWord: ultimate.word,
      briefedWords: flowMode ? [...briefedWords, ultimate.word] : [],
      tierNumber: tierNum,
      flowMode
    };
  }

  if (trimmed.includes('안녕') || trimmed.includes('반가워')) {
    return {
      text: `안녕하세요! ⚡ **끝말잇기 AI브리핑**입니다.\n\n네이버 국어사전 전수 어휘를 바탕으로 **4단계 지능 의사결정**을 제공합니다:\n\n1. 💥 **1순위 (한방 단어 위주)**: 상대 반격 0개로 즉시 승리하는 필승 단어\n2. ⚔️ **2순위 (되받아칠 단어 거의 없는 단어)**: 상대 반격 1~3개뿐인 치명타/외통수\n3. 🛡️ **3순위 (한방에 당하지 않는 단어)**: 상대 한방을 완벽히 피하는 안전 수\n4. ⚠️ **4순위 (할 수라도 있는 단어)**: 자살수를 감수하고 이어가는 차선책\n\n🌊 **흐름 모드**를 켜시면 한 번 알려준 단어는 중복 추천되지 않습니다!\n지금 바로 앞글자(예: *'기'*, *'산기슭'*)를 입력해보세요!`
    };
  }

  if (trimmed.includes('두음') || trimmed.includes('두음법칙')) {
    return {
      text: `📖 **국립국어원 표준 두음법칙 안내 (제10항·제11항 정방향만 적용)**:\n\n1. **ㄴ 두음법칙 (제10항)**: '냐, 녀, 녜, 뇨, 뉴, 니' → **'야, 여, 예, 요, 유, 이'** (초성 ㄴ → ㅇ)\n   * 역방향(니 → 리: '리튬' 등)은 엄격히 차단됩니다!\n2. **ㄹ 두음법칙 (제11항)**:\n   - '랴, 려, 례, 료, 류, 리' → **'야, 여, 예, 요, 유, 이'** (초성 ㄹ → ㅇ)\n   - '라, 로, 루, 르, 래, 뢰...' → **'나, 노, 누, 느, 내, 뇌...'** (초성 ㄹ → ㄴ)\n\n알고리즘이 정방향 두음법칙을 완벽 계산하여 최적의 단어를 찾아냅니다!`
    };
  }

  return {
    text: `어떤 글자로 이어갈지 고민되시나요? 🤔\n\n원하시는 **앞글자**(예: *'기'*, *'나'*, *'스'*)나 **상대방이 낸 단어**를 입력해주시면,\n\n**[1순위 한방 단어 ➔ 2순위 되받아칠 단어 거의 없는 단어 ➔ 3순위 한방 피하는 단어 ➔ 4순위 할수라도 있는 단어]** 순서로 계산된 최적의 수를 브리핑해 드립니다!`
  };
}

// 8. 실시간 끝말잇기 게임 엔진 (PvE 대결) - 4단계 난이도 (쉬움, 중간, 어려움, 헬)
// 8. 실시간 끝말잇기 게임 엔진 (PvE 대결) - 4단계 난이도 (쉬움, 중간, 어려움, 헬) 및 첫 턴 한방제외 모드
async function processGameMove(userWord, gameHistory = [], difficulty = 'hell', options = {}) {
  if (!userWord || typeof userWord !== 'string') {
    return { success: false, message: '단어를 입력해주세요.' };
  }

  const noFirstTurnKill = options.noFirstTurnKill !== undefined ? !!options.noFirstTurnKill : true;
  const isFirstTurn = gameHistory.length === 0;

  const rawTrimmed = userWord.trim();

  // ⭐ 띄어쓰기(공백) 포함 여부 철저 검증 (끝말잇기 대원칙)
  if (/\s/.test(rawTrimmed)) {
    return {
      success: false,
      message: '띄어쓰기(공백)가 포함된 단어는 끝말잇기 규칙상 사용할 수 없습니다.'
    };
  }

  const cleanWord = rawTrimmed.replace(/[^\uAC00-\uD7A3]/g, '');

  if (cleanWord.length < 2) {
    return { success: false, message: '단어는 최소 2글자 이상이어야 합니다.' };
  }

  const diffRaw = String(difficulty || 'hell').toLowerCase();
  let diff = 'hell';
  if (diffRaw === 'easy' || diffRaw === '쉬움') diff = 'easy';
  else if (diffRaw === 'normal' || diffRaw === '중간') diff = 'normal';
  else if (diffRaw === 'hard' || diffRaw === '어려움') diff = 'hard';

  const usedSet = new Set(gameHistory.map(h => h.word));
  if (usedSet.has(cleanWord)) {
    return { success: false, message: `이미 사용된 단어입니다: 「${cleanWord}」` };
  }

  if (gameHistory.length > 0) {
    const lastWord = gameHistory[gameHistory.length - 1].word;
    const requiredChar = lastWord[lastWord.length - 1];
    const allowedStarts = getDueumVariants(requiredChar);

    if (!allowedStarts.includes(cleanWord[0])) {
      return {
        success: false,
        message: `'${requiredChar}'(으)로 시작해야 합니다.${allowedStarts.length > 1 ? ` (두음법칙: '${allowedStarts.join("', '")}')` : ''}`
      };
    }
  }

  // 네이버 국어사전 실시간 검색 검증 (네이버 사전에 등재된 단어는 옛말/방언 포함 100% 인정)
  const dictCheck = await queryNaverDictionary(cleanWord);
  if (!dictCheck || !dictCheck.isVerified) {
    if (dictCheck && dictCheck.isSpacedWord) {
      return {
        success: false,
        message: dictCheck.message || `「${cleanWord}」은(는) 국어사전 표제어에 띄어쓰기가 포함된 어휘(구)이므로 끝말잇기 규칙상 사용할 수 없습니다.`
      };
    }
    return {
      success: false,
      message: `「${cleanWord}」은(는) 네이버 국어사전에 등재되지 않은 단어입니다.`
    };
  }

  // 구체적인 실제 사전 뜻풀이가 존재하는지 엄격 검증 (뜻이 없으면 없다고 판단하고 사용 불가 차단)
  if (!dictCheck.meanings || dictCheck.meanings.length === 0 || !isRealMeaning(dictCheck.meanings[0])) {
    return {
      success: false,
      message: `「${cleanWord}」은(는) 네이버 국어사전에 구체적인 뜻풀이가 등재되지 않은 단어이므로 사용할 수 없습니다.`
    };
  }

  const nextTargetChar = cleanWord[cleanWord.length - 1];

  // ⭐ [첫 턴 한방제외 모드 검증]: 플레이어가 첫 턴에 한방 단어를 낸 경우 차단
  if (isFirstTurn && noFirstTurnKill) {
    const userRebuttal = getRebuttalAnalysis(nextTargetChar, [], new Set([cleanWord]));
    if (userRebuttal.totalCount === 0) {
      return {
        success: false,
        isFirstTurnKill: true,
        message: `🛡️ [첫 턴 한방제외 룰] 「${cleanWord}」은(는) 끝글자 '${nextTargetChar}'(으)로 상대가 시작할 수 있는 단어가 없는 💥한방 단어입니다. 첫 턴 한방제외 모드에서는 첫 번째 턴에 한방 단어를 쓸 수 없습니다! 랠리를 이어갈 수 있는 다른 단어를 입력해주세요.`
      };
    }
  }

  const userMeaning = dictCheck.meanings[0];
  const userPartOfSpeech = dictCheck.partOfSpeech || wordInfoMap.get(cleanWord)?.part || '명사';
  const userSource = dictCheck.source || '네이버 국어사전';
  const userLink = dictCheck.link || `https://ko.dict.naver.com/#/search?query=${encodeURIComponent(cleanWord)}`;

  // ⭐ 유효 단어로 확인되면 즉시 로컬 사전 맵에도 영구 동기화!
  registerDynamicWord(cleanWord, userPartOfSpeech);

  // ⭐ AI 또한 첫 턴(플레이어의 첫 수에 대한 응수)에서는 첫 턴 한방제외 룰 준수!
  const aiNoFirstTurnKill = noFirstTurnKill && (gameHistory.length <= 1);
  const analysis = await findUltimateBestWord(nextTargetChar, { 
    usedWords: new Set([...usedSet, cleanWord]),
    difficulty: diff,
    noFirstTurnKill: aiNoFirstTurnKill
  });

  if (!analysis || !analysis.ultimateWord) {
    return {
      success: true,
      userWord: cleanWord,
      userMeaning,
      userPartOfSpeech,
      userSource,
      userLink,
      gameOver: true,
      winner: 'user',
      message: `🎉 대단합니다! '${nextTargetChar}'(으)로 시작하는 단어가 더 이상 사전에 없습니다. 플레이어의 승리입니다!`
    };
  }

  const aiChosen = analysis.ultimateWord;
  const isWinningMove = aiChosen.outCount === 0;
  const tierNum = aiChosen.tierInfo?.tierNumber || 1;

  let strategyBrief = '';
  if (aiNoFirstTurnKill && !isWinningMove) {
    strategyBrief = `🛡️ [첫 턴 한방제외 적용] 「${aiChosen.word}」! 첫 턴이므로 즉시 한방 대신 전략적 랠리 단어로 응수합니다.`;
  } else if (isWinningMove) {
    strategyBrief = `💀 [1순위: 즉시 한방] 「${aiChosen.word}」! 끝글자 '${aiChosen.endChar}'(으)로 상대 반격 0개, 즉시 승리합니다.`;
  } else if (tierNum === 2) {
    const cpSample = aiChosen.minimax?.counterPlan?.[0];
    const cpText = cpSample ? ` (예: 상대가 「${cpSample.oppWord}」 두면 ➔ 「${cpSample.myCounter}」로 격파)` : '';
    strategyBrief = `⚔️ [2순위: 2수 앞 외통수] 「${aiChosen.word}」! 상대 선택지를 ${aiChosen.outCount}개로 제한하며 100% 필승 덫을 완성했습니다.${cpText}`;
  } else if (tierNum === 3) {
    strategyBrief = `🔥 [3순위: 치명적 압박] 「${aiChosen.word}」! 상대 반격 선택지가 단 ${aiChosen.outCount}개뿐인 치명타입니다.`;
  } else if (tierNum === 4) {
    strategyBrief = `🛡️ [4순위: 안전 방어] 「${aiChosen.word}」! 한방을 피하며 안정적으로 랠리의 주도권을 장악합니다.`;
  } else {
    strategyBrief = `⚠️ [5순위: 차선책 방어] 「${aiChosen.word}」! 위기를 넘기며 다음 기회를 노립니다.`;
  }

  return {
    success: true,
    userWord: cleanWord,
    userMeaning,
    userPartOfSpeech,
    userSource,
    userLink,
    aiWord: aiChosen.word,
    aiEndChar: aiChosen.endChar,
    aiOutCount: aiChosen.outCount,
    aiMeaning: aiChosen.naverMeaning,
    aiPartOfSpeech: aiChosen.partOfSpeech,
    aiSource: aiChosen.source,
    aiLink: aiChosen.naverLink,
    tierNumber: tierNum,
    strategyBrief,
    gameOver: isWinningMove,
    winner: isWinningMove ? 'ai' : null
  };
}

async function parseRequestBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') {
      try { return JSON.parse(req.body); } catch (e) { return {}; }
    }
  }
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

// 8. HTTP API 및 정적 파일 서버 핸들러
async function handleRequest(req, res) {
  let rawUrl = (req.headers && req.headers['x-forwarded-uri'])
    || (req.headers && req.headers['x-matched-path'] && !req.headers['x-matched-path'].includes('/api/index') ? req.headers['x-matched-path'] : null)
    || req.url
    || '/';

  const parsedUrl = url.parse(rawUrl, true);
  let pathname = parsedUrl.pathname || '/';

  // Vercel rewrite _route 파라미터 매핑 지원
  if (pathname === '/api/index.js' || pathname === '/api' || pathname === '/api/') {
    if (parsedUrl.query && parsedUrl.query._route) {
      pathname = '/api/' + parsedUrl.query._route;
    }
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API 0: 서버 접속 정보 (외부 공개 주소 및 같은 와이파이 주소)
  if (pathname === '/api/server-info' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      localIps: getLocalIpAddresses(),
      publicTunnelUrl: publicTunnelUrl || null,
      port: PORT,
      isVercel: !!process.env.VERCEL
    }));
    return;
  }

  // API 1: 추천 단어
  if (pathname === '/api/recommend' && req.method === 'GET') {
    const query = parsedUrl.query.query || '';
    const clean = query.trim().replace(/[^\uAC00-\uD7A3]/g, '');

    if (!clean) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '올바른 한글 글자를 입력해주세요.' }));
      return;
    }

    const char = clean[clean.length - 1];
    const noFirstTurnKill = parsedUrl.query.noFirstTurnKill === 'true' || parsedUrl.query.noFirstTurnKill === '1';
    const difficulty = parsedUrl.query.difficulty || 'hell';
    const analysis = await findUltimateBestWord(char, { noFirstTurnKill, difficulty });

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(analysis || { error: '단어를 찾을 수 없습니다.' }));
    return;
  }

  // API 2: AI브리핑
  if (pathname === '/api/chat' && req.method === 'POST') {
    try {
      const data = await parseRequestBody(req);
      const reply = await generateAiChatResponse(data.message || '', data.history || [], {
        flowMode: !!data.flowMode,
        opponentWordMode: data.opponentWordMode !== undefined ? !!data.opponentWordMode : true,
        briefedWords: Array.isArray(data.briefedWords) ? data.briefedWords : [],
        opponentStartChar: data.opponentStartChar || null,
        noFirstTurnKill: data.noFirstTurnKill !== undefined ? !!data.noFirstTurnKill : true,
        difficulty: 'hell' // ⭐ AI브리핑은 배틀 난이도와 무관하게 항상 최고 지능(헬 모드) 영구 고정!
      });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(reply));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // API 3: 네이버 국어사전 실시간 검색/검증 및 일치도 순 단어 쫘르르륵 검색
  if (pathname === '/api/dict/search' && req.method === 'GET') {
    const word = parsedUrl.query.word || parsedUrl.query.q || '';
    const rawTrimmed = String(word).trim();
    const hasSpace = /\s/.test(rawTrimmed);
    const clean = rawTrimmed.replace(/[^\uAC00-\uD7A3]/g, '');
    const info = await queryNaverDictionary(hasSpace ? rawTrimmed : clean);

    let rebuttal = null;
    if (clean && !hasSpace) {
      const lastChar = clean[clean.length - 1];
      rebuttal = getRebuttalAnalysis(lastChar);
    }

    // ⭐ 가장 일치하는 것부터 쫘르르륵 한 글자라도 일치하는 단어 파트별 분류 추출
    const searchResult = clean ? searchMatchingWords(clean, 48) : {
      exact: null,
      prefix: [],
      prefixTotal: 0,
      suffix: [],
      suffixTotal: 0,
      contains: [],
      containsTotal: 0,
      charMatch: [],
      charMatchTotal: 0,
      flat: [],
      totalMatches: 0
    };

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ...(info || getUnverifiedResult(clean)),
      rebuttal,
      queryWord: clean,
      matchedCount: searchResult.totalMatches,
      matchedWords: searchResult.flat,
      categories: searchResult
    }));
    return;
  }

  // API 4: 배틀
  if (pathname === '/api/game/move' && req.method === 'POST') {
    try {
      const data = await parseRequestBody(req);
      const result = await processGameMove(
        data.userWord || '', 
        data.history || [], 
        data.difficulty || 'hell',
        { noFirstTurnKill: data.noFirstTurnKill !== undefined ? !!data.noFirstTurnKill : true }
      );

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, message: err.message }));
    }
    return;
  }

  // API 5: 렉시콘
  if (pathname === '/api/killing-words' && req.method === 'GET') {
    const killingChars = [];
    for (const [char] of endMap.entries()) {
      if (staticTerminalCharSet.has(char)) {
        const words = (endMap.get(char) || []).filter(w => w.isPure).map(w => w.word);
        if (words.length > 0) {
          killingChars.push({
            char,
            wordCount: words.length,
            samples: words.slice(0, 6)
          });
        }
      }
    }
    killingChars.sort((a, b) => b.wordCount - a.wordCount);

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      totalKillingChars: killingChars.length,
      items: killingChars.slice(0, 30)
    }));
    return;
  }

  // 정적 파일 서빙 (로컬 서버 또는 Vercel fallback)
  const baseDir = fs.existsSync(path.join(__dirname, 'index.html'))
    ? __dirname
    : (fs.existsSync(path.join(process.cwd(), 'index.html')) ? process.cwd() : __dirname);

  let targetFile = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  let filePath = path.join(baseDir, targetFile);
  const ext = path.extname(filePath).toLowerCase();

  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
  };

  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('500 Server Error: ' + err.code);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
}

const server = http.createServer(handleRequest);

function getLocalIpAddresses() {
  const nets = os.networkInterfaces();
  const results = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        results.push({ name, address: net.address });
      }
    }
  }
  return results;
}

let publicTunnelUrl = null;

async function startPublicTunnel() {
  try {
    const { startTunnel } = require('untun');
    const tunnel = await startTunnel({ port: PORT });
    const url = await tunnel.getURL();
    publicTunnelUrl = url;
    console.log(`🌐 [외부 어디서나 - IP/비번 입력 전혀 없음!]`);
    console.log(`👉 친구 접속 주소: ${url}`);
    console.log(`   (카톡 등으로 이 링크만 주면 바로 접속됩니다!)\n`);
  } catch (err) {
    try {
      const localtunnel = require('localtunnel');
      const tunnel = await localtunnel({ port: PORT });
      publicTunnelUrl = tunnel.url;
      console.log(`🌐 [외부 어디서나] 친구/타인 접속 주소: ${tunnel.url}`);
    } catch (e) {
      console.log('ℹ️ 외부 터널 자동 생성 건너뜀 (로컬 네트워크는 정상 동작)');
    }
  }
}

// 로컬 환경에서 직접 실행 시에만 포트 바인딩 및 터널 개시
if (require.main === module && !process.env.VERCEL) {
  server.listen(PORT, '0.0.0.0', () => {
    const localIps = getLocalIpAddresses();
    console.log(`\n======================================================`);
    console.log(`🚀 [WordChain AI v4.0] Minimax 지능 엔진 & 끄투 배틀 서버 가동!`);
    console.log(`🏠 내 컴퓨터 접속 주소:   http://localhost:${PORT} (또는 http://127.0.0.1:${PORT})`);
    localIps.forEach(item => {
      console.log(`📱 다른 사람 / 같은 와이파이: http://${item.address}:${PORT} (${item.name})`);
    });
    console.log(`======================================================`);

    startPublicTunnel();
  });
}

module.exports = handleRequest;
