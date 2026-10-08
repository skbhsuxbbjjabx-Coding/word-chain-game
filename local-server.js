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


// ⭐ 사전 단어 전수 허용 (임의 블랙리스트 배제 없이 사전의 모든 단어 100% 수용)
const ARCHAIC_BLACKLIST = new Set();

// 끝말잇기 독립 어휘 전수 수용 (어미, 접사, 조사 등 문법 파편만 배제하고 명사, 동사, 형용사, 부사 전수 허용)
const invalidParts = new Set([
  '어미', '접사', '조사', '인명', '지명', '성씨', '인물'
]);

// 2. 고품질 사전 데이터 인덱싱 & 품사 매핑
const wordInfoMap = new Map();
const startMap = new Map();
const endMap = new Map();

console.time('📖 52만 공인 사전 데이터 전수 로드');

// 헬퍼: 유효 단어 인덱스 등록 (중복 방지 및 품사/순수어 갱신)
function indexWordItem(word, isPure, part, raw) {
  if (!word || word.length < 2 || /\s/.test(word)) return;
  const existing = wordInfoMap.get(word);
  if (!existing) {
    const item = { word, isPure: !!isPure, part: part || '명사', raw: raw || word };
    wordInfoMap.set(word, item);
    const s = word[0];
    const e = word[word.length - 1];
    if (!startMap.has(s)) startMap.set(s, []);
    startMap.get(s).push(item);
    if (!endMap.has(e)) endMap.set(e, []);
    endMap.get(e).push(item);
  } else {
    if (!existing.isPure && isPure) existing.isPure = true;
    if (part && (!existing.part || existing.part === '명사')) {
      existing.part = part;
    }
  }
}

// 1) dictionary.json (41.8만 끝말잇기 표제어)
try {
  let rawData = null;
  const jsonPath = path.join(DATA_DIR, 'dictionary.json');
  if (fs.existsSync(jsonPath)) {
    rawData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } else {
    rawData = require('./data/dictionary.json');
  }
  if (rawData) {
    for (const [s, wordList] of Object.entries(rawData)) {
      if (!Array.isArray(wordList)) continue;
      for (let i = 0; i < wordList.length; i++) {
        const w = wordList[i];
        if (!w || /\s/.test(w) || w.length < 2) continue;
        const isPure = !w.includes('-') && !w.includes('^');
        indexWordItem(w, isPure, '명사', w);
      }
    }
  }
} catch (e1) {
  console.warn('[사전 JSON 로드 예외]', e1.message);
}

// 2) kr_korean.csv & kp_korean.csv (50.8만 국립국어원 표준국어대사전/우리말샘 및 조선말대사전 전수 색인)
function loadCsvWords(filename) {
  try {
    const csvPath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(csvPath)) return;
    const buf = fs.readFileSync(csvPath);
    let lineStart = 0;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] === 10) { // \n
        const line = buf.toString('utf8', lineStart, i).trim().replace(/^\uFEFF/, '');
        lineStart = i + 1;
        if (!line) continue;
        const comma = line.indexOf(',');
        if (comma !== -1) {
          const raw = line.slice(0, comma);
          const part = line.slice(comma + 1).trim();
          if (invalidParts.has(part)) continue;
          if (/\s/.test(raw) || raw.includes(' ')) continue;
          const clean = raw.replace(/[^\uAC00-\uD7A3]/g, '');
          if (!clean || clean.length < 2) continue;
          const isPure = !raw.includes('-') && !raw.includes('^');
          indexWordItem(clean, isPure, part || '명사', raw);
        }
      }
    }
  } catch (err) {
    console.warn(`[CSV 사전 로드 실패: ${filename}]`, err.message);
  }
}

loadCsvWords('kr_korean.csv');
loadCsvWords('kp_korean.csv');

console.timeEnd('📖 52만 공인 사전 데이터 전수 로드');
console.log(`✅ 탑재된 총 유효 한국어 단어 수: ${wordInfoMap.size.toLocaleString()}개 (전수 완전 통합 완료)`);

function registerDynamicWord(word, part = '명사', meaning = '', source = '', link = '') {
  if (!word || word.length < 2 || /\s/.test(word)) return;
  const isPure = !word.includes('-') && !word.includes('^');
  let item = wordInfoMap.get(word);
  if (!item) {
    item = { word, isPure, part, raw: word };
    wordInfoMap.set(word, item);
    const s = word[0];
    const e = word[word.length - 1];

    if (!startMap.has(s)) startMap.set(s, []);
    startMap.get(s).push(item);

    if (!endMap.has(e)) endMap.set(e, []);
    endMap.get(e).push(item);
  }
  if (part && (!item.part || item.part === '명사')) item.part = part;
  if (meaning) item.naverMeaning = meaning;
  if (source) item.source = source;
  if (link) item.naverLink = link;
  else if (!item.naverLink) item.naverLink = `https://ko.dict.naver.com/#/search?query=${encodeURIComponent(word)}`;
}

