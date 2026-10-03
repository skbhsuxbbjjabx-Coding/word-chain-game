// ==========================================================================
// 끝말잇기 AI - 프론트엔드 컨트롤러 (배틀, AI브리핑 흐름 모드, 단어 사전, 4단계 난이도)
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  // ------------------------------------------------------------------------
  // 1. DOM 요소 캐싱
  // ------------------------------------------------------------------------
  // 글로벌 헤더
  const soundToggleBtn = document.getElementById('soundToggleBtn');
  const soundIcon = document.getElementById('soundIcon');
  const resetGameBtn = document.getElementById('resetGameBtn');
  const compactAiToggleBtn = document.getElementById('compactAiToggleBtn');
  const appNav = document.getElementById('appNav');
  const navTabs = document.querySelectorAll('.nav-tab');

  // 대시보드 패널
  const panelBattle = document.getElementById('panelBattle');
  const panelAux = document.getElementById('panelAux');
  const auxTabBtns = document.querySelectorAll('.aux-tab-btn');
  const auxBriefing = document.getElementById('auxBriefing');
  const auxDict = document.getElementById('auxDict');

  // 배틀 DOM
  const turnBadge = document.getElementById('turnBadge');
  const turnStatusText = document.getElementById('turnStatusText');
  const comboBadge = document.getElementById('comboBadge');
  const comboText = document.getElementById('comboText');
  const diffBtns = document.querySelectorAll('.diff-btn');
  const targetCharDisplay = document.getElementById('targetCharDisplay');
  const dueumBadge = document.getElementById('dueumBadge');
  const lastWordText = document.getElementById('lastWordText');
  const lastWordMeaning = document.getElementById('lastWordMeaning');
  const turnLog = document.getElementById('turnLog');
  const emptyLogState = document.getElementById('emptyLogState');
  const gameForm = document.getElementById('gameForm');
  const inputPrefixBadge = document.getElementById('inputPrefixBadge');
  const prefixChar = document.getElementById('prefixChar');
  const wordInput = document.getElementById('wordInput');
  const submitBtn = document.getElementById('submitBtn');
  const inputFeedback = document.getElementById('inputFeedback');

  // AI브리핑 DOM
  const flowModeCheckbox = document.getElementById('flowModeCheckbox');
  const flowCountBadge = document.getElementById('flowCountBadge');
  const opponentWordModeCheckbox = document.getElementById('opponentWordModeCheckbox');
  const clearChatBtn = document.getElementById('clearChatBtn');
  const briefingMessages = document.getElementById('briefingMessages');
  const briefingForm = document.getElementById('briefingForm');
  const briefingInput = document.getElementById('briefingInput');
  const briefingSendBtn = document.getElementById('briefingSendBtn');
  const quickBriefingChips = document.querySelectorAll('.briefing-chip');
  const noFirstTurnKillCheckbox = document.getElementById('noFirstTurnKillCheckbox');
  const briefingNoFirstTurnKillCheckbox = document.getElementById('briefingNoFirstTurnKillCheckbox');

  // 단어 사전 DOM
  const dictSearchForm = document.getElementById('dictSearchForm');
  const dictSearchInput = document.getElementById('dictSearchInput');
  const dictClearBtn = document.getElementById('dictClearBtn');
  const dictEmptyState = document.getElementById('dictEmptyState');
  const dictContentArea = document.getElementById('dictContentArea');
  const dictChips = document.querySelectorAll('.dict-chip');

  // 토스트
  const toastContainer = document.getElementById('toastContainer');

  // ------------------------------------------------------------------------
  // 2. 상태 변수
  // ------------------------------------------------------------------------
  // 배틀 상태
  let gameHistory = [];
  let currentTargetChar = '';
  let isGameOver = false;
  let turnCount = 0;
  let comboCount = 0;
  let isSubmitting = false;
  let currentDifficulty = 'hell'; // 기본값: 헬 (쉬움, 중간, 어려움, 헬)

  // AI브리핑 상태
  let briefedWords = [];
  let isBriefingLoading = false;

  // ------------------------------------------------------------------------
  // 3. 두음법칙 엔진 (국립국어원 한글 맞춤법 제10항·제11항 정방향 규칙만 적용)
  // ------------------------------------------------------------------------
  function getDueumVariantsClient(char) {
    if (!char || typeof char !== 'string') return [char];
    const code = char.charCodeAt(0) - 0xAC00;
    if (code < 0 || code > 11171) return [char];

    const initial = Math.floor(code / 588);
    const medial = Math.floor((code % 588) / 28);
    const final = code % 28;
    const variants = [char];

    // [한글 맞춤법 제10항] ㄴ 두음법칙: '냐, 녀, 녜, 뇨, 뉴, 니' -> '야, 여, 예, 요, 유, 이' (초성 ㄴ -> ㅇ)
    // * 역방향(ㄴ -> ㄹ: 예: '니' -> '리'('리튬'))은 일체 금지!
    if (initial === 2) {
      if ([2, 3, 6, 7, 12, 17, 20].includes(medial)) {
        variants.push(String.fromCharCode(0xAC00 + (11 * 588) + (medial * 28) + final));
      }
    }
    // [한글 맞춤법 제11항] ㄹ 두음법칙:
    // 1) '랴, 려, 례, 료, 류, 리' -> '야, 여, 예, 요, 유, 이' (초성 ㄹ -> ㅇ)
    // 2) '라, 로, 루, 르, 래, 뢰...' -> '나, 노, 누, 느, 내, 뇌...' (초성 ㄹ -> ㄴ)
    else if (initial === 5) {
      if ([2, 3, 6, 7, 12, 17, 20].includes(medial)) {
        variants.push(String.fromCharCode(0xAC00 + (11 * 588) + (medial * 28) + final));
      } else {
        variants.push(String.fromCharCode(0xAC00 + (2 * 588) + (medial * 28) + final));
      }
    }

    return [...new Set(variants)];
  }

  // ------------------------------------------------------------------------
  // 4. 사운드 및 알림 유틸리티
  // ------------------------------------------------------------------------
  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>⚡</span><span>${message}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = '0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2200);
  }

  function showFeedback(message, type = 'error') {
    inputFeedback.textContent = message;
    inputFeedback.className = `input-feedback ${type}`;
    inputFeedback.style.display = 'block';
  }

  function clearFeedback() {
    inputFeedback.textContent = '';
    inputFeedback.style.display = 'none';
  }

  function copyToClipboard(text, label = '단어') {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast(`「${text}」 ${label}가 복사되었습니다. 📋`);
        if (window.soundEngine) window.soundEngine.playCopy();
      }).catch(() => {
        fallbackCopy(text, label);
      });
    } else {
      fallbackCopy(text, label);
    }
  }

  function fallbackCopy(text, label) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast(`「${text}」 ${label}가 복사되었습니다. 📋`);
      if (window.soundEngine) window.soundEngine.playCopy();
    } catch (e) {
      showToast('복사에 실패했습니다.');
    }
  }

  function applyWordToBattle(word, autoSubmit = false) {
    if (!word) return;
    switchTab('battle');
    wordInput.value = word;
    wordInput.focus();

    // 입력창 시각 강조 애니메이션
    wordInput.classList.remove('input-highlight-pulse');
    void wordInput.offsetWidth;
    wordInput.classList.add('input-highlight-pulse');

    if (autoSubmit && !isGameOver && !isSubmitting) {
      showToast(`「${word}」(으)로 배틀에 바로 출격합니다! ⚔️`);
      submitWord(word);
    } else {
      showToast(`「${word}」 단어가 배틀 입력창에 준비되었습니다.`);
      if (window.soundEngine) window.soundEngine.playCopy();
    }
  }

  function inspectWordInDictionary(word) {
    if (!word) return;
    switchTab('dict');
    switchAuxTab('dict');
    searchDictionary(word);
  }

  function formatBriefingText(rawText) {
    if (!rawText) return '';
    let html = rawText;

    // 1. 단어 강조: 「...」
    html = html.replace(/「([^」]+)」/g, '<strong class="highlight-word-pill">「$1」</strong>');

    // 2. 글자 강조: '...'
    html = html.replace(/'([^']+)'/g, '<span class="highlight-char-pill">\'$1\'</span>');

    // 3. 티어 순위 및 턴 인식 강조
    html = html.replace(/\[1순위:[^\]]+\]/g, '<span class="highlight-tier-pill tier-1">💥 $&</span>');
    html = html.replace(/\[2순위:[^\]]+\]/g, '<span class="highlight-tier-pill tier-2">⚔️ $&</span>');
    html = html.replace(/\[3순위:[^\]]+\]/g, '<span class="highlight-tier-pill tier-3">🛡️ $&</span>');
    html = html.replace(/\[4순위:[^\]]+\]/g, '<span class="highlight-tier-pill tier-4">⚠️ $&</span>');
    html = html.replace(/\[내 턴:[^\]]+\]/g, '<span class="highlight-tier-pill my-turn-pill">🎯 $&</span>');
    html = html.replace(/\[상대방 턴:[^\]]+\]/g, '<span class="highlight-tier-pill opp-turn-pill">⚔️ $&</span>');

    // 4. 볼드 및 이탤릭
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // 5. 개행 처리
    html = html.replace(/\n\n/g, '<div style="margin: 8px 0;"></div>');
    html = html.replace(/\n/g, '<br>');

    return html;
  }

  function createBriefingHeroCard(data) {
    const analysis = data.analysis || {};
    const ultimate = analysis.ultimateWord;
    if (!ultimate || !ultimate.word) return null;

    const word = ultimate.word;
    const targetChar = analysis.targetChar || word[0];
    const endChar = ultimate.endChar || word[word.length - 1];
    const tierNum = data.tierNumber || ultimate.tierInfo?.tierNumber || 1;

    let tierClass = 'tier-1';
    let tierTitle = '💥 [1순위: 즉시 승리 한방 단어]';
    if (tierNum === 2) {
      tierClass = 'tier-2';
      tierTitle = '⚔️ [2순위: 2수 앞 필승 외통수 단어]';
    } else if (tierNum === 3) {
      tierClass = 'tier-3';
      tierTitle = '🔥 [3순위: 반격 봉쇄 치명타 단어]';
    } else if (tierNum === 4) {
      tierClass = 'tier-4';
      tierTitle = '🛡️ [4순위: 한방 회피 안전 단어]';
    } else if (tierNum >= 5) {
      tierClass = 'tier-5';
      tierTitle = '⚠️ [5순위: 위기 탈출 차선책]';
    }

    let killBadgeHtml = '';
    const outCount = typeof ultimate.outCount === 'number' ? ultimate.outCount : 0;
    if (outCount === 0) {
      killBadgeHtml = `<div class="hero-kill-badge killing">💥 끝글자 '${endChar}' ➔ 상대 반격 단어 0개 (100% 필승 한방)</div>`;
    } else if (tierNum === 2) {
      killBadgeHtml = `<div class="hero-kill-badge trap">⚔️ 끝글자 '${endChar}' ➔ 다음 턴 100% 한방 격파 (2수 앞 필승 외통수)</div>`;
    } else if (outCount <= 4) {
      killBadgeHtml = `<div class="hero-kill-badge pressure">🔥 끝글자 '${endChar}' ➔ 상대 선택지 단 ${outCount}개뿐 (치명적 압박 포위망)</div>`;
    } else {
      killBadgeHtml = `<div class="hero-kill-badge safe">🛡️ 끝글자 '${endChar}' ➔ 한방 피하는 안전 수 (상대 반격 ${outCount}개)</div>`;
    }

    let subLabel = '🌟 AI 추천 최적수 단어';
    if (data.turnType === 'opponentTurn' && data.opponentWord) {
      subLabel = `⚔️ 상대 「${escapeHtml(data.opponentWord)}」 격파 ➔ 회심의 반격 단어`;
    } else if (data.turnType === 'myTurn') {
      subLabel = `🎯 [내 턴] 시작 글자 '${escapeHtml(targetChar)}' ➔ 필승 추천 단어`;
    }

    const card = document.createElement('div');
    card.className = `briefing-hero-card ${tierClass}`;
    card.innerHTML = `
      <div class="hero-top-badge-row">
        <span class="hero-tier-badge ${tierClass}">${tierTitle}</span>
        <span class="hero-start-char-tag">시작: <strong>'${targetChar}'</strong></span>
      </div>

      <div class="hero-center-box">
        <div class="hero-word-header">
          <div class="hero-sub-label">${subLabel}</div>
          <div class="hero-word-row">
            <span class="hero-word-display">${word}</span>
            <span class="hero-pos-tag">[${ultimate.partOfSpeech || '명사'}]</span>
          </div>
        </div>
        ${killBadgeHtml}
      </div>

      <div class="hero-meaning-card">
        <div class="hero-source-label">📖 ${ultimate.source || '공인 국어사전'} 공식 뜻</div>
        <div class="hero-meaning-body">${ultimate.naverMeaning || '국어사전에 등재된 유효 표준 표제어입니다.'}</div>
      </div>

      <div class="hero-action-buttons">
        <button type="button" class="hero-action-btn hero-battle-btn" data-word="${word}" title="이 단어로 배틀 즉시 플레이">
          <span class="btn-icon">⚔️</span>
          <span class="btn-text-content">
            <strong>배틀에 바로 출격</strong>
            <small>1-클릭 즉시 사용</small>
          </span>
        </button>
        <button type="button" class="hero-action-btn hero-copy-btn" data-word="${word}" title="단어 복사">
          <span class="btn-icon">📋</span>
          <span>단어 복사</span>
        </button>
        <button type="button" class="hero-action-btn hero-dict-btn" data-word="${word}" title="국어사전에서 상세 조회">
          <span class="btn-icon">🔍</span>
          <span>사전 조회</span>
        </button>
      </div>
    `;

    // 이벤트 리스너 연결
    const battleBtn = card.querySelector('.hero-battle-btn');
    if (battleBtn) {
      battleBtn.addEventListener('click', () => {
        applyWordToBattle(word, true);
      });
    }

    const copyBtn = card.querySelector('.hero-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        copyToClipboard(word);
      });
    }

    const dictBtn = card.querySelector('.hero-dict-btn');
    if (dictBtn) {
      dictBtn.addEventListener('click', () => {
        inspectWordInDictionary(word);
      });
    }

    return card;
  }

  soundToggleBtn.addEventListener('click', () => {
    if (window.soundEngine) {
      const isMuted = window.soundEngine.toggleMute();
      soundIcon.textContent = isMuted ? '🔇' : '🔊';
      showToast(isMuted ? '사운드가 꺼졌습니다.' : '사운드가 켜졌습니다.');
      if (!isMuted) window.soundEngine.playCopy();
    }
  });

  // ------------------------------------------------------------------------
  // 5. 탭 전환 (모바일 상단 탭 & PC 보조 탭)
  // ------------------------------------------------------------------------
  // ⭐ 컴퓨터 화면 작게 했을 때 / AI 전용창 모드 제어
  let isAiOnlyMode = false;
  let autoCompactTriggered = false;

  function setAiOnlyMode(enable, silent = false) {
    isAiOnlyMode = enable;
    const layout = document.querySelector('.app-layout');
    if (layout) layout.classList.toggle('ai-only-mode', isAiOnlyMode);
    
    if (compactAiToggleBtn) {
      compactAiToggleBtn.classList.toggle('active', isAiOnlyMode);
      const textSpan = compactAiToggleBtn.querySelector('.btn-text');
      if (textSpan) textSpan.textContent = isAiOnlyMode ? '전체 보기' : 'AI 창만';
    }

    if (isAiOnlyMode) {
      switchTab('briefing');
      if (!silent) showToast('⚡ AI 창 전용 모드가 켜졌습니다.');
    } else {
      switchTab('battle');
      if (!silent) showToast('전체 대시보드 모드로 전환되었습니다.');
    }
  }

  if (compactAiToggleBtn) {
    compactAiToggleBtn.addEventListener('click', () => {
      setAiOnlyMode(!isAiOnlyMode);
      if (window.soundEngine) window.soundEngine.playCopy();
    });
  }

  // ⭐ [요청사항] 컴퓨터에서 화면을 조그맣게 만들었을 때 AI창만 남게 자동 최적화!
  function handleWindowResize() {
    const width = window.innerWidth;
    if (width < 992) {
      if (!autoCompactTriggered) {
        autoCompactTriggered = true;
        setAiOnlyMode(true, true);
      }
    } else {
      if (autoCompactTriggered) {
        autoCompactTriggered = false;
        setAiOnlyMode(false, true);
      }
    }
  }
  window.addEventListener('resize', handleWindowResize);
  // 초기 로드 시에도 창 크기 검사
  setTimeout(handleWindowResize, 50);

  function switchTab(tabKey) {
    // 모바일 네비게이션 탭 갱신
    navTabs.forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-tab') === tabKey);
    });

    if (tabKey === 'battle') {
      panelBattle.classList.add('active');
      panelAux.classList.remove('active');
    } else if (tabKey === 'briefing') {
      panelBattle.classList.remove('active');
      panelAux.classList.add('active');
      switchAuxTab('briefing');
    } else if (tabKey === 'dict') {
      panelBattle.classList.remove('active');
      panelAux.classList.add('active');
      switchAuxTab('dict');
    }
  }

  function switchAuxTab(auxKey) {
    auxTabBtns.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-aux') === auxKey);
    });

    if (auxKey === 'briefing') {
      auxBriefing.classList.add('active');
      auxDict.classList.remove('active');
    } else if (auxKey === 'dict') {
      auxBriefing.classList.remove('active');
      auxDict.classList.add('active');
    }
  }

  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');
      if (targetTab === 'battle') {
        const layout = document.querySelector('.app-layout');
        if (layout) layout.classList.remove('ai-only-mode');
        isAiOnlyMode = false;
        if (compactAiToggleBtn) {
          compactAiToggleBtn.classList.remove('active');
          const textSpan = compactAiToggleBtn.querySelector('.btn-text');
          if (textSpan) textSpan.textContent = 'AI 창만';
        }
      }
      switchTab(targetTab);
      if (window.soundEngine) window.soundEngine.playCopy();
    });
  });

  auxTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetAux = btn.getAttribute('data-aux');
      switchAuxTab(targetAux);
    });
  });

  // ------------------------------------------------------------------------
  // 6. 배틀 로직 및 난이도 관리 (쉬움, 중간, 어려움, 헬)
  // ------------------------------------------------------------------------
  diffBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      diffBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentDifficulty = btn.getAttribute('data-diff');
      
      const diffName = btn.textContent;
      showToast(`난이도가 [${diffName}] 모드로 변경되었습니다.`);
      if (window.soundEngine) window.soundEngine.playCopy();
    });
  });

  function updateTargetSection(char, isUserTurn, lastWord = null, lastMeaning = null) {
    currentTargetChar = char || '';

    if (!char) {
      targetCharDisplay.innerHTML = '<span class="target-pulse-char empty">시작</span>';
      prefixChar.textContent = '시작';
      dueumBadge.innerHTML = '<span class="dueum-char-chip primary">자유 시작</span> 원하는 단어로 시작하세요 (2자 이상)';
      lastWordText.textContent = '배틀 준비 완료';
      lastWordMeaning.textContent = '사전에 등재된 표준 표제어만 유효합니다.';
      turnBadge.className = 'turn-badge user';
      turnStatusText.textContent = '플레이어 차례';
      return;
    }

    targetCharDisplay.innerHTML = `<span class="target-pulse-char active">${char}</span>`;
    prefixChar.textContent = char;

    const variants = getDueumVariantsClient(char);
    if (variants.length > 1) {
      dueumBadge.innerHTML = `두음법칙 허용: <span class="dueum-pill-group">${variants.map(v => `<span class="dueum-char-chip ${v === char ? 'primary' : 'alt'}">${v}</span>`).join(' ')}</span>`;
    } else {
      dueumBadge.innerHTML = `<span class="dueum-char-chip primary">'${char}'</span>(으)로 시작하는 단어를 입력하세요`;
    }

    if (lastWord) {
      lastWordText.textContent = `직전 단어: 「${lastWord}」`;
      if (lastMeaning) {
        lastWordMeaning.textContent = lastMeaning;
      }
    }

    if (isGameOver) {
      turnBadge.className = 'turn-badge gameover';
      turnStatusText.textContent = '게임 종료';
    } else if (isUserTurn) {
      turnBadge.className = 'turn-badge user';
      turnStatusText.textContent = '플레이어 차례';
    } else {
      turnBadge.className = 'turn-badge ai';
      turnStatusText.textContent = 'AI 수읽기 중...';
    }
  }

  function appendTurnCard({
    speaker,
    word,
    partOfSpeech,
    meaning,
    source,
    link,
    tierNumber,
    strategyBrief
  }) {
    if (emptyLogState && emptyLogState.parentElement) {
      emptyLogState.remove();
    }

    turnCount++;
    const card = document.createElement('div');
    card.className = `turn-card ${speaker}`;

    const isUser = speaker === 'user';
    const speakerLabel = isUser ? '👤 플레이어' : '🤖 마스터 AI';
    const dictBadge = source || '공인 국어사전';
    const posBadge = partOfSpeech || '명사';
    const dictUrl = link || `https://ko.dict.naver.com/#/search?query=${encodeURIComponent(word)}`;

    let strategyHtml = '';
    if (!isUser) {
      let tierBadge = '';
      if (tierNumber === 1) tierBadge = '<span class="ai-strat-pill tier-1">💥 1순위 한방</span>';
      else if (tierNumber === 2) tierBadge = '<span class="ai-strat-pill tier-2">⚔️ 2순위 외통수</span>';
      else if (tierNumber === 3) tierBadge = '<span class="ai-strat-pill tier-3">🔥 3순위 치명타</span>';
      else if (tierNumber === 4) tierBadge = '<span class="ai-strat-pill tier-4">🛡️ 4순위 안전수</span>';
      else if (tierNumber >= 5) tierBadge = '<span class="ai-strat-pill tier-5">⚠️ 5순위 차선책</span>';
      if (tierBadge || strategyBrief) {
        strategyHtml = `<div class="card-strategy-brief">${tierBadge} ${strategyBrief || ''}</div>`;
      }
    }

    const baseWord = word.length > 1 ? word.slice(0, -1) : '';
    const tailChar = word.slice(-1);

    card.innerHTML = `
      <div class="card-header-row">
        <span class="card-speaker">${speakerLabel}</span>
        <span class="card-turn-number">#${turnCount}</span>
      </div>
      <div class="card-word-row">
        <span class="card-word-text">
          <span class="word-stem">${baseWord}</span><span class="word-tail" title="다음 턴 연결 글자: '${tailChar}'">${tailChar}</span>
        </span>
        <span class="card-pos-badge">[${posBadge}]</span>
        <span class="card-dict-source">${dictBadge}</span>
      </div>
      <div class="card-meaning">${meaning || '공인 국어사전에 등재된 유효 표준 표제어입니다.'}</div>
      ${strategyHtml}
      <div class="card-footer-row">
        <button type="button" class="card-copy-btn" data-word="${word}" title="단어 복사">📋 복사</button>
        <a href="${dictUrl}" target="_blank" rel="noopener noreferrer" class="dict-link-btn" title="네이버 사전에서 뜻 확인">
          사전 보기 ↗
        </a>
      </div>
    `;

    const copyBtn = card.querySelector('.card-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        copyToClipboard(word);
      });
    }

    turnLog.appendChild(card);
    card.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  function appendGameOverCard(winner, message) {
    const isUserWinner = winner === 'user';
    const card = document.createElement('div');
    card.className = 'turn-card gameover';

    card.innerHTML = `
      <div style="font-size: 2rem; margin-bottom: 6px;">${isUserWinner ? '🏆' : '💀'}</div>
      <h3 style="font-size: 1.15rem; font-weight: 800; color: ${isUserWinner ? '#34d399' : '#f87171'}; margin-bottom: 4px;">
        ${isUserWinner ? '플레이어 승리!' : '마스터 AI 승리!'}
      </h3>
      <p style="font-size: 0.85rem; color: #cbd5e1; line-height: 1.5; margin-bottom: 12px;">${message}</p>
      <button id="cardResetBtn" class="submit-btn" style="padding: 0 20px; height: 38px;">
        🔄 한 판 더 하기
      </button>
    `;

    turnLog.appendChild(card);
    card.scrollIntoView({ behavior: 'smooth', block: 'end' });

    const cardResetBtn = card.querySelector('#cardResetBtn');
    if (cardResetBtn) {
      cardResetBtn.addEventListener('click', resetGame);
    }
  }

  async function submitWord(rawInput) {
    if (isGameOver) {
      showFeedback('게임이 종료되었습니다. 상단의 [새 게임] 버튼을 눌러주세요.', 'info');
      return;
    }

    if (isSubmitting) return;

    const trimmedInput = (rawInput || '').trim();

    // 1차 띄어쓰기(공백) 검증 - 끝말잇기 대원칙 룰
    if (/\s/.test(trimmedInput)) {
      showFeedback('띄어쓰기(공백)가 포함된 단어는 끝말잇기 규칙상 사용할 수 없습니다.');
      if (window.soundEngine) window.soundEngine.playError();
      wordInput.focus();
      return;
    }

    const cleanWord = trimmedInput.replace(/[^\uAC00-\uD7A3]/g, '');

    // 2차 룰 검증
    if (cleanWord.length < 2) {
      showFeedback('단어는 최소 2글자 이상이어야 합니다.');
      if (window.soundEngine) window.soundEngine.playError();
      wordInput.focus();
      return;
    }

    if (currentTargetChar) {
      const allowedStarts = getDueumVariantsClient(currentTargetChar);
      if (!allowedStarts.includes(cleanWord[0])) {
        const dueumMsg = allowedStarts.length > 1 ? ` (두음법칙 허용: '${allowedStarts.join("', '")}')` : '';
        showFeedback(`'${currentTargetChar}'(으)로 시작해야 합니다.${dueumMsg}`);
        if (window.soundEngine) window.soundEngine.playError();
        wordInput.focus();
        return;
      }
    }

    if (gameHistory.some(item => item.word === cleanWord)) {
      showFeedback(`이미 사용된 단어입니다: 「${cleanWord}」`);
      if (window.soundEngine) window.soundEngine.playError();
      wordInput.focus();
      return;
    }

    clearFeedback();
    isSubmitting = true;
    submitBtn.disabled = true;
    turnBadge.className = 'turn-badge ai';
    turnStatusText.textContent = '사전 탐색 및 검증 중...';

    try {
      const res = await fetch('/api/game/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userWord: cleanWord,
          history: gameHistory,
          difficulty: currentDifficulty,
          noFirstTurnKill: noFirstTurnKillCheckbox ? noFirstTurnKillCheckbox.checked : true
        })
      });

      const data = await res.json();

      if (!data.success) {
        showFeedback(data.message || '공인 국어사전에 등재되지 않은 단어입니다.');
        if (window.soundEngine) window.soundEngine.playError();
        turnBadge.className = 'turn-badge user';
        turnStatusText.textContent = '플레이어 차례';
        wordInput.focus();
        return;
      }

      if (window.soundEngine) window.soundEngine.playCombo(comboCount + 1);

      appendTurnCard({
        speaker: 'user',
        word: data.userWord,
        partOfSpeech: data.userPartOfSpeech,
        meaning: data.userMeaning,
        source: data.userSource,
        link: data.userLink
      });

      gameHistory.push({ word: data.userWord, speaker: 'user' });
      comboCount++;
      comboText.textContent = `${comboCount} COMBO`;

      if (data.gameOver && data.winner === 'user') {
        isGameOver = true;
        updateTargetSection('', true, data.userWord, data.userMeaning);
        appendGameOverCard('user', data.message || '더 이상 이어갈 수 있는 단어가 사전에 없습니다!');
        if (window.soundEngine) window.soundEngine.playVictory();
        wordInput.value = '';
        return;
      }

      if (data.aiWord) {
        setTimeout(() => {
          appendTurnCard({
            speaker: 'ai',
            word: data.aiWord,
            partOfSpeech: data.aiPartOfSpeech,
            meaning: data.aiMeaning,
            source: data.aiSource,
            link: data.aiLink,
            tierNumber: data.tierNumber,
            strategyBrief: data.strategyBrief
          });

          gameHistory.push({ word: data.aiWord, speaker: 'ai' });
          comboCount++;
          comboText.textContent = `${comboCount} COMBO`;

          if (data.gameOver && data.winner === 'ai') {
            isGameOver = true;
            updateTargetSection(data.aiEndChar, false, data.aiWord, data.aiMeaning);
            appendGameOverCard('ai', `AI가 낸 「${data.aiWord}」의 끝글자 '${data.aiEndChar}'(으)로 시작하는 단어가 국어사전에 없어 패배하였습니다.`);
            if (window.soundEngine) window.soundEngine.playError();
            wordInput.value = '';
            return;
          }

          updateTargetSection(data.aiEndChar, true, data.aiWord, data.aiMeaning);
          wordInput.value = '';
          wordInput.focus();
        }, 280);
      }

      wordInput.value = '';
    } catch (err) {
      showFeedback('서버와의 통신에 실패했습니다. 다시 시도해주세요.');
      if (window.soundEngine) window.soundEngine.playError();
      turnBadge.className = 'turn-badge user';
      turnStatusText.textContent = '플레이어 차례';
    } finally {
      isSubmitting = false;
      submitBtn.disabled = false;
    }
  }

  function resetGame() {
    gameHistory = [];
    currentTargetChar = '';
    isGameOver = false;
    turnCount = 0;
    comboCount = 0;
    isSubmitting = false;

    turnLog.innerHTML = `
      <div class="empty-log-state" id="emptyLogState">
        <div class="empty-icon">🎮</div>
        <h3>끝말잇기 배틀을 시작하세요!</h3>
        <p>
          네이버 국어사전(어학사전)에 정식 등재된<br>
          유효 표제어만 인정되며, <strong>한글 맞춤법 제10항·제11항 정방향 두음법칙</strong>만 적용됩니다.
        </p>
        <div class="rules-chips">
          <span class="rule-chip">✓ 🛡️ 첫 턴 한방제외 모드 지원</span>
          <span class="rule-chip">✓ 띄어쓰기(공백/구) 단어 엄격 배제</span>
          <span class="rule-chip">✓ 비표준어/억지단어 원천 차단</span>
          <span class="rule-chip">✓ 역방향 두음법칙(니→리 등) 금지</span>
          <span class="rule-chip">✓ AI 환각(없는 단어) 생성 불가</span>
        </div>
      </div>
    `;

    comboText.textContent = '0 COMBO';
    updateTargetSection('', true);
    clearFeedback();
    wordInput.value = '';
    wordInput.disabled = false;
    submitBtn.disabled = false;
    wordInput.focus();

    if (window.soundEngine) window.soundEngine.playCopy();
    showToast('새 배틀이 시작되었습니다!');
  }

  gameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitWord(wordInput.value);
  });

  resetGameBtn.addEventListener('click', resetGame);
  wordInput.addEventListener('input', () => {
    if (inputFeedback.style.display !== 'none') clearFeedback();
  });

  // ------------------------------------------------------------------------
  // 7. [AI브리핑] 로직 (흐름 모드 & 4단계 우선순위 브리핑)
  // ------------------------------------------------------------------------
  // 7. [AI브리핑] 로직 (흐름 모드 & 상대방 단어 적기 모드 & 4단계 우선순위 브리핑)
  // ------------------------------------------------------------------------
  let flowOpponentStartChar = null; // 대기 중인 상대방 시작 글자

  function updateFlowCount() {
    if (flowCountBadge) {
      flowCountBadge.textContent = `(${briefedWords.length})`;
    }
  }

  function updateBriefingPlaceholder() {
    const isOpponentMode = opponentWordModeCheckbox ? opponentWordModeCheckbox.checked : true;
    if (isOpponentMode) {
      if (flowOpponentStartChar) {
        briefingInput.placeholder = `상대 단어(풀네임: '${flowOpponentStartChar}'...) 또는 내 앞글자 입력...`;
      } else {
        briefingInput.placeholder = '앞글자 1자(내 턴) 또는 풀네임(상대 턴)을 입력하세요...';
      }
    } else if (flowModeCheckbox && flowModeCheckbox.checked) {
      briefingInput.placeholder = '앞글자 또는 단어를 입력하세요 (예: 기, 기차)...';
    } else {
      briefingInput.placeholder = '앞글자 또는 단어를 입력하세요 (예: 기, 산기슭)...';
    }
  }

  flowModeCheckbox.addEventListener('change', () => {
    const isFlow = flowModeCheckbox.checked;
    if (!isFlow) {
      briefedWords = [];
      flowOpponentStartChar = null;
      updateFlowCount();
    }
    updateBriefingPlaceholder();
    showToast(isFlow ? '🌊 흐름 모드가 켜졌습니다. (단어 중복 방지 및 대결 누적)' : '흐름 모드가 꺼졌습니다.');
    if (window.soundEngine) window.soundEngine.playCopy();
  });

  if (opponentWordModeCheckbox) {
    opponentWordModeCheckbox.addEventListener('change', () => {
      const isOpponent = opponentWordModeCheckbox.checked;
      flowOpponentStartChar = null;
      updateBriefingPlaceholder();
      showToast(isOpponent ? '📝 상대방 단어 적기 모드가 켜졌습니다. (앞글자=내턴 / 풀네임=상대턴)' : '상대방 단어 적기 모드가 꺼졌습니다.');
      if (window.soundEngine) window.soundEngine.playCopy();
    });
  }

  if (noFirstTurnKillCheckbox) {
    noFirstTurnKillCheckbox.addEventListener('change', () => {
      const isChecked = noFirstTurnKillCheckbox.checked;
      showToast(isChecked ? '🛡️ 배틀 첫 턴 한방제외가 켜졌습니다.' : '배틀 첫 턴 한방제외가 꺼졌습니다.');
      if (window.soundEngine) window.soundEngine.playCopy();
    });
  }

  if (briefingNoFirstTurnKillCheckbox) {
    briefingNoFirstTurnKillCheckbox.addEventListener('change', () => {
      const isChecked = briefingNoFirstTurnKillCheckbox.checked;
      showToast(isChecked ? '🛡️ 한방제외 모드가 켜졌습니다. (한방 단어 추천 제외)' : '한방제외 모드가 꺼졌습니다. (1순위 한방 단어 추천)');
      if (window.soundEngine) window.soundEngine.playCopy();
    });
  }

  clearChatBtn.addEventListener('click', () => {
    briefedWords = [];
    flowOpponentStartChar = null;
    updateFlowCount();
    updateBriefingPlaceholder();
    briefingMessages.innerHTML = `
      <div class="briefing-msg ai">
        <div class="msg-avatar">⚡</div>
        <div class="msg-bubble">
          <p>채팅 및 흐름 모드가 초기화되었습니다! 🔄</p>
          <p>원하시는 앞글자(1자: [내 턴])나 단어 풀네임(2자 이상: [상대 턴])을 입력해주세요.</p>
          <ol class="briefing-priority-list">
            <li>💥 <strong>1순위</strong>: 일단 <strong>한방 단어</strong> 위주로 탐색 (상대 반격 0개)</li>
            <li>⚔️ <strong>2순위</strong>: 없으면 <strong>되받아칠 단어가 거의 없는 단어</strong> (외통수/치명타)</li>
            <li>🛡️ <strong>3순위</strong>: 없으면 <strong>한방단어에 당하지 않는 단어</strong> (안전 수)</li>
            <li>⚠️ <strong>4순위</strong>: 없으면 <strong>할 수라도 있는 단어</strong> (차선책)</li>
          </ol>
          <p class="flow-mode-note">
            📝 <strong>상대방 단어 적기 모드</strong>: <strong>앞글자(1자)</strong> 입력 시 [내 턴] 필승 수 추천, <strong>단어 풀네임(2자 이상)</strong> 입력 시 [상대 턴]으로 자동 인식하여 반격 수를 브리핑합니다.
          </p>
        </div>
      </div>
    `;
    showToast('AI브리핑 채팅이 초기화되었습니다.');
    if (window.soundEngine) window.soundEngine.playCopy();
  });

  async function requestBriefing(queryText) {
    if (isBriefingLoading) return;
    const cleanQuery = queryText.trim();
    if (!cleanQuery) return;

    // 사용자 메시지 표시
    const userMsg = document.createElement('div');
    userMsg.className = 'briefing-msg user';
    userMsg.innerHTML = `<div class="msg-bubble">${escapeHtml(cleanQuery)}</div>`;
    briefingMessages.appendChild(userMsg);
    userMsg.scrollIntoView({ behavior: 'smooth' });

    // 로딩 메시지
    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'briefing-msg ai';
    loadingMsg.innerHTML = `
      <div class="msg-avatar">⚡</div>
      <div class="msg-bubble">분석 중... 4단계 지능으로 최적의 수를 탐색하고 있습니다.</div>
    `;
    briefingMessages.appendChild(loadingMsg);
    loadingMsg.scrollIntoView({ behavior: 'smooth' });

    isBriefingLoading = true;
    briefingSendBtn.disabled = true;

    try {
      const isFlow = flowModeCheckbox ? flowModeCheckbox.checked : true;
      const isOpponentMode = opponentWordModeCheckbox ? opponentWordModeCheckbox.checked : true;
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: cleanQuery,
          flowMode: isFlow,
          opponentWordMode: isOpponentMode,
          briefedWords: isFlow ? briefedWords : [],
          opponentStartChar: flowOpponentStartChar,
          noFirstTurnKill: briefingNoFirstTurnKillCheckbox ? briefingNoFirstTurnKillCheckbox.checked : false
        })
      });

      const data = await res.json();
      loadingMsg.remove();

      const aiMsg = document.createElement('div');
      aiMsg.className = 'briefing-msg ai';

      const bubble = document.createElement('div');
      bubble.className = 'msg-bubble';
      bubble.innerHTML = formatBriefingText(data.text || '추천 단어를 찾을 수 없습니다.');

      // 추천 단어 시각적 강조 히어로 카드 추가 (한방, 외통수, 안전수, 차선책)
      if (data.hasUltimateCard && data.analysis && data.analysis.ultimateWord) {
        const heroCard = createBriefingHeroCard(data);
        if (heroCard) {
          bubble.appendChild(heroCard);
        }
      }

      aiMsg.innerHTML = `<div class="msg-avatar">⚡</div>`;
      aiMsg.appendChild(bubble);
      briefingMessages.appendChild(aiMsg);
      aiMsg.scrollIntoView({ behavior: 'smooth' });

      // 흐름 모드 & 상대방 단어 적기 상태 및 단어 업데이트
      if (isFlow) {
        if (Array.isArray(data.briefedWords)) {
          briefedWords = data.briefedWords;
        } else {
          if (data.opponentWord && !briefedWords.includes(data.opponentWord)) {
            briefedWords.push(data.opponentWord);
          }
          if (data.briefedWord && !briefedWords.includes(data.briefedWord)) {
            briefedWords.push(data.briefedWord);
          }
        }
      } else {
        briefedWords = [];
      }
      updateFlowCount();

      if (isOpponentMode) {
        if (data.isAwaitingOpponentWord && data.opponentStartChar) {
          flowOpponentStartChar = data.opponentStartChar;
        } else {
          flowOpponentStartChar = null;
        }
      } else {
        flowOpponentStartChar = null;
      }
      updateBriefingPlaceholder();

      if (window.soundEngine) window.soundEngine.playCopy();
    } catch (err) {
      loadingMsg.remove();
      const errorMsg = document.createElement('div');
      errorMsg.className = 'briefing-msg ai';
      errorMsg.innerHTML = `
        <div class="msg-avatar">⚡</div>
        <div class="msg-bubble">네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.</div>
      `;
      briefingMessages.appendChild(errorMsg);
    } finally {
      isBriefingLoading = false;
      briefingSendBtn.disabled = false;
      briefingInput.value = '';
    }
  }

  briefingForm.addEventListener('submit', (e) => {
    e.preventDefault();
    requestBriefing(briefingInput.value);
  });

  quickBriefingChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const char = chip.getAttribute('data-char');
      if (char === 'auto') {
        const target = currentTargetChar || '시작';
        if (target === '시작') {
          requestBriefing('끝말잇기 첫 턴 추천 단어 알려줘');
        } else {
          requestBriefing(target);
        }
      } else {
        requestBriefing(char);
      }
    });
  });

  // ------------------------------------------------------------------------
  // 8. [단어 사전] 로직 (국어사전 실시간 검색 & 일치 단어 리스트)
  // ------------------------------------------------------------------------
  // ------------------------------------------------------------------------
  // 8. [단어 사전] 로직 (국어사전 실시간 검색 & 파트별 분할 일치 어휘)
  // ------------------------------------------------------------------------
  function escapeHtml(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function highlightPrefix(word, query) {
    if (word.startsWith(query)) {
      return `<strong class="match-part prefix-hl">${escapeHtml(query)}</strong><span class="rest-part">${escapeHtml(word.slice(query.length))}</span>`;
    }
    return escapeHtml(word);
  }

  function highlightSuffix(word, query) {
    if (word.endsWith(query)) {
      return `<span class="rest-part">${escapeHtml(word.slice(0, -query.length))}</span><strong class="match-part suffix-hl">${escapeHtml(query)}</strong>`;
    }
    return escapeHtml(word);
  }

  function highlightContains(word, query) {
    const idx = word.indexOf(query);
    if (idx !== -1) {
      const before = word.slice(0, idx);
      const after = word.slice(idx + query.length);
      return `<span class="rest-part">${escapeHtml(before)}</span><strong class="match-part contains-hl">${escapeHtml(query)}</strong><span class="rest-part">${escapeHtml(after)}</span>`;
    }
    return escapeHtml(word);
  }

  function highlightCharMatch(word, query) {
    const queryChars = new Set(query.split(''));
    let res = '';
    for (const ch of word) {
      if (queryChars.has(ch)) {
        res += `<strong class="match-part char-hl">${escapeHtml(ch)}</strong>`;
      } else {
        res += `<span class="rest-part">${escapeHtml(ch)}</span>`;
      }
    }
    return res;
  }

  function getStratBadge(wordObj) {
    if (!wordObj) return '';
    if (wordObj.isKilling || wordObj.outCount === 0) {
      return `<span class="pill-strat killing">한방</span>`;
    }
    if (wordObj.outCount <= 3) {
      return `<span class="pill-strat trap">외통수</span>`;
    }
    return '';
  }

  function renderPartitionSection(title, icon, type, items, totalCount, highlightFn, query) {
    if (!items || items.length === 0) return '';
    const isTruncated = totalCount > items.length;
    return `
      <section class="dict-partition-section part-${type}" data-part="${type}">
        <div class="partition-header">
          <div class="partition-title-group">
            <span class="partition-icon">${icon}</span>
            <h5 class="partition-title">${title}</h5>
            <span class="partition-count-badge">
              ${isTruncated ? `${items.length}개 표시 (총 ${totalCount.toLocaleString()}개)` : `총 ${totalCount.toLocaleString()}개`}
            </span>
          </div>
          <span class="partition-subtip">클릭 시 해당 단어로 즉시 사전 검색</span>
        </div>
        <div class="partition-words-grid">
          ${items.map(item => `
            <button type="button" class="partition-word-pill ${item.isKilling ? 'is-kill' : ''}" data-word="${escapeHtml(item.word)}" title="「${escapeHtml(item.word)}」 국어사전 검색 [${escapeHtml(item.part || '명사')}, 끝글자: '${escapeHtml(item.endChar)}']">
              <span class="pill-text-wrap">${highlightFn(item.word, query)}</span>
              ${getStratBadge(item)}
            </button>
          `).join('')}
        </div>
      </section>
    `;
  }

  async function searchDictionary(word) {
    const rawTrimmed = (word || '').trim();
    if (!rawTrimmed) return;
    const hasSpace = /\s/.test(rawTrimmed);
    const clean = rawTrimmed.replace(/[^\uAC00-\uD7A3]/g, '');
    if (!clean && !hasSpace) return;

    dictSearchInput.value = rawTrimmed;
    dictClearBtn.style.display = 'block';
    dictEmptyState.style.display = 'none';
    dictContentArea.style.display = 'block';
    dictContentArea.innerHTML = `
      <div class="dict-loading-box">
        <div class="dict-loading-spinner"></div>
        <div class="dict-loading-text"><strong>「${escapeHtml(rawTrimmed)}」</strong> 국어사전 실시간 정밀 탐색 중...</div>
      </div>
    `;

    try {
      const res = await fetch(`/api/dict/search?word=${encodeURIComponent(rawTrimmed)}`);
      const data = await res.json();

      const cats = data.categories || {
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

      const totalAll = (cats.exact ? 1 : 0) + (cats.prefixTotal || 0) + (cats.suffixTotal || 0) + (cats.containsTotal || 0) + (cats.charMatchTotal || 0);

      // 1. 헤드워드 끝말잇기 반격 분석 카드
      let rebuttalHtml = '';
      if (data.isSpacedWord) {
        rebuttalHtml = `
          <div class="dict-rebuttal-box spaced-rule-box">
            <div class="dict-rebuttal-top">
              <div class="dict-rebuttal-title">
                <span>🚫</span>
                <span>끝말잇기 공식 규칙 위반 (띄어쓰기 포함)</span>
              </div>
              <span class="dict-rebuttal-status-badge killing">끝말잇기 사용 불가</span>
            </div>
            <div class="dict-rebuttal-samples">
              <span class="sample-words" style="color: #fca5a5;">
                네이버 국어사전에 ‘${escapeHtml(data.spacedEntry || data.word || rawTrimmed)}’(으)로 띄어쓰기(공백)가 포함되어 등재된 어휘/구입니다.<br>
                끝말잇기 공식 대원칙상 <strong>띄어쓰기가 없는 한 단어(단일어 또는 합성명사)</strong>만 유효하므로 게임에서 인정되지 않습니다.
              </span>
            </div>
          </div>
        `;
      } else if (data.rebuttal) {
        const r = data.rebuttal;
        let statusClass = 'safe';
        let statusIcon = '🛡️';
        let statusMain = `안전 글자 (상대 선택지 ${r.totalCount}개)`;

        if (r.totalCount === 0) {
          statusClass = 'killing';
          statusIcon = '💥';
          statusMain = `반격 불가 (상대 단어 0개 / 100% 필승 한방!)`;
        } else if (r.totalCount <= 3) {
          statusClass = 'trap';
          statusIcon = '⚔️';
          statusMain = `외통수 포위 (상대 선택지 단 ${r.totalCount}개뿐)`;
        }

        rebuttalHtml = `
          <div class="dict-rebuttal-box ${statusClass}">
            <div class="dict-rebuttal-top">
              <div class="dict-rebuttal-title">
                <span>${statusIcon}</span>
                <span>끝말잇기 끝소리 <strong>'${escapeHtml(r.endChar)}'</strong> 반격 분석</span>
              </div>
              <span class="dict-rebuttal-status-badge ${statusClass}">${statusMain}</span>
            </div>
            ${r.samples && r.samples.length > 0 ? `
              <div class="dict-rebuttal-samples">
                <span class="sample-label">상대방 가능 반격 어휘:</span>
                <span class="sample-words">${r.samples.slice(0, 6).map(s => `<code>${escapeHtml(s)}</code>`).join(' ')}</span>
              </div>
            ` : `
              <div class="dict-rebuttal-samples">
                <span class="sample-words killing-note">상대방이 낼 수 있는 공인 단어가 국어사전에 전무하여 즉시 승리합니다!</span>
              </div>
            `}
          </div>
        `;
      }

      // 2. 표제어 뜻풀이 포맷팅
      let meaningsHtml = '';
      if (data.meanings && data.meanings.length > 0) {
        if (data.meanings.length === 1) {
          meaningsHtml = `<div class="dict-single-meaning">${escapeHtml(data.meanings[0])}</div>`;
        } else {
          meaningsHtml = `
            <ol class="dict-meaning-list">
              ${data.meanings.slice(0, 4).map(m => `<li>${escapeHtml(m)}</li>`).join('')}
            </ol>
          `;
        }
      } else {
        meaningsHtml = `<div class="dict-single-meaning unverified-msg">네이버 국어사전에 구체적인 뜻풀이가 등재되지 않은 단어입니다.</div>`;
      }

      // 3. 초대형 표제어 히어로 카드 (처음에 일치하는거 크게 뜨고!)
      const isVerified = !!data.isVerified;
      const isSpaced = !!data.isSpacedWord;
      const heroWord = data.word || clean || rawTrimmed;
      const sealClass = isVerified ? 'verified' : (isSpaced ? 'spaced' : 'unverified');
      const sealText = isVerified 
        ? '🏛️ 네이버 국어사전 공인 표제어' 
        : (isSpaced ? '🚫 끝말잇기 불가 (띄어쓰기 포함 어휘/구)' : '⚠️ 사전 미등재');
      const heroCardHtml = `
        <div class="dict-hero-card ${sealClass}">
          <div class="dict-hero-badge-bar">
            <span class="dict-hero-seal ${sealClass}">
              ${sealText}
            </span>
            <span class="dict-hero-pos">[${escapeHtml(data.partOfSpeech || '명사')}]</span>
            <span class="dict-hero-source">${escapeHtml(data.source || '공인 국어사전')}</span>
          </div>

          <div class="dict-hero-main-row">
            <h2 class="dict-hero-word-title" title="표제어: ${escapeHtml(heroWord)}">
              ${escapeHtml(heroWord)}
            </h2>
            <div class="dict-hero-tag-wrap">
              <span class="dict-hero-len">${heroWord.length}글자 어휘</span>
              ${data.rebuttal && data.rebuttal.totalCount === 0 ? '<span class="dict-hero-kill-tag">💥 한방 단어</span>' : ''}
              ${data.rebuttal && data.rebuttal.totalCount > 0 && data.rebuttal.totalCount <= 3 ? '<span class="dict-hero-trap-tag">⚔️ 외통수 단어</span>' : ''}
            </div>
          </div>

          <div class="dict-hero-meanings-panel">
            <div class="meanings-header">
              <span class="meanings-icon">📖</span>
              <span class="meanings-caption">표준 국어사전 정의</span>
            </div>
            ${meaningsHtml}
          </div>

          ${rebuttalHtml}

          <div class="dict-hero-actions-bar">
            <button type="button" class="dict-action-btn dict-battle-btn" data-word="${escapeHtml(heroWord)}">
              ⚔️ 배틀에 바로 쓰기
            </button>
            <button type="button" class="dict-action-btn dict-copy-btn" data-word="${escapeHtml(heroWord)}">
              📋 단어 복사
            </button>
            <a href="${data.link || `https://ko.dict.naver.com/#/search?query=${encodeURIComponent(clean)}`}" target="_blank" rel="noopener noreferrer" class="dict-action-btn dict-link-btn">
              네이버 국어사전 원문 보기 ↗
            </a>
          </div>
        </div>
      `;

      // 4. 요약 바 및 파트별 필터 탭
      const summaryBarHtml = `
        <div class="dict-summary-bar">
          <div class="summary-meta-line">
            <div class="summary-left">
              <span class="summary-pulse-icon">📚</span>
              <span class="summary-query-text"><strong>「${escapeHtml(clean)}」</strong> 검색 결과</span>
              <span class="summary-total-pill">총 ${totalAll.toLocaleString()}개 어휘 탐색</span>
            </div>
          </div>
          <div class="dict-partition-tabs">
            <button type="button" class="part-tab-chip active" data-filter="all">전체 (${totalAll.toLocaleString()})</button>
            ${cats.prefixTotal > 0 ? `<button type="button" class="part-tab-chip part-prefix" data-filter="prefix">📌 앞에 들어감 (${cats.prefixTotal.toLocaleString()})</button>` : ''}
            ${cats.suffixTotal > 0 ? `<button type="button" class="part-tab-chip part-suffix" data-filter="suffix">📎 끝에 들어감 (${cats.suffixTotal.toLocaleString()})</button>` : ''}
            ${cats.containsTotal > 0 ? `<button type="button" class="part-tab-chip part-contains" data-filter="contains">🔍 중간에 포함 (${cats.containsTotal.toLocaleString()})</button>` : ''}
            ${cats.charMatchTotal > 0 ? `<button type="button" class="part-tab-chip part-char" data-filter="char">💡 한 글자 일치 (${cats.charMatchTotal.toLocaleString()})</button>` : ''}
          </div>
        </div>
      `;

      // 5. 파트별 분할 섹션 렌더링
      const prefixSectionHtml = renderPartitionSection(
        `앞에 들어가는 단어 (「${escapeHtml(clean)}」 시작)`,
        '📌',
        'prefix',
        cats.prefix,
        cats.prefixTotal,
        highlightPrefix,
        clean
      );

      const suffixSectionHtml = renderPartitionSection(
        `끝에 들어가는 단어 (「${escapeHtml(clean)}」(으)로 끝남)`,
        '📎',
        'suffix',
        cats.suffix,
        cats.suffixTotal,
        highlightSuffix,
        clean
      );

      const containsSectionHtml = renderPartitionSection(
        `중간에 들어가는 단어 (「${escapeHtml(clean)}」 포함)`,
        '🔍',
        'contains',
        cats.contains,
        cats.containsTotal,
        highlightContains,
        clean
      );

      const charMatchSectionHtml = renderPartitionSection(
        `한 글자라도 일치하는 단어 (음절 일치)`,
        '💡',
        'char',
        cats.charMatch,
        cats.charMatchTotal,
        highlightCharMatch,
        clean
      );

      // 전체 조합
      dictContentArea.innerHTML = `
        ${heroCardHtml}
        ${summaryBarHtml}
        <div class="dict-partitions-wrapper" id="dictPartitionsWrapper">
          ${prefixSectionHtml}
          ${suffixSectionHtml}
          ${containsSectionHtml}
          ${charMatchSectionHtml}
          ${(!prefixSectionHtml && !suffixSectionHtml && !containsSectionHtml && !charMatchSectionHtml) ? `
            <div class="dict-no-partitions">
              「${escapeHtml(clean)}」과(와) 연관된 추가 어휘를 찾을 수 없습니다.
            </div>
          ` : ''}
        </div>
      `;

      // 필터 탭 클릭 이벤트
      const partitionTabs = dictContentArea.querySelectorAll('.part-tab-chip');
      const partitionSections = dictContentArea.querySelectorAll('.dict-partition-section');

      partitionTabs.forEach(tab => {
        tab.addEventListener('click', () => {
          const filter = tab.getAttribute('data-filter');
          partitionTabs.forEach(t => t.classList.toggle('active', t === tab));

          partitionSections.forEach(sec => {
            const partType = sec.getAttribute('data-part');
            if (filter === 'all' || filter === partType) {
              sec.style.display = 'block';
            } else {
              sec.style.display = 'none';
            }
          });
          if (window.soundEngine) window.soundEngine.playCopy();
        });
      });

      // 단어 사전 내 액션 버튼 연결
      const dBattleBtn = dictContentArea.querySelector('.dict-battle-btn');
      if (dBattleBtn) {
        dBattleBtn.addEventListener('click', () => {
          applyWordToBattle(heroWord, true);
        });
      }

      const dCopyBtn = dictContentArea.querySelector('.dict-copy-btn');
      if (dCopyBtn) {
        dCopyBtn.addEventListener('click', () => {
          copyToClipboard(heroWord);
        });
      }

      // 연관 단어 칩 클릭 시 즉시 검색
      dictContentArea.querySelectorAll('.partition-word-pill').forEach(pill => {
        pill.addEventListener('click', () => {
          const targetWord = pill.getAttribute('data-word');
          searchDictionary(targetWord);
        });
      });

      if (window.soundEngine) window.soundEngine.playCopy();
    } catch (err) {
      dictContentArea.innerHTML = `
        <div class="dict-error-card">
          <div style="font-size: 2rem; margin-bottom: 8px;">⚠️</div>
          <div style="font-weight: 700; color: var(--diff-hell); margin-bottom: 4px;">사전 조회 중 오류가 발생했습니다.</div>
          <div style="font-size: 0.78rem; color: var(--text-muted);">${escapeHtml(err.message || '네트워크 상태를 확인해주세요.')}</div>
        </div>
      `;
    }
  }

  dictSearchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    searchDictionary(dictSearchInput.value);
  });

  dictClearBtn.addEventListener('click', () => {
    dictSearchInput.value = '';
    dictClearBtn.style.display = 'none';
    dictContentArea.style.display = 'none';
    dictEmptyState.style.display = 'block';
    dictSearchInput.focus();
  });

  dictSearchInput.addEventListener('input', () => {
    dictClearBtn.style.display = dictSearchInput.value ? 'block' : 'none';
  });

  dictChips.forEach(chip => {
    chip.addEventListener('click', () => {
      searchDictionary(chip.getAttribute('data-word'));
    });
  });

  // 초기 상태 설정
  updateTargetSection('', true);
  updateFlowCount();
  updateBriefingPlaceholder();
  wordInput.focus();
});
