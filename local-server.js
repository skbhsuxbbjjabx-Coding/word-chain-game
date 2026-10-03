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


// ⭐ 현대에 쓰이지 않는 옛말(사어/고어) 영구 블랙리스트 (입거웆, 입거웇, 이웆 등 원천 차단)
const ARCHAIC_BLACKLIST = new Set([
  '입거웆', '입거웇', '이웆', '가웆', '가늣', '모믈늣', '버들늣', '늣', '븟', '게웆다', '뉘웇다'
]);

// 2. 고품질 사전 데이터 인덱싱
const wordInfoMap = new Map();
const startMap = new Map();
const endMap = new Map();
const invalidParts = new Set(['어미', '접사', '조사', '인명', '지명', '성씨', '인물']);

console.time('📖 52만 공인 사전 데이터 로드');

let loadedFromJson = false;
try {
  const rawData = require('./data/dictionary.json');
  for (const [s, wordList] of Object.entries(rawData)) {
    for (const w of wordList) {
      if (!w || /\s/.test(w) || ARCHAIC_BLACKLIST.has(w)) continue;
      const item = { word: w, isPure: true, part: '명사', raw: w };
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
          if (!w || /\s/.test(w) || ARCHAIC_BLACKLIST.has(w)) continue;
          const item = { word: w, isPure: true, part: '명사', raw: w };
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
        // ⭐ 띄어쓰기(공백)가 포함된 단어/구는 끝말잇기 룰에 어긋나므로 원천 배제
        if (/\s/.test(raw) || raw.includes(' ')) continue;

        const clean = raw.replace(/[^\uAC00-\uD7A3]/g, '');
        if (!clean || clean.length < 2 || ARCHAIC_BLACKLIST.has(clean)) continue;

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

console.timeEnd('📖 52만 공인 사전 데이터 로드');
console.log(`✅ 탑재된 총 유효 한국어 단어 수: ${wordInfoMap.size.toLocaleString()}개`);

function registerDynamicWord(word, part = '명사') {
  if (!word || word.length < 2 || /\s/.test(word) || ARCHAIC_BLACKLIST.has(word)) return;
  if (wordInfoMap.has(word)) return;
  const item = { word, isPure: true, part, raw: word };
  wordInfoMap.set(word, item);
  const s = word[0];
  const e = word[word.length - 1];

  if (!startMap.has(s)) startMap.set(s, []);
  startMap.get(s).push(item);

  if (!endMap.has(e)) endMap.set(e, []);
  endMap.get(e).push(item);
}

// ⭐ [우리말샘 공인 방언 및 핵심 어휘 영구 탑재] '륨/늄'의 유일한 반격 카드 '윰라대왕' 사전 초기 탑재
registerDynamicWord('윰라대왕', '명사');
if (wordInfoMap.has('윰라대왕')) {
  const item = wordInfoMap.get('윰라대왕');
  item.naverMeaning = '‘염라대왕’의 방언 (강원)';
  item.source = '공인 국어사전 (우리말샘)';
  item.naverLink = 'https://ko.dict.naver.com/#/entry/koko/44ff94fd43d740e496ed51da143926ba';
}

function getOutDegree(char) {
  const v = getDueumVariants(char);
  return v.reduce((acc, c) => acc + (startMap.get(c)?.length || 0), 0);
}

// 3. 공인 국어사전 실시간 검색 엔진 (국립국어원 우리말샘 & 네이버 국어사전 WORD 공인 표제어 전수 연동)
const naverCache = new Map();
const MAX_CACHE_SIZE = 5000;

naverCache.set('윰라대왕', {
  isVerified: true,
  word: '윰라대왕',
  source: '공인 국어사전 (우리말샘)',
  partOfSpeech: '명사',
  meanings: ['‘염라대왕’의 방언 (강원)'],
  link: 'https://ko.dict.naver.com/#/entry/koko/44ff94fd43d740e496ed51da143926ba'
});

// 네이버 국어사전 실시간 쿼리 함수 (실제 공인 사전에 등재된 유효 표제어만 100% 검증)
async function queryNaverDictionary(queryWord) {
  if (!queryWord) return null;
  const rawInput = String(queryWord).trim();

  // ⭐ 1) 단어 자체에 띄어쓰기(공백)가 포함되어 있는 경우 끝말잇기 룰 위반으로 즉시 배제
  if (/\s/.test(rawInput)) {
    return {
      word: rawInput,
      isVerified: false,
      isSpacedWord: true,
      spacedEntry: rawInput,
      source: '띄어쓰기(공백) 포함 어휘 (끝말잇기 룰 위반)',
      totalMatches: 0,
      partOfSpeech: '구/복합표현',
      meanings: ['띄어쓰기(공백)가 포함된 말은 끝말잇기 규칙상 사용할 수 없습니다.'],
      message: '띄어쓰기(공백)가 포함된 말은 끝말잇기 규칙상 사용할 수 없습니다.',
      link: `https://ko.dict.naver.com/#/search?query=${encodeURIComponent(rawInput)}`
    };
  }

  const clean = rawInput.replace(/[^\uAC00-\uD7A3]/g, '');
  if (!clean || clean.length < 2) return getUnverifiedResult(queryWord);

  // ⭐ 현대에 쓰이지 않는 옛말(사어/고어) 즉시 차단
  if (ARCHAIC_BLACKLIST.has(clean)) {
    const archaicRes = {
      word: clean,
      isVerified: false,
      isArchaic: true,
      source: '국어사전 옛말/사어 (끝말잇기 불가)',
      totalMatches: 1,
      partOfSpeech: '옛말',
      meanings: ['현대에 쓰이지 않는 옛말(사어)입니다.'],
      message: `「${clean}」은(는) 현대에 쓰이지 않는 옛말(사어)이므로, 끝말잇기 규칙상 사용할 수 없습니다.`,
      link: `https://ko.dict.naver.com/#/search?query=${encodeURIComponent(clean)}`
    };
    naverCache.set(clean, archaicRes);
    return archaicRes;
  }

  if (naverCache.has(clean)) {
    return naverCache.get(clean);
  }

  const encoded = encodeURIComponent(clean);

  // 1) 네이버 국어사전 공식 API3 실시간 조회 (공인 사전 표제어 WORD만 조회, 비표준/오픈사전 제외)
  let apiResult = null;
  let apiResponded = false; // 네이버 API와 정상 통신 여부
  let spacedSampleEntry = '';

  try {
    const apiUrl = `https://ko.dict.naver.com/api3/koko/search?query=${encoded}&m=pc`;
    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://ko.dict.naver.com/',
        'Accept': 'application/json, text/plain, */*'
      },
      signal: AbortSignal.timeout(3500)
    });

    if (res.ok) {
      apiResponded = true;
      const data = await res.json();
      const listMap = data?.searchResultMap?.searchResultListMap || {};
      // 국립국어원 표준국어대사전, 우리말샘, 고려대 한국어대사전 등 공인 표제어만 탐색 (오픈사전 제외)
      const officialItems = listMap.WORD?.items || [];

      let matchedItem = null;
      let matchedSource = '국립국어원 우리말샘 / 표준국어대사전';

      for (const item of officialItems) {
        // 표제어 원문 (HTML 태그, 첨자 숫자 등 제거)
        const entryRaw = (item.handleEntry || item.expEntry || item.expEntryRaw || '')
          .replace(/<[^>]+>/g, '')
          .replace(/[0-9]/g, '')
          .trim();

        // 기호 제거 후 순수 한글만 비교
        const raw = entryRaw
          .replace(/[-^ㆍ·\s\(\)]/g, '')
          .replace(/[^\uAC00-\uD7A3]/g, '')
          .trim();

        // ⭐ 절대 규칙: 검색어와 100% 일치할 때만 판정!
        if (raw === clean) {
          // 표제어 자체에 띄어쓰기(공백)가 포함되어 있는지 검사 (예: "인공 지능", "고양이 세수")
          if (/\s/.test(entryRaw)) {
            if (!spacedSampleEntry) spacedSampleEntry = entryRaw;
          } else {
            matchedItem = item;
            matchedSource = item.sourceDictnameKO ? `공인 국어사전 (${item.sourceDictnameKO})` : '국립국어원 우리말샘 / 표준국어대사전';
            break; // 띄어쓰기 없는 온전한 한 단어(단일어/합성명사) 우선 채택!
          }
        }
      }

      // ⭐ 온전한 한 단어는 없고 오직 띄어쓰기가 들어간 표제어(구/복합표현)만 존재하는 경우: 끝말잇기 룰에 따라 배제!
      if (!matchedItem && spacedSampleEntry) {
        const spacedResult = {
          word: clean,
          isVerified: false,
          isSpacedWord: true,
          spacedEntry: spacedSampleEntry,
          source: '국어사전 표제어 띄어쓰기 포함 어휘 (끝말잇기 불가)',
          totalMatches: officialItems.length,
          partOfSpeech: '구/복합표현',
          meanings: [`국어사전에 ‘${spacedSampleEntry}’(으)로 띄어쓰기가 포함되어 등재된 어휘/구입니다. 끝말잇기에서는 띄어쓰기 없는 한 단어만 인정되므로 사용이 불가합니다.`],
          message: `「${clean}」은(는) 국어사전에 ‘${spacedSampleEntry}’(으)로 띄어쓰기가 포함되어 등재된 어휘(구/복합표현)이므로, 끝말잇기 규칙상 사용할 수 없습니다.`,
          link: `https://ko.dict.naver.com/#/search?query=${encoded}`
        };
        naverCache.set(clean, spacedResult);
        return spacedResult;
      }

      if (matchedItem) {
        const meanings = [];
        let partOfSpeech = wordInfoMap.get(clean)?.part || '명사';
        let hasArchaicMeaning = false;
        let hasModernMeaning = false;

        if (matchedItem.meansCollector && matchedItem.meansCollector.length > 0) {
          for (const mc of matchedItem.meansCollector) {
            if (mc.partOfSpeech) partOfSpeech = mc.partOfSpeech;
            for (const m of (mc.means || [])) {
              const val = (m.value || '').replace(/<[^>]+>/g, '').trim();
              if (val && val.length >= 2) {
                meanings.push(val);
                const isArchaic = m.subjectGroup === '옛말' || m.subjectGroup === '옛' || val.includes('옛말') || val.includes('고어');
                const isDialect = m.subjectGroup === '방언' || val.includes('방언') || val.includes('사투리');
                if (isArchaic) {
                  hasArchaicMeaning = true;
                } else if (!isDialect) {
                  hasModernMeaning = true;
                }
              }
            }
          }
        }

        if (meanings.length === 0) {
          const fallbackText = matchedItem.abstractContent?.value || matchedItem.abstractContent || matchedItem.expAbstract || matchedItem.etcExplain;
          if (fallbackText && typeof fallbackText === 'string') {
            const cleanFallback = fallbackText.replace(/<[^>]+>/g, '').trim();
            meanings.push(cleanFallback);
            if (cleanFallback.includes('옛말') || cleanFallback.includes('고어')) {
              hasArchaicMeaning = true;
            } else {
              hasModernMeaning = true;
            }
          }
        }

        // ⭐ 순수 옛말/사어(현대 표준 의미가 전혀 없음, 예: '입거웆') 배제!
        const isPureArchaic = (hasArchaicMeaning && !hasModernMeaning) || (meanings.length > 0 && meanings.every(m => m.includes('옛말')));
        if (isPureArchaic) {
          const archaicResult = {
            word: clean,
            isVerified: false,
            isArchaic: true,
            source: '국어사전 옛말/사어 (끝말잇기 불가)',
            totalMatches: officialItems.length,
            partOfSpeech: '옛말',
            meanings: meanings.slice(0, 5),
            message: `「${clean}」은(는) 현대에 쓰이지 않는 옛말(사어)이므로, 끝말잇기 규칙상 사용할 수 없습니다.`,
            link: matchedItem.destinationLink
              ? (matchedItem.destinationLink.startsWith('http') ? matchedItem.destinationLink : `https://ko.dict.naver.com/${matchedItem.destinationLink}`)
              : `https://ko.dict.naver.com/#/search?query=${encoded}`
          };
          naverCache.set(clean, archaicResult);
          return archaicResult;
        }

        if (meanings.length > 0) {
          apiResult = {
            word: clean,
            isVerified: true,
            isArchaic: false,
            source: matchedSource,
            totalMatches: officialItems.length,
            partOfSpeech,
            meanings: meanings.slice(0, 5),
            isDialectOrArchaic: meanings[0]?.includes('방언') || meanings[0]?.includes('북한어'),
            link: matchedItem.destinationLink
              ? (matchedItem.destinationLink.startsWith('http') ? matchedItem.destinationLink : `https://ko.dict.naver.com/${matchedItem.destinationLink}`)
              : `https://ko.dict.naver.com/#/search?query=${encoded}`
          };
          registerDynamicWord(clean, partOfSpeech);
        }
      }
    }
  } catch (err) {
    // 네트워크 일시 오류 또는 타임아웃
  }

  // 3) 네이버 API에서 직접 실존 표제어와 뜻을 찾았으면 캐시 후 반환
  if (apiResult) {
    if (naverCache.size >= MAX_CACHE_SIZE) {
      const firstKey = naverCache.keys().next().value;
      naverCache.delete(firstKey);
    }
    naverCache.set(clean, apiResult);
    return apiResult;
  }

  // 4) ⭐ 네이버 API가 정상 응답했으나 일치하는 표제어가 없는 경우:
  // 절대 임의 인정하지 않고 무조건 "네이버 사전 미등재"로 판정! ("네이버 사전에서 검색 조회 후 있는 거만 되게")
  if (apiResponded) {
    const unverified = {
      word: clean,
      isVerified: false,
      source: '네이버 국어사전 미등재 단어',
      totalMatches: 0,
      partOfSpeech: '미상',
      meanings: ['네이버 국어사전에 구체적인 뜻풀이가 등재되지 않은 단어입니다.'],
      link: `https://ko.dict.naver.com/#/search?query=${encoded}`
    };
    naverCache.set(clean, unverified);
    return unverified;
  }

  // 5) 네트워크 단절(오프라인) 시의 비상 폴백 (로컬 52만 사전에 있는 경우에만 한정)
  if (wordInfoMap.has(clean)) {
    const item = wordInfoMap.get(clean);
    const verifiedResult = {
      word: clean,
      isVerified: true,
      source: '국립국어원 표준국어대사전 (오프라인 캐시)',
      totalMatches: 1,
      partOfSpeech: item.part || '명사',
      meanings: [`국립국어원 표준국어대사전 및 우리말샘에 공식 등재된 [${item.part || '명사'}] 표제어입니다.`],
      isDialectOrArchaic: false,
      link: `https://ko.dict.naver.com/#/search?query=${encoded}`
    };
    return verifiedResult;
  }

  // 6) 미등재 단어 최종 반환
  const unverified = {
    word: clean,
    isVerified: false,
    source: '사전 미등재 단어',
    totalMatches: 0,
    partOfSpeech: '미상',
    meanings: ['네이버 국어사전에 구체적인 뜻풀이가 등재되지 않은 단어입니다.'],
    link: `https://ko.dict.naver.com/#/search?query=${encoded}`
  };
  return unverified;
}