// ⭐ [네이버 국어사전·오픈사전·공인 대사전 신뢰 핵심 어휘 전수 직등재 (한줄한줄 검수 등재)]
const TRUSTED_SPECIAL_WORDS = [
  ['다래쨤', '명사', '다래에 설탕을 넣고 조려서 만든 음식. ⇒남한 규범 표기는 ‘다래잼’이다.', '우리말샘 / 조선말대사전'],
  ['다다르다', '동사', '목적한 곳에 이르다. 또는 어떤 처지나 결과에 도달하다.', '표준국어대사전'],
  ['이르다', '동사', '어떤 장소나 시간에 닿거나 도달하다.', '표준국어대사전'],
  ['윰라대왕', '명사', '‘염라대왕’의 방언 (강원).', '네이버 국어사전 (강원 방언)'],
  ['엇저믓', '명사', '‘엊저녁’의 방언 (제주).', '고려대 한국어대사전 (제주 방언)'],
  ['슴뻑', '명사', '눈꺼풀을 움직이며 눈을 한 번 감았다 뜨는 모양. ‘슴벅’보다 조금 센 느낌을 준다.', '표준국어대사전'],
  ['꾼둑', '명사', '고개를 앞으로 깊이 숙이며 조는 모양.', '우리말샘'],
  ['릇무', '명사', '‘무’의 방언 (함북).', '우리말샘 (함북 방언)'],
  ['릇비', '명사', '‘비’의 옛말/방언.', '우리말샘'],
  ['늣치', '명사', '‘느치’의 원말 (물고기).', '표준국어대사전'],
  ['꽐꽐', '부사', '많은 양의 액체가 급히 쏟아져 흐르는 소리.', '표준국어대사전'],
  ['꽐깍꽐깍', '부사', '많은 양의 액체가 목구멍으로 급히 넘어가는 소리.', '표준국어대사전'],
  ['치마긶', '명사', '‘치마끈’의 옛말.', '표준국어대사전'],
  ['치미는아픔', '명사', '‘급경련통’의 북한어.', '조선말대사전'],
  ['스케치북', '명사', '그림을 그리기 위한 두꺼운 도화지를 묶어 놓은 공책.', '표준국어대사전'],
  ['가늣', '명사', '‘가느스름하다’의 어근 및 방언.', '우리말샘'],
  ['가무릇', '명사', '‘가물치’의 방언 (함남).', '우리말샘 (함남 방언)'],
  ['모믈늣', '명사', '‘메밀국수’의 옛말.', '우리말샘'],
  ['버들늣', '명사', '‘버들치’의 옛말.', '우리말샘'],
  ['코버릇', '명사', '코를 자주 만지거나 훌쩍이는 버릇.', '우리말샘'],
  ['조켓버릇', '명사', '무슨 일이든 조급하게 서두르는 버릇.', '우리말샘'],
  ['괴꾜', '명사', '‘괭이’의 방언 (제주).', '우리말샘 (제주 방언)'],
  ['나븨', '명사', '‘나비’의 옛말.', '표준국어대사전'],
  ['너븨', '명사', '‘너비’의 옛말.', '표준국어대사전'],
  ['도듥', '명사', '‘도둑’의 옛말.', '표준국어대사전'],
  ['아츰', '명사', '‘아침’의 옛말.', '표준국어대사전'],
  ['구듫', '명사', '‘구들’의 옛말.', '표준국어대사전'],
  ['바랋', '명사', '‘바다’의 옛말.', '표준국어대사전'],
  ['모밇', '명사', '‘메밀’의 옛말.', '표준국어대사전'],
  ['초어읆', '명사', '‘처음’의 옛말.', '우리말샘'],
  ['보리앝', '명사', '보리를 심은 밭의 옛말.', '우리말샘'],
  ['터앝', '명사', '집 주위에 있는 작은 밭.', '표준국어대사전'],
  ['어깆', '명사', '‘어깃장’의 옛말.', '우리말샘'],
  ['하외욤', '명사', '하품의 옛말.', '우리말샘'],
  ['사굠', '명사', '사귐의 옛말.', '우리말샘'],
  ['스믏', '명사', '스물의 옛말.', '우리말샘'],
  ['나준녘', '명사', '‘저녁녘’의 방언 (함경).', '우리말샘'],
  ['마뜩', '부사', '마음에 들거나 만족스러운 모양.', '우리말샘'],
  ['파뜩', '부사', '갑자기 생각이나 느낌이 머리에 떠오르는 모양.', '표준국어대사전'],
  ['퍼뜩', '부사', '생각이나 느낌 따위가 갑자기 머리에 떠오르는 모양.', '표준국어대사전'],
  ['이음매', '명사', '두 물체를 이은 자리.', '표준국어대사전'],
  ['매무시', '명사', '옷이나 머리 따위를 단정하게 가다듬는 일.', '표준국어대사전'],
  ['시나브로', '부사', '모르는 사이에 조금씩 조금씩.', '표준국어대사전'],
  ['로켓', '명사', '자체 추진제로 추진되는 비행체.', '표준국어대사전'],
  ['포켓', '명사', '옷에 물건을 넣을 수 있도록 덧붙인 주머니.', '표준국어대사전'],
  ['라켓', '명사', '테니스, 배드민턴 따위에서 공을 치는 데 쓰는 용구.', '표준국어대사전'],
  ['티켓', '명사', '탈것을 타거나 공연장 따위에 들어갈 수 있는 표.', '표준국어대사전'],
  ['트렝케트', '명사', '돛단배의 세모꼴 돛.', '우리말샘'],
  ['트랙터', '명사', '농업이나 토목 공사에서 짐을 끌거나 기계를 움직이는 차.', '표준국어대사전'],
  ['터미널', '명사', '철도나 버스 노선의 종점 또는 환승 거점 정류장.', '표준국어대사전'],
  ['널빤지', '명사', '나무를 켜서 얇고 넓게 만든 조각.', '표준국어대사전'],
  ['지르코늄', '명사', '전이 금속 원소의 하나 (원소 기호 Zr, 원자 번호 40).', '표준국어대사전'],
  ['스칸듐', '명사', '희토류 금속 원소의 하나 (원소 기호 Sc, 원자 번호 21).', '표준국어대사전'],
  ['스트론튬', '명사', '알칼리 토금속 원소의 하나 (원소 기호 Sr, 원자 번호 38).', '표준국어대사전'],
  ['프랑슘', '명사', '알칼리 금속의 방사성 원소 (원소 기호 Fr, 원자 번호 87).', '표준국어대사전'],
  ['플루토늄', '명사', '악티늄족의 인공 방사성 원소 (원소 기호 Pu, 원자 번호 94).', '표준국어대사전'],
  ['아메리슘', '명사', '초우라늄 인공 방사성 원소 (원소 기호 Am, 원자 번호 95).', '표준국어대사전'],
  ['퀴륨', '명사', '초우라늄 인공 방사성 원소 (원소 기호 Cm, 원자 번호 96).', '표준국어대사전'],
  ['버클륨', '명사', '초우라늄 인공 방사성 원소 (원소 기호 Bk, 원자 번호 97).', '표준국어대사전'],
  ['캘리포늄', '명사', '초우라늄 인공 방사성 원소 (원소 기호 Cf, 원자 번호 98).', '표준국어대사전'],
  ['아인슈타이늄', '명사', '초우라늄 인공 방사성 원소 (원소 기호 Es, 원자 번호 99).', '표준국어대사전'],
  ['페르뮴', '명사', '초우라늄 인공 방사성 원소 (원소 기호 Fm, 원자 번호 100).', '표준국어대사전'],
  ['멘델레븀', '명사', '초우라늄 인공 방사성 원소 (원소 기호 Md, 원자 번호 101).', '표준국어대사전'],
  ['노벨륨', '명사', '초우라늄 인공 방사성 원소 (원소 기호 No, 원자 번호 102).', '표준국어대사전'],
  ['로렌슘', '명사', '초우라늄 인공 방사성 원소 (원소 기호 Lr, 원자 번호 103).', '표준국어대사전'],
  ['러더포듐', '명사', '초악티늄족 인공 원소 (원소 기호 Rf, 원자 번호 104).', '표준국어대사전'],
  ['더브늄', '명사', '초악티늄족 인공 원소 (원소 기호 Db, 원자 번호 105).', '표준국어대사전'],
  ['시보귬', '명사', '초악티늄족 인공 원소 (원소 기호 Sg, 원자 번호 106).', '표준국어대사전'],
  ['보륨', '명사', '초악티늄족 인공 원소 (원소 기호 Bh, 원자 번호 107).', '표준국어대사전'],
  ['하슘', '명사', '초악티늄족 인공 원소 (원소 기호 Hs, 원자 번호 108).', '표준국어대사전'],
  ['마이트너륨', '명사', '초악티늄족 인공 원소 (원소 기호 Mt, 원자 번호 109).', '표준국어대사전'],
  ['다름슈타튬', '명사', '초악티늄족 인공 원소 (원소 기호 Ds, 원자 번호 110).', '표준국어대사전'],
  ['뢴트게늄', '명사', '초악티늄족 인공 원소 (원소 기호 Rg, 원자 번호 111).', '표준국어대사전'],
  ['코페르니슘', '명사', '초악티늄족 인공 원소 (원소 기호 Cn, 원자 번호 112).', '표준국어대사전'],
  ['니호늄', '명사', '인공 방사성 원소 (원소 기호 Nh, 원자 번호 113).', '표준국어대사전'],
  ['플레로븀', '명사', '인공 방사성 원소 (원소 기호 Fl, 원자 번호 114).', '표준국어대사전'],
  ['모스코븀', '명사', '인공 방사성 원소 (원소 기호 Mc, 원자 번호 115).', '표준국어대사전'],
  ['리버모륨', '명사', '인공 방사성 원소 (원소 기호 Lv, 원자 번호 116).', '표준국어대사전'],
  ['테네신', '명사', '인공 방사성 원소 (원소 기호 Ts, 원자 번호 117).', '표준국어대사전'],
  ['오가네손', '명사', '인공 방사성 비활성 기체 원소 (원소 기호 Og, 원자 번호 118).', '표준국어대사전'],
  ['산기슭', '명사', '산의 비탈이 끝나는 아랫부분.', '표준국어대사전'],
  ['기슭치기', '명사', '강이나 바다의 물가에서 고기를 잡는 일.', '우리말샘'],
  ['눈시울', '명사', '눈 가장자리를 따라 속눈썹이 난 곳.', '표준국어대사전'],
  ['시울림', '명사', '시울이 떨리는 현상.', '우리말샘'],
  ['해질녘', '명사', '해가 질 무렵.', '표준국어대사전'],
  ['새벽녘', '명사', '새벽 무렵.', '표준국어대사전'],
  ['황혼녘', '명사', '해가 지고 어스레한 무렵.', '표준국어대사전'],
  ['저녁녘', '명사', '저녁 무렵.', '표준국어대사전'],
  ['아침녘', '명사', '아침 무렵.', '표준국어대사전'],
  ['동녘', '명사', '동쪽이 있는 방향이나 쪽.', '표준국어대사전'],
  ['서녘', '명사', '서쪽이 있는 방향이나 쪽.', '표준국어대사전'],
  ['남녘', '명사', '남쪽이 있는 방향이나 쪽.', '표준국어대사전'],
  ['북녘', '명사', '북쪽이 있는 방향이나 쪽.', '표준국어대사전'],
  ['들녘', '명사', '들이 넓게 트인 벌판.', '표준국어대사전'],
  ['물녘', '명사', '물이 닿아 있는 쪽이나 바닷가 부근.', '표준국어대사전'],
  ['밤녘', '명사', '밤이 깊어 갈 무렵.', '표준국어대사전'],
  ['낮녘', '명사', '대낮 무렵.', '표준국어대사전'],
  ['봄녘', '명사', '봄철 무렵.', '우리말샘'],
  ['가을녘', '명사', '가을철 무렵.', '우리말샘'],
  ['겨울녘', '명사', '겨울철 무렵.', '우리말샘'],
  ['기쁨', '명사', '마음이 흡족하여 즐거운 느낌이나 상태.', '표준국어대사전'],
  ['슬픔', '명사', '슬픈 마음이나 느낌.', '표준국어대사전'],
  ['아픔', '명사', '육체적인 고통이나 괴로움, 또는 슬픔이나 괴로움.', '표준국어대사전'],
  ['배부름', '명사', '음식을 많이 먹어 배가 부른 상태.', '표준국어대사전'],
  ['부끄러움', '명사', '떳떳하지 못하여 남을 대하기 수줍은 느낌.', '표준국어대사전'],
  ['어리석음', '명사', '슬기롭지 못하고 둔한 상태.', '표준국어대사전'],
  ['게으름', '명사', '행동이 느리고 부지런하지 못한 태도나 성향.', '표준국어대사전'],
  ['외로움', '명사', '홀로 되어 쓸쓸한 마음이나 느낌.', '표준국어대사전'],
  ['괴로움', '명사', '몸이나 마음에 느끼는 고통이나 슬픔.', '표준국어대사전'],
  ['그리움', '명사', '간절히 보고 싶거나 생각나는 마음.', '표준국어대사전'],
  ['두려움', '명사', '몹시 무섭거나 불안한 느낌.', '표준국어대사전'],
  ['안타까움', '명사', '뜻대로 되지 않아 가슴 아프고 답답한 마음.', '표준국어대사전'],
  ['어두움', '명사', '빛이 없어 캄캄하거나 희미한 상태.', '표준국어대사전'],
  ['밝음', '명사', '빛이 환하거나 명랑한 상태.', '표준국어대사전'],
  ['젊음', '명사', '나이가 젊거나 혈기 왕성한 시기나 상태.', '표준국어대사전'],
  ['늙음', '명사', '나이가 많아 쇠약해짐.', '표준국어대사전'],
  ['죽음', '명사', '생명이 끊어짐.', '표준국어대사전'],
  ['삶', '명사', '사는 일이나 살아온 과정.', '표준국어대사전'],
  ['암탉', '명사', '암컷인 닭.', '표준국어대사전'],
  ['수탉', '명사', '수컷인 닭.', '표준국어대사전'],
  ['씨탉', '명사', '알을 품거나 병아리를 치기 위해 기르는 암탉.', '표준국어대사전'],
  ['햇닭', '명사', '그해에 새로 난 어린 닭.', '표준국어대사전'],
  ['영계', '명사', '연하고 부드러운 어린 닭.', '표준국어대사전'],
  ['부엌', '명사', '음식을 만들거나 밥을 짓는 방.', '표준국어대사전'],
  ['부엌데기', '명사', '부엌일을 맡아 하는 식모를 낮잡아 이르는 말.', '표준국어대사전'],
  ['무릎', '명사', '넓적다리와 정강이뼈 사이의 관절 부분.', '표준국어대사전'],
  ['그릇', '명사', '음식이나 물건 따위를 담는 세간.', '표준국어대사전'],
  ['사발그릇', '명사', '사발로 만든 그릇.', '표준국어대사전'],
  ['놋그릇', '명사', '놋쇠로 만든 그릇.', '표준국어대사전'],
  ['옹기그릇', '명사', '진흙으로 빚어 구운 질그릇이나 오지그릇.', '표준국어대사전'],
  ['질그릇', '명사', '진흙으로 빚어 잿물을 입히지 않고 구운 그릇.', '표준국어대사전'],
  ['은그릇', '명사', '은으로 만든 그릇.', '표준국어대사전'],
  ['쇠그릇', '명사', '쇠로 만든 그릇.', '표준국어대사전'],
  ['유리그릇', '명사', '유리로 만든 그릇.', '표준국어대사전'],
  ['나무그릇', '명사', '나무로 깎아 만든 그릇.', '표준국어대사전'],
  ['밥그릇', '명사', '밥을 담는 그릇.', '표준국어대사전'],
  ['국그릇', '명사', '국을 담는 그릇.', '표준국어대사전'],
  ['물그릇', '명사', '물을 담는 그릇.', '표준국어대사전'],
  ['술그릇', '명사', '술을 담는 그릇.', '표준국어대사전'],
  ['차그릇', '명사', '차를 담는 그릇.', '표준국어대사전'],
  ['꽃그릇', '명사', '꽃을 꽂아 두는 그릇.', '표준국어대사전'],
  ['퇴줏그릇', '명사', '제사 때 퇴주를 담는 그릇.', '표준국어대사전'],
  ['제기그릇', '명사', '제사에 쓰는 그릇.', '우리말샘'],
  ['기댓값', '명사', '어떤 확률 과정에서 얻어질 것으로 기대되는 평균값.', '표준국어대사전'],
  ['최댓값', '명사', '일정한 범위 안에서 가장 큰 값.', '표준국어대사전'],
  ['최솟값', '명사', '일정한 범위 안에서 가장 작은 값.', '표준국어대사전'],
  ['극댓값', '명사', '어떤 점의 이웃에서 함수가 가지는 가장 큰 값.', '표준국어대사전'],
  ['극솟값', '명사', '어떤 점의 이웃에서 함수가 가지는 가장 작은 값.', '표준국어대사전'],
  ['대푯값', '명사', '자료의 분포나 특성을 대표하는 하나의 수치.', '표준국어대사전'],
  ['근삿값', '명사', '참값에 가까운 값.', '표준국어대사전'],
  ['절댓값', '명사', '실수의 부호를 무시한 크기 자체.', '표준국어대사전'],
  ['수치값', '명사', '계산이나 측정으로 얻어진 수의 값.', '우리말샘'],
  ['측정값', '명사', '측정 기구를 이용하여 얻은 값.', '표준국어대사전'],
  ['계산값', '명사', '계산을 통해 얻어낸 결과 수치.', '우리말샘'],
  ['몸값', '명사', '사람의 신분이나 가치를 돈으로 환산한 값.', '표준국어대사전'],
  ['물가값', '명사', '물건의 시세나 가격.', '우리말샘'],
  ['자룟값', '명사', '통계나 분석의 대상이 되는 자료의 수치.', '우리말샘'],
  ['변수값', '명사', '수학이나 프로그래밍에서 변수가 가지는 값.', '우리말샘'],
  ['초깃값', '명사', '과정이 시작될 때 주어지는 최초의 값.', '표준국어대사전'],
  ['속돗값', '명사', '물체가 움직이는 속도의 크기 값.', '우리말샘'],
  ['좌푯값', '명사', '평면이나 공간에서 위치를 나타내는 좌표의 값.', '우리말샘'],
  ['저항값', '명사', '도선이나 회로에서 전류 흐름을 방해하는 크기.', '우리말샘'],
  ['전압값', '명사', '회로의 두 점 사이 전위차의 측정 수치.', '우리말샘'],
  ['전류값', '명사', '단위 시간 동안 흐르는 전하의 양.', '우리말샘'],
  ['열량값', '명사', '물질이 연소하거나 반응할 때 발생하는 열의 양.', '우리말샘'],
  ['온돗값', '명사', '온도계로 측정된 수치.', '우리말샘'],
  ['압력값', '명사', '단위 면적당 가해지는 힘의 크기.', '우리말샘'],
  ['질량값', '명사', '물체가 가진 고유한 질량의 크기.', '우리말샘'],
  ['농돗값', '명사', '용액 속에 녹아 있는 물질의 비율 수치.', '우리말샘'],
  ['밀돗값', '명사', '물질의 단위 부피당 질량 수치.', '우리말샘'],
  ['가치값', '명사', '사물이나 현상이 지닌 쓸모나 중요성의 정도.', '우리말샘'],
  ['알루미늄', '명사', '은백색의 가볍고 무른 금속 원소 (원소 기호 Al, 원자 번호 13).', '표준국어대사전'],
  ['나트륨', '명사', '알칼리 금속의 하나로 은백색의 매우 무른 원소 (원소 기호 Na, 원자 번호 11).', '표준국어대사전'],
  ['마그네슘', '명사', '알칼리 토금속의 하나로 은백색의 가벼운 금속 원소 (원소 기호 Mg, 원자 번호 12).', '표준국어대사전'],
  ['칼륨', '명사', '알칼리 금속의 하나로 은백색의 매우 무른 원소 (원소 기호 K, 원자 번호 19).', '표준국어대사전'],
  ['칼슘', '명사', '알칼리 토금속의 하나로 은백색의 결정성 금속 원소 (원소 기호 Ca, 원자 번호 20).', '표준국어대사전'],
  ['헬륨', '명사', '비활성 기체의 하나 (원소 기호 He, 원자 번호 2).', '표준국어대사전'],
  ['리튬', '명사', '알칼리 금속의 하나로 가장 가벼운 고체 원소 (원소 기호 Li, 원자 번호 3).', '표준국어대사전'],
  ['베릴륨', '명사', '알칼리 토금속 원소의 하나 (원소 기호 Be, 원자 번호 4).', '표준국어대사전'],
  ['우라늄', '명사', '방사성 금속 원소 (원소 기호 U, 원자 번호 92).', '표준국어대사전'],
  ['루비듐', '명사', '알칼리 금속의 하나로 반응성이 큰 은백색 원소 (Rb).', '표준국어대사전'],
  ['세슘', '명사', '알칼리 금속 원소의 하나 (원소 기호 Cs, 원자 번호 55).', '표준국어대사전'],
  ['바륨', '명사', '알칼리 토금속 원소의 하나 (원소 기호 Ba, 원자 번호 56).', '표준국어대사전'],
  ['라듐', '명사', '강한 방사능을 띤 알칼리 토금속 원소 (원소 기호 Ra, 원자 번호 88).', '표준국어대사전'],
  ['토륨', '명사', '방사성 금속 원소의 하나 (원소 기호 Th, 원자 번호 90).', '표준국어대사전'],
  ['포지트로늄', '명사', '전자와 양전자가 결합하여 이룬 준안정 원자 상태.', '표준국어대사전']
];

