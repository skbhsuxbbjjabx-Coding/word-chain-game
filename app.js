// ==========================================================================
// 끝말잇기 AI 프론트엔드 컨트롤러 (정통 룰 & 정방향 두음법칙 & 실시간 사전 연동)
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  // DOM 요소 캐싱
  const soundToggleBtn = document.getElementById('soundToggleBtn');
  const soundIcon = document.getElementById('soundIcon');
  const resetGameBtn = document.getElementById('resetGameBtn');

  // [제시어] DOM
  const turnBadge = document.getElementById('turnBadge');
  const turnStatusText = document.getElementById('turnStatusText');
  const comboBadge = document.getElementById('comboBadge');
  const comboText = document.getElementById('comboText');
  const targetCharDisplay = document.getElementById('targetCharDisplay');
  const dueumBadge = document.getElementById('dueumBadge');
  const lastWordText = document.getElementById('lastWordText');
  const lastWordMeaning = document.getElementById('lastWordMeaning');

  // [턴 로그] DOM
  const turnLog = document.getElementById('turnLog');
  const emptyLogState = document.getElementById('emptyLogState');

  // [입력창] DOM
  const gameForm = document.getElementById('gameForm');
  const inputPrefixBadge = document.getElementById('inputPrefixBadge');
  const prefixChar = document.getElementById('prefixChar');
  const wordInput = document.getElementById('wordInput');
  const submitBtn = document.getElementById('submitBtn');
  const inputFeedback = document.getElementById('inputFeedback');
  const toastContainer = document.getElementById('toastContainer');

  // 게임 상태 변수
  let gameHistory = [];
  let currentTargetChar = '';
  let isGameOver = false;
  let turnCount = 0;
  let comboCount = 0;
  let isSubmitting = false;

  // ==========================================================================
  // 1. 두음법칙 계산기 (국립국어원 한글 맞춤법 제10항·제11항 정방향 규칙만 엄격 적용)
  // ==========================================================================
  function getDueumVariantsClient(char) {
    if (!char || typeof char !== 'string') return [char];
    const code = char.charCodeAt(0) - 0xAC00;
    if (code < 0 || code > 11171) return [char];

    const initial = Math.floor(code / 588);
    const medial = Math.floor((code % 588) / 28);
    const final = code % 28;
    const variants = [char];

    // [한글 맞춤법 제10항] ㄴ 두음법칙
    // '냐, 녀, 녜, 뇨, 뉴, 니' -> '야, 여, 예, 요, 유, 이' 변환만 허용 (초성 ㄴ -> ㅇ)
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

    return [...new Set(variants)];
  }

  // ==========================================================================
  // 2. 알림 및 사운드 헬퍼
  // ==========================================================================
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

  // 사운드 토글
  soundToggleBtn.addEventListener('click', () => {
    if (window.soundEngine) {
      const isMuted = window.soundEngine.toggleMute();
      soundIcon.textContent = isMuted ? '🔇' : '🔊';
      showToast(isMuted ? '사운드가 꺼졌습니다.' : '사운드가 켜졌습니다.');
      if (!isMuted) window.soundEngine.playCopy();
    }
  });

  // ==========================================================================
  // 3. UI 렌더링 헬퍼 ([제시어 / 턴 로그 / 입력창])
  // ==========================================================================

  // 제시어 영역 갱신
  function updateTargetSection(char, isUserTurn, lastWord = null, lastMeaning = null) {
    currentTargetChar = char || '';

    if (!char) {
      targetCharDisplay.textContent = '시작';
      prefixChar.textContent = '시작';
      dueumBadge.textContent = '원하는 단어로 시작하세요 (2자 이상)';
      lastWordText.textContent = '배틀 준비 완료';
      lastWordMeaning.textContent = '사전에 등재된 표준 표제어만 유효합니다.';
      turnBadge.className = 'turn-badge user';
      turnStatusText.textContent = '플레이어 차례';
      return;
    }

    targetCharDisplay.textContent = char;
    prefixChar.textContent = char;

    const variants = getDueumVariantsClient(char);
    if (variants.length > 1) {
      const altChar = variants.find(v => v !== char);
      dueumBadge.textContent = `두음법칙 적용: '${altChar}' 가능 ('${variants.join("', '")}')`;
    } else {
      dueumBadge.textContent = `'${char}'(으)로 시작하는 단어를 입력하세요`;
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

  // 턴 로그 카드 추가
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
    // 첫 턴이면 빈 상태 제거
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
    if (!isUser && strategyBrief) {
      strategyHtml = `<div class="card-strategy-brief">${strategyBrief}</div>`;
    }

    card.innerHTML = `
      <div class="card-header-row">
        <span class="card-speaker">${speakerLabel}</span>
        <span class="card-turn-number">#${turnCount}</span>
      </div>
      <div class="card-word-row">
        <span class="card-word-text">${word}</span>
        <span class="card-pos-badge">[${posBadge}]</span>
        <span class="card-dict-source">${dictBadge}</span>
      </div>
      <div class="card-meaning">${meaning || '공인 국어사전에 등재된 유효 표준 표제어입니다.'}</div>
      ${strategyHtml}
      <div class="card-footer-row">
        <a href="${dictUrl}" target="_blank" rel="noopener noreferrer" class="dict-link-btn" title="네이버 사전에서 뜻 확인">
          사전 보기 ↗
        </a>
      </div>
    `;

    turnLog.appendChild(card);
    // 항상 최신 턴 로그 카드가 보이도록 스크롤 이동
    card.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  // 게임 오버 카드 추가
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

  // ==========================================================================
  // 4. 단어 탐색 및 판정 파이프라인 (명세서 요구사항 4번 완벽 준수)
  // ==========================================================================
  async function submitWord(rawInput) {
    if (isGameOver) {
      showFeedback('게임이 종료되었습니다. 상단의 [새 게임] 버튼을 눌러주세요.', 'info');
      return;
    }

    if (isSubmitting) return;

    const cleanWord = (rawInput || '').trim().replace(/[^\uAC00-\uD7A3]/g, '');

    // 1차 룰 검증:
    // A. 글자 수 검증 (최소 2자 이상)
    if (cleanWord.length < 2) {
      showFeedback('단어는 최소 2글자 이상이어야 합니다.');
      if (window.soundEngine) window.soundEngine.playError();
      wordInput.focus();
      return;
    }

    // B. 끝말 일치 및 정방향 두음법칙 유효성 체크
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

    // C. 중복 사용 여부 체크
    if (gameHistory.some(item => item.word === cleanWord)) {
      showFeedback(`이미 사용된 단어입니다: 「${cleanWord}」`);
      if (window.soundEngine) window.soundEngine.playError();
      wordInput.focus();
      return;
    }

    // 입력 상태 락 및 UI 표시
    clearFeedback();
    isSubmitting = true;
    submitBtn.disabled = true;
    turnBadge.className = 'turn-badge ai';
    turnStatusText.textContent = '사전 탐색 및 검증 중...';

    try {
      // 2차 사전 실시간 탐색: 서버 API 호출 (네이버 어학사전 & 우리말샘 전수 실시간 조회)
      const res = await fetch('/api/game/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userWord: cleanWord,
          history: gameHistory
        })
      });

      const data = await res.json();

      // 결과 처리: 탐색 실패 (미등재 단어 또는 룰 위반)
      if (!data.success) {
        showFeedback(data.message || '공인 국어사전에 등재되지 않은 단어입니다.');
        if (window.soundEngine) window.soundEngine.playError();
        turnBadge.className = 'turn-badge user';
        turnStatusText.textContent = '플레이어 차례';
        wordInput.focus();
        return;
      }

      // 결과 처리: 탐색 성공 (정식 단어 인정 -> 배틀 진행)
      if (window.soundEngine) window.soundEngine.playCombo(comboCount + 1);

      // 1) 플레이어 턴 기록
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

      // 플레이어가 이긴 경우 (AI 반격 불가)
      if (data.gameOver && data.winner === 'user') {
        isGameOver = true;
        updateTargetSection('', true, data.userWord, data.userMeaning);
        appendGameOverCard('user', data.message || '더 이상 이어갈 수 있는 단어가 사전에 없습니다!');
        if (window.soundEngine) window.soundEngine.playVictory();
        wordInput.value = '';
        return;
      }

      // 2) AI 응수 턴 기록
      if (data.aiWord) {
        // 잠시 딜레이를 주어 AI의 사고 과정을 자연스럽게 연출
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

          // 다음 플레이어 턴 준비
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

  // ==========================================================================
  // 5. 새 게임 리셋
  // ==========================================================================
  function resetGame() {
    gameHistory = [];
    currentTargetChar = '';
    isGameOver = false;
    turnCount = 0;
    comboCount = 0;
    isSubmitting = false;

    // 턴 로그 초기화 및 빈 상태 복원
    turnLog.innerHTML = `
      <div class="empty-log-state" id="emptyLogState">
        <div class="empty-icon">🎮</div>
        <h3>끝말잇기 배틀을 시작하세요!</h3>
        <p>
          국립국어원 우리말샘(약 118만 개) 및 네이버 어학사전에 정식 등재된<br>
          유효 표제어만 인정되며, <strong>한글 맞춤법 제10항·제11항 정방향 두음법칙</strong>만 적용됩니다.
        </p>
        <div class="rules-chips">
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
    showToast('새 게임이 시작되었습니다!');
  }

  // ==========================================================================
  // 6. 이벤트 리스너 바인딩
  // ==========================================================================
  gameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitWord(wordInput.value);
  });

  resetGameBtn.addEventListener('click', resetGame);

  wordInput.addEventListener('input', () => {
    if (inputFeedback.style.display !== 'none') {
      clearFeedback();
    }
  });

  // 초기 셋업
  updateTargetSection('', true);
  wordInput.focus();
});