// 구체적인 실제 사전 뜻풀이인지 검증
function isRealMeaning(text) {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;
  const fakePhrases = [
    '등재되지 않은',
    '사전 미등재',
    '뜻이 등재되지'
  ];
  for (const phrase of fakePhrases) {
    if (trimmed.includes(phrase)) return false;
  }
  return true;
}

function getUnverifiedResult(word) {
  return {
    word,
    isVerified: false,
    source: '사전 미등재 단어',
    totalMatches: 0,
    partOfSpeech: '미상',
    meanings: ['네이버 국어사전에 구체적인 뜻풀이가 등재되지 않은 단어입니다.'],
    link: `https://ko.dict.naver.com/#/search?query=${encodeURIComponent(word)}`
  };
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
function getRebuttalAnalysis(endChar, counterPlan = []) {
  const variants = getDueumVariants(endChar);
  const candidates = [];

  for (const v of variants) {
    if (startMap.has(v)) {
      candidates.push(...startMap.get(v));
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
    opponentWord: cp.oppWord,
    myBestCounter: cp.myCounter
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

const ABSOLUTE_KILLING_CHARS = new Set(['녘', '쁨', '듐', '늧', '릇', '릎', '탉', '값', '옄', '엌', '헿', '흗', '늣', '픔', '튬', '뮴']);
const FOREIGN_NAMES_SET = new Set(['해리슨', '윌슨', '존슨', '앤더슨', '잭슨', '톰슨', '파킨슨', '클린턴', '워싱턴', '뉴턴', '에디슨', '로빈슨', '마이컬슨', '스티븐슨', '제퍼슨']);

// ⭐ [사전-AI-배틀 실시간 일원화] 글자(또는 두음 변이)로 시작하는 단어가 로컬 사전에 부족할 때 네이버 사전을 실시간 조회하여 동기화
async function ensureCharWordsFromNaver(char) {
  if (!char || typeof char !== 'string') return;
  const variants = getDueumVariants(char);

  for (const v of variants) {
    const existing = startMap.get(v) || [];
    // 이미 10개 이상 충분히 있으면 스킵
    if (existing.length >= 10) continue;

    try {
      const encoded = encodeURIComponent(v);
      const apiUrl = `https://ko.dict.naver.com/api3/koko/search?query=${encoded}&m=pc`;
      const res = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Referer': 'https://ko.dict.naver.com/',
          'Accept': 'application/json, text/plain, */*'
        },
        signal: AbortSignal.timeout(2500)
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

          // ⭐ 띄어쓰기(공백)가 있는 표제어는 끝말잇기 룰 위반이므로 엄격히 배제!
          if (/\s/.test(entryRaw)) continue;

          // ⭐ 옛말(사어) 표제어 원천 배제 (예: 입거웆)
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

async function findUltimateBestWord(inputChar, options = {}) {
  // ⭐ 네이버 국어사전 실시간 동기화 (사전-AI-배틀 사전 연결 100% 일원화)
  await ensureCharWordsFromNaver(inputChar);

  const variants = getDueumVariants(inputChar);
  let candidateItems = [];

  for (const v of variants) {
    if (startMap.has(v)) {
      candidateItems.push(...startMap.get(v));
    }
  }

  if (options.usedWords && options.usedWords instanceof Set) {
    candidateItems = candidateItems.filter(item => !options.usedWords.has(item.word));
  }

  if (candidateItems.length === 0) {
    return null;
  }

  // 4대 티어 버킷
  const tier1_instantKill = []; // 1순위: 즉시 한방 (상대 반격 0개)
  const tier2_forcedWin = [];   // 2순위: 반격해도 한방 (2수 앞 필승 외통수)
  const tier3_nearKill = [];    // 3순위: 거의 한방급 (상대 선택지 1~4개 극소 & 자살수 없음)
  const tier4_safePlay = [];    // 4순위: 쓸 수라도 있는 단어 (자살수 없는 안전한 단어)
  const tier5_desperate = [];   // 5순위: 최후의 발악 (모든 단어가 자살수인 극단적 상황)

  for (const item of candidateItems) {
    const word = item.word;
    const endChar = word[word.length - 1];
    const endVariants = getDueumVariants(endChar);

    // 상대방의 가능한 다음 수 계산
    const oppMoves = [];
    for (const ev of endVariants) {
      if (startMap.has(ev)) {
        oppMoves.push(...startMap.get(ev));
      }
    }
    const filteredOppMoves = (options.usedWords && options.usedWords instanceof Set)
      ? oppMoves.filter(o => !options.usedWords.has(o.word))
      : oppMoves;

    const oppCount = filteredOppMoves.length;

    // 상대방이 나를 즉시 한방으로 보낼 수 있는 킬링 수(자살수) 확인
    const oppKillingMoves = filteredOppMoves.filter(o => {
      const oppEnd = o.word[o.word.length - 1];
      return getOutDegree(oppEnd) === 0;
    });
    const hasSuicideRisk = oppKillingMoves.length > 0;

    // 내부 품질 점수 (길이, 순수어, 대표 공인어)
    let qualityScore = 0;
    if (item.isPure) qualityScore += 30000;
    if (word.length === 2) qualityScore += 50000;
    else if (word.length === 3) qualityScore += 35000;
    else if (word.length === 4) qualityScore += 15000;
    else if (word.length >= 5) qualityScore -= (word.length * 60000); // 5자 이상 대폭 감점

    // 대표 공인 어휘 가산점 (해질녘, 기쁨, 알루미늄, 나트륨, 칼륨, 마그네슘, 산기슭 등 100% 공인 필수어)
    if (word === '해질녘' || word === '기쁨' || word === '알루미늄' || word === '나트륨' || word === '칼륨' || word === '마그네슘' || word === '산기슭') {
      qualityScore += 200000;
    }

    // 외래어 인명/고유명사 대폭 감점
    if (FOREIGN_NAMES_SET.has(word) || (/^[가-힣]{3,}$/.test(word) && word.endsWith('슨') && word !== '이순신')) {
      qualityScore -= 500000;
    }

    // ------------------------------------------------------------------------
    // 🥇 1순위: 즉시 한방으로 끝나는 단어 (상대 반격 어휘 수 == 0)
    // ------------------------------------------------------------------------
    if (oppCount === 0) {
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
          brief: `💥 [1수 즉시 승리] 끝글자 '${endChar}'(으)로 시작하는 단어가 국어사전에 단 0개입니다!`,
          rebuttalCount: 0,
          samples: [],
          counterPlan: []
        }
      });
      continue;
    }

    // ------------------------------------------------------------------------
    // 🥈 2순위: 반격해도 한방인 단어 (2수 앞 필승 외통수)
    // 조건: 상대가 나를 한방으로 죽일 수 없고, 상대의 모든 반격에 대해
    //       내 다음 턴에 100% 한방 단어로 끝낼 수 있는 완벽한 덫!
    // ------------------------------------------------------------------------
    if (!hasSuicideRisk && oppCount >= 1 && oppCount <= 8) {
      let canForceKillAll = true;
      const counterPlan = [];

      for (const opp of filteredOppMoves) {
        const oppEnd = opp.word[opp.word.length - 1];
        const oppEndVariants = getDueumVariants(oppEnd);
        let foundMyKillingCounter = null;

        for (const ov of oppEndVariants) {
          if (startMap.has(ov)) {
            for (const myNext of startMap.get(ov)) {
              if (options.usedWords && options.usedWords.has(myNext.word)) continue;
              const myNextEnd = myNext.word[myNext.word.length - 1];
              if (getOutDegree(myNextEnd) === 0) {
                foundMyKillingCounter = myNext.word;
                break;
              }
            }
          }
          if (foundMyKillingCounter) break;
        }

        if (foundMyKillingCounter) {
          counterPlan.push({ oppWord: opp.word, myCounter: foundMyKillingCounter });
        } else {
          canForceKillAll = false;
          break;
        }
      }

      if (canForceKillAll && counterPlan.length === oppCount) {
        let score = 500000 - (oppCount * 5000) + qualityScore;
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
            brief: `⚔️ [2수 앞 필승 외통수] 상대방이 어떤 반격을 하든 다음 턴에 100% 한방으로 즉시 격파합니다!`,
            rebuttalCount: oppCount,
            samples: filteredOppMoves.slice(0, 6).map(o => o.word),
            counterPlan
          }
        });
        continue;
      }
    }

    // ------------------------------------------------------------------------
    // 🥉 3순위: 거의 한방급인 단어 (치명적 극소 압박)
    // 조건: 상대가 나를 한방으로 죽일 수 없고, 상대의 반격 선택지가 1~4개로 극히 적음!
    // ------------------------------------------------------------------------
    if (!hasSuicideRisk && oppCount >= 1 && oppCount <= 4) {
      let score = 300000 - (oppCount * 12000) + qualityScore;
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
        counterPlan: [],
        minimax: {
          type: 'NEAR_KILL',
          score,
          brief: `🔥 [거의 한방급 압박] 상대방의 되받아칠 단어가 단 ${oppCount}개뿐으로, 거의 한방급의 치명적인 포위망을 형성합니다.`,
          rebuttalCount: oppCount,
          samples: filteredOppMoves.slice(0, 6).map(o => o.word),
          counterPlan: []
        }
      });
      continue;
    }

    // ------------------------------------------------------------------------
    // 🏅 4순위: 쓸 수라도 있는 단어 (안전한 방어 및 랠리)
    // 조건: 상대에게 한방 역공(자살수)을 허용하지 않고 게임을 이어갈 수 있는 수
    // ------------------------------------------------------------------------
    if (!hasSuicideRisk) {
      let score = 100000 - (oppCount * 80) + qualityScore;
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
        tierName: '🛡️ 4순위: 안전하게 쓸 수 있는 방어 단어',
        tierBadgeClass: 'tier-4',
        tierIcon: '🛡️',
        score,
        counterPlan: [],
        minimax: {
          type: 'SAFE_RALLY',
          score,
          brief: `🛡️ [안전 방어] 상대에게 한방 역공을 원천 차단하고 안정적으로 전세를 이어가는 안전한 수입니다.`,
          rebuttalCount: oppCount,
          samples: filteredOppMoves.slice(0, 8).map(o => o.word),
          counterPlan: []
        }
      });
    } else {
      // 5순위: 자살수 위험 단어 (모든 단어가 자살수인 최악의 상황일 때만 고려)
      let score = -200000 - (oppKillingMoves.length * 5000) + qualityScore;
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
        tierName: '⚠️ 4순위: 차선책 방어 단어 (한방 주의)',
        tierBadgeClass: 'tier-desperate',
        tierIcon: '⚠️',
        score,
        counterPlan: [],
        minimax: {
          type: 'DANGEROUS',
          score,
          brief: `⚠️ 상대방에게 한방 역공(예: 「${oppKillingMoves[0].word}」)을 허용할 위험이 있으나 현재 최선의 응수입니다.`,
          rebuttalCount: oppCount,
          samples: filteredOppMoves.slice(0, 8).map(o => o.word),
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

  let tierBuckets;
  if (diff === 'easy') {
    // [쉬움]: 플레이어가 편하게 이어갈 수 있도록 안전 수(반격 선택지 많은 단어) 우선 추천! 한방 단어 회피
    tier4_safePlay.sort((a, b) => b.outCount - a.outCount || b.score - a.score);
    tierBuckets = [
      { list: tier4_safePlay, num: 4 },
      { list: tier3_nearKill, num: 3 },
      { list: tier5_desperate, num: 5 },
      { list: tier2_forcedWin, num: 2 },
      { list: tier1_instantKill, num: 1 }
    ];
  } else if (diff === 'normal') {
    // [중간]: 안전 수 우선 및 균형 있는 랠리
    tierBuckets = [
      { list: tier4_safePlay, num: 4 },
      { list: tier3_nearKill, num: 3 },
      { list: tier2_forcedWin, num: 2 },
      { list: tier1_instantKill, num: 1 },
      { list: tier5_desperate, num: 5 }
    ];
  } else if (diff === 'hard') {
    // [어려움]: 2수 앞 외통수 및 치명타 우선
    tierBuckets = [
      { list: tier2_forcedWin, num: 2 },
      { list: tier3_nearKill, num: 3 },
      { list: tier1_instantKill, num: 1 },
      { list: tier4_safePlay, num: 4 },
      { list: tier5_desperate, num: 5 }
    ];
  } else {
    // [헬]: 100% 무자비한 4단계 지능 (1순위 한방 -> 2순위 외통수 -> 3순위 치명타 -> 4순위 안전수)
    tierBuckets = [
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

  // ⭐ [네이버 국어사전 100% 실시간 실존 검증 루프]
  for (const bucket of tierBuckets) {
    if (bucket.list.length === 0) continue;
    bucket.list.sort((a, b) => b.score - a.score || a.length - b.length);

    for (const cand of bucket.list) {
      const dict = await queryNaverDictionary(cand.word);
      if (dict && dict.isVerified && !dict.isArchaic) {
        best = cand;
        bestDict = dict;
        chosenTierNumber = bucket.num;
        chosenTierList = bucket.list;
        break;
      }
    }
    if (best) break;
  }

  if (!best) {
    return null; // 네이버 국어사전에 실제로 등재된 단어가 전무함
  }

  // 대안 후보군 선별 (네이버 국어사전 실시간 검증을 통과한 단어로만 최대 3개 선별)
  const allCandidates = [
    ...chosenTierList,
    ...tier1_instantKill,
    ...tier2_forcedWin,
    ...tier3_nearKill,
    ...tier4_safePlay
  ].filter(c => c.word !== best.word);

  const seenAltWords = new Set([best.word]);
  const uniqueAlternatives = [];
  const altDicts = [];

  for (const alt of allCandidates) {
    if (!seenAltWords.has(alt.word)) {
      seenAltWords.add(alt.word);
      const dict = await queryNaverDictionary(alt.word);
      if (dict && dict.isVerified && !dict.isArchaic) {
        uniqueAlternatives.push(alt);
        altDicts.push(dict);
        if (uniqueAlternatives.length >= 3) break;
      }
    }
  }

  const rebuttal = getRebuttalAnalysis(best.endChar, best.counterPlan);

  // 4대 선정 근거 브리핑
  let strongestReason = '';
  let optimalReason = '';
  let bestReason = '';
  let supremeReason = '';

  if (chosenTierNumber === 1) {
    strongestReason = `끝글자 '${best.endChar}'(으)로 시작하는 한국어 단어가 국어사전에 정확히 0개로 상대방을 즉시 100% 격파합니다.`;
    optimalReason = `불필요한 장기전 없이 단 1수로 승리를 완벽히 확정짓는 최우선 [1순위 한방]입니다.`;
    bestReason = `네이버 국어사전 및 국립국어원 표준국어대사전에 공식 등재된 표준 어휘입니다.`;
    supremeReason = `${best.length}글자의 완성도 높은 어휘로, 실전에서 즉시 인정받는 최고의 한방 단어입니다.`;
  } else if (chosenTierNumber === 2) {
    strongestReason = `상대방의 다음 선택지를 단 ${best.outCount}개(${best.minimax.samples.slice(0, 3).join(', ')})로 완전히 포위합니다.`;
    optimalReason = `상대가 어떤 반격을 하든 다음 턴에 100% 한방 단어로 격파하는 [2순위 2수 앞 필승 외통수]입니다.`;
    bestReason = `네이버 국어사전 및 공인 사전에 정식 등재된 신뢰도 100%의 표준 단어입니다.`;
    supremeReason = `상대의 패를 꿰뚫어 보고 다음 턴의 승리를 설계하는 가장 지능적인 수 싸움입니다.`;
  } else if (chosenTierNumber === 3) {
    strongestReason = `상대방이 되받아칠 수 있는 단어가 국어사전 전체에서 단 ${best.outCount}개뿐인 [3순위 거의 한방급] 치명타입니다.`;
    optimalReason = `상대에게 나를 한방으로 보내는 역공 어휘가 전혀 없어 상대방을 완벽히 질식시킵니다.`;
    bestReason = `네이버 국어사전에 실제 뜻풀이가 등재되어 있어 감점이나 실격 없이 당당히 쓸 수 있습니다.`;
    supremeReason = `상대에게 패착이나 타임오버를 강제하여 주도권을 확실하게 쥐어오는 결정구입니다.`;
  } else {
    strongestReason = `상대의 한방 역공(자살수)을 원천 차단하고 안정적으로 전세를 이어가는 [4순위 안전 방어]입니다.`;
    optimalReason = `위험한 수를 철저히 회피하면서 다음 기회를 도모하는 가장 현명하고 단단한 수입니다.`;
    bestReason = `네이버 국어사전 및 국립국어원 표준국어대사전 공인 표준 표제어입니다.`;
    supremeReason = `${best.length}글자의 직관적이고 품격 있는 어휘로 안전하게 랠리를 장악합니다.`;
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
      naverMeaning: bestDict?.meanings?.[0] || '네이버 국어사전 공인 표제어입니다.',
      naverMeanings: bestDict?.meanings || [],
      source: bestDict?.source || '공인 국어사전 (우리말샘 / 표준국어대사전)',
      naverLink: bestDict?.link || `https://ko.dict.naver.com/#/search?query=${encodeURIComponent(best.word)}`
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
  const briefedWords = Array.isArray(options.briefedWords) ? options.briefedWords : [];
  const usedWords = flowMode && briefedWords.length > 0 ? new Set(briefedWords) : new Set();

  if (trimmed.includes('안녕') || trimmed.includes('반가워')) {
    return {
      text: `안녕하세요! ⚡ **끝말잇기 AI브리핑**입니다.\n\n국립국어원 우리말샘 및 네이버 국어사전 전수 어휘를 바탕으로 **4단계 지능 의사결정**을 제공합니다:\n\n1. 💥 **1순위 (한방 단어 위주)**: 상대 반격 0개로 즉시 승리하는 필승 단어\n2. ⚔️ **2순위 (되받아칠 단어 거의 없는 단어)**: 상대 반격 1~3개뿐인 치명타/외통수\n3. 🛡️ **3순위 (한방에 당하지 않는 단어)**: 상대 한방을 완벽히 피하는 안전 수\n4. ⚠️ **4순위 (할 수라도 있는 단어)**: 자살수를 감수하고 이어가는 차선책\n\n🌊 **흐름 모드**를 켜시면 상대의 시작 글자(앞글자) 입력 ➔ 상대 단어 입력 ➔ 내 1순위 필승 반격 수로 랠리가 이어집니다!\n지금 바로 앞글자(예: *'기'*, *'산기슭'*)를 입력해보세요!`
    };
  }

  if (trimmed.includes('두음') || trimmed.includes('두음법칙')) {
    return {
      text: `📖 **국립국어원 표준 두음법칙 안내 (제10항·제11항 정방향만 적용)**:\n\n1. **ㄴ 두음법칙 (제10항)**: '냐, 녀, 녜, 뇨, 뉴, 니' → **'야, 여, 예, 요, 유, 이'** (초성 ㄴ → ㅇ)\n   * 역방향(니 → 리: '리튬' 등)은 엄격히 차단됩니다!\n2. **ㄹ 두음법칙 (제11항)**:\n   - '랴, 려, 례, 료, 류, 리' → **'야, 여, 예, 요, 유, 이'** (초성 ㄹ → ㅇ)\n   - '라, 로, 루, 르, 래, 뢰...' → **'나, 노, 누, 느, 내, 뇌...'** (초성 ㄹ → ㄴ)\n\n알고리즘이 정방향 두음법칙을 완벽 계산하여 최적의 단어를 찾아냅니다!`
    };
  }

  // ⭐ 띄어쓰기(공백) 검증 (끝말잇기 대원칙)
  if (/\s/.test(trimmed)) {
    return {
      text: `⚠️ **[끝말잇기 룰 안내]**\n\n입력하신 **「${trimmed}」**에는 띄어쓰기(공백)가 포함되어 있습니다.\n\n끝말잇기 공식 규칙상 **띄어쓰기가 없는 한 단어(단일어 또는 합성명사)**만 유효하므로 게임에서 인정되지 않습니다.`
    };
  }

  const pureKorean = trimmed.replace(/[^가-힣]/g, '');

  // --------------------------------------------------------------------------
  // 🌊 [흐름 모드 전용 로직] "상대 앞에글자 입력하면 상대 단어도 그 다음에 입력하게 해줘"
  // --------------------------------------------------------------------------
  if (flowMode) {
    const oppStartCharParam = options.opponentStartChar ? String(options.opponentStartChar).trim() : null;

    // 1) 1글자 입력이거나 "상대" 단어와 함께 시작 글자를 지정한 경우: 상대 시작 글자 접수 후 상대 단어 입력 대기!
    const isSingleChar = pureKorean.length === 1;
    const isOpponentStartCharIntent = isSingleChar || (trimmed.includes('상대') && pureKorean.length <= 2);

    if (isOpponentStartCharIntent) {
      const oppStartChar = pureKorean.length === 1 ? pureKorean : pureKorean[pureKorean.length - 1];
      const variants = getDueumVariants(oppStartChar);
      const candidateSamples = [];
      for (const v of variants) {
        if (startMap.has(v)) {
          for (const item of startMap.get(v)) {
            if (!usedWords.has(item.word) && item.word.length >= 2 && !ARCHAIC_BLACKLIST.has(item.word)) {
              candidateSamples.push(item.word);
              if (candidateSamples.length >= 4) break;
            }
          }
        }
        if (candidateSamples.length >= 4) break;
      }

      const sampleText = candidateSamples.length > 0 ? ` (예: **'${candidateSamples.join("', '")}'** 등)` : '';

      return {
        text: `🎯 **[상대방 턴: 시작 글자 '${oppStartChar}']**\n\n상대방 차례의 시작 글자 **'${oppStartChar}'**(이)가 접수되었습니다!\n\n상대방이 **'${oppStartChar}'**(으)로 어떤 단어를 냈나요? 상대방이 낸 단어를 아래 입력창에 입력해주세요!${sampleText}\n\n입력하시면 상대방의 단어를 완벽하게 격파할 **1순위 필승 수**를 즉시 브리핑해 드립니다!`,
        flowMode: true,
        isAwaitingOpponentWord: true,
        opponentStartChar: oppStartChar,
        sampleWords: candidateSamples
      };
    }

    // 2) 2글자 이상 단어 입력인 경우: 상대방이 낸 단어로 접수 후, 나의 최적 반격 수 브리핑!
    if (pureKorean.length >= 2) {
      const opponentWord = pureKorean;

      // 만약 직전 턴에서 상대 시작 글자가 지정되어 있었다면 두음법칙 포함 일치 여부 엄격 검증!
      if (oppStartCharParam) {
        const allowedStarts = getDueumVariants(oppStartCharParam);
        if (!allowedStarts.includes(opponentWord[0])) {
          const dueumNote = allowedStarts.length > 1 ? ` (두음법칙 허용: '${allowedStarts.join("', '")}')` : '';
          return {
            text: `⚠️ **[상대방 시작 글자 불일치]**\n\n현재 상대방 차례의 시작 글자는 **'${oppStartCharParam}'**입니다.${dueumNote}\n\n상대방이 **'${oppStartCharParam}'**(으)로 낸 단어를 입력해주세요! (현재 입력: 「${opponentWord}」)`,
            flowMode: true,
            isAwaitingOpponentWord: true,
            opponentStartChar: oppStartCharParam
          };
        }
      }

      // 상대방 단어 옛말/사어 블랙리스트 검사
      if (ARCHAIC_BLACKLIST.has(opponentWord)) {
        return {
          text: `⚠️ **[끝말잇기 룰 안내]**\n\n상대방이 낸 **「${opponentWord}」**은(는) 현대에 쓰이지 않는 **옛말(사어)**입니다.\n\n끝말잇기 공식 규칙상 옛말이나 사어는 인정되지 않습니다. 상대방이 낸 올바른 단어를 다시 입력해주세요!`,
          flowMode: true,
          isAwaitingOpponentWord: true,
          opponentStartChar: oppStartCharParam || opponentWord[0]
        };
      }

      // 상대방 단어 국어사전 정밀 검증
      const oppDict = await queryNaverDictionary(opponentWord);
      if (!oppDict || !oppDict.isVerified || oppDict.isArchaic) {
        if (oppDict && oppDict.isArchaic) {
          return {
            text: `⚠️ **[끝말잇기 룰 안내]**\n\n상대방이 낸 **「${opponentWord}」**은(는) 현대에 쓰이지 않는 **옛말(사어)**입니다.\n\n끝말잇기 공식 규칙상 옛말이나 사어는 인정되지 않습니다. 상대방이 낸 올바른 단어를 다시 입력해주세요!`,
            flowMode: true,
            isAwaitingOpponentWord: true,
            opponentStartChar: oppStartCharParam || opponentWord[0]
          };
        }
        if (oppDict && oppDict.isSpacedWord) {
          return {
            text: `⚠️ **[끝말잇기 룰 안내]**\n\n**「${opponentWord}」**은(는) 국어사전에 **‘${oppDict.spacedEntry || opponentWord}’**(으)로 띄어쓰기가 포함되어 등재된 구/복합표현입니다.\n\n끝말잇기 공식 규칙상 **띄어쓰기가 없는 한 단어**만 인정되므로 사용하실 수 없습니다.`,
            flowMode: true,
            isAwaitingOpponentWord: true,
            opponentStartChar: oppStartCharParam || opponentWord[0]
          };
        }
        return {
          text: `🤔 **「${opponentWord}」**은(는) 공인 국어사전(우리말샘 / 표준국어대사전)에 등재되지 않은 단어입니다.\n\n상대방이 낸 올바른 표준 단어를 다시 입력해주세요!`,
          flowMode: true,
          isAwaitingOpponentWord: true,
          opponentStartChar: oppStartCharParam || opponentWord[0]
        };
      }

      // 이미 사용된 단어인지 확인
      if (usedWords.has(opponentWord)) {
        return {
          text: `⚠️ **[중복 단어 경고]**\n\n**「${opponentWord}」**은(는) 이번 대결 흐름에서 이미 사용된 단어입니다.\n\n상대방이 낸 다른 단어를 입력해주세요!`,
          flowMode: true,
          isAwaitingOpponentWord: true,
          opponentStartChar: oppStartCharParam || opponentWord[0]
        };
      }

      // 상대방 단어의 끝글자로 내가 반격할 최적의 수 탐색!
      const oppEndChar = opponentWord[opponentWord.length - 1];
      const newUsedWords = new Set([...usedWords, opponentWord]);
      const analysis = await findUltimateBestWord(oppEndChar, { usedWords: newUsedWords, difficulty: 'hell' });

      if (!analysis || !analysis.ultimateWord) {
        return {
          text: `🎉 **[플레이어 완승!]**\n\n상대방이 **「${opponentWord}」**(으)로 냈으나, 끝글자 **'${oppEndChar}'**(으)로 시작하는 단어가 국어사전에 더 이상 없습니다!\n\n상대방이 치명적인 자살수를 두었으므로 플레이어의 승리입니다!`,
          opponentWord,
          briefedWords: [...briefedWords, opponentWord],
          flowMode: true,
          isAwaitingOpponentWord: false,
          opponentStartChar: null
        };
      }

      const ultimate = analysis.ultimateWord;
      const tierNum = ultimate.tierInfo?.tierNumber || 1;

      let speech = '';
      if (ultimate.word === '윰라대왕' || oppEndChar === '륨' || oppEndChar === '늄' || oppEndChar === '윰') {
        speech = `🛡️ **'${oppEndChar}'**(은)는 두음법칙(한글 맞춤법 제10항·제11항)에 따라 **'윰'**으로 변환하여 이어갈 수 있습니다!\n\n` +
                 `국어사전 전체에서 '윰'으로 시작하는 단어는 국립국어원 우리말샘 공인 표제어인 **「${ultimate.word}」**(강원 방언) 단 1개만 존재합니다!\n\n` +
                 `상대방의 '나트륨'이나 '알루미늄' 공격을 무력화하고 주도권을 가져오는 **유일무이한 회심의 방어 카드**입니다!\n\n` +
                 `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
      } else if (tierNum === 1) {
        speech = `💥 **'${oppEndChar}'**(으)로 이어질 **[1순위: 즉시 승리 한방 단어]**는 단연 **「${ultimate.word}」**입니다!\n\n` +
                 `끝글자 **'${ultimate.endChar}'**(으)로 시작하는 단어가 국어사전에 **정확히 0개**이므로, 내가 이 단어를 내는 순간 상대방은 어떠한 반격도 하지 못하고 **즉시 100% 승리(한방)**합니다!\n\n` +
                 `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
      } else if (tierNum === 2 || tierNum === 3) {
        speech = `⚔️ **'${oppEndChar}'**(으)로 이어질 **[2순위: 되받아칠 단어가 거의 없는 외통수 단어]**는 바로 **「${ultimate.word}」**입니다!\n\n` +
                 `상대방의 다음 선택지가 국어사전 전체에서 단 **${ultimate.outCount}개**(${ultimate.minimax.samples.slice(0, 3).join(', ')})뿐이며, 다음 턴 100% 한방으로 격파하는 **필승 2수 앞 덫**입니다!\n\n` +
                 `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
      } else if (tierNum === 4) {
        speech = `🛡️ **'${oppEndChar}'**(으)로 이어질 **[3순위: 한방단어에 당하지 않는 안전 단어]**로 **「${ultimate.word}」**을(를) 추천합니다!\n\n` +
                 `상대의 한방 역공(자살수)을 원천 차단하면서 안정적으로 주도권을 쥐고 랠리를 이어가는 최선의 안전 수입니다.\n\n` +
                 `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
      } else {
        speech = `⚠️ **'${oppEndChar}'**(으)로 이어갈 **[4순위: 할 수라도 있는 차선책 단어]**로 **「${ultimate.word}」**을(를) 추천합니다!\n\n` +
                 `상대의 역공 위험이 다소 있으나 현재 상황에서 유효하게 전세를 만회해 나가는 유일한 수입니다.\n\n` +
                 `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
      }

      const isDirectWin = ultimate.outCount === 0;
      const nextPrompt = isDirectWin
        ? `\n\n👑 **[필승 완승 경고]** 내가 낸 **「${ultimate.word}」**의 끝글자 **'${ultimate.endChar}'**(으)로 상대가 낼 수 있는 단어가 국어사전에 **전무(0개)**하여 상대방은 무조건 패배합니다!`
        : `\n\n👉 내가 **「${ultimate.word}」**(으)로 반격했습니다!\n상대방이 다음 끝글자 **'${ultimate.endChar}'**(으)로 어떤 단어로 받아쳤나요? 상대방의 다음 단어를 입력해주세요!`;

      const fullText = `⚔️ **[상대방 응수: 「${opponentWord}」 ➔ 반격 제시어: '${oppEndChar}']**\n\n` +
                       `상대방이 낸 **「${opponentWord}」**을(를) 격파할 **최적의 필승 수**를 브리핑합니다:\n\n` +
                       speech +
                       nextPrompt;

      return {
        text: fullText,
        analysis,
        hasUltimateCard: true,
        briefedWord: ultimate.word,
        opponentWord: opponentWord,
        briefedWords: [...briefedWords, opponentWord, ultimate.word],
        tierNumber: tierNum,
        flowMode: true,
        isAwaitingOpponentWord: !isDirectWin,
        opponentStartChar: ultimate.endChar,
        nextTargetChar: ultimate.endChar
      };
    }
  }

  // --------------------------------------------------------------------------
  // 🎯 일반 모드 (흐름 모드 OFF): 단일 앞글자 또는 단어에 대한 즉시 최적수 추천
  // --------------------------------------------------------------------------
  const targetChar = parseUserTargetChar(trimmed);

  if (targetChar) {
    const analysis = await findUltimateBestWord(targetChar, { usedWords, difficulty: 'hell' });

    if (!analysis || !analysis.ultimateWord) {
      const pureWord = trimmed.replace(/[^가-힣]/g, '');
      if (pureWord.length >= 2) {
        const selfDict = await queryNaverDictionary(pureWord);
        if (selfDict && selfDict.isArchaic) {
          return {
            text: `⚠️ **[끝말잇기 룰 안내]**\n\n**「${pureWord}」**은(는) 현대에 쓰이지 않는 **옛말(사어)**입니다.\n\n끝말잇기 공식 규칙상 옛말이나 사어는 인정되지 않으므로 사용하실 수 없습니다.`
          };
        }
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
            briefedWords: [...briefedWords, pureWord],
            tierNumber: isDirectKilling ? 1 : 3,
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
                  desc: isDirectKilling ? '상대 반격 0개 절대 필승' : '공인 국어사전 등재 어휘'
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
        text: `🤔 아쉽게도 현재 국어사전에서 '${targetChar}'(으)로 시작하는 유효한 단어를 찾을 수 없습니다. (사전에 없는 음절이거나 끝말잇기 한방 글자일 가능성이 높습니다)`
      };
    }

    const ultimate = analysis.ultimateWord;
    const tierNum = ultimate.tierInfo?.tierNumber || 1;

    let speech = '';
    // ⭐ '륨'/'늄'/'윰' 특수 브리핑: 윰라대왕 안내
    if (ultimate.word === '윰라대왕' || targetChar === '륨' || targetChar === '늄' || targetChar === '윰') {
      speech = `🛡️ **'${targetChar}'**(은)는 두음법칙(한글 맞춤법 제10항·제11항)에 따라 **'윰'**으로 변환하여 이어갈 수 있습니다!\n\n` +
               `국어사전 전체에서 '윰'으로 시작하는 단어는 국립국어원 우리말샘 공인 표제어인 **「${ultimate.word}」**(강원 방언) 단 1개만 존재합니다!\n\n` +
               `상대방의 '나트륨'이나 '알루미늄' 공격을 무력화하고 랠리를 이어가는 **유일무이한 회심의 방어 카드**입니다!\n\n` +
               `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
    } else if (tierNum === 1) {
      speech = `💥 **'${targetChar}'**(으)로 이어질 **[1순위: 즉시 승리 한방 단어]**는 단연 **「${ultimate.word}」**입니다!\n\n` +
               `끝글자 **'${ultimate.endChar}'**(으)로 시작하는 단어가 국어사전에 **정확히 0개**이므로, 상대방은 어떤 반격도 하지 못하고 **단 1수로 즉시 100% 승리(한방)**합니다!\n\n` +
               `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
    } else if (tierNum === 2 || tierNum === 3) {
      speech = `⚔️ **'${targetChar}'**(으)로 이어질 **[2순위: 되받아칠 단어가 거의 없는 외통수 단어]**는 바로 **「${ultimate.word}」**입니다!\n\n` +
               `1순위 즉시 한방 단어가 없어 선택했습니다. 상대방의 다음 선택지가 국어사전 전체에서 단 **${ultimate.outCount}개**(${ultimate.minimax.samples.slice(0, 3).join(', ')})뿐이며, 다음 턴 100% 한방으로 격파하는 **필승 2수 앞 덫**입니다!\n\n` +
               `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
    } else if (tierNum === 4) {
      speech = `🛡️ **'${targetChar}'**(으)로 이어질 **[3순위: 한방단어에 당하지 않는 안전 단어]**로 **「${ultimate.word}」**을(를) 추천합니다!\n\n` +
               `상대의 한방 역공(자살수)을 원천 차단하면서 안정적으로 주도권을 쥐고 랠리를 이어가는 최선의 안전 수입니다.\n\n` +
               `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
    } else {
      speech = `⚠️ **'${targetChar}'**(으)로 이어갈 **[4순위: 할 수라도 있는 차선책 단어]**로 **「${ultimate.word}」**을(를) 추천합니다!\n\n` +
               `상대의 역공 위험이 다소 있으나 현재 상황에서 유효하게 전세를 만회해 나가는 유일한 수입니다.\n\n` +
               `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
    }

    return {
      text: speech,
      analysis,
      hasUltimateCard: true,
      briefedWord: ultimate.word,
      briefedWords: [...briefedWords, ultimate.word],
      tierNumber: tierNum,
      flowMode: false
    };
  }

  if (trimmed.includes('안녕') || trimmed.includes('반가워')) {
    return {
      text: `안녕하세요! ⚡ **끝말잇기 AI브리핑**입니다.\n\n국립국어원 우리말샘 및 네이버 국어사전 전수 어휘를 바탕으로 **4단계 지능 의사결정**을 제공합니다:\n\n1. 💥 **1순위 (한방 단어 위주)**: 상대 반격 0개로 즉시 승리하는 필승 단어\n2. ⚔️ **2순위 (되받아칠 단어 거의 없는 단어)**: 상대 반격 1~3개뿐인 치명타/외통수\n3. 🛡️ **3순위 (한방에 당하지 않는 단어)**: 상대 한방을 완벽히 피하는 안전 수\n4. ⚠️ **4순위 (할 수라도 있는 단어)**: 자살수를 감수하고 이어가는 차선책\n\n🌊 **흐름 모드**를 켜시면 한 번 알려준 단어는 중복 추천되지 않습니다!\n지금 바로 앞글자(예: *'기'*, *'산기슭'*)를 입력해보세요!`
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
async function processGameMove(userWord, gameHistory = [], difficulty = 'hell') {
  if (!userWord || typeof userWord !== 'string') {
    return { success: false, message: '단어를 입력해주세요.' };
  }

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

  // 네이버 국어사전 실시간 검색 검증 (네이버 사전에 실제 등재되어 있는 단어만 100% 인정)
  const dictCheck = await queryNaverDictionary(cleanWord);
  if (!dictCheck || !dictCheck.isVerified || dictCheck.isArchaic) {
    if (dictCheck && dictCheck.isArchaic) {
      return {
        success: false,
        message: `「${cleanWord}」은(는) 현대에 쓰이지 않는 옛말(사어)이므로 끝말잇기 규칙상 사용할 수 없습니다.`
      };
    }
    if (dictCheck && dictCheck.isSpacedWord) {
      return {
        success: false,
        message: dictCheck.message || `「${cleanWord}」은(는) 국어사전 표제어에 띄어쓰기가 포함된 어휘(구)이므로 끝말잇기 규칙상 사용할 수 없습니다.`
      };
    }
    return {
      success: false,
      message: `「${cleanWord}」은(는) 공인 국어사전(우리말샘 / 네이버 사전)에 등재되지 않은 단어입니다.`
    };
  }

  const userMeaning = dictCheck.meanings?.[0] || '국립국어원 우리말샘 및 표준국어대사전 공인 표제어입니다.';
  const userPartOfSpeech = dictCheck.partOfSpeech || wordInfoMap.get(cleanWord)?.part || '명사';
  const userSource = dictCheck.source || '국립국어원 우리말샘 / 표준국어대사전';
  const userLink = dictCheck.link || `https://ko.dict.naver.com/#/search?query=${encodeURIComponent(cleanWord)}`;

  // ⭐ 유효 단어로 확인되면 즉시 로컬 사전 맵에도 영구 동기화!
  registerDynamicWord(cleanWord, userPartOfSpeech);

  const nextTargetChar = cleanWord[cleanWord.length - 1];
  const analysis = await findUltimateBestWord(nextTargetChar, { 
    usedWords: new Set([...usedSet, cleanWord]),
    difficulty: diff
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
  if (isWinningMove) {
    strategyBrief = `💀 [1순위: 즉시 한방] 「${aiChosen.word}」! 상대 반격 0개로 즉시 승리합니다.`;
  } else if (tierNum === 2) {
    strategyBrief = `⚔️ [2순위: 반격해도 한방] 「${aiChosen.word}」! 상대의 모든 패를 묶는 2수 앞 외통수입니다.`;
  } else if (tierNum === 3) {
    strategyBrief = `🔥 [3순위: 거의 한방급] 「${aiChosen.word}」! 상대 반격 어휘: 단 ${aiChosen.outCount}개!`;
  } else {
    strategyBrief = `🛡️ [4순위: 안전 방어] 「${aiChosen.word}」! 한방을 피하며 랠리를 이어갑니다.`;
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
    const analysis = await findUltimateBestWord(char);

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
        briefedWords: Array.isArray(data.briefedWords) ? data.briefedWords : [],
        opponentStartChar: data.opponentStartChar || null
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
      const result = await processGameMove(data.userWord || '', data.history || [], data.difficulty || 'hell');

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
      const rebuttal = getRebuttalAnalysis(char);
      if (rebuttal.totalCount === 0) {
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