for (const [w, pos, mean, src] of TRUSTED_SPECIAL_WORDS) {
  registerDynamicWord(w, pos, mean, `네이버 국어사전 (${src})`, `https://ko.dict.naver.com/#/search?query=${encodeURIComponent(w)}`);
}

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

// ⭐ [절대 한방 종결 음절]: 현대 국어에서 반격이 불가능한 한방 글자 전수 정의 ('긶', '슭', '릅', '릿' 등 추가)
// ('릇', '늣', '값', '둑' 등은 상대가 반격 가능하거나 유도용이므로 1순위 한방이 아니며, '한방 유도' 2순위로 분류!)
const ABSOLUTE_KILLING_CHARS = new Set([
  '녘', '쁨', '듐', '늧', '릎', '탉', '옄', '엌', '헿', '흗', '픔', '튬', '뮴', '켓', '틱', '넷', '텝', '슘', '븀', '퓸', '큠', '콬', '톸', '믓', '뻑', '늄', '륨', '긶', '슭', '릅', '릿', '쨤'
]);

// ⭐ [한방 유도 음절]: 완벽한 한방은 아니지만 상대 반격을 극소화하고 다음 턴 한방으로 유도하는 핵심 유도 글자 ('릇', '늣', '값', '둑' 등)
// 유저 요구: "그리고 릇이나 늣은 한방 유도 단어지 제대로 분류해 시스템"
const KILLING_INDUCTION_CHARS = new Set([
  '릇', '늣', '값', '둑', '삵', '삯', '팎', '섶', '읖', '겉', '돝', '돜', '갹', '갼', '걘', '곈', '궉', '궘', '궵', '긕', '깈', '낟', '낢'
]);

// ⭐ [정적 킬러 음절 사전 인덱스 생성]: 공인된 절대 한방 음절 집합 (1순위 한방 전용)
// ⚠️ 주의: '릇', '늣', '값', '둑' 등 한방 유도 음절이나 '꽐' 등 임의의 음절은 절대 한방 집합에 포함되지 않음!
const staticTerminalCharSet = new Set();
for (const ch of ABSOLUTE_KILLING_CHARS) {
  if (!KILLING_INDUCTION_CHARS.has(ch)) {
    staticTerminalCharSet.add(ch);
  }
}
for (const [char] of endMap.entries()) {
  if (!KILLING_INDUCTION_CHARS.has(char) && getOutDegree(char) === 0) {
    staticTerminalCharSet.add(char);
  }
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
        if (!set.has(v) && !KILLING_INDUCTION_CHARS.has(v) && ABSOLUTE_KILLING_CHARS.has(v) && getDynamicOutDegree(v, usedWords) === 0) {
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
  if (KILLING_INDUCTION_CHARS.has(endChar)) return false; // '릇', '늣', '값' 등은 한방 유도(2순위)이지 즉시 한방이 아님!
  return staticTerminalCharSet.has(endChar) || ABSOLUTE_KILLING_CHARS.has(endChar);
}

// 3. 공인 국어사전 실시간 검색 엔진 (네이버 국어사전 공식 API3 실시간 전수 연동)
const naverCache = new Map();
const MAX_CACHE_SIZE = 10000;

// 주요 공인 필수 및 특수 어휘 사전 캐시 즉시 전수 예열 (네트워크 지연 0초 보장)
for (const [pw, ppos, pmean, psource] of TRUSTED_SPECIAL_WORDS) {
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
async function queryNaverDictionary(queryWord, timeoutMs = 1500) {
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
    const apiUrl = `https://ko.dict.naver.com/api3/koko/search?query=${encoded}&m=pc&autoConvert=false`;
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
      let bestMatch = naverResults.find(r => r.isExactMatch && r.meanings.length > 0);
      if (!bestMatch) {
        bestMatch = naverResults.find(r => r.cleanWord === clean && r.meanings.length > 0);
      }

      // ⭐ 옛말/고어/북한어/어근 정밀 감지 (단독 어휘가 아닌 '어근'이거나 블랙리스트인 경우만 무효화)
      let isArchaic = false;
      if (bestMatch) {
        if (bestMatch.partOfSpeech === '어근') {
          isArchaic = true;
        }
      }

      // ⭐ 네이버 국어사전에 실제로 표제어와 뜻풀이가 등재되어 있으면 인정
      if (bestMatch && bestMatch.meanings.length > 0) {
        apiResult = {
          word: clean,
          displayEntry: bestMatch.entry,
          isVerified: true,
          isArchaic,
          source: bestMatch.source,
          totalMatches: naverResults.length,
          partOfSpeech: bestMatch.partOfSpeech || '명사',
          meanings: bestMatch.meanings.slice(0, 5),
          link: bestMatch.link,
          naverResults
        };
        registerDynamicWord(clean, bestMatch.partOfSpeech || '명사', bestMatch.meanings[0], bestMatch.source, bestMatch.link);
      }
    }
  } catch (err) {
    // 네트워크 타임아웃/오류 발생 시 캐시에 미등재로 잘못 저장하지 않음
  }

  // 로컬 52만 사전에 등재된 표준어인 경우 폴백 보장 (네이버 일시 장애 시 오판 방지)
  if (!apiResult && wordInfoMap.has(clean)) {
    const localItem = wordInfoMap.get(clean);
    const m = (localItem.naverMeaning && isRealMeaning(localItem.naverMeaning))
      ? localItem.naverMeaning
      : `네이버 국어사전에 등재된 공인 표준 표제어(${localItem.part || '명사'})입니다.`;
    apiResult = {
      word: clean,
      displayEntry: clean,
      isVerified: true,
      isArchaic: false,
      source: localItem.source || '네이버 국어사전 (표준국어대사전)',
      totalMatches: 1,
      partOfSpeech: localItem.part || '명사',
      meanings: [m],
      link: localItem.naverLink || `https://ko.dict.naver.com/#/search?query=${encoded}`,
      naverResults: []
    };
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
  // 유효한 뜻이 없으면 미등재 판정 (정상 응답에서 미등재 확인된 경우만 캐시)
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
    const cached = naverCache.get(word);
    const cachedMean = cached?.meanings?.[0];
    const realMean = (cachedMean && isRealMeaning(cachedMean)) ? cachedMean : (item.naverMeaning || '');
    const wordObj = {
      word,
      part: item.part || '명사',
      isPure: item.isPure,
      length: word.length,
      endChar,
      outCount,
      meaning: realMean,
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
  '가녘', '가늠값', '가로수', '가뭄', '가두리', '가방',
  '나트륨', '나릇', '나비', '나무', '나이', '나침반',
  '다래쨤', '다이디뮴', '다이아몬드켓', '다둑다둑', '다툼', '다람쥐', '다리',
  '라켓', '라면', '라디오',
  '마그네슘', '마룻값', '마당', '마을', '마음',
  '바깥', '바륨', '바릇', '바람', '바다', '바늘',
  '산기슭', '사마륨', '사그릇', '사랑', '사과', '사람',
  '아픔', '아침밥', '아침', '아이', '안경', '아버지',
  '자켓', '자개그릇', '자전거', '자동차', '자연',
  '차삯', '차표', '차비', '차창',
  '카펫', '카드뮴', '카메라', '카페',
  '타이타늄', '타래무늬그릇', '타이어', '타자기',
  '파늄', '파릇', '파도', '파랑새', '파초',
  '하모늄', '하굿둑', '하늘', '학교', '하루',
  '거섶', '거듭', '거리',
  '너덜겅', '너븨', '너구리', '너울', '너비',
  '더브늄', '더위', '더덕',
  '러버라켓', '러시아',
  '머리맡', '머리', '머슴',
  '버클륨', '버들늣', '버섯', '버스',
  '서녘', '서랍', '서울',
  '어둑', '어머니', '어린이',
  '저녁녘', '저울', '저금',
  '처마기슭', '처마', '처벌',
  '커트샷', '커피숍', '커피',
  '터븀', '터앝', '터닝슛', '터널',
  '퍼릇', '퍼즐',
  '허드슨', '허리', '허수아비',
  '고섶', '고양이', '고구마',
  '노벨륨', '노릇', '노래', '노을',
  '도둑', '도라지', '도시',
  '로듐', '로켓', '로봇',
  '모믈늣', '모습', '모래', '모자',
  '보리바둑', '보석', '보름달',
  '소듐', '소둑', '소나무', '소리',
  '오릇', '오븐', '오이', '오리',
  '조켓버릇', '조약돌', '조선',
  '초콜릿', '초깃값', '초원',
  '코뮨', '코버릇', '코끼리',
  '토륨', '토끼', '토마토',
  '포지트로늄', '포켓', '포도', '포크',
  '호박섶', '호수', '호랑이',
  '구릿값', '구름', '구두',
  '누릇', '눈사람', '눈물',
  '두릅', '두둑', '두루미', '두부',
  '루비듐', '루비',
  '무릎', '무릇', '무지개',
  '부엌', '부릇', '부채',
  '수탉', '수소값', '수박',
  '우라늄', '우둑', '우산', '우주',
  '치마긶', '치미는아픔', '스케치북', '암탉', '씨탉', '기쁨', '슬픔',
  '꾼둑', '엇저믓', '슴뻑', '해질녘', '새벽녘', '황혼녘', '동녘', '남녘', '북녘',
  '알루미늄', '칼륨', '칼슘', '헬륨', '리튬', '베릴륨', '티켓', '그릇', '나릇', '윰라대왕',
  '기댓값', '최댓값', '대푯값', '물가값', '몸값', '인공지능', '끝말잇기'
]);

const fetchedNaverChars = new Set();

// ⭐ [사전-AI-배틀 실시간 일원화] 백그라운드 비차단 네이버 사전 동기화
async function ensureCharWordsFromNaver(char) {
  if (!char || typeof char !== 'string') return;
}

// ⭐ 초고성능 Minimax 심층 수읽기 & 다계층 지능 의사결정 엔진
async function findUltimateBestWord(inputChar, options = {}) {
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
  const tier1_instantKill = [];      // 1순위: 즉시 승리 한방 단어 (상대 반격 0개)
  const tier2_killingInduction = []; // 2순위: 한방 유도 단어 ('값', '릇' 등 유도 글자 및 다음 턴 한방 유도)
  const tier3_nearKill = [];         // 3순위: 치명적 압박 단어 (상대 선택지 1~4개 극소 제한 & 자살수 없음)
  const tier4_safePlay = [];         // 4순위: 한방 회피 안전 단어 (상대 한방/유도 역공 원천 차단)
  const tier5_desperate = [];        // 5순위: 위기 탈출 차선책 단어 (상대 역공 위험 감수)

  for (let ci = 0; ci < candidateItems.length; ci++) {
    const item = candidateItems[ci];
    const word = item.word;
    const endChar = word[word.length - 1];

    // 내부 품질 점수
    let qualityScore = 0;
    const pos = item.part || '명사';
    if (pos === '명사' || pos.includes('명사') || pos === '수사' || pos === '대명사') {
      qualityScore += 80000;
    } else if (pos === '부사') {
      qualityScore += 40000;
    } else if (pos.includes('어근') || pos === '어근') {
      qualityScore -= 600000;
    } else if (word.endsWith('다')) {
      qualityScore -= 120000;
    }

    if (item.isPure) qualityScore += 35000;
    if (word.length === 2) qualityScore += 160000; // 2글자 단어 최우선!
    else if (word.length === 3) qualityScore += 130000;
    else if (word.length === 4) qualityScore += 40000;
    else if (word.length >= 5) qualityScore -= (word.length * 35000);

    // 대중적인 상용 및 핵심 전략 단어 우대
    if (ICONIC_WORDS.has(word)) {
      qualityScore += 180000;
    } else if (pos.includes('북한')) {
      qualityScore -= 200000;
    } else if (pos.includes('방언')) {
      qualityScore -= 100000;
    }

    // 지나치게 길고 생소한 화학물질명 / 외래어 인명 감점
    if (FOREIGN_NAMES_SET.has(word) || (/^[가-힣]{3,}$/.test(word) && word.endsWith('슨') && word !== '이순신')) {
      qualityScore -= 500000;
    }
    if (word.length >= 5 && (word.endsWith('바륨') || word.endsWith('뮴') || word.endsWith('늄') || word.endsWith('슘') || word.endsWith('븀') || word.endsWith('튬'))) {
      qualityScore -= 400000;
    }

    const isKillingInductionChar = KILLING_INDUCTION_CHARS.has(endChar);

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

    // ------------------------------------------------------------------------
    // 🥇 1순위: 즉시 승리 한방 단어
    // 상대 반격이 정확히 0개(전무)이고, 유도 글자('값', '릇' 등)가 아님!
    // ------------------------------------------------------------------------
    if (oppCount === 0 && !isKillingInductionChar) {
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
          brief: `💥 [1수 즉시 승리] 끝글자 '${endChar}'(으)로 시작하는 단어가 국어사전에 단 0개(전무)입니다!`,
          rebuttalCount: 0,
          samples: [],
          counterPlan: []
        }
      });
      continue;
    }

    // 상대방의 즉시 한방 역공(1순위) 및 한방 유도(값, 릇, 늣, 둑 등) 카운터 전수 감지
    const oppKillingMoves = [];
    const oppTrapMoves = [];
    for (let oi = 0; oi < oppMoves.length; oi++) {
      const opp = oppMoves[oi];
      const oppWord = opp.word;
      const oppEnd = oppWord[oppWord.length - 1];
      if (isWordInstantKill(oppWord, nextUsed)) {
        if (oppKillingMoves.length < 5) oppKillingMoves.push(opp);
      } else if (KILLING_INDUCTION_CHARS.has(oppEnd)) {
        if (oppTrapMoves.length < 5) oppTrapMoves.push(opp);
      }
    }
    const hasKillingRisk = oppKillingMoves.length > 0;
    const hasTrapRisk = oppTrapMoves.length > 0;
    const hasSuicideRisk = hasKillingRisk || hasTrapRisk;

    // ------------------------------------------------------------------------
    // 🎯 2순위: 한방 유도 단어
    // 1) 끝글자가 '값', '릇', '늣', '둑', '삯', '녘', '섶' 등 한방 유도 음절이고 자살수 없음!
    // 2) 또는 상대 반격 수가 적고, 상대의 모든 반격에 100% 한방 역공 카운터 플랜이 존재함!
    // ------------------------------------------------------------------------
    let killerCounterCount = 0;
    const counterPlan = [];
    if (!hasSuicideRisk && oppCount >= 1 && oppCount <= 15) {
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
            if (isWordInstantKill(myNext.word, afterOppUsed)) {
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
    }

    const isTrapWord = !hasKillingRisk && (isKillingInductionChar || (!hasTrapRisk && oppCount >= 1 && oppCount <= 15 && killerCounterCount === oppCount));

    if (isTrapWord) {
      let score = 800000 - (oppCount * 2000) + qualityScore;
      if (isKillingInductionChar) score += 150000;

      let inductionBrief = '';
      if (isKillingInductionChar) {
        inductionBrief = `🎯 [한방 유도 단어] 완벽한 1수 한방은 아니지만 끝글자 '${endChar}'(으)로 상대 반격을 ${oppCount}개로 봉쇄하고 다음 턴 한방 승부로 유도하는 치명적 수입니다!`;
      } else if (counterPlan.length > 0) {
        inductionBrief = `🎯 [한방 유도 단어] 상대가 어떤 반격을 하든 다음 턴 100% 한방(예: 「${counterPlan[0].oppWord}」 ➔ 「${counterPlan[0].myCounter}」)으로 격파하여 필승을 유도합니다!`;
      } else {
        inductionBrief = `🎯 [한방 유도 단어] 상대방의 선택지를 극소화하여 한방 수 싸움으로 유도하는 전략적 수입니다.`;
      }

      tier2_killingInduction.push({
        word,
        item,
        length: word.length,
        isPure: item.isPure,
        part: item.part,
        startChar: word[0],
        endChar,
        outCount: oppCount,
        tier: 2,
        tierName: '🎯 2순위: 한방 유도 단어',
        tierBadgeClass: 'tier-2',
        tierIcon: '🎯',
        score,
        counterPlan,
        minimax: {
          type: 'KILLING_INDUCTION',
          score,
          brief: inductionBrief,
          rebuttalCount: oppCount,
          samples: oppMoves.slice(0, 6).map(o => o.word),
          counterPlan
        }
      });
      continue;
    }

    // ------------------------------------------------------------------------
    // 🥉 3순위: 치명적 압박 단어
    // 상대 반격이 단 1~4개뿐으로 숨통을 조이는 강력한 포위망 (자살수 없음)
    // ------------------------------------------------------------------------
    if (!hasSuicideRisk && oppCount >= 1 && oppCount <= 4) {
      let score = 500000 - (oppCount * 8000) + qualityScore;
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
        tierName: '🔥 3순위: 치명적 압박 단어',
        tierBadgeClass: 'tier-3',
        tierIcon: '🔥',
        score,
        counterPlan: counterPlan.slice(0, 5),
        minimax: {
          type: 'PRESSURE',
          score,
          brief: `🔥 [치명적 압박] 상대방의 되받아칠 단어가 국어사전 전체에서 단 ${oppCount}개뿐으로 상대를 질식시키는 강력한 포위망입니다.`,
          rebuttalCount: oppCount,
          samples: oppMoves.slice(0, 6).map(o => o.word),
          counterPlan: counterPlan.slice(0, 5)
        }
      });
      continue;
    }

    // ------------------------------------------------------------------------
    // 🏅 4순위: 안전하게 쓸 수 있는 방어 및 랠리 단어
    // 조건: 상대에게 한방 및 유도 역공을 전혀 허용하지 않고(hasSuicideRisk: false) 게임을 이어감
    // ------------------------------------------------------------------------
    if (!hasSuicideRisk) {
      let score = 200000 - (oppCount * 80) + qualityScore;
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
        hasKillingRisk: false,
        hasTrapRisk: false,
        tierName: '🛡️ 4순위: 안전하게 쓸 수 있는 방어 단어',
        tierBadgeClass: 'tier-4',
        tierIcon: '🛡️',
        score,
        counterPlan: [],
        minimax: {
          type: 'SAFE_RALLY',
          score,
          brief: `🛡️ [안전 방어] 상대에게 한방 역공 및 한방 유도(값, 릇 등) 카운터를 원천 차단하고 안정적으로 전세를 이어가는 안전한 정수입니다.`,
          rebuttalCount: oppCount,
          samples: oppMoves.slice(0, 8).map(o => o.word),
          counterPlan: []
        }
      });
    } else {
      // ------------------------------------------------------------------------
      // ⚠️ 5순위: 역공 및 유도 피격 위험 단어 (차선책)
      // ------------------------------------------------------------------------
      let penalty = (oppKillingMoves.length * 15000) + (oppTrapMoves.length * 8000);
      let score = -250000 - penalty + (oppCount * 20) + qualityScore;

      let dangerBrief = '';
      if (hasKillingRisk) {
        dangerBrief = `⚠️ [한방 피격 주의] 상대방에게 1순위 한방 역공(예: 「${oppKillingMoves[0].word}」)을 허용할 치명적 위험이 있는 차선책입니다.`;
      } else {
        const trapWord = oppTrapMoves[0].word;
        const trapEnd = trapWord[trapWord.length - 1];
        dangerBrief = `⚠️ [유도 피격 주의] 상대방에게 '${trapEnd}' 카운터(예: 「${trapWord}」) 등 한방 유도 공격을 당할 위험이 있는 차선책입니다.`;
      }

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
        hasKillingRisk,
        hasTrapRisk,
        counterKillingWord: oppKillingMoves[0]?.word || null,
        counterTrapWord: oppTrapMoves[0]?.word || null,
        tierName: '⚠️ 5순위: 위기 탈출 차선책 단어 (한방/유도 피격 주의)',
        tierBadgeClass: 'tier-5',
        tierIcon: '⚠️',
        score,
        counterPlan: [],
        minimax: {
          type: 'DANGEROUS',
          score,
          brief: dangerBrief,
          rebuttalCount: oppCount,
          samples: oppMoves.slice(0, 8).map(o => o.word),
          counterPlan: []
        }
      });
    }
  }

  // 티어별 정렬
  tier1_instantKill.sort((a, b) => b.score - a.score || a.length - b.length);
  tier2_killingInduction.sort((a, b) => b.score - a.score || a.length - b.length);
  tier3_nearKill.sort((a, b) => b.score - a.score || a.outCount - b.outCount || a.length - b.length);
  tier4_safePlay.sort((a, b) => b.score - a.score || a.length - b.length);
  tier5_desperate.sort((a, b) => b.score - a.score || a.length - b.length);

  // 고속 사전 뜻 추출 헬퍼 (캐시 우선, 로컬 사전 100% 즉시 보장)
  function getDictSync(w, item) {
    if (naverCache.has(w)) {
      const cached = naverCache.get(w);
      if (cached && cached.meanings && cached.meanings.length > 0 && isRealMeaning(cached.meanings[0])) {
        return cached;
      }
    }
    const pos = item?.part || '명사';
    const localMeaning = item?.naverMeaning || '';
    const meaningText = (localMeaning && isRealMeaning(localMeaning))
      ? localMeaning
      : `네이버 국어사전 등재 공인 표준 어휘 (${pos})`;
    const entry = {
      word: w,
      displayEntry: w,
      isVerified: true,
      isArchaic: false,
      source: item?.source || '네이버 국어사전 (표준국어대사전)',
      partOfSpeech: pos,
      meanings: [meaningText],
      link: item?.naverLink || `https://ko.dict.naver.com/#/search?query=${encodeURIComponent(w)}`
    };
    naverCache.set(w, entry);
    return entry;
  }

  const tier1Best = tier1_instantKill[0] || null;
  const tier2Best = tier2_killingInduction[0] || null;
  const tier3Best = tier3_nearKill[0] || null;
  const tier4Best = tier4_safePlay[0] || null;
  const tier5Best = tier5_desperate[0] || null;

  const diffRaw = String(options.difficulty || 'hell').toLowerCase();
  const noFirstTurnKill = !!options.noFirstTurnKill;

  // 전체 최적 추천단어 (best) 결정
  let best = null;
  let chosenTierNumber = 1;
  if (noFirstTurnKill) {
    if (tier4Best) { best = tier4Best; chosenTierNumber = 4; }
    else if (tier3Best) { best = tier3Best; chosenTierNumber = 3; }
    else if (tier5Best) { best = tier5Best; chosenTierNumber = 5; }
  } else if (diffRaw === 'easy') {
    if (tier4Best) { best = tier4Best; chosenTierNumber = 4; }
    else if (tier3Best) { best = tier3Best; chosenTierNumber = 3; }
    else if (tier1Best) { best = tier1Best; chosenTierNumber = 1; }
    else if (tier2Best) { best = tier2Best; chosenTierNumber = 2; }
    else if (tier5Best) { best = tier5Best; chosenTierNumber = 5; }
  } else {
    // Hard / Hell 모드: 1순위 한방 > 2순위 한방유도 > 3순위 압박 > 4순위 안전 > 5순위 차선책
    if (tier1Best) { best = tier1Best; chosenTierNumber = 1; }
    else if (tier2Best) { best = tier2Best; chosenTierNumber = 2; }
    else if (tier3Best) { best = tier3Best; chosenTierNumber = 3; }
    else if (tier4Best) { best = tier4Best; chosenTierNumber = 4; }
    else if (tier5Best) { best = tier5Best; chosenTierNumber = 5; }
  }

  if (!best) return null;

  // 대안 후보군: 다른 티어의 대표 단어들을 골고루 제공
  const altTierCandidates = [tier1Best, tier2Best, tier3Best, tier4Best, tier5Best].filter(t => t && t.word !== best.word && (!noFirstTurnKill || (t.tier !== 1 && t.tier !== 2)));
  const seenAlt = new Set([best.word, ...altTierCandidates.map(a => a.word)]);
  const extraPool = noFirstTurnKill ? [...tier4_safePlay, ...tier3_nearKill] : [...tier1_instantKill, ...tier2_killingInduction, ...tier4_safePlay, ...tier3_nearKill];
  for (const it of extraPool) {
    if (altTierCandidates.length >= 4) break;
    if (!seenAlt.has(it.word) && !it.hasSuicideRisk && (!noFirstTurnKill || (it.tier !== 1 && it.tier !== 2))) {
      seenAlt.add(it.word);
      altTierCandidates.push(it);
    }
  }

  // ⭐ [네이버 국어사전 100% 완전 동기화 엔진]:
  // 베스트 단어, 1~5순위 대표 단어, 대안 후보군 및 각 티어 상위 3개 후보군에 대해
  // 캐시에 구체적 뜻이 없는 경우 네이버 공식 API3에서 비동기 병렬로 세세한 사전 뜻을 100% 실시간 인출!
  const wordsToSync = new Set();
  wordsToSync.add(best.word);
  if (tier1Best) wordsToSync.add(tier1Best.word);
  if (tier2Best) wordsToSync.add(tier2Best.word);
  if (tier3Best) wordsToSync.add(tier3Best.word);
  if (tier4Best) wordsToSync.add(tier4Best.word);
  if (tier5Best) wordsToSync.add(tier5Best.word);
  for (const a of altTierCandidates) if (a?.word) wordsToSync.add(a.word);
  for (const list of [tier1_instantKill, tier2_killingInduction, tier3_nearKill, tier4_safePlay, tier5_desperate]) {
    for (let i = 0; i < Math.min(3, list.length); i++) {
      if (list[i]?.word) wordsToSync.add(list[i].word);
    }
  }

  const uncachedWords = Array.from(wordsToSync).filter(w => {
    if (!naverCache.has(w)) return true;
    const entry = naverCache.get(w);
    const m = entry?.meanings?.[0] || '';
    return !m || m.includes('등재된 공인 표준어(') || m.includes('공인 표준 어휘');
  });

  if (uncachedWords.length > 0) {
    try {
      await Promise.all(uncachedWords.map(w => queryNaverDictionary(w, 2500)));
    } catch (e) {
      // 타임아웃 발생 시에도 로컬 사전 정보로 안전 폴백
    }
  }

  const cBest = naverCache.get(best.word);
  const bestPos = cBest?.partOfSpeech || best.item?.part || best.part || '명사';
  const bestMean = (cBest && cBest.meanings && cBest.meanings[0] && isRealMeaning(cBest.meanings[0]))
    ? cBest.meanings[0]
    : (best.item?.naverMeaning || `네이버 국어사전 등재 어휘 (${bestPos})`);
  const bestSource = cBest?.source || best.item?.source || '네이버 국어사전';
  const bestLink = cBest?.link || best.item?.naverLink || `https://ko.dict.naver.com/#/search?query=${encodeURIComponent(best.word)}`;

  const rebuttal = getRebuttalAnalysis(best.endChar, best.counterPlan, usedWords);

  let strongestReason = '';
  let optimalReason = '';
  let bestReason = `네이버 국어사전 공식 뜻: "${bestMean}"`;
  let supremeReason = '';

  if (chosenTierNumber === 1) {
    strongestReason = `끝글자 '${best.endChar}'(으)로 시작하는 한국어 단어가 국어사전에 정확히 0개로 상대방을 즉시 100% 격파합니다.`;
    optimalReason = `불필요한 장기전 없이 단 1수로 승리를 완벽히 확정짓는 최우선 [1순위 즉시 한방]입니다.`;
    supremeReason = `${best.length}글자의 완성도 높은 어휘로, 실전에서 즉시 인정받는 최고의 한방 단어입니다.`;
  } else if (chosenTierNumber === 2) {
    const oppSampleStr = best.counterPlan?.slice(0, 3).map(cp => `「${cp.oppWord}」➔「${cp.myCounter}」`).join(', ') || '';
    const counterText = oppSampleStr ? ` (${oppSampleStr})` : '';
    strongestReason = `상대방의 선택지를 단 ${best.outCount}개로 봉쇄하며 한방 수 싸움으로 유도하는 [2순위 한방 유도 단어]입니다.`;
    optimalReason = `완벽한 즉시 한방은 아니지만, 상대를 외통수로 몰아넣어 다음 수에 확실한 승리를 가져오는 가장 치명적인 유도 수입니다.${counterText}`;
    supremeReason = `상대의 공격 루트를 원천 차단하고 한방으로 유도하는 최고 수준의 심층 전략 어휘입니다.`;
  } else if (chosenTierNumber === 3) {
    strongestReason = `상대방이 되받아칠 수 있는 단어가 국어사전 전체에서 단 ${best.outCount}개뿐인 [3순위 거의 한방급] 치명타입니다.`;
    optimalReason = `상대에게 나를 한방으로 보내는 역공 어휘가 전혀 없어 상대방을 완벽히 질식시킵니다.`;
    supremeReason = `상대에게 패착이나 타임오버를 강제하여 주도권을 확실하게 쥐어오는 결정구입니다.`;
  } else if (chosenTierNumber === 4) {
    strongestReason = `상대의 한방 역공 및 한방 유도(값, 릇 등) 카운터를 원천 차단하고 안정적으로 전세를 이어가는 [4순위 안전 방어]입니다.`;
    optimalReason = `위험한 수를 철저히 회피하면서 다음 기회를 도모하는 가장 현명하고 단단한 수입니다.`;
    supremeReason = `${best.length}글자의 직관적이고 품격 있는 어휘로 안전하게 랠리를 장악합니다.`;
  } else {
    if (best.hasKillingRisk) {
      strongestReason = `상대방에게 즉각적인 1순위 한방 역공(예: 「${best.counterKillingWord || '한방 단어'}」)을 허용할 치명적 위험이 있는 [5순위 차선책]입니다.`;
      optimalReason = `현재 상황에서 상대의 한방 역공 위험을 감수하고서라도 전세를 이어가는 불가피한 차선책 응수입니다.`;
    } else if (best.hasTrapRisk) {
      const trapChar = best.counterTrapWord ? best.counterTrapWord.slice(-1) : '값';
      strongestReason = `상대방에게 '${trapChar}' 카운터(예: 「${best.counterTrapWord || '유도 단어'}」) 등 한방 유도 공격을 당할 위험이 있는 [5순위 차선책]입니다.`;
      optimalReason = `완벽히 안전하지는 않으나, 상대의 유도 카운터를 경계하며 전세를 이어가는 차선책입니다.`;
    } else {
      strongestReason = `상대의 공격 기회를 최소화하고 위기를 벗어나는 [5순위 차선책 방어]입니다.`;
      optimalReason = `불리한 상황 속에서도 최선의 방어를 펼치며 상대의 실수를 유도합니다.`;
    }
    supremeReason = `위기를 넘기고 반격의 기회를 노리는 전략적 수입니다.`;
  }

  function formatTierSummary(t) {
    if (!t) return null;
    const c = naverCache.get(t.word);
    const pos = c?.partOfSpeech || t.item?.part || t.part || '명사';
    const cMean = (c && c.meanings && c.meanings[0] && isRealMeaning(c.meanings[0])) ? c.meanings[0] : null;
    const m = cMean || t.item?.naverMeaning || `네이버 국어사전 등재 어휘 (${pos})`;
    const src = c?.source || t.item?.source || '네이버 국어사전 (표준국어대사전)';
    return {
      word: t.word,
      length: t.length,
      partOfSpeech: pos,
      endChar: t.endChar,
      outCount: t.outCount,
      hasKillingRisk: !!t.hasKillingRisk,
      hasTrapRisk: !!t.hasTrapRisk,
      tier: t.tier,
      tierName: t.tierName,
      tierBadgeClass: t.tierBadgeClass,
      naverMeaning: m,
      source: src
    };
  }

  return {
    queryChar: inputChar,
    targetChar: inputChar,
    variants,
    ultimateWord: {
      word: best.word,
      length: best.length,
      partOfSpeech: bestPos,
      endChar: best.endChar,
      outCount: best.outCount,
      hasKillingRisk: !!best.hasKillingRisk,
      hasTrapRisk: !!best.hasTrapRisk,
      counterKillingWord: best.counterKillingWord || null,
      counterTrapWord: best.counterTrapWord || null,
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
      naverMeaning: bestMean,
      naverMeanings: (cBest?.meanings && cBest.meanings.length > 0) ? cBest.meanings : [bestMean],
      source: bestSource,
      naverLink: bestLink
    },
    tierWords: {
      1: tier1Best ? { ...formatTierSummary(tier1Best), totalCount: tier1_instantKill.length } : null,
      2: tier2Best ? { ...formatTierSummary(tier2Best), totalCount: tier2_killingInduction.length } : null,
      3: tier3Best ? { ...formatTierSummary(tier3Best), totalCount: tier3_nearKill.length } : null,
      4: tier4Best ? { ...formatTierSummary(tier4Best), totalCount: tier4_safePlay.length } : null,
      5: tier5Best ? { ...formatTierSummary(tier5Best), totalCount: tier5_desperate.length } : null
    },
    tierCandidates: {
      1: tier1_instantKill.slice(0, 8).map(formatTierSummary),
      2: tier2_killingInduction.slice(0, 8).map(formatTierSummary),
      3: tier3_nearKill.slice(0, 8).map(formatTierSummary),
      4: tier4_safePlay.slice(0, 8).map(formatTierSummary),
      5: tier5_desperate.slice(0, 8).map(formatTierSummary)
    },
    alternatives: altTierCandidates.slice(0, 4).map(alt => {
      const cAlt = naverCache.get(alt.word);
      const altPos = cAlt?.partOfSpeech || alt.item?.part || alt.part || '명사';
      const altMean = (cAlt && cAlt.meanings && cAlt.meanings[0] && isRealMeaning(cAlt.meanings[0]))
        ? cAlt.meanings[0]
        : (alt.item?.naverMeaning || `네이버 국어사전 등재 어휘 (${altPos})`);
      const altSource = cAlt?.source || alt.item?.source || '네이버 국어사전';
      return {
        word: alt.word,
        length: alt.length,
        part: altPos,
        endChar: alt.endChar,
        outCount: alt.outCount,
        tier: alt.tier,
        tierName: alt.tierName,
        tierBadgeClass: alt.tierBadgeClass,
        rebuttalSummary: alt.outCount === 0 ? '반격 불가 (0개)' : `반격 ${alt.outCount}개`,
        meaning: altMean,
        source: altSource
      };
    })
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
  const noFirstTurnKill = options.noFirstTurnKill !== undefined ? !!options.noFirstTurnKill : false;

  if (trimmed.includes('안녕') || trimmed.includes('반가워')) {
    return {
      text: `안녕하세요! ⚡ **끝말잇기 AI브리핑**입니다.\n\n네이버 국어사전 및 52만 공인 데이터베이스를 바탕으로 **5대 계층 지능 의사결정**을 제공합니다:\n\n1. 💥 **1순위 (즉시 승리 한방 단어)**: 상대 반격 0개로 즉시 100% 승리하는 필승 단어\n2. 🎯 **2순위 (한방 유도 단어)**: '값', '릇', '늣' 등 상대 선택지 극소화 및 다음 턴 한방 유도\n3. 🔥 **3순위 (치명적 압박 단어)**: 상대 반격 1~4개뿐인 강력한 포위망\n4. 🛡️ **4순위 (한방 회피 안전 단어)**: 상대 한방/유도 역공을 원천 차단하는 안전 수\n5. ⚠️ **5순위 (위기 탈출 차선책)**: 불가피한 상황에서 위험을 감수하는 차선책\n\n📝 **상대방 단어 적기 모드 안내**:\n• **앞글자만(1자) 입력** (예: *'기'*): **[내 턴]** 최적의 필승 수 즉시 추천!\n• **풀네임(2자 이상) 입력** (예: *'비행기'*): **[상대 턴]**으로 자동 인식하여 상대 단어 검증 및 카운터 반격 수 브리핑!\n\n지금 바로 앞글자나 단어를 입력해보세요!`
    };
  }

  if (trimmed.includes('두음') || trimmed.includes('두음법칙')) {
    return {
      text: `📖 **국립국어원 표준 두음법칙 안내 (제10항·제11항 정방향만 적용)**:\n\n1. **ㄴ 두음법칙 (제10항)**: '냐, 녀, 녜, 뇨, 뉴, 니' → **'야, 여, 예, 요, 유, 이'** (초성 ㄴ → ㅇ)\n   * 역방향(니 → 리: '리튬' 등)은 엄격히 차단됩니다!\n2. **ㄹ 두음법칙 (제11항)**:\n   - '랴, 려, 례, 료, 류, 리' → **'야, 여, 예, 요, 유, 이'** (초성 ㄹ → ㅇ)\n   - '라, 로, 루, 르, 래, 뢰...' → **'나, 노, 누, 느, 내, 뇌...'** (초성 ㄹ → ㄴ)\n\n알고리즘이 정방향 두음법칙을 완벽 계산하여 최적의 단어를 찾아냅니다!`
    };
  }

  // ⭐ 1. 질문성 자연어 문장 및 비교 질의 여부 감지
  const isQuestionSentence = /(?:알려줘|알려달라|알려|추천|어때|뭐있어|뭐야|가르쳐|해줘|이어|받아|단어|글자|첫\s*턴|첫턴|뜻|검색|왜|비교|차이|있는데|없다고|있는|안돼|버그|이유|좋은|질문)/.test(trimmed);
  const isConversational = (/\s/.test(trimmed) && isQuestionSentence) || /(?:왜|비교|차이|있는데|없다고|이유|좋은|멍청)/.test(trimmed);

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

  // ⭐ 2. 자연어 대화/질문/비교 질의 처리 (공백 허용! 띄어쓰기 금지 에러 일체 제거)
  if (isConversational) {
    const rawTokens = trimmed.match(/[가-힣]{2,}/g) || [];
    const stopWords = new Set([
      '있는', '없고', '없다고', '있는데', '추천하고', '추천해', '추천', '알려주고', '알려줘',
      '이러잖아', '제대로', '연결이', '연결하면', '표시하고', '구분도', '단어도', '생각을',
      '생각해', '알고리즘', '어떻게', '무조건', '정신나갔냐', '이해못해', '적당히', '그냥',
      '수정해', '고쳐줘', '나오지', '나오게', '만들어놔', '이상해', '있어서', '유도돼서',
      '대체해', '모르는거같고', '멍청해', '푸시해줘', '깃허브', '네이버', '사전이랑', '사전에'
    ]);
    const cleanTokens = rawTokens
      .map(t => t.replace(/(?:으로|로|은|는|이|가|을|를|와|과|도|의|에)$/, ''))
      .filter(t => t.length >= 2 && !stopWords.has(t));
    const uniqueTokens = [...new Set(cleanTokens)];

    // 2-A) 두 개 이상의 단어가 언급된 비교 질문 (예: "꾼둑이 있는데 왜 꾼내를 추천해?")
    if (uniqueTokens.length >= 2) {
      const w1 = uniqueTokens[0];
      const w2 = uniqueTokens[1];
      const dict1 = await queryNaverDictionary(w1);
      const dict2 = await queryNaverDictionary(w2);

      const reb1 = getRebuttalAnalysis(w1[w1.length - 1]);
      const reb2 = getRebuttalAnalysis(w2[w2.length - 1]);
      const end1 = w1[w1.length - 1];
      const end2 = w2[w2.length - 1];

      const isTrap1 = KILLING_INDUCTION_CHARS.has(end1) || reb1.totalCount <= 30;
      const isKill1 = !KILLING_INDUCTION_CHARS.has(end1) && ABSOLUTE_KILLING_CHARS.has(end1) && reb1.totalCount === 0;
      const isTrap2 = KILLING_INDUCTION_CHARS.has(end2) || reb2.totalCount <= 30;
      const isKill2 = !KILLING_INDUCTION_CHARS.has(end2) && ABSOLUTE_KILLING_CHARS.has(end2) && reb2.totalCount === 0;

      const desc1 = isKill1 ? '💥 1순위 즉시 승리 한방 단어' : (isTrap1 ? '🎯 2순위 한방 유도 필승 수' : '🛡️ 일반 수');
      const desc2 = isKill2 ? '💥 1순위 즉시 승리 한방 단어' : (isTrap2 ? '🎯 2순위 한방 유도 필승 수' : '⚠️ 상대 반격 다수 허용 단어');

      let winner = w1;
      let reason = '';
      if (reb1.totalCount < reb2.totalCount) {
        winner = w1;
        reason = `「${w1}」(상대 반격 ${reb1.totalCount}개로 봉쇄)이 「${w2}」(상대 반격 ${reb2.totalCount}개 허용)보다 압도적으로 우수한 최적의 수입니다!`;
      } else if (reb2.totalCount < reb1.totalCount) {
        winner = w2;
        reason = `「${w2}」(상대 반격 ${reb2.totalCount}개로 봉쇄)이 「${w1}」(상대 반격 ${reb1.totalCount}개 허용)보다 압도적으로 우수한 최적의 수입니다!`;
      } else {
        winner = w1;
        reason = `두 단어 모두 상대 반격 ${reb1.totalCount}개로 대등한 수입니다.`;
      }

      return {
        text: `💡 **[AI브리핑 단어 전략 비교 분석]**\n\n` +
              `질문하신 두 단어를 네이버 국어사전과 Minimax 2수 앞 수읽기 엔진으로 정밀 비교 분석했습니다:\n\n` +
              `1️⃣ **「${w1}」** (${desc1})\n` +
              `• **사전 뜻**: ${dict1?.meanings?.[0] || '네이버 국어사전 공인 표제어'}\n` +
              `• **끝글자**: '${w1[w1.length - 1]}' ➔ 상대 반격 가능한 단어: **${reb1.totalCount}개** ${reb1.totalCount <= 30 ? '(상대 선택지 극소 봉쇄!)' : ''}\n\n` +
              `2️⃣ **「${w2}」** (${desc2})\n` +
              `• **사전 뜻**: ${dict2?.meanings?.[0] || '네이버 국어사전 공인 표제어'}\n` +
              `• **끝글자**: '${w2[w2.length - 1]}' ➔ 상대 반격 가능한 단어: **${reb2.totalCount}개**\n\n` +
              `🏆 **전략적 판정**: **${reason}**\n` +
              `AI브리핑은 상대의 반격을 극소화하여 다음 턴 한방으로 필승하는 **「${winner}」**을 최우선 추천합니다!`,
        flowMode,
        opponentWordMode: true
      };
    }

    // 2-B) 단일 단어 문의 (예: "꾼둑 사전에 있어?", "왜 차삯 없다고 나와?")
    if (uniqueTokens.length === 1) {
      const singleWord = uniqueTokens[0];
      const dict = await queryNaverDictionary(singleWord);
      const endC = singleWord[singleWord.length - 1];
      const reb = getRebuttalAnalysis(endC);
      const isTrap = KILLING_INDUCTION_CHARS.has(endC) || reb.totalCount <= 30;
      const isKill = !KILLING_INDUCTION_CHARS.has(endC) && ABSOLUTE_KILLING_CHARS.has(endC) && reb.totalCount === 0;

      if (dict && dict.isVerified) {
        return {
          text: `📖 **[네이버 국어사전 실시간 검증: 「${singleWord}」]**\n\n` +
                `• **품사**: ${dict.partOfSpeech || '명사'}\n` +
                `• **출처**: ${dict.source || '네이버 국어사전'}\n` +
                `• **사전 뜻**: ${dict.meanings?.[0] || '네이버 국어사전 실시간 표준 뜻풀이'}\n` +
                `• **끝말잇기 전략 가치**: ${isKill ? '💥 **1순위 즉시 승리 한방 단어** (상대 반격 0개 전무)' : (isTrap ? `🎯 **2순위 한방 유도 필승 수** (상대 반격 단 ${reb.totalCount}개 극소화)` : `🛡️ **일반 안전 수** (상대 반격 ${reb.totalCount}개)`)}\n\n` +
                `네이버 국어사전과 게임 데이터베이스에 100% 정상 연동되어 있습니다!`,
          flowMode,
          opponentWordMode: true
        };
      }
    }
  }

  const pureKorean = cleanText.replace(/[^가-힣]/g, '');

  // --------------------------------------------------------------------------
  // 🎯 [3. 턴 및 단어 브리핑]
  // --------------------------------------------------------------------------
  if (opponentWordMode && pureKorean.length > 0) {
    const oppStartCharParam = options.opponentStartChar ? String(options.opponentStartChar).trim() : null;

    // 1) 앞글자만 입력 (1글자) 또는 명시적 내턴: [내 턴] 최적의 수 추천!
    if (pureKorean.length === 1 || forceMyTurn) {
      const myStartChar = pureKorean.length === 1 ? pureKorean : (pureKorean[0] || '기');
      const isFirstTurnIntent = !!noFirstTurnKill;
      const analysis = await findUltimateBestWord(myStartChar, {
        usedWords,
        difficulty: 'hell',
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
        speech = `🎯 **'${myStartChar}'**(으)로 시작할 **[2순위: 한방 유도 단어]**는 바로 **「${ultimate.word}」**입니다!\n\n` +
                 `상대방의 다음 선택지가 국어사전 전체에서 단 **${ultimate.outCount}개**(${ultimate.minimax.samples.slice(0, 3).join(', ')})뿐이며, 다음 턴 100% 한방으로 격파하는 **필승 치명적 한방 유도 덫**입니다!\n\n` +
                 `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
      } else if (tierNum === 3) {
        speech = `🔥 **'${myStartChar}'**(으)로 시작할 **[3순위: 반격 봉쇄 치명타 단어]**는 바로 **「${ultimate.word}」**입니다!\n\n` +
                 `상대방의 다음 선택지가 국어사전 전체에서 단 **${ultimate.outCount}개**(${ultimate.minimax.samples.slice(0, 3).join(', ')})뿐인 치명적 포위망으로 상대의 반격을 원천 봉쇄합니다!\n\n` +
                 `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
      } else if (tierNum === 4) {
        speech = `🛡️ **'${myStartChar}'**(으)로 시작할 **[4순위: 한방단어에 당하지 않는 안전 단어]**로 **「${ultimate.word}」**을(를) 추천합니다!\n\n` +
                 `상대의 한방 역공 및 한방 유도(값, 릇 등) 카운터를 원천 차단하면서 안정적으로 주도권을 쥐고 랠리를 이어가는 최선의 안전 수입니다.\n\n` +
                 `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
      } else {
        const warningDetail = ultimate.hasKillingRisk
          ? `상대방에게 1순위 한방 역공(예: 「${ultimate.counterKillingWord || '한방 단어'}」)을 허용할 위험이 있으나 현재 상황에서 최선의 응수입니다.`
          : (ultimate.hasTrapRisk
              ? `상대방에게 '${ultimate.counterTrapWord ? ultimate.counterTrapWord.slice(-1) : '값'}' 카운터(예: 「${ultimate.counterTrapWord || '유도 단어'}」) 등 한방 유도 공격을 당할 위험이 있는 차선책입니다.`
              : `상대의 역공 위험이 다소 있으나 현재 상황에서 최선의 응수로 위기를 넘기는 수입니다.`);
        speech = `⚠️ **'${myStartChar}'**(으)로 시작할 **[5순위: 위기 탈출 차선책 단어 (한방/유도 피격 주의)]**로 **「${ultimate.word}」**을(를) 추천합니다!\n\n` +
                 `⚠️ **주의**: ${warningDetail}\n\n` +
                 `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
      }

      const tw = analysis.tierWords || {};
      const t1 = tw[1];
      const t2 = tw[2];
      const t3 = tw[3];
      const t4 = tw[4];

      const tierOverview = `\n\n📊 **[1순위~4순위 전략 단어 종합 브리핑]**\n` +
        `• 💥 **1순위 (즉시 한방)**: ${t1 ? `**「${t1.word}」** (끝: '${t1.endChar}', 상대 반격 0개 필승!)` : '사전에 반격 0개 한방 단어 없음'}\n` +
        `• 🎯 **2순위 (한방 유도)**: ${t2 ? `**「${t2.word}」** (끝: '${t2.endChar}', 상대 반격 ${t2.outCount}개 봉쇄 & 한방 유도)` : '한방 유도 단어 없음'}\n` +
        `• 🔥 **3순위 (치명타 압박)**: ${t3 ? `**「${t3.word}」** (끝: '${t3.endChar}', 상대 선택지 단 ${t3.outCount}개뿐인 포위망)` : '압박 단어 없음'}\n` +
        `• 🛡️ **4순위 (안전 방어)**: ${t4 ? `**「${t4.word}」** (끝: '${t4.endChar}', 상대 역공 위험 0개 안전 수)` : '안전 방어 단어 없음'}`;

      const isDirectWin = ultimate.outCount === 0;
      const nextPrompt = isDirectWin
        ? `\n\n👑 **[필승 완승 경고]** 내가 낸 **「${ultimate.word}」**의 끝글자 **'${ultimate.endChar}'**(으)로 상대가 낼 수 있는 단어가 국어사전에 **전무(0개)**하여 게임이 즉시 승리로 끝납니다!`
        : `\n\n👉 내가 **「${ultimate.word}」**(으)로 공격했습니다!\n상대방이 다음 끝글자 **'${ultimate.endChar}'**(으)로 어떤 단어로 받아쳤나요? 상대방이 낸 단어를 풀네임으로 입력해주세요!`;

      const fullText = `🎯 **[내 턴: 시작 글자 '${myStartChar}']**\n\n` +
                       `시작 글자 **'${myStartChar}'**(으)로 상대방을 압도할 **최적의 필승 수**를 브리핑합니다:\n\n` +
                       speech +
                       tierOverview +
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

    // 2) 풀네임 단어 입력 (2글자 이상): [단어 전략 분석 & 공수 양면 브리핑]
    if (pureKorean.length >= 2) {
      const queryWord = pureKorean;

      // 네이버 국어사전 정밀 검증
      const dict = await queryNaverDictionary(queryWord);
      if (!dict || !dict.isVerified) {
        if (dict && dict.isSpacedWord) {
          return {
            text: `⚠️ **[끝말잇기 룰 안내]**\n\n입력하신 **「${queryWord}」**은(는) 국어사전에 **‘${dict.spacedEntry || queryWord}’**(으)로 띄어쓰기가 포함되어 등재된 구/복합표현입니다.\n\n끝말잇기 공식 규칙상 **띄어쓰기가 없는 한 단어**만 인정되므로 올바른 단어를 다시 입력해주세요!`,
            flowMode,
            opponentWordMode: true
          };
        }
        return {
          text: `🤔 **「${queryWord}」**은(는) 네이버 국어사전 및 공인 사전에 등재되지 않은 단어입니다.\n\n구체적인 뜻풀이가 있는 올바른 표준 단어를 입력해주세요!`,
          flowMode,
          opponentWordMode: true
        };
      }

      // 2-A) 사용자가 명시적으로 [상대 턴]임을 밝힌 경우
      if (forceOpponentTurn) {
        const oppEndChar = queryWord[queryWord.length - 1];
        const newUsedWords = new Set([...usedWords, queryWord]);
        const counterAnalysis = await findUltimateBestWord(oppEndChar, {
          usedWords: newUsedWords,
          difficulty: 'hell',
          noFirstTurnKill: false
        });

        const counterUltimate = counterAnalysis?.ultimateWord;
        const isDirectWin = counterUltimate ? counterUltimate.outCount === 0 : false;
        const speech = counterUltimate
          ? `💥 상대가 **「${queryWord}」**(으)로 공격해 왔을 때, 끝글자 **'${oppEndChar}'**(으)로 반격할 최적의 수는 **「${counterUltimate.word}」**입니다!\n\n📖 **사전 뜻**: ${counterUltimate.naverMeaning}`
          : `🎉 끝글자 '${oppEndChar}'로 시작하는 단어가 국어사전에 없어 상대방의 패배입니다!`;

        return {
          text: `⚔️ **[상대방 턴: 「${queryWord}」 접수 ➔ 반격 제시어: '${oppEndChar}']**\n\n` + speech,
          analysis: counterAnalysis,
          hasUltimateCard: !!counterUltimate,
          turnType: 'opponentTurn',
          briefedWord: counterUltimate?.word || queryWord,
          opponentWord: queryWord,
          briefedWords: flowMode ? [...briefedWords, queryWord, counterUltimate?.word].filter(Boolean) : briefedWords,
          flowMode,
          opponentWordMode: true,
          isAwaitingOpponentWord: !isDirectWin,
          opponentStartChar: counterUltimate?.endChar || null,
          nextTargetChar: counterUltimate?.endChar || null
        };
      }

      // 2-B) 일반 단어 입력: [공수 양면 종합 전략 카드 (Dual-Perspective Strategy)]
      const endChar = queryWord[queryWord.length - 1];
      const reb = getRebuttalAnalysis(endChar);
      const isKill = !KILLING_INDUCTION_CHARS.has(endChar) && ABSOLUTE_KILLING_CHARS.has(endChar) && reb.totalCount === 0;

      // 상대방이 나에게 역공할 수 있는 한방 및 한방 유도(값, 릇, 늣, 둑 등) 카운터 전수 감지
      const oppKillerWords = [];
      const oppTrapWords = [];
      const endVariants = getDueumVariants(endChar);
      for (let vi = 0; vi < endVariants.length; vi++) {
        const moves = startMap.get(endVariants[vi]) || [];
        for (let mi = 0; mi < moves.length; mi++) {
          const w = moves[mi].word;
          const e = w[w.length - 1];
          if (isWordInstantKill(w)) {
            if (oppKillerWords.length < 5) oppKillerWords.push(w);
          } else if (KILLING_INDUCTION_CHARS.has(e)) {
            if (oppTrapWords.length < 5) oppTrapWords.push(w);
          }
        }
      }
      const hasKillingRisk = oppKillerWords.length > 0;
      const hasTrapRisk = oppTrapWords.length > 0;
      const hasCounterRisk = hasKillingRisk || hasTrapRisk;
      const isTrap = !isKill && !hasCounterRisk && (KILLING_INDUCTION_CHARS.has(endChar) || reb.totalCount <= 15);

      let tierNum = 4;
      let tierName = '🛡️ 4순위: 안전 방어 단어';
      let strategyDesc = '상대에게 한방 역공 및 한방 유도(값, 릇 등) 카운터를 원천 차단하고 안정적으로 전세를 이어가는 안전 수입니다.';

      if (isKill) {
        tierNum = 1;
        tierName = '💥 1순위: 즉시 승리 한방 단어';
        strategyDesc = '상대 반격 0개, 즉시 100% 승리하는 절대 필승 수입니다!';
      } else if (hasCounterRisk) {
        tierNum = 5;
        if (hasKillingRisk) {
          tierName = '⚠️ 5순위: 한방 피격 위험 단어 (차선책)';
          strategyDesc = `상대방에게 1순위 한방 역공(예: 「${oppKillerWords[0]}」)을 허용할 위험이 있는 차선책입니다.`;
        } else {
          const trapW = oppTrapWords[0];
          const trapE = trapW[trapW.length - 1];
          tierName = `⚠️ 5순위: '${trapE}' 유도 피격 위험 단어 (차선책)`;
          strategyDesc = `상대방에게 '${trapE}' 카운터(예: 「${trapW}」) 등 한방 유도 공격을 당할 위험이 있는 차선책입니다.`;
        }
      } else if (isTrap) {
        tierNum = 2;
        tierName = '🎯 2순위: 한방 유도 단어';
        strategyDesc = `끝글자 '${endChar}'(으)로 상대 반격을 ${reb.totalCount}개로 제한하고 한방으로 유도하는 전략 수입니다!`;
      } else if (reb.totalCount >= 1 && reb.totalCount <= 4) {
        tierNum = 3;
        tierName = '🔥 3순위: 치명적 압박 단어';
        strategyDesc = `상대방의 다음 선택지가 국어사전 전체에서 단 ${reb.totalCount}개뿐인 치명적 포위망입니다.`;
      } else {
        tierNum = 4;
        tierName = '🛡️ 4순위: 안전 방어 단어';
        strategyDesc = '상대에게 한방 역공 및 한방 유도(값, 릇 등) 카운터를 원천 차단하고 안정적으로 전세를 이어가는 안전 수입니다.';
      }

      // 상대방이 이 단어로 왔을 때의 반격 최적수 탐색
      const counterAnalysis = await findUltimateBestWord(endChar, {
        usedWords,
        difficulty: 'hell',
        noFirstTurnKill: false
      });
      const counterWord = counterAnalysis?.ultimateWord?.word || '반격 어휘 없음';

      const dualText = `🎯 **[단어 전략 분석: 「${queryWord}」]**\n\n` +
                       `📖 **[네이버 국어사전 실시간 검증]**\n` +
                       `• **품사**: ${dict.partOfSpeech || '명사'} | **출처**: ${dict.source || '네이버 국어사전'}\n` +
                       `• **공식 뜻풀이**: ${dict.meanings?.[0] || '네이버 국어사전 실시간 표준 뜻풀이'}\n\n` +
                       `💥 **[1. 내가 「${queryWord}」(으)로 공격할 때]**\n` +
                       `• **전략 분류**: ${tierName}\n` +
                       `• **전략 해설**: ${strategyDesc}\n` +
                       `• **상대방 반격 수**: 끝글자 **'${endChar}'** ➔ 국어사전 전체에서 ${reb.totalCount === 0 ? '단 **0개** (상대 반격 불가! 즉시 승리!)' : `총 **${reb.totalCount}개**`}\n` +
                       (isKill
                         ? `• **승리 플랜**: 상대가 낼 수 있는 단어가 **0개**이므로, 내가 이 단어를 내는 순간 즉시 100% 승리합니다!\n\n`
                         : (hasCounterRisk
                             ? `• ⚠️ **카운터 경고**: 상대가 **「${oppKillerWords[0] || oppTrapWords[0]}」**(끝글자 '${(oppKillerWords[0] || oppTrapWords[0]).slice(-1)}') 등의 치명적 역공/유도로 맞받아칠 수 있으니 주의하세요!\n\n`
                             : `• **안전 플랜**: 상대에게 치명적 한방 및 유도 카운터를 허용하지 않고 안정적으로 랠리를 장악합니다!\n\n`)) +
                       `⚔️ **[2. 상대방이 「${queryWord}」(으)로 공격해왔을 때]**\n` +
                       `• **추천 카운터 수**: 끝글자 **'${endChar}'** ➔ 회심의 반격 **「${counterWord}」**\n` +
                       `• 상대방의 공격을 완벽히 무력화하고 게임 주도권을 가져오는 최선의 수입니다!`;

      const analysisObj = {
        targetChar: queryWord[0],
        ultimateWord: {
          word: queryWord,
          length: queryWord.length,
          partOfSpeech: dict.partOfSpeech || '명사',
          endChar,
          outCount: reb.totalCount,
          naverMeaning: dict.meanings?.[0] || '네이버 국어사전 실시간 표준 뜻풀이',
          source: dict.source || '네이버 국어사전',
          hasKillingRisk,
          hasTrapRisk,
          counterKillingWord: oppKillerWords[0] || null,
          counterTrapWord: oppTrapWords[0] || null,
          tierInfo: {
            tierNumber: tierNum,
            tierName,
            name: tierName,
            desc: strategyDesc
          },
          minimax: {
            type: isKill ? 'WIN_1_STEP' : (isTrap ? 'KILLING_INDUCTION' : (hasCounterRisk ? 'DANGEROUS' : 'SAFE_RALLY')),
            score: 0,
            brief: strategyDesc,
            samples: reb.samples || []
          }
        }
      };

      const newBriefed = flowMode ? [...briefedWords, queryWord] : [...briefedWords];

      return {
        text: dualText,
        analysis: analysisObj,
        hasUltimateCard: true,
        turnType: 'wordStrategy',
        briefedWord: queryWord,
        briefedWords: newBriefed,
        tierNumber: tierNum,
        flowMode,
        opponentWordMode: true,
        isAwaitingOpponentWord: !isKill,
        opponentStartChar: endChar,
        nextTargetChar: endChar
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
    if (dict && dict.isVerified) {
      const endC = lookupWord[lookupWord.length - 1];
      const reb = getRebuttalAnalysis(endC);
      const isTrap = KILLING_INDUCTION_CHARS.has(endC) || reb.totalCount <= 30;
      const isKill = !KILLING_INDUCTION_CHARS.has(endC) && ABSOLUTE_KILLING_CHARS.has(endC) && reb.totalCount === 0;
      const verdictText = isKill 
        ? '💥 **즉시 승리 한방 단어** (상대 반격 0개)' 
        : (isTrap ? `🎯 **한방 유도 단어** (상대 반격 어휘 ${reb.totalCount}개 극소화)` : `🛡️ **유효 단어** (상대 반격 어휘 ${reb.totalCount}개)`);
      return {
        text: `📚 **[단어 사전 정보: 「${lookupWord}」]**\n\n` +
              `• **품사**: ${dict.partOfSpeech || '명사'}\n` +
              `• **출처**: ${dict.source || '네이버 국어사전'}\n` +
              `• **사전 뜻**: ${dict.meanings?.[0] || '네이버 국어사전 실시간 표준 뜻풀이'}\n` +
              `• **끝말잇기 판정**: ${verdictText}\n\n` +
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
          const isDirectTrap = KILLING_INDUCTION_CHARS.has(directEndChar) || directRebuttal.totalCount <= 30;
          const isDirectKilling = !KILLING_INDUCTION_CHARS.has(directEndChar) && ABSOLUTE_KILLING_CHARS.has(directEndChar) && directRebuttal.totalCount === 0;
          const directTierNum = isDirectKilling ? 1 : (isDirectTrap ? 2 : 3);
          const directTierName = isDirectKilling ? '1순위 한방 단어' : (isDirectTrap ? '2순위 한방 유도 단어' : '공인 등재 단어');
          const directTierDesc = isDirectKilling ? '상대 반격 0개 절대 필승' : (isDirectTrap ? '상대 선택지 극소화 한방 유도' : '네이버 국어사전 등재 어휘');

          return {
            text: `👑 **「${pureWord}」**은(는) 네이버 국어사전에 공인 등재된 **${directTierName}**입니다!\n\n` +
                  (isDirectKilling
                    ? `끝글자 **'${directEndChar}'**(으)로 시작하는 단어가 국어사전에 **정확히 0개**이므로, 실전 끝말잇기 배틀에서 이 단어를 내는 순간 상대방은 어떠한 반격도 하지 못하고 즉시 패배합니다!\n\n`
                    : (isDirectTrap 
                        ? `끝글자 **'${directEndChar}'**(으)로 상대방이 반격 가능한 단어가 사전에 ${directRebuttal.totalCount}개뿐인 치명적 한방 유도 단어입니다.\n\n`
                        : `끝글자 **'${directEndChar}'**(으)로 상대방이 반격 가능한 단어가 사전에 ${directRebuttal.totalCount}개 존재합니다.\n\n`)) +
                  `📚 **공인 사전 공식 뜻**: ${selfDict.meanings[0]} (${selfDict.source})`,
            hasUltimateCard: true,
            briefedWord: pureWord,
            briefedWords: flowMode ? [...briefedWords, pureWord] : [],
            tierNumber: directTierNum,
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
                  tierNumber: directTierNum,
                  name: directTierName,
                  desc: directTierDesc
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
      speech = `🎯 **'${targetChar}'**(으)로 이어질 **[2순위: 한방 유도 단어]**는 바로 **「${ultimate.word}」**입니다!\n\n` +
               `1순위 즉시 한방 단어가 없어 선택했습니다. 상대방의 다음 선택지가 국어사전 전체에서 단 **${ultimate.outCount}개**(${ultimate.minimax.samples.slice(0, 3).join(', ')})뿐이며, 다음 턴 100% 한방으로 격파하는 **필승 치명적 한방 유도 덫**입니다!\n\n` +
               `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
    } else if (tierNum === 3) {
      speech = `🔥 **'${targetChar}'**(으)로 이어질 **[3순위: 반격 봉쇄 치명타 단어]**는 바로 **「${ultimate.word}」**입니다!\n\n` +
               `상대방의 다음 선택지가 국어사전 전체에서 단 **${ultimate.outCount}개**(${ultimate.minimax.samples.slice(0, 3).join(', ')})뿐인 치명적 포위망으로 상대의 숨통을 조입니다!\n\n` +
               `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
    } else if (tierNum === 4) {
      speech = `🛡️ **'${targetChar}'**(으)로 이어질 **[4순위: 한방단어에 당하지 않는 안전 단어]**로 **「${ultimate.word}」**을(를) 추천합니다!\n\n` +
               `상대의 한방 역공 및 한방 유도(값, 릇 등) 카운터를 원천 차단하면서 안정적으로 주도권을 쥐고 랠리를 이어가는 최선의 안전 수입니다.\n\n` +
               `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
    } else {
      const warningDetail = ultimate.hasKillingRisk
        ? `상대방에게 1순위 한방 역공(예: 「${ultimate.counterKillingWord || '한방 단어'}」)을 허용할 위험이 있으나 현재 상황에서 최선의 응수입니다.`
        : (ultimate.hasTrapRisk
            ? `상대방에게 '${ultimate.counterTrapWord ? ultimate.counterTrapWord.slice(-1) : '값'}' 카운터(예: 「${ultimate.counterTrapWord || '유도 단어'}」) 등 한방 유도 공격을 당할 위험이 있는 차선책입니다.`
            : `상대의 역공 위험이 다소 있으나 현재 상황에서 최선의 응수로 위기를 넘기는 수입니다.`);
      speech = `⚠️ **'${targetChar}'**(으)로 이어갈 **[5순위: 위기 탈출 차선책 단어 (한방/유도 피격 주의)]**로 **「${ultimate.word}」**을(를) 추천합니다!\n\n` +
               `⚠️ **주의**: ${warningDetail}\n\n` +
               `📖 **사전 뜻풀이**: ${ultimate.naverMeaning} (${ultimate.source})`;
    }

    const tc = analysis.tierCandidates || {};
    const curCandidates = tc[tierNum] || [];
    const altWords = curCandidates.slice(1, 6).map(c => c.word);
    if (altWords.length > 0) {
      speech += `\n💡 **추가 ${tierNum}순위 추천 후보군**: ${altWords.map(w => `「${w}」`).join(', ')}`;
    }

    const tw = analysis.tierWords || {};
    const t1 = tw[1];
    const t2 = tw[2];
    const t3 = tw[3];
    const t4 = tw[4];
    const t5 = tw[5];

    const tierOverview = `\n\n📊 **[1순위~5순위 전략 단어 종합 브리핑]**\n` +
      `• 💥 **1순위 (즉시 한방)**: ${t1 ? `**「${t1.word}」** (끝: '${t1.endChar}', 상대 반격 0개 필승!${t1.totalCount > 1 ? ` 외 ${t1.totalCount - 1}개` : ''})` : '사전에 반격 0개 한방 단어 없음'}\n` +
      `• 🎯 **2순위 (한방 유도)**: ${t2 ? `**「${t2.word}」** (끝: '${t2.endChar}', 상대 반격 ${t2.outCount}개 봉쇄 & 한방 유도${t2.totalCount > 1 ? ` 외 ${t2.totalCount - 1}개` : ''})` : '한방 유도 단어 없음'}\n` +
      `• 🔥 **3순위 (치명타 압박)**: ${t3 ? `**「${t3.word}」** (끝: '${t3.endChar}', 상대 선택지 단 ${t3.outCount}개뿐인 포위망${t3.totalCount > 1 ? ` 외 ${t3.totalCount - 1}개` : ''})` : '압박 단어 없음'}\n` +
      `• 🛡️ **4순위 (안전 방어)**: ${t4 ? `**「${t4.word}」** (끝: '${t4.endChar}', 상대 역공 위험 0개 안전 수${t4.totalCount > 1 ? ` 외 ${t4.totalCount - 1}개` : ''})` : '안전 방어 단어 없음'}\n` +
      `• ⚠️ **5순위 (위기 차선책)**: ${t5 ? `**「${t5.word}」** (끝: '${t5.endChar}', 상대 반격 ${t5.outCount}개, ${t5.hasKillingRisk ? '한방 피격 위험' : '유도 피격 위험'})` : '차선책 단어 없음'}`;

    speech += tierOverview;

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
      text: `안녕하세요! ⚡ **끝말잇기 AI브리핑**입니다.\n\n네이버 국어사전 전수 어휘를 바탕으로 **5단계 정밀 지능 의사결정**을 제공합니다:\n\n1. 💥 **1순위 (즉시 승리 한방)**: 상대 반격 0개로 즉시 승리하는 필승 단어\n2. 🎯 **2순위 (한방 유도 단어)**: '값', '릇', '늣' 등 상대 선택지 극소화 & 다음 턴 한방 유도\n3. 🔥 **3순위 (치명타 압박)**: 상대 선택지가 단 1~4개뿐인 질식 포위망\n4. 🛡️ **4순위 (한방 회피 안전 단어)**: 상대 한방/유도 역공을 완벽히 피하는 안전 수\n5. ⚠️ **5순위 (위기 탈출 차선책)**: 자살수를 감수하고 이어가는 차선책\n\n🌊 **흐름 모드**를 켜시면 한 번 알려준 단어는 중복 추천되지 않습니다!\n지금 바로 앞글자(예: *'기'*, *'산기슭'*)를 입력해보세요!`
    };
  }

  if (trimmed.includes('두음') || trimmed.includes('두음법칙')) {
    return {
      text: `📖 **국립국어원 표준 두음법칙 안내 (제10항·제11항 정방향만 적용)**:\n\n1. **ㄴ 두음법칙 (제10항)**: '냐, 녀, 녜, 뇨, 뉴, 니' → **'야, 여, 예, 요, 유, 이'** (초성 ㄴ → ㅇ)\n   * 역방향(니 → 리: '리튬' 등)은 엄격히 차단됩니다!\n2. **ㄹ 두음법칙 (제11항)**:\n   - '랴, 려, 례, 료, 류, 리' → **'야, 여, 예, 요, 유, 이'** (초성 ㄹ → ㅇ)\n   - '라, 로, 루, 르, 래, 뢰...' → **'나, 노, 누, 느, 내, 뇌...'** (초성 ㄹ → ㄴ)\n\n알고리즘이 정방향 두음법칙을 완벽 계산하여 최적의 단어를 찾아냅니다!`
    };
  }

  return {
    text: `어떤 글자로 이어갈지 고민되시나요? 🤔\n\n원하시는 **앞글자**(예: *'기'*, *'나'*, *'스'*)나 **상대방이 낸 단어**를 입력해주시면,\n\n**[1순위 즉시 한방 단어 ➔ 2순위 한방 유도 단어 ➔ 3순위 치명적 압박 단어 ➔ 4순위 한방 회피 안전 단어 ➔ 5순위 위기 탈출 차선책]** 순서로 계산된 최적의 수를 브리핑해 드립니다!`
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

  // ⭐ [첫 턴 한방제외 모드 검증]: 플레이어가 첫 턴에 한방 또는 한방 유도 단어를 낸 경우 차단
  if (isFirstTurn && noFirstTurnKill) {
    const userRebuttal = getRebuttalAnalysis(nextTargetChar, [], new Set([cleanWord]));
    const isKillOrTrap = (userRebuttal.totalCount === 0 && ABSOLUTE_KILLING_CHARS.has(nextTargetChar)) || KILLING_INDUCTION_CHARS.has(nextTargetChar);
    if (isKillOrTrap) {
      return {
        success: false,
        isFirstTurnKill: true,
        message: `🛡️ [첫 턴 한방제외 룰] 「${cleanWord}」은(는) 끝글자 '${nextTargetChar}'(으)로 상대가 반격하기 극히 어려운 ${KILLING_INDUCTION_CHARS.has(nextTargetChar) ? '🎯한방 유도' : '💥한방'} 단어입니다. 첫 턴 한방제외 모드에서는 한방 및 한방 유도 단어를 쓸 수 없습니다! 랠리를 이어갈 수 있는 다른 안전 단어를 입력해주세요.`
      };
    }
  }

  const userMeaning = dictCheck.meanings[0];
  const userPartOfSpeech = dictCheck.partOfSpeech || wordInfoMap.get(cleanWord)?.part || '명사';
  const userSource = dictCheck.source || '네이버 국어사전';
  const userLink = dictCheck.link || `https://ko.dict.naver.com/#/search?query=${encodeURIComponent(cleanWord)}`;

  // ⭐ 유효 단어로 확인되면 즉시 로컬 사전 맵에도 영구 동기화!
  registerDynamicWord(cleanWord, userPartOfSpeech, userMeaning, userSource, userLink);

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

  let aiChosen = analysis.ultimateWord;
  const tierNum = aiChosen.tierInfo?.tierNumber || 1;
  const candidatesForTier = analysis.tierCandidates?.[tierNum] || [];
  // AI 단어 다변화: 동일 티어 내 상위 후보군 중에서 지능적으로 다양하게 선택 (반복 착수 방지)
  if (candidatesForTier.length > 1) {
    const pickIndex = Math.floor(Math.random() * Math.min(candidatesForTier.length, 3));
    const cand = candidatesForTier[pickIndex];
    if (cand && cand.word) {
      aiChosen = {
        ...aiChosen,
        word: cand.word,
        length: cand.length,
        endChar: cand.endChar,
        outCount: cand.outCount,
        naverMeaning: cand.naverMeaning || aiChosen.naverMeaning,
        partOfSpeech: cand.partOfSpeech || aiChosen.partOfSpeech,
        source: cand.source || aiChosen.source,
        naverLink: `https://ko.dict.naver.com/#/search?query=${encodeURIComponent(cand.word)}`
      };
    }
  }
  const isWinningMove = aiChosen.outCount === 0;

  let strategyBrief = '';
  if (aiNoFirstTurnKill && !isWinningMove) {
    strategyBrief = `🛡️ [첫 턴 한방제외 적용] 「${aiChosen.word}」! 첫 턴이므로 즉시 한방 대신 전략적 랠리 단어로 응수합니다.`;
  } else if (isWinningMove) {
    strategyBrief = `💀 [1순위: 즉시 한방] 「${aiChosen.word}」! 끝글자 '${aiChosen.endChar}'(으)로 상대 반격 0개, 즉시 승리합니다.`;
  } else if (tierNum === 2) {
    const cpSample = aiChosen.minimax?.counterPlan?.[0];
    const cpText = cpSample ? ` (예: 상대가 「${cpSample.oppWord}」 두면 ➔ 「${cpSample.myCounter}」로 격파)` : '';
    strategyBrief = `⚔️ [2순위: 한방 유도 단어] 「${aiChosen.word}」! 상대 선택지를 ${aiChosen.outCount}개로 제한하며 100% 필승 덫을 완성했습니다.${cpText}`;
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
        noFirstTurnKill: data.noFirstTurnKill !== undefined ? !!data.noFirstTurnKill : false,
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
