// ============================================
// Quiz Player - Gameplay UI Controller
// ============================================

const QuizPlayer = (() => {
  let isResuming = false;
  let cachedTypeCounts = null;

  function clearInMemoryState() {
    PlayerState.clearInMemoryState();
  }

  function saveProgress() {
    return PlayerState.saveProgress();
  }

  function getSavedProgress(quizId, targetQtype = null) {
    return PlayerState.getSavedProgress(quizId, targetQtype);
  }

  function clearSavedProgress(quizId, targetQtype = null, clearInMemory = false) {
    return PlayerState.clearSavedProgress(quizId, targetQtype, clearInMemory);
  }

  function playTTS(text, langCode = 'en') {
    PlayerAudio.playTTS(text, langCode);
  }

  // Keyboard shortcut listener
  document.addEventListener('keydown', (e) => {
    const isInput = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');

    if ((e.key === 'Enter' || (!isInput && e.key === ' ')) && !e.repeat && PlayerState.answered) {
      if (Date.now() - PlayerState.lastAnswerTime < 150) return;
      const submitBtn = document.getElementById('submit-btn');
      if (submitBtn && typeof submitBtn.onclick === 'function') {
        e.preventDefault();
        submitBtn.onclick();
        return;
      }
    }

    const isModalActive = document.getElementById('modal-overlay')?.classList.contains('active');
    if (isModalActive) return;

    // Multiple-choice shortcuts (1, 2, 3, 4, ...)
    if (!isInput && !PlayerState.answered && !e.repeat && PlayerState.questionsQueue) {
      const q = PlayerState.questionsQueue[PlayerState.currentIndex];
      const isMcq = q && ((q.question_type && q.question_type.startsWith('mcq')) || (q.question_text && q.question_text.includes('|||')));

      if (isMcq) {
        let keyNum = -1;
        if (/^[1-9]$/.test(e.key)) {
          keyNum = parseInt(e.key, 10);
        } else if (e.code && /^Digit([1-9])$/.test(e.code)) {
          keyNum = parseInt(e.code.replace('Digit', ''), 10);
        } else if (e.code && /^Numpad([1-9])$/.test(e.code)) {
          keyNum = parseInt(e.code.replace('Numpad', ''), 10);
        }

        if (keyNum >= 1) {
          const optionBtns = document.querySelectorAll('#mcq-options-container .mcq-option');
          if (keyNum <= optionBtns.length) {
            const targetBtn = optionBtns[keyNum - 1];
            if (targetBtn && !targetBtn.disabled) {
              e.preventDefault();
              targetBtn.click();
              return;
            }
          }
        }

        const showDontRemember = PlayerState.currentQuiz && PlayerState.currentQuiz.quiz_type === 'vocabulary';
        if ((e.key === '0' || e.key === '?' || e.code === 'Numpad0') && showDontRemember) {
          const dontRememberBtn = document.getElementById('dont-remember-btn');
          if (dontRememberBtn && !dontRememberBtn.disabled && dontRememberBtn.offsetParent !== null) {
            e.preventDefault();
            dontRememberBtn.click();
            return;
          }
        }
      }
    }

    // Flashcard shortcuts (when not typing in an input)
    if (!isInput && PlayerState.currentQuiz && PlayerState.currentQuiz.quiz_type === 'vocabulary') {
      const q = PlayerState.questionsQueue[PlayerState.currentIndex];
      const isMcq = (q && ((q.question_type && q.question_type.startsWith('mcq')) || (q.question_text && q.question_text.includes('|||'))));
      const isFlashcard = !isMcq && (PlayerState.vocabInputMode === 'flashcard');

      if (isFlashcard && !PlayerState.answered) {
        if (!PlayerState.flashcardFlipped) {
          if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown') {
            e.preventDefault();
            flipFlashcard(true);
          }
        } else {
          if (e.key === '1' || e.key === 'ArrowLeft' || e.key === 'x' || e.key === 'X') {
            e.preventDefault();
            submitFlashcardGrade(false);
          } else if (e.key === '2' || e.key === 'ArrowRight' || e.key === 'c' || e.key === 'C') {
            e.preventDefault();
            submitFlashcardGrade(true);
          } else if (e.key === ' ' || e.key === 'ArrowUp') {
            e.preventDefault();
            flipFlashcard(false);
          }
        }
      }
    }
  });

  function renderSelectScreen() {
    const main = document.getElementById('main-content');
    main.innerHTML = `
      <div class="page-header">
        <h1>${I18n.t('play.title')}</h1>
        <p>${I18n.t('play.subtitle')}</p>
      </div>

      <div class="mode-toggle" style="margin-bottom: 24px;">
        <button class="mode-btn ${PlayerState.currentPlayMode === 'question' ? 'active' : ''}" id="play-mode-question-btn" onclick="QuizPlayer.setPlayMode('question')">
          📝 <span data-i18n="dashboard.modeQuestion">${I18n.t('dashboard.modeQuestion')}</span>
        </button>
        <button class="mode-btn ${PlayerState.currentPlayMode === 'vocabulary' ? 'active' : ''}" id="play-mode-vocab-btn" onclick="QuizPlayer.setPlayMode('vocabulary')">
          🔤 <span data-i18n="dashboard.modeVocab">${I18n.t('dashboard.modeVocab')}</span>
        </button>
      </div>

      <div id="play-quiz-list" class="loading-overlay"><div class="spinner"></div></div>
    `;
    loadQuizList();
  }

  function setPlayMode(mode) {
    PlayerState.currentPlayMode = mode;
    localStorage.setItem('quizmaster-play-mode', mode);
    localStorage.setItem('quizmaster-dashboard-mode', mode);

    const qBtn = document.getElementById('play-mode-question-btn');
    const vBtn = document.getElementById('play-mode-vocab-btn');
    if (qBtn) qBtn.className = `mode-btn ${mode === 'question' ? 'active' : ''}`;
    if (vBtn) vBtn.className = `mode-btn ${mode === 'vocabulary' ? 'active' : ''}`;

    renderFilteredPlayQuizList();
  }

  async function loadQuizList(forceFetch = false) {
    try {
      const container = document.getElementById('play-quiz-list');
      if (!PlayerState.cachedPlayQuizzes || forceFetch) {
        const res = await fetch('/api/quizzes');
        PlayerState.cachedPlayQuizzes = await res.json();
      }
      if (container) container.classList.remove('loading-overlay');
      renderFilteredPlayQuizList();
    } catch (err) {
      Components.showToast(I18n.t('common.error'), 'error');
    }
  }

  function renderFilteredPlayQuizList() {
    const container = document.getElementById('play-quiz-list');
    if (!container || !PlayerState.cachedPlayQuizzes) return;

    const filtered = PlayerState.cachedPlayQuizzes.filter(q => (q.quiz_type || 'question') === PlayerState.currentPlayMode);

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">🎮</span>
          <h3>${I18n.t('dashboard.empty')}</h3>
          <p>${I18n.t('dashboard.emptyHint')}</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(q => {
      const isPinned = q.is_pinned === 1 || q.code === 'WRONG0';
      const saved = getSavedProgress(q.id);
      const savedQueue = saved ? (saved.queue || saved.questionsQueue || []) : [];
      const hasSaved = saved && savedQueue.length > 0 && (saved.currentIndex || 0) < savedQueue.length;
      const savedBadge = hasSaved
        ? `<span class="resume-badge" style="display: inline-block; margin-top: 4px; background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600;">💾 ${I18n.t('resume.badge', { current: Math.min((saved.currentIndex || 0) + 1, savedQueue.length), total: savedQueue.length })}</span>`
        : '';

      const pinnedStyle = isPinned ? 'border: 1px solid rgba(239, 68, 68, 0.4); background: rgba(239, 68, 68, 0.05);' : '';
      const pinnedBadge = isPinned ? `<span style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 700; margin-left: 6px;">📌 ${I18n.t('quiz.pinned')}</span>` : '';

      return `
        <div class="card play-quiz-card ${isPinned ? 'pinned-card' : ''}" style="${pinnedStyle}"
             onclick="QuizPlayer.startQuiz(${q.id})">
          <div class="play-quiz-card-info">
            <h3 class="play-quiz-card-title">
              ${Components.escapeHtml(q.title)} ${pinnedBadge}
            </h3>
            <div class="play-quiz-card-meta">
              <span class="text-muted" style="font-size: 13px;">
                ${q.question_count || 0} ${I18n.t('table.questions').toLowerCase()} · 
                <span class="code-badge" style="font-size: 12px;">${q.code}</span>
              </span>
              ${savedBadge ? `<div style="margin-top: 4px;">${savedBadge}</div>` : ''}
            </div>
          </div>
          <div class="play-quiz-card-actions" style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; align-items: center;">
            <button class="btn btn-ghost edit-quiz-btn" onclick="event.stopPropagation(); App.editQuiz(${q.id}, '${q.quiz_type || 'question'}')" title="${I18n.t('common.edit')}">
              ✏️ ${I18n.t('common.edit')}
            </button>
            <a href="/api/export/${q.id}" class="btn btn-ghost export-quiz-btn" onclick="event.stopPropagation();" download title="Xuất file Excel" style="text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
              📤 ${I18n.t('export.downloadExcel') || 'Xuất Excel'}
            </a>
            <button class="btn btn-primary start-quiz-btn" onclick="event.stopPropagation(); QuizPlayer.startQuiz(${q.id})">
              ${hasSaved ? '▶ ' + I18n.t('resume.continue') : '▶ ' + I18n.t('play.start')}
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  function buildFullVocabQuestions(quiz, settingsObj, mode = null) {
    if (!quiz || !quiz.questions) return [];
    let raw = [...quiz.questions];
    if (settingsObj && settingsObj.swapQA) {
      raw = raw.map(q => {
        let swappedType = q.question_type;
        if (q.question_type === 'fill_word_ipa') swappedType = 'fill_ipa_word';
        else if (q.question_type === 'fill_meaning_ipa') swappedType = 'fill_ipa_meaning';
        else if (q.question_type === 'fill_ipa_word') swappedType = 'fill_word_ipa';
        else if (q.question_type === 'fill_ipa_meaning') swappedType = 'fill_meaning_ipa';
        return {
          ...q,
          question_text: q.correct_answer.split('/').join(' / '),
          correct_answer: q.question_text,
          question_type: swappedType
        };
      });
    }

    const inputMode = mode || PlayerState.vocabInputMode || localStorage.getItem('quizmaster-vocab-input-mode') || 'input';
    const isFlashcard = (inputMode === 'flashcard');

    if (isFlashcard) {
      // In flashcard mode: each prompt for a question type appears exactly once,
      // and ALL alternative answers for that question type are merged!
      const groupedMap = new Map();
      raw.forEach(q => {
        const isMcq = (q.question_type && q.question_type.startsWith('mcq')) || (q.question_text && q.question_text.includes('|||'));
        const cleanPrompt = (q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0].trim().toLowerCase();
        const key = `${q.question_type || 'fill'}:${cleanPrompt}`;

        if (!groupedMap.has(key)) {
          groupedMap.set(key, { ...q });
        } else {
          const existing = groupedMap.get(key);
          if (!isMcq && q.correct_answer && existing.correct_answer) {
            const currentAns = existing.correct_answer.split('/').map(s => s.trim()).filter(Boolean);
            const newAns = q.correct_answer.split('/').map(s => s.trim()).filter(Boolean);
            existing.correct_answer = Array.from(new Set([...currentAns, ...newAns])).join(' / ');
          }
          if (q.ipa && existing.ipa) {
            const currentIpas = existing.ipa.split('/').map(s => s.trim()).filter(Boolean);
            const newIpas = q.ipa.split('/').map(s => s.trim()).filter(Boolean);
            existing.ipa = Array.from(new Set([...currentIpas, ...newIpas])).join(' / ');
          } else if (q.ipa && !existing.ipa) {
            existing.ipa = q.ipa;
          }
        }
      });
      return Array.from(groupedMap.values());
    }

    const fullList = [];
    const dedupeTypes = new Set(['mcq_word_ipa', 'mcq_meaning_ipa', 'mcq_ipa_word', 'fill_ipa_word', 'fill_word_ipa', 'fill_meaning_ipa', 'mcq_listen_word', 'fill_listen_word']);
    const seenDedupeKeys = new Set();

    raw.forEach(q => {
      if (dedupeTypes.has(q.question_type)) {
        const cleanPrompt = (q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0].trim().toLowerCase();
        const key = `${q.question_type}:${cleanPrompt}`;
        if (seenDedupeKeys.has(key)) return;
        seenDedupeKeys.add(key);
      }

      const isMcq = (q.question_type && q.question_type.startsWith('mcq')) || (q.question_text && q.question_text.includes('|||'));
      if (isMcq) {
        fullList.push({ ...q });
      } else {
        const ansCount = q.correct_answer.split('/').filter(a => a.trim()).length || 1;
        for (let i = 0; i < ansCount; i++) {
          fullList.push({ ...q });
        }
      }
    });
    return fullList;
  }

  async function resumeQuiz(quizId, targetQtype = null, rawSessionData = null) {
    if (isResuming) return;
    isResuming = true;
    try {
      Components.closeModal();

      let saved = rawSessionData;
      if (typeof saved === 'string') {
        try { saved = JSON.parse(saved); } catch (e) {}
      }

      if (!saved) {
        saved = getSavedProgress(quizId, targetQtype) || getSavedProgress(quizId);
      }

      if (!saved) {
        isResuming = false;
        startQuiz(quizId, false);
        return;
      }

      const effectiveQtype = targetQtype || saved.selectedQuestionType || 'all';

      try {
        const uid = window.Utils ? Utils.getCurrentUserId() : 1;
        if (effectiveQtype === 'all') {
          localStorage.setItem(`quizmaster-progress-u${uid}-${quizId}`, JSON.stringify(saved));
        }
        if (effectiveQtype) {
          localStorage.setItem(`quizmaster-progress-u${uid}-${quizId}_${effectiveQtype}`, JSON.stringify(saved));
        }
      } catch (e) {}

      const res = await fetch(`/api/quizzes/${quizId}`);
      if (!res.ok) throw new Error('Quiz not found');
      PlayerState.currentQuiz = await res.json();
      PlayerState.resetQuizProgressState(quizId);

      PlayerState.settings = {
        shuffleQuestions: localStorage.getItem('quizmaster-shuffle') === 'true',
        swapQA: localStorage.getItem('quizmaster-swap') === 'true',
        allowDuplicates: localStorage.getItem('quizmaster-allow-duplicates') === 'true',
        maxRetries: parseInt(localStorage.getItem('quizmaster-max-retries') || '-1', 10),
      };

      PlayerState.selectedQuestionType = effectiveQtype;
      PlayerState.results = (saved.results || []).map(r => ({
        ...r,
        question: r.question || {
          id: r.questionId || r.question?.id,
          question_text: r.questionText || r.question?.question_text,
          question_type: r.questionType || r.question?.question_type,
          correct_answer: r.userAnswer || ''
        }
      }));
      PlayerState.questionStates = Array.isArray(saved.questionStates) ? saved.questionStates : (saved.results || []).map(r => ({ key: String(r.questionId || r.question?.id) + '|' + (r.questionType || r.question?.question_type) + '|' + r.queueIndex, questionId: r.questionId || r.question?.id, questionType: r.questionType || r.question?.question_type, queueIndex: r.queueIndex, status: r.isCorrect ? 'correct' : 'incorrect' }));
      PlayerState.usedAnswers = saved.usedAnswers || {};

      if (PlayerState.currentQuiz.quiz_type === 'vocabulary') {
        PlayerState.allVocabQuestions = buildFullVocabQuestions(PlayerState.currentQuiz, PlayerState.settings);
        cachedTypeCounts = null;

        let targetPool = [...PlayerState.allVocabQuestions];
        if (effectiveQtype && effectiveQtype !== 'all') {
          targetPool = targetPool.filter(q => q.question_type === effectiveQtype);
        }
        if (targetPool.length === 0) {
          targetPool = [...PlayerState.allVocabQuestions];
        }

        const savedQueue = saved.queue || saved.questions || saved.questionsQueue || [];
        if (savedQueue.length > 0) {
          const poolMapById = new Map(targetPool.map(q => [String(q.id), q]));
          const poolMapByType = new Map();
          targetPool.forEach(q => {
            if (!poolMapByType.has(q.question_type)) poolMapByType.set(q.question_type, []);
            poolMapByType.get(q.question_type).push(q);
          });

          const restored = [];
          const usedIndices = new Set();

          savedQueue.forEach((item, idx) => {
            let matched = poolMapById.get(String(item.id));
            if (!matched && item.question_type) {
              const typeList = poolMapByType.get(item.question_type) || [];
              matched = typeList.find((_, i) => !usedIndices.has(item.question_type + '_' + i));
              if (matched) {
                const matchedIdx = typeList.indexOf(matched);
                usedIndices.add(item.question_type + '_' + matchedIdx);
              }
            }
            if (!matched && idx < targetPool.length) {
              matched = targetPool[idx];
            }

            if (matched) {
              restored.push({
                ...matched,
                _failedTries: item._failedTries || 0
              });
            } else if (item.question_text) {
              restored.push({ ...item });
            }
          });

          PlayerState.questionsQueue = restored.length > 0 ? restored : targetPool;
        } else {
          PlayerState.questionsQueue = targetPool;
        }
      } else {
        PlayerState.allVocabQuestions = [];
        cachedTypeCounts = null;
        let rawQuestions = [...PlayerState.currentQuiz.questions];
        if (PlayerState.settings.swapQA) {
          rawQuestions = rawQuestions.map(q => {
            let swappedType = q.question_type;
            if (q.question_type === 'fill_word_ipa') swappedType = 'fill_ipa_word';
            else if (q.question_type === 'fill_meaning_ipa') swappedType = 'fill_ipa_meaning';
            return {
              ...q,
              question_text: q.correct_answer.split('/').join(' / '),
              correct_answer: q.question_text,
              question_type: swappedType
            };
          });
        }

        const questionMap = new Map(rawQuestions.map(q => [String(q.id), q]));
        const savedQueue = saved.queue || saved.questions || saved.questionsQueue || [];

        if (savedQueue.length > 0) {
          PlayerState.questionsQueue = savedQueue.map(item => {
            const fullQ = questionMap.get(String(item.id)) || item;
            return {
              ...fullQ,
              _failedTries: item._failedTries || 0
            };
          }).filter(q => q && q.question_text);
        } else {
          PlayerState.questionsQueue = rawQuestions;
        }
      }

      if (!PlayerState.questionsQueue || PlayerState.questionsQueue.length === 0) {
        throw new Error('Không có câu hỏi nào để khôi phục');
      }

      const rawIndex = saved.currentIndex !== undefined ? saved.currentIndex : (saved.currentQuestionIndex || 0);
      
      if (rawIndex >= PlayerState.questionsQueue.length) {
        if (PlayerState.results.length >= PlayerState.questionsQueue.length) {
          PlayerState.currentIndex = PlayerState.questionsQueue.length;
        } else {
          PlayerState.currentIndex = Math.max(0, PlayerState.questionsQueue.length - 1);
        }
      } else {
        PlayerState.currentIndex = Math.max(0, rawIndex);
      }

      PlayerState.attachWordMetadataToQuestions(PlayerState.questionsQueue);
      if (PlayerState.allVocabQuestions && PlayerState.allVocabQuestions.length > 0) {
        PlayerState.attachWordMetadataToQuestions(PlayerState.allVocabQuestions);
      }

      if (window.location.hash !== `#play/${quizId}`) {
        if (history.replaceState) {
          history.replaceState(null, '', `#play/${quizId}`);
        } else {
          window.location.hash = `play/${quizId}`;
        }
      }

      Components.showToast('✅ ' + I18n.t('resume.savedNotice'), 'success');
      renderQuestion();
    } catch (err) {
      console.error('Error in resumeQuiz:', err);
      Components.showToast(I18n.t('common.error') + ': ' + err.message, 'error');
    } finally {
      isResuming = false;
    }
  }

  async function startQuiz(quizId, forceNew = false, autoResume = false) {
    if (isResuming) return;
    try {
      let saved = getSavedProgress(quizId);
      if (!saved && !forceNew) {
        try {
          const sRes = await fetch('/api/sessions');
          if (sRes.ok) {
            const userSessions = await sRes.json();
            const quizGroup = userSessions.find(g => Number(g.quiz_id) === Number(quizId));
            if (quizGroup && quizGroup.sessions && quizGroup.sessions.length > 0) {
              const latestS = quizGroup.sessions[0];
              if (latestS && latestS.session_data) {
                saved = latestS.session_data;
              }
            }
          }
        } catch (e) {}
      }

      const savedQueue = saved ? (saved.queue || saved.questionsQueue || []) : [];
      if (saved && !forceNew && savedQueue.length > 0 && (saved.currentIndex || 0) < savedQueue.length) {
        resumeQuiz(quizId, saved.selectedQuestionType || 'all', saved);
        return;
      }

      Components.closeModal();

      if (forceNew) {
        clearSavedProgress(quizId);
      }
      PlayerState.resetQuizProgressState(quizId);

      const res = await fetch(`/api/quizzes/${quizId}`);
      if (!res.ok) throw new Error('Quiz not found');
      PlayerState.currentQuiz = await res.json();

      if (!PlayerState.currentQuiz.questions || PlayerState.currentQuiz.questions.length === 0) {
        Components.showToast('This quiz has no questions.', 'warning');
        return;
      }

      PlayerState.settings = {
        shuffleQuestions: localStorage.getItem('quizmaster-shuffle') === 'true',
        swapQA: localStorage.getItem('quizmaster-swap') === 'true',
        allowDuplicates: localStorage.getItem('quizmaster-allow-duplicates') === 'true',
        maxRetries: parseInt(localStorage.getItem('quizmaster-max-retries') || '-1', 10),
      };

      let rawQueue = [...PlayerState.currentQuiz.questions];

      if (PlayerState.settings.swapQA) {
        rawQueue = rawQueue.map(q => {
          let swappedType = q.question_type;
          if (q.question_type === 'fill_word_ipa') swappedType = 'fill_ipa_word';
          else if (q.question_type === 'fill_meaning_ipa') swappedType = 'fill_ipa_meaning';
          return {
            ...q,
            question_text: q.correct_answer.split('/').join(' / '),
            correct_answer: q.question_text,
            question_type: swappedType
          };
        });
      }

      let newQueue = [];
      rawQueue.forEach(q => {
        const isMcq = (q.question_type && q.question_type.startsWith('mcq')) || (q.question_text && q.question_text.includes('|||'));
        if (isMcq) {
          newQueue.push({ ...q });
        } else {
          const ansCount = q.correct_answer.split('/').filter(a => a.trim()).length || 1;
          for (let i = 0; i < ansCount; i++) {
            newQueue.push({ ...q });
          }
        }
      });

      if (PlayerState.settings.shuffleQuestions) {
        newQueue = PlayerState.shuffleArray(newQueue);
      }

      if (PlayerState.currentQuiz.quiz_type === 'vocabulary') {
        PlayerState.allVocabQuestions = buildFullVocabQuestions(PlayerState.currentQuiz, PlayerState.settings);
        cachedTypeCounts = null;
        newQueue = [...PlayerState.allVocabQuestions];
        if (PlayerState.settings.shuffleQuestions) {
          newQueue = PlayerState.shuffleArray(newQueue);
        }
        if (PlayerState.selectedQuestionType !== 'all') {
          newQueue = newQueue.filter(q => q.question_type === PlayerState.selectedQuestionType);
        }
        PlayerState.attachWordMetadataToQuestions(PlayerState.allVocabQuestions);
      } else {
        PlayerState.allVocabQuestions = [];
        cachedTypeCounts = null;
        PlayerState.selectedQuestionType = 'all';
      }

      PlayerState.questionsQueue = newQueue;
      PlayerState.attachWordMetadataToQuestions(PlayerState.questionsQueue);

      PlayerState.currentIndex = 0;
      PlayerState.results = [];
      PlayerState.questionStates = [];
      PlayerState.usedAnswers = {};
      renderQuestion();
    } catch (err) {
      Components.showToast(I18n.t('common.error'), 'error');
      console.error(err);
    }
  }

  function renderQuestion() {
    if (window.PlayerAudio) PlayerAudio.stopVoiceRecognition();
    const queue = PlayerState.questionsQueue;
    const idx = PlayerState.currentIndex;
    if (idx >= queue.length) {
      renderResults();
      return;
    }

    const q = queue[idx];
    PlayerState.currentRetries = q._failedTries || 0;
    PlayerState.answered = false;

    saveProgress();
    const total = queue.length;
    const progress = ((idx) / total) * 100;

    const main = document.getElementById('main-content');

    let displayQuestionText = q.question_text;
    let options = [];
    const isMcq = (q.question_type && q.question_type.startsWith('mcq')) || (q.question_text && q.question_text.includes('|||'));
    const isListen = q.question_type && (q.question_type.startsWith('fill_listen_') || q.question_type.startsWith('mcq_listen_'));
    const answerKey = PlayerState.getUsedAnswersKey(q);
    const answeredChips = !isMcq ? (PlayerState.usedAnswers[answerKey] || []) : [];

    if (displayQuestionText.includes('|||')) {
      const parts = displayQuestionText.split('|||');
      displayQuestionText = parts[0];
      try { options = JSON.parse(parts[1]); } catch(e) {}
    }

    if (displayQuestionText.startsWith('🎧 ')) {
      displayQuestionText = displayQuestionText.substring(2).trim();
    }

    let langToSpeak = 'en';
    if (PlayerState.currentQuiz && PlayerState.currentQuiz.quiz_type === 'vocabulary') {
      const isMeaningPrompt = q.question_type === 'fill_meaning_word' || q.question_type === 'mcq_meaning_word' || q.question_type === 'mcq_meaning_ipa';
      langToSpeak = isMeaningPrompt ? PlayerState.currentQuiz.meaning_lang : PlayerState.currentQuiz.vocab_lang;
    }

    let mediaHTML = '';
    if (q.image_path || q.audio_path) {
      mediaHTML = '<div class="question-media">';
      if (q.image_path) {
        mediaHTML += `<img src="${q.image_path}" alt="Question image" loading="lazy">`;
      }
      if (q.audio_path) {
        mediaHTML += `<audio controls src="${q.audio_path}" onplay="App.applyAudioVolume(this)"></audio>`;
      }
      mediaHTML += '</div>';
    }

    let questionTextHTML = '';
    const isMeaningOrIpaPrompt = q.question_type === 'fill_meaning_word' || 
                                q.question_type === 'mcq_meaning_word' || 
                                q.question_type === 'mcq_meaning_ipa' || 
                                q.question_type === 'fill_meaning_ipa' || 
                                q.question_type === 'fill_ipa_word' || 
                                q.question_type === 'fill_ipa_meaning';

    if (isListen) {
      questionTextHTML = `
        <div style="text-align: center; margin-bottom: 24px;">
          <button class="btn btn-primary btn-lg" onclick="QuizPlayer.playTTS('${Components.escapeHtml(displayQuestionText).replace(/'/g, "\\'")}', '${langToSpeak}')">
            🔊 ${I18n.t('mcq.listenAgain')}
          </button>
        </div>
      `;
      setTimeout(() => playTTS(displayQuestionText, langToSpeak), 300);
    } else {
      let ttsBtn = '';
      if (PlayerState.currentQuiz && PlayerState.currentQuiz.quiz_type === 'vocabulary' && !isMeaningOrIpaPrompt) {
        ttsBtn = `<button class="tts-btn" onclick="QuizPlayer.playTTS('${Components.escapeHtml(displayQuestionText).replace(/'/g, "\\'")}', '${langToSpeak}')">🔊</button>`;
      }
      questionTextHTML = `<div class="question-text">${Components.escapeHtml(displayQuestionText)} ${ttsBtn}</div>`;
    }

    let answerInputHTML = '';
    const showDontRemember = PlayerState.currentQuiz && PlayerState.currentQuiz.quiz_type === 'vocabulary';
    const dontRememberBtnHTML = showDontRemember ? `
      <button class="dont-remember-btn" id="dont-remember-btn" onclick="QuizPlayer.handleDontRemember()">
        ❓ ${I18n.t('play.dontRemember')}
      </button>
    ` : '';

    const isVocab = PlayerState.currentQuiz && PlayerState.currentQuiz.quiz_type === 'vocabulary';
    const vocabInputMode = (PlayerState.vocabInputMode || localStorage.getItem('quizmaster-vocab-input-mode') || 'input');
    PlayerState.flashcardFlipped = false;

    let modeSwitchHTML = '';
    if (isVocab && !isMcq) {
      modeSwitchHTML = `
        <div class="vocab-input-mode-switch-wrapper">
          <div class="vocab-input-mode-switch">
            <button type="button" class="vocab-mode-pill ${vocabInputMode === 'input' ? 'active' : ''}" onclick="QuizPlayer.setVocabInputMode('input')">
              ✍️ ${I18n.t('play.modeManual')}
            </button>
            <button type="button" class="vocab-mode-pill ${vocabInputMode === 'flashcard' ? 'active' : ''}" onclick="QuizPlayer.setVocabInputMode('flashcard')">
              🎴 ${I18n.t('play.modeFlashcard')}
            </button>
          </div>
        </div>
      `;
    }

    let cardBodyHTML = '';

    if (isMcq) {
      answerInputHTML = `
        <div class="mcq-options" id="mcq-options-container">
          ${options.map((opt, idx) => `
            <button class="mcq-option" data-answer="${Components.escapeHtml(opt)}" data-option-index="${idx}" onclick="QuizPlayer.submitMcqAnswer(this, '${Components.escapeHtml(opt).replace(/'/g, "\\'")}')">
              <span class="mcq-key-badge">${idx + 1}</span>
              <span class="mcq-option-text">${Components.escapeHtml(opt)}</span>
            </button>
          `).join('')}
        </div>
        ${showDontRemember ? `
          <div style="display: flex; justify-content: flex-end; margin-top: 12px;">
            ${dontRememberBtnHTML}
          </div>
        ` : ''}
      `;
      cardBodyHTML = `
        ${questionTextHTML}
        ${mediaHTML}
        ${answerInputHTML}
      `;
    } else if (isVocab && vocabInputMode === 'flashcard') {
      const safeCorrectAnswer = String(q.correct_answer || '');
      const displayAnswer = safeCorrectAnswer.includes('/')
        ? Array.from(new Set(safeCorrectAnswer.split('/').map(s => s.trim()).filter(Boolean))).join(' / ')
        : safeCorrectAnswer;

      cardBodyHTML = `
        ${modeSwitchHTML}
        <div class="flashcard-container">
          <div class="flashcard-card ${PlayerState.flashcardFlipped ? 'flipped' : ''}" id="flashcard-card" onclick="QuizPlayer.onFlashcardCardClick(event)">
            <!-- FRONT -->
            <div class="flashcard-face flashcard-front">
              <div class="flashcard-prompt-area">
                ${isListen ? `
                  <div style="text-align: center; margin: 16px 0;">
                    <button type="button" class="btn btn-primary btn-lg" onclick="event.stopPropagation(); QuizPlayer.playTTS('${Components.escapeHtml(displayQuestionText).replace(/'/g, "\\'")}', '${langToSpeak}')">
                      🔊 ${I18n.t('mcq.listenAgain')}
                    </button>
                  </div>
                ` : `
                  <div class="flashcard-prompt-text">
                    ${Components.escapeHtml(displayQuestionText)}
                    ${(!isMeaningOrIpaPrompt) ? `
                      <button type="button" class="tts-btn" onclick="event.stopPropagation(); QuizPlayer.playTTS('${Components.escapeHtml(displayQuestionText).replace(/'/g, "\\'")}', '${langToSpeak}')">🔊</button>
                    ` : ''}
                  </div>
                `}
                ${mediaHTML}
              </div>
              <div class="flashcard-flip-prompt">
                <span class="flashcard-flip-hint">💡 ${I18n.t('play.flipCardHint')}</span>
              </div>
            </div>

            <!-- BACK -->
            <div class="flashcard-face flashcard-back">
              <div class="flashcard-answer-area">
                <div class="flashcard-answer-main">${Components.escapeHtml(displayAnswer)}</div>
                
                <div class="flashcard-details-box">
                  ${q._word ? `
                    <div class="flashcard-detail-item">
                      <span class="detail-label">Từ vựng:</span>
                      <span class="detail-val bold">${Components.escapeHtml(q._word)}</span>
                      <button type="button" class="tts-btn" onclick="event.stopPropagation(); QuizPlayer.playTTS('${Components.escapeHtml(q._word).replace(/'/g, "\\'")}', '${PlayerState.currentQuiz.vocab_lang}')">🔊</button>
                    </div>
                  ` : ''}
                  ${(q._ipa || q.ipa) ? `
                    <div class="flashcard-detail-item">
                      <span class="detail-label">Phiên âm:</span>
                      <span class="detail-val ipa-font">${Components.escapeHtml(q._ipa || q.ipa)}</span>
                    </div>
                  ` : ''}
                  ${q._meaning ? `
                    <div class="flashcard-detail-item">
                      <span class="detail-label">Nghĩa:</span>
                      <span class="detail-val">${Components.escapeHtml(q._meaning)}</span>
                    </div>
                  ` : ''}
                </div>
              </div>

              <div class="flashcard-grade-area" onclick="event.stopPropagation();">
                <div class="flashcard-grade-buttons">
                  <button type="button" class="btn btn-flashcard-wrong" id="flashcard-btn-wrong" onclick="QuizPlayer.submitFlashcardGrade(false)">
                    <span class="btn-icon">❌</span>
                    <span class="btn-text">${I18n.t('play.flashcardWrong')}</span>
                    <span class="btn-key">${I18n.t('play.flashcardKeyWrong') || '[Nhấn 1]'}</span>
                  </button>
                  <button type="button" class="btn btn-flashcard-correct" id="flashcard-btn-correct" onclick="QuizPlayer.submitFlashcardGrade(true)">
                    <span class="btn-icon">✅</span>
                    <span class="btn-text">${I18n.t('play.flashcardCorrect')}</span>
                    <span class="btn-key">${I18n.t('play.flashcardKeyCorrect') || '[Nhấn 2]'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <button class="answer-submit-btn" id="submit-btn" style="display: none; margin-top: 16px; width: 100%;"></button>
      `;
    } else {
      const placeholderText = (q.question_type && q.question_type.startsWith('fill_'))
        ? (I18n.t('qtype.' + q.question_type + '_desc') || I18n.t('play.answerPlaceholder'))
        : I18n.t('play.answerPlaceholder');

      const voiceTitle = I18n.t('play.voiceInput') || 'Nhập bằng giọng nói';

      answerInputHTML = `
        <div class="answer-input-group">
          <div class="answer-input-wrapper">
            <button type="button" class="voice-input-btn" id="voice-input-btn" 
                    onclick="QuizPlayer.toggleVoiceInput(event)" 
                    onpointerdown="event.stopPropagation();"
                    ontouchstart="event.stopPropagation();"
                    title="${voiceTitle}" 
                    aria-label="${voiceTitle}">
              <svg class="voice-mic-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            </button>
            <input type="text" class="answer-input with-voice" id="answer-input" 
                   placeholder="${placeholderText}"
                   autocomplete="off" spellcheck="false"
                   onkeydown="if(event.key==='Enter' && !event.repeat){ event.preventDefault(); event.stopPropagation(); QuizPlayer.submitAnswer(); }">
          </div>
          <button class="answer-submit-btn" id="submit-btn" onclick="QuizPlayer.submitAnswer()">${I18n.t('play.submit')}</button>
          ${dontRememberBtnHTML}
        </div>
      `;
      cardBodyHTML = `
        ${modeSwitchHTML}
        ${questionTextHTML}
        ${mediaHTML}
        ${answerInputHTML}
      `;
    }

    let questionTypeSelectorHTML = '';
    if (PlayerState.currentQuiz && PlayerState.currentQuiz.quiz_type === 'vocabulary') {
      questionTypeSelectorHTML = buildQuestionTypeSelector();
    }

    if (PlayerState.currentQuiz && PlayerState.currentQuiz.quiz_type === 'vocabulary') {
      const gridSidebarHTML = buildVocabGridHTML();
      main.innerHTML = `
        <div class="vocab-player-layout">
          <div class="vocab-player-main">
            <div class="quiz-progress">
              <div class="progress-bar-container">
                <div class="progress-bar" style="width: ${progress}%"></div>
              </div>
              <div class="progress-info">
                <span>${I18n.t('play.questionOf', { current: idx + 1, total })}</span>
                <span class="retry-count" id="retry-display">
                  🔄 ${I18n.t('play.retries')}: <span id="retry-count">${PlayerState.currentRetries}</span>
                </span>
              </div>
            </div>

            <div class="question-card" id="question-card">
              <div class="question-card-top-row">
                <div class="question-number">
                  ${q.question_type && !isMcq ? `
                    <span class="vocab-qtype-badge">🎯 ${I18n.t('qtype.' + q.question_type + '_desc')}</span>
                  ` : `<span>${I18n.t('play.questionOf', { current: idx + 1, total })}</span>`}
                </div>
                <div class="question-card-header-chips">
                  ${(q._failedTries && q._failedTries > 0) ? `
                    <span class="retry-attempt-badge">
                      🔄 ${I18n.t('play.retryAttempt', { count: q._failedTries })}
                    </span>
                  ` : ''}
                  ${answeredChips.map(ans => 
                    `<span class="answered-chip">✓ ${Components.escapeHtml(ans)}</span>`
                  ).join('')}
                </div>
              </div>
              ${cardBodyHTML}
              <div class="answer-feedback" id="answer-feedback"></div>
              
              <div class="auto-advance-bar-container" id="auto-advance-container">
                <div class="auto-advance-bar" id="auto-advance-bar"></div>
              </div>
            </div>

            ${questionTypeSelectorHTML}
          </div>
          ${gridSidebarHTML}
        </div>
      `;
    } else {
      main.innerHTML = `
        <div class="quiz-player">
          <div class="quiz-progress">
            <div class="progress-bar-container">
              <div class="progress-bar" style="width: ${progress}%"></div>
            </div>
            <div class="progress-info">
              <span>${I18n.t('play.questionOf', { current: idx + 1, total })}</span>
              <span class="retry-count" id="retry-display">
                🔄 ${I18n.t('play.retries')}: <span id="retry-count">${PlayerState.currentRetries}</span>
              </span>
            </div>
          </div>

          <div class="question-card" id="question-card">
            <div class="question-card-top-row">
              <div class="question-number">
                <span>${I18n.t('play.questionOf', { current: idx + 1, total })}</span>
                ${(q.question_type && q.question_type !== 'fill' && !isMcq) ? `
                  <span class="vocab-qtype-badge" style="margin-left: 8px;">🎯 ${I18n.t('qtype.' + q.question_type + '_desc') || q.question_type}</span>
                ` : ''}
              </div>
              <div class="question-card-header-chips">
                ${(q._failedTries && q._failedTries > 0) ? `
                  <span class="retry-attempt-badge">
                    🔄 ${I18n.t('play.retryAttempt', { count: q._failedTries })}
                  </span>
                ` : ''}
                ${answeredChips.map(ans => 
                  `<span class="answered-chip">✓ ${Components.escapeHtml(ans)}</span>`
                ).join('')}
              </div>
            </div>
            ${questionTextHTML}
            ${mediaHTML}
            ${answerInputHTML}
            <div class="answer-feedback" id="answer-feedback"></div>
            
            <div class="auto-advance-bar-container" id="auto-advance-container">
              <div class="auto-advance-bar" id="auto-advance-bar"></div>
            </div>
          </div>
        </div>
      `;
    }

    if (!isMcq && vocabInputMode !== 'flashcard') {
      setTimeout(() => {
        document.getElementById('answer-input')?.focus();
      }, 100);
    }

    if (PlayerState.currentQuiz && PlayerState.currentQuiz.quiz_type === 'vocabulary') {
      const currentBox = document.querySelector('.vocab-grid-box.current');
      const gridContainer = document.querySelector('.vocab-grid-container');
      if (currentBox && gridContainer) {
        const boxTop = currentBox.offsetTop;
        const boxBottom = boxTop + currentBox.offsetHeight;
        const containerTop = gridContainer.scrollTop;
        const containerBottom = containerTop + gridContainer.clientHeight;

        if (boxTop < containerTop) {
          gridContainer.scrollTop = Math.max(0, boxTop - 12);
        } else if (boxBottom > containerBottom) {
          gridContainer.scrollTop = boxBottom - gridContainer.clientHeight + 12;
        }
      }
    }
  }

  function getTypeCounts() {
    if (cachedTypeCounts) return cachedTypeCounts;
    const counts = {};
    const pool = PlayerState.allVocabQuestions;
    for (let i = 0; i < pool.length; i++) {
      const t = pool[i].question_type || 'unknown';
      counts[t] = (counts[t] || 0) + 1;
    }
    cachedTypeCounts = counts;
    return counts;
  }

  function buildQuestionTypeSelector() {
    const typeCounts = getTypeCounts();

    const typeDefinitions = [
      { key: 'mcq_word_meaning', icon: '⚡', colorClass: 'qtype-mcq' },
      { key: 'mcq_meaning_word', icon: '⚡', colorClass: 'qtype-mcq' },
      { key: 'mcq_word_ipa', icon: '⚡', colorClass: 'qtype-mcq' },
      { key: 'mcq_meaning_ipa', icon: '⚡', colorClass: 'qtype-mcq' },
      { key: 'mcq_ipa_word', icon: '⚡', colorClass: 'qtype-mcq' },
      { key: 'mcq_ipa_meaning', icon: '⚡', colorClass: 'qtype-mcq' },
      { key: 'mcq_listen_word', icon: '⚡', colorClass: 'qtype-mcq' },
      { key: 'mcq_listen_meaning', icon: '⚡', colorClass: 'qtype-mcq' },
      { key: 'fill_word_meaning', icon: '✏️', colorClass: 'qtype-fill' },
      { key: 'fill_meaning_word', icon: '✏️', colorClass: 'qtype-fill' },
      { key: 'fill_word_ipa', icon: '✏️', colorClass: 'qtype-fill' },
      { key: 'fill_meaning_ipa', icon: '✏️', colorClass: 'qtype-fill' },
      { key: 'fill_ipa_word', icon: '✏️', colorClass: 'qtype-fill' },
      { key: 'fill_ipa_meaning', icon: '✏️', colorClass: 'qtype-fill' },
      { key: 'fill_listen_word', icon: '✏️', colorClass: 'qtype-fill' },
      { key: 'fill_listen_meaning', icon: '✏️', colorClass: 'qtype-fill' },
    ];

    const availableTypes = typeDefinitions.filter(td => typeCounts[td.key] > 0);
    if (availableTypes.length <= 1) return '';

    const allCount = PlayerState.allVocabQuestions.length;
    let buttons = `
      <button class="qtype-chip ${PlayerState.selectedQuestionType === 'all' ? 'active qtype-all' : ''}" 
              onclick="QuizPlayer.filterByQuestionType('all')">
        <span class="qtype-chip-icon">📚</span>
        <span class="qtype-chip-label">${I18n.t('qtype.all')}</span>
        <span class="qtype-chip-count">${allCount}</span>
      </button>
    `;

    availableTypes.forEach(td => {
      const count = typeCounts[td.key];
      const isActive = PlayerState.selectedQuestionType === td.key;
      buttons += `
        <button class="qtype-chip ${isActive ? 'active' : ''} ${td.colorClass}" 
                onclick="QuizPlayer.filterByQuestionType('${td.key}')">
          <span class="qtype-chip-icon">${td.icon}</span>
          <span class="qtype-chip-label">${I18n.t('qtype.' + td.key)}</span>
          <span class="qtype-chip-desc">${I18n.t('qtype.' + td.key + '_desc')}</span>
          <span class="qtype-chip-count">${count}</span>
        </button>
      `;
    });

    return `
      <div class="qtype-selector">
        ${buttons}
      </div>
    `;
  }

  function filterByQuestionType(type) {
    PlayerState.selectedQuestionType = type;
    if (type === 'all') {
      PlayerState.questionsQueue = [...PlayerState.allVocabQuestions];
    } else {
      PlayerState.questionsQueue = PlayerState.allVocabQuestions.filter(q => q.question_type === type);
    }
    if (PlayerState.settings.shuffleQuestions) {
      PlayerState.questionsQueue = PlayerState.shuffleArray(PlayerState.questionsQueue);
    }
    const saved = PlayerState.currentQuiz ? getSavedProgress(PlayerState.currentQuiz.id, type) : null;
    if (saved && saved.results && saved.results.length > 0) {
      PlayerState.results = (saved.results || []).map(r => ({
        ...r,
        question: r.question || {
          id: r.questionId || r.question?.id,
          question_text: r.questionText || r.question?.question_text,
          question_type: r.questionType || r.question?.question_type,
          correct_answer: r.userAnswer || ''
        }
      }));
      PlayerState.questionStates = Array.isArray(saved.questionStates) ? saved.questionStates : [];
      PlayerState.currentIndex = Math.min(saved.currentIndex !== undefined ? saved.currentIndex : (saved.currentQuestionIndex || 0), Math.max(0, PlayerState.questionsQueue.length - 1));
      PlayerState.usedAnswers = (saved && saved.usedAnswers) ? saved.usedAnswers : {};
    } else {
      PlayerState.currentIndex = 0;
      PlayerState.results = [];
      PlayerState.questionStates = [];
      PlayerState.usedAnswers = {};
    }
    renderQuestion();
  }

  function openQuestionTypeModal() {
    if (!PlayerState.currentQuiz) return;

    if (!PlayerState.allVocabQuestions || PlayerState.allVocabQuestions.length === 0) {
      PlayerState.allVocabQuestions = buildFullVocabQuestions(PlayerState.currentQuiz, PlayerState.settings || {});
      cachedTypeCounts = null;
    }

    const typeCounts = getTypeCounts();
    const typeDefinitions = [
      { key: 'mcq_word_meaning', icon: '⚡', colorClass: 'qtype-mcq' },
      { key: 'mcq_meaning_word', icon: '⚡', colorClass: 'qtype-mcq' },
      { key: 'mcq_word_ipa', icon: '⚡', colorClass: 'qtype-mcq' },
      { key: 'mcq_meaning_ipa', icon: '⚡', colorClass: 'qtype-mcq' },
      { key: 'mcq_ipa_word', icon: '⚡', colorClass: 'qtype-mcq' },
      { key: 'mcq_ipa_meaning', icon: '⚡', colorClass: 'qtype-mcq' },
      { key: 'mcq_listen_word', icon: '⚡', colorClass: 'qtype-mcq' },
      { key: 'mcq_listen_meaning', icon: '⚡', colorClass: 'qtype-mcq' },
      { key: 'fill_word_meaning', icon: '✏️', colorClass: 'qtype-fill' },
      { key: 'fill_meaning_word', icon: '✏️', colorClass: 'qtype-fill' },
      { key: 'fill_word_ipa', icon: '✏️', colorClass: 'qtype-fill' },
      { key: 'fill_meaning_ipa', icon: '✏️', colorClass: 'qtype-fill' },
      { key: 'fill_ipa_word', icon: '✏️', colorClass: 'qtype-fill' },
      { key: 'fill_ipa_meaning', icon: '✏️', colorClass: 'qtype-fill' },
      { key: 'fill_listen_word', icon: '✏️', colorClass: 'qtype-fill' },
      { key: 'fill_listen_meaning', icon: '✏️', colorClass: 'qtype-fill' },
    ];

    const availableTypes = typeDefinitions.filter(td => (typeCounts[td.key] || 0) > 0);
    const allCount = PlayerState.allVocabQuestions.length;

    let buttons = `
      <button class="qtype-chip ${PlayerState.selectedQuestionType === 'all' ? 'active qtype-all' : ''}" 
              onclick="QuizPlayer.selectQuestionTypeAndStart('all')">
        <span class="qtype-chip-icon">📚</span>
        <span class="qtype-chip-label">${I18n.t('qtype.all')}</span>
        <span class="qtype-chip-count">${allCount}</span>
      </button>
    `;

    availableTypes.forEach(td => {
      const count = typeCounts[td.key];
      const isActive = PlayerState.selectedQuestionType === td.key;
      buttons += `
        <button class="qtype-chip ${isActive ? 'active' : ''} ${td.colorClass}" 
                onclick="QuizPlayer.selectQuestionTypeAndStart('${td.key}')">
          <span class="qtype-chip-icon">${td.icon}</span>
          <span class="qtype-chip-label">${I18n.t('qtype.' + td.key)}</span>
          <span class="qtype-chip-desc">${I18n.t('qtype.' + td.key + '_desc')}</span>
          <span class="qtype-chip-count">${count}</span>
        </button>
      `;
    });

    const modalBody = `
      <div style="text-align: center; margin-bottom: 16px; color: var(--text-secondary); font-size: 14px;">
        ${I18n.t('results.chooseQuestionTypeDesc') || 'Chọn một loại câu hỏi để bắt đầu luyện tập:'}
      </div>
      <div class="qtype-selector modal-qtype-selector">
        ${buttons}
      </div>
    `;

    Components.showModal(
      I18n.t('results.chooseQuestionType') || 'Chọn loại câu hỏi',
      modalBody,
      `<button class="btn btn-ghost" onclick="Components.closeModal()">${I18n.t('common.close')}</button>`
    );

    const modalEl = document.getElementById('modal');
    if (modalEl) modalEl.classList.add('modal-wide');
  }

  function selectQuestionTypeAndStart(type) {
    Components.closeModal();
    const quizId = PlayerState.currentQuiz ? PlayerState.currentQuiz.id : null;
    if (quizId) {
      clearSavedProgress(quizId, null, false);
      PlayerState.resetQuizProgressState(quizId);
    }
    PlayerState.selectedQuestionType = type;
    if (type === 'all') {
      PlayerState.questionsQueue = [...PlayerState.allVocabQuestions];
    } else {
      PlayerState.questionsQueue = PlayerState.allVocabQuestions.filter(q => q.question_type === type);
    }
    if (PlayerState.settings && PlayerState.settings.shuffleQuestions) {
      PlayerState.questionsQueue = PlayerState.shuffleArray(PlayerState.questionsQueue);
    }
    PlayerState.currentIndex = 0;
    PlayerState.results = [];
    PlayerState.questionStates = [];
    PlayerState.usedAnswers = {};
    PlayerState.attachWordMetadataToQuestions(PlayerState.questionsQueue);
    renderQuestion();
  }

  function jumpToQuestion(index) {
    if (index < 0 || index >= PlayerState.questionsQueue.length) return;
    if (index === PlayerState.currentIndex) return;
    saveProgress();
    PlayerState.currentIndex = index;
    renderQuestion();
  }

  function buildVocabGridHTML() {
    if (!PlayerState.currentQuiz || PlayerState.currentQuiz.quiz_type !== 'vocabulary') return '';

    const targetList = PlayerState.questionsQueue;
    if (!targetList || targetList.length === 0) return '';

    const totalN = targetList.length;
    let boxesHTML = '';

    targetList.forEach((q, idx) => {
      const isCurrent = idx === PlayerState.currentIndex;
      
      const state = PlayerState.questionStates.find(s =>
        (s.queueIndex === idx && s.questionType === q.question_type) ||
        (String(s.questionId) === String(q.id) && s.questionType === q.question_type)
      );
      const res = PlayerState.results.find(r =>
        (r.queueIndex !== undefined && r.queueIndex === idx) ||
        r.question === q ||
        (r.question && r.question === q) ||
        ((r.questionId || r.question?.id) && String(r.questionId || r.question?.id) === String(q.id) && (r.questionType || r.question?.question_type) === q.question_type && ((r.questionText || r.question?.question_text) === q.question_text || r.queueIndex === idx))
      );

      let statusClass = 'pending';
      let titleTooltip = `${I18n.t('play.questionOf', { current: idx + 1, total: totalN })}`;

      if (state) {
        statusClass = state.status;
        titleTooltip += `: ${state.status === 'correct' ? I18n.t('play.correct') : I18n.t('play.incorrect')}`;
      } else if (res) {
        statusClass = res.isCorrect ? 'correct' : 'incorrect';
        titleTooltip += `: ${res.isCorrect ? I18n.t('play.correct') : I18n.t('play.incorrect')}`;
      } else if (isCurrent) {
        statusClass = 'current';
        titleTooltip += ` (${I18n.t('play.current')})`;
      }

      if (isCurrent && res) {
        statusClass += ' current';
      }

      const wordLabel = (q._word || q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0].trim();
      if (wordLabel) {
        titleTooltip += ` - ${Components.escapeHtml(wordLabel)}`;
      }

      boxesHTML += `
        <div class="vocab-grid-box ${statusClass}" 
             title="${titleTooltip}"
             onclick="QuizPlayer.jumpToQuestion(${idx})">
          ${idx + 1}
        </div>
      `;
    });

    const answeredCount = PlayerState.questionStates.filter(s => s.status === 'correct' || s.status === 'incorrect').length;

    return `
      <div class="vocab-grid-sidebar ${PlayerState.isGridCollapsedOnMobile ? 'collapsed' : ''}">
        <div class="vocab-grid-header" onclick="QuizPlayer.toggleGridCollapse()" title="Bấm để ẩn/hiện danh sách câu">
          <span class="vocab-grid-title">📋 ${I18n.t('play.questionList')} <span class="grid-collapse-arrow">▼</span></span>
          <span class="vocab-grid-stats">${answeredCount}/${totalN}</span>
        </div>
        <div class="vocab-grid-collapsible-body">
          <div class="vocab-grid-container">
            ${boxesHTML}
          </div>
          <div class="vocab-grid-legend">
            <div class="vocab-grid-legend-item">
              <div class="vocab-grid-legend-dot current"></div>
              <span>${I18n.t('play.current')}</span>
            </div>
            <div class="vocab-grid-legend-item">
              <div class="vocab-grid-legend-dot correct"></div>
              <span>${I18n.t('results.correct')}</span>
            </div>
            <div class="vocab-grid-legend-item">
              <div class="vocab-grid-legend-dot incorrect"></div>
              <span>${I18n.t('results.incorrect')}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function toggleGridCollapse() {
    PlayerState.isGridCollapsedOnMobile = !PlayerState.isGridCollapsedOnMobile;
    const sidebar = document.querySelector('.vocab-grid-sidebar');
    if (sidebar) {
      sidebar.classList.toggle('collapsed', PlayerState.isGridCollapsedOnMobile);
    }
  }

  function toggleVoiceInput(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (PlayerState.answered) return;
    const btn = document.getElementById('voice-input-btn');
    const input = document.getElementById('answer-input');
    if (!btn || !input) return;

    if (PlayerAudio.getIsListening()) {
      PlayerAudio.stopVoiceRecognition();
      btn.classList.remove('listening', 'connecting');
      btn.title = I18n.t('play.voiceInput') || 'Nhập bằng giọng nói';
      return;
    }

    const q = PlayerState.questionsQueue[PlayerState.currentIndex];
    if (!q) return;

    // Provide instant visual feedback immediately on click/touch
    btn.classList.add('connecting');
    btn.classList.remove('listening');
    btn.title = I18n.t('play.voiceConnecting') || 'Đang kết nối micro...';

    PlayerAudio.startVoiceRecognition({
      question: q,
      quiz: PlayerState.currentQuiz,
      onConnecting: () => {
        btn.classList.add('connecting');
        btn.classList.remove('listening');
        btn.title = I18n.t('play.voiceConnecting') || 'Đang kết nối micro...';
      },
      onStart: (config) => {
        btn.classList.remove('connecting');
        btn.classList.add('listening');
        btn.title = I18n.t('play.voiceListening') || 'Đang nghe... hãy nói đáp án';
      },
      onInterim: (interimText, config) => {
        input.value = interimText;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      },
      onFinal: (processedText, config) => {
        btn.classList.remove('listening', 'connecting');
        btn.title = I18n.t('play.voiceInput') || 'Nhập bằng giọng nói';
        if (processedText && processedText.trim()) {
          input.value = processedText;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.focus();
          setTimeout(() => {
            if (!PlayerState.answered) {
              submitAnswer(processedText);
            }
          }, 250);
        }
      },
      onError: (errCode) => {
        btn.classList.remove('listening', 'connecting');
        btn.title = I18n.t('play.voiceInput') || 'Nhập bằng giọng nói';
        if (errCode === 'need-https') {
          showHttpsRedirectModal();
        } else if (errCode === 'not-supported') {
          if (window.Components && Components.showToast) {
            Components.showToast(I18n.t('play.voiceNotSupported') || 'Trình duyệt không hỗ trợ nhận diện giọng nói (Web Speech API).', 'error');
          }
        } else if (errCode === 'not-allowed') {
          if (window.Components && Components.showToast) {
            Components.showToast(I18n.t('play.voicePermissionDenied') || 'Vui lòng cấp quyền truy cập micro cho trang web.', 'error');
          }
        } else if (errCode === 'timeout') {
          if (window.Components && Components.showToast) {
            Components.showToast(I18n.t('play.voiceTimeout') || 'Không thể kết nối dịch vụ micro. Vui lòng thử lại.', 'warning');
          }
        } else if (errCode === 'no-speech') {
          if (window.Components && Components.showToast) {
            Components.showToast(I18n.t('play.voiceNoSpeech') || 'Chưa nghe thấy giọng nói, vui lòng thử lại.', 'info');
          }
        } else {
          console.warn('Speech recognition error:', errCode);
        }
      },
      onEnd: () => {
        btn.classList.remove('listening', 'connecting');
        btn.title = I18n.t('play.voiceInput') || 'Nhập bằng giọng nói';
      }
    });
  }

  async function showHttpsRedirectModal() {
    let httpsUrl = '';
    try {
      const res = await fetch('/api/server-info');
      if (res.ok) {
        const info = await res.json();
        if (info && info.httpsPort) {
          const currentHost = location.hostname;
          httpsUrl = `https://${currentHost}:${info.httpsPort}${location.pathname}${location.search}${location.hash}`;
        }
      }
    } catch (e) {
      console.warn('Could not get server-info:', e);
    }

    if (!httpsUrl) {
      const currentHost = location.hostname;
      httpsUrl = `https://${currentHost}:3443${location.pathname}${location.search}${location.hash}`;
    }

    const title = I18n.t('play.httpsModalTitle') || 'Yêu cầu kết nối HTTPS';
    const body = `
      <div style="text-align: center; padding: 10px 0;">
        <div style="font-size: 3rem; margin-bottom: 12px;">🔒</div>
        <p style="margin-bottom: 16px; font-size: 0.95rem; line-height: 1.5; color: var(--text-color);">
          ${I18n.t('play.httpsModalDesc') || 'Trình duyệt trên điện thoại bắt buộc sử dụng kết nối bảo mật <b>HTTPS</b> để cấp quyền microphone.'}
        </p>
        <div style="background: rgba(99, 102, 241, 0.1); border: 1px dashed var(--primary, #6366f1); border-radius: 8px; padding: 12px; margin-bottom: 16px; word-break: break-all; font-family: monospace; font-size: 0.9rem;">
          <a href="${httpsUrl}" style="color: var(--primary, #6366f1); font-weight: 600; text-decoration: underline;">${httpsUrl}</a>
        </div>
        <div style="background: rgba(245, 158, 11, 0.1); border-left: 4px solid #f59e0b; padding: 10px 14px; text-align: left; border-radius: 6px; font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
          💡 <b>Lưu ý chứng chỉ mạng LAN:</b> Khi chuyển sang HTTPS, nếu trình duyệt cảnh báo "Kết nối không riêng tư" do SSL nội bộ, bạn chỉ cần chọn <b>Nâng cao (Advanced)</b> &rarr; <b>Tiếp tục truy cập (Proceed)</b> là microphone sẽ hoạt động tốt!
        </div>
      </div>
    `;
    const footer = `
      <a href="${httpsUrl}" class="btn btn-primary" style="display: inline-flex; align-items: center; justify-content: center; text-decoration: none;">
        🚀 Chuyển sang HTTPS ngay
      </a>
      <button class="btn btn-ghost" onclick="Components.closeModal()">${I18n.t('common.close') || 'Đóng'}</button>
    `;

    if (window.Components && Components.showModal) {
      Components.showModal(title, body, footer);
    } else {
      alert('Vui lòng truy cập qua HTTPS để dùng microphone: ' + httpsUrl);
    }
  }

  function setVocabInputMode(mode) {
    if (PlayerState.vocabInputMode === mode) return;
    PlayerState.vocabInputMode = mode;
    localStorage.setItem('quizmaster-vocab-input-mode', mode);
    PlayerState.flashcardFlipped = false;

    if (PlayerState.currentQuiz && PlayerState.currentQuiz.quiz_type === 'vocabulary') {
      PlayerState.allVocabQuestions = buildFullVocabQuestions(PlayerState.currentQuiz, PlayerState.settings, mode);
      cachedTypeCounts = null;

      if (mode === 'flashcard') {
        const mergedMap = new Map();
        PlayerState.allVocabQuestions.forEach(q => {
          const cleanPrompt = (q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0].trim().toLowerCase();
          mergedMap.set(`${q.question_type || 'fill'}:${cleanPrompt}`, q);
        });

        const answeredKeys = new Set();
        for (let i = 0; i <= PlayerState.currentIndex; i++) {
          const q = PlayerState.questionsQueue[i];
          if (q) {
            const cleanPrompt = (q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0].trim().toLowerCase();
            answeredKeys.add(`${q.question_type || 'fill'}:${cleanPrompt}`);
          }
        }

        const remaining = [];
        const seenRemaining = new Set();
        for (let i = PlayerState.currentIndex + 1; i < PlayerState.questionsQueue.length; i++) {
          const q = PlayerState.questionsQueue[i];
          const cleanPrompt = (q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0].trim().toLowerCase();
          const k = `${q.question_type || 'fill'}:${cleanPrompt}`;

          const mergedQ = mergedMap.get(k) || q;
          if ((q._failedTries && q._failedTries > 0) || (!answeredKeys.has(k) && !seenRemaining.has(k))) {
            remaining.push({ ...mergedQ, _failedTries: q._failedTries });
            seenRemaining.add(k);
          }
        }
        PlayerState.questionsQueue = PlayerState.questionsQueue.slice(0, PlayerState.currentIndex + 1).concat(remaining);
      }
      PlayerState.attachWordMetadataToQuestions(PlayerState.questionsQueue);
      PlayerState.attachWordMetadataToQuestions(PlayerState.allVocabQuestions);
    }

    renderQuestion();
  }

  function flipFlashcard(forceState = null) {
    if (forceState !== null) {
      PlayerState.flashcardFlipped = !!forceState;
    } else {
      PlayerState.flashcardFlipped = !PlayerState.flashcardFlipped;
    }
    const cardEl = document.getElementById('flashcard-card');
    if (cardEl) {
      cardEl.classList.toggle('flipped', PlayerState.flashcardFlipped);
    }
  }

  function onFlashcardCardClick(event) {
    if (event.target.closest('button, a, input, audio, .flashcard-grade-area')) return;
    if (!PlayerState.answered) {
      flipFlashcard();
    }
  }

  function submitFlashcardGrade(isCorrect) {
    if (PlayerState.answered) return;
    const q = PlayerState.questionsQueue[PlayerState.currentIndex];
    if (!q) return;

    const correctBtn = document.getElementById('flashcard-btn-correct');
    const wrongBtn = document.getElementById('flashcard-btn-wrong');
    if (correctBtn) correctBtn.disabled = true;
    if (wrongBtn) wrongBtn.disabled = true;

    if (isCorrect) {
      if (correctBtn) correctBtn.classList.add('selected');
      const answerKey = PlayerState.getUsedAnswersKey(q);
      const normalize = (str) => window.Utils ? Utils.normalizeText(str) : String(str || '').trim().toLowerCase().normalize('NFC').replace(/\s+/g, ' ');
      const used = (PlayerState.usedAnswers[answerKey] || []).map(a => normalize(a));
      const allAnswers = String(q.correct_answer || '').split('/').map(a => a.trim()).filter(Boolean);
      const unusedAnswer = allAnswers.find(a => !used.includes(normalize(a)));
      const chosenAnswer = unusedAnswer || allAnswers[0] || '';
      submitAnswer(chosenAnswer);
    } else {
      if (wrongBtn) wrongBtn.classList.add('selected');
      PlayerState.answered = true;
      PlayerState.lastAnswerTime = Date.now();

      if (q._word && q._meaning) {
        PlayerState.addWrongWord(q._word, q._meaning, q._ipa);
      }

      const currentFailures = q._failedTries || 0;
      let willRetry = false;
      if (PlayerState.settings.maxRetries === -1 || currentFailures < PlayerState.settings.maxRetries) {
        willRetry = true;
        const retryQ = { ...q, _failedTries: currentFailures + 1 };
        const insertIndex = PlayerState.currentIndex + 1 + 7;
        if (insertIndex >= PlayerState.questionsQueue.length) {
          PlayerState.questionsQueue.push(retryQ);
        } else {
          PlayerState.questionsQueue.splice(insertIndex, 0, retryQ);
        }
      } else {
        q._finalFailure = true;
      }

      PlayerState.currentRetries = currentFailures + 1;
      const retryCountEl = document.getElementById('retry-count');
      if (retryCountEl) retryCountEl.textContent = PlayerState.currentRetries;

      if (!willRetry) {
        PlayerState.results.push({
          question: q,
          questionId: q.id,
          questionText: q.question_text,
          questionType: q.question_type,
          correctAnswer: q.correct_answer,
          queueIndex: PlayerState.currentIndex,
          userAnswer: I18n.t('play.flashcardWrong') || 'Sai',
          isCorrect: false,
          retries: PlayerState.currentRetries,
        });
      }
      PlayerState.setQuestionState(q, PlayerState.currentIndex, 'incorrect');

      saveProgress();

      const proceedFunc = () => {
        PlayerState.currentIndex++;
        renderQuestion();
      };

      const autoDelay = parseInt(localStorage.getItem('quizmaster-auto-advance') || '1500', 10);
      if (autoDelay >= 0) {
        if (autoDelay === 0) {
          requestAnimationFrame(() => proceedFunc());
        } else {
          const container = document.getElementById('auto-advance-container');
          const bar = document.getElementById('auto-advance-bar');
          if (container && bar) {
            container.style.display = 'block';
            setTimeout(() => {
              bar.style.transitionDuration = `${autoDelay}ms`;
              bar.style.width = '100%';
            }, 50);
          }
          setTimeout(proceedFunc, autoDelay);
        }
      } else {
        setTimeout(proceedFunc, 600);
      }
    }
  }

  function submitMcqAnswer(btnEl, userAnswer) {
    if (PlayerState.answered) return;
    document.querySelectorAll('.mcq-option').forEach(el => el.classList.remove('selected'));
    btnEl.classList.add('selected');
    submitAnswer(userAnswer, btnEl);
  }

  function submitAnswer(overrideAnswer = null, btnEl = null) {
    if (window.PlayerAudio) PlayerAudio.stopVoiceRecognition();
    if (PlayerState.answered) {
      if (Date.now() - PlayerState.lastAnswerTime < 150) return;
      const submitBtn = document.getElementById('submit-btn');
      if (submitBtn && typeof submitBtn.onclick === 'function') {
        submitBtn.onclick();
      }
      return;
    }

    let userAnswer = overrideAnswer;
    let input = document.getElementById('answer-input');
    
    if (userAnswer === null) {
      if (!input) return;
      userAnswer = input.value.trim();
    }

    if (!userAnswer) {
      if (input) input.focus();
      return;
    }

    const q = PlayerState.questionsQueue[PlayerState.currentIndex];
    const isMcq = (q.question_type && q.question_type.startsWith('mcq')) || (q.question_text && q.question_text.includes('|||'));
    const isCorrect = PlayerState.checkAnswer(userAnswer, q.correct_answer);
    
    const feedback = document.getElementById('answer-feedback');
    let submitBtn = document.getElementById('submit-btn');

    const normalize = (str) => Utils ? Utils.normalizeText(str) : String(str || '').trim().toLowerCase().normalize('NFC').replace(/\s+/g, ' ');
    const answerKey = PlayerState.getUsedAnswersKey(q);
    const isVocab = PlayerState.currentQuiz && PlayerState.currentQuiz.quiz_type === 'vocabulary';
    const isFlashcard = isVocab && (PlayerState.vocabInputMode || localStorage.getItem('quizmaster-vocab-input-mode')) === 'flashcard';

    if (isCorrect) {
      const normalizedAnswer = normalize(userAnswer);
      const isDuplicate = !isMcq && !isFlashcard && !PlayerState.settings.allowDuplicates && (PlayerState.usedAnswers[answerKey] || []).some(a => normalize(a) === normalizedAnswer);

      if (isDuplicate) {
        if (input) {
          input.classList.remove('incorrect', 'correct');
          input.style.borderColor = '#f59e0b';
        }
        feedback.className = 'answer-feedback show';
        feedback.style.color = '#f59e0b';
        feedback.textContent = I18n.t('play.alreadyAnswered');
        return;
      }

      if (!PlayerState.usedAnswers[answerKey]) PlayerState.usedAnswers[answerKey] = [];
      PlayerState.usedAnswers[answerKey].push(userAnswer);

      PlayerState.answered = true;
      PlayerState.lastAnswerTime = Date.now();

      PlayerState.results.push({
        question: q,
        questionId: q.id,
        questionText: q.question_text,
        questionType: q.question_type,
        correctAnswer: q.correct_answer,
        queueIndex: PlayerState.currentIndex,
        userAnswer,
        isCorrect: true,
        retries: q._failedTries || 0,
      });
      PlayerState.setQuestionState(q, PlayerState.currentIndex, 'correct');

      saveProgress();

      if (input) {
        input.style.borderColor = '';
        input.classList.add('correct');
        input.classList.remove('incorrect');
      }
      
      if (btnEl) {
        btnEl.classList.add('correct');
      }

      feedback.className = 'answer-feedback show correct';
      feedback.style.color = '';
      feedback.textContent = I18n.t('play.correct');
      
      const proceedFunc = () => {
        PlayerState.currentIndex++;
        renderQuestion();
      };

      if (submitBtn) {
        submitBtn.textContent = PlayerState.currentIndex < PlayerState.questionsQueue.length - 1
          ? I18n.t('play.next') + ' →'
          : I18n.t('play.finish') + ' 🎉';
        submitBtn.onclick = proceedFunc;
      }

      const autoDelay = parseInt(localStorage.getItem('quizmaster-auto-advance') || '1500', 10);
      if (autoDelay >= 0) {
        document.querySelectorAll('.mcq-option').forEach(el => el.disabled = true);
        if (autoDelay === 0) {
          requestAnimationFrame(() => {
            proceedFunc();
          });
        } else {
          const container = document.getElementById('auto-advance-container');
          const bar = document.getElementById('auto-advance-bar');
          if (container && bar) {
            container.style.display = 'block';
            setTimeout(() => {
              bar.style.transitionDuration = `${autoDelay}ms`;
              bar.style.width = '100%';
            }, 50);
          }
          setTimeout(proceedFunc, autoDelay);
        }
      }
    } else {
      const dontRememberBtn = document.getElementById('dont-remember-btn');
      if (dontRememberBtn) dontRememberBtn.style.display = 'none';

      if (q._word && q._meaning) {
        PlayerState.addWrongWord(q._word, q._meaning, q._ipa);
      }

      const currentFailures = q._failedTries || 0;
      let willRetry = false;
      
      if (PlayerState.settings.maxRetries === -1 || currentFailures < PlayerState.settings.maxRetries) {
        willRetry = true;
        const retryQ = { ...q, _failedTries: currentFailures + 1 };
        const insertIndex = PlayerState.currentIndex + 1 + 7;
        if (insertIndex >= PlayerState.questionsQueue.length) {
          PlayerState.questionsQueue.push(retryQ);
        } else {
          PlayerState.questionsQueue.splice(insertIndex, 0, retryQ);
        }
      } else {
        q._finalFailure = true;
      }

      PlayerState.currentRetries = currentFailures + 1;
      const retryCountEl = document.getElementById('retry-count');
      if (retryCountEl) retryCountEl.textContent = PlayerState.currentRetries;
      if (input) {
        input.style.borderColor = '';
        input.classList.add('incorrect');
        input.classList.remove('correct');
      }

      if (btnEl) {
        btnEl.classList.add('incorrect');
      }

      feedback.style.color = '';
      const safeCorrectAnswer = String(q.correct_answer || '');
      const displayAnswer = safeCorrectAnswer.includes('/')
        ? safeCorrectAnswer.split('/').join(' / ')
        : safeCorrectAnswer;

      feedback.className = 'answer-feedback show incorrect';
      feedback.innerHTML = I18n.t('play.incorrect', { answer: `<strong>${Components.escapeHtml(displayAnswer)}</strong>` });

      if (isMcq) {
        document.querySelectorAll('.mcq-option').forEach(el => {
          el.disabled = true;
          const optAnswer = el.getAttribute('data-answer') || (el.querySelector('.mcq-option-text') ? el.querySelector('.mcq-option-text').textContent.trim() : el.textContent.trim());
          if (PlayerState.checkAnswer(optAnswer, q.correct_answer)) {
            el.classList.add('correct');
          }
        });
      }

      PlayerState.answered = true;
      PlayerState.lastAnswerTime = Date.now();
      
      if (!willRetry) {
        PlayerState.results.push({
          question: q,
          questionId: q.id,
          questionText: q.question_text,
          questionType: q.question_type,
          correctAnswer: q.correct_answer,
          queueIndex: PlayerState.currentIndex,
          userAnswer,
          isCorrect: false,
          retries: PlayerState.currentRetries,
        });
        PlayerState.setQuestionState(q, PlayerState.currentIndex, 'incorrect');
      }

      saveProgress();

      const proceedFunc = () => {
        PlayerState.currentIndex++;
        renderQuestion();
      };

      if (submitBtn) {
        submitBtn.textContent = (PlayerState.currentIndex < PlayerState.questionsQueue.length - 1 || willRetry)
          ? I18n.t('play.next') + ' →'
          : I18n.t('play.finish') + ' 🎉';
        submitBtn.onclick = proceedFunc;
      } else {
        feedback.innerHTML += `<br><button class="btn btn-danger mt-2" onclick="document.getElementById('hidden-next-btn').click()">${(PlayerState.currentIndex < PlayerState.questionsQueue.length - 1 || willRetry) ? I18n.t('play.next') + ' →' : I18n.t('play.finish') + ' 🎉'}</button>`;
        const hiddenBtn = document.createElement('button');
        hiddenBtn.id = 'hidden-next-btn';
        hiddenBtn.style.display = 'none';
        hiddenBtn.onclick = proceedFunc;
        feedback.appendChild(hiddenBtn);
      }
    }
  }

  function handleDontRemember() {
    if (PlayerState.answered) return;
    PlayerState.answered = true;
    PlayerState.lastAnswerTime = Date.now();

    const dontRememberBtn = document.getElementById('dont-remember-btn');
    if (dontRememberBtn) dontRememberBtn.style.display = 'none';

    const q = PlayerState.questionsQueue[PlayerState.currentIndex];
    const isMcq = (q.question_type && q.question_type.startsWith('mcq')) || (q.question_text && q.question_text.includes('|||'));
    const feedback = document.getElementById('answer-feedback');
    let submitBtn = document.getElementById('submit-btn');
    let input = document.getElementById('answer-input');

    if (q._word && q._meaning) {
      PlayerState.addWrongWord(q._word, q._meaning, q._ipa);
    }

    const currentFailures = q._failedTries || 0;
    let willRetry = false;
    
    if (PlayerState.settings.maxRetries === -1 || currentFailures < PlayerState.settings.maxRetries) {
      willRetry = true;
      const retryQ = { ...q, _failedTries: currentFailures + 1 };
      const insertIndex = PlayerState.currentIndex + 1 + 7;
      if (insertIndex >= PlayerState.questionsQueue.length) {
        PlayerState.questionsQueue.push(retryQ);
      } else {
        PlayerState.questionsQueue.splice(insertIndex, 0, retryQ);
      }
    } else {
      q._finalFailure = true;
    }

    PlayerState.currentRetries = currentFailures + 1;
    const retryCountEl = document.getElementById('retry-count');
    if (retryCountEl) retryCountEl.textContent = PlayerState.currentRetries;

    if (input) {
      input.style.borderColor = '';
      input.classList.add('incorrect');
      input.classList.remove('correct');
    }

    feedback.style.color = '';
    const safeCorrectAnswer = String(q.correct_answer || '');
    const displayAnswer = safeCorrectAnswer.includes('/')
      ? safeCorrectAnswer.split('/').join(' / ')
      : safeCorrectAnswer;

    feedback.className = 'answer-feedback show incorrect';
    feedback.innerHTML = I18n.t('play.dontRememberFeedback', { answer: `<strong>${Components.escapeHtml(displayAnswer)}</strong>` });

    if (isMcq) {
      document.querySelectorAll('.mcq-option').forEach(el => {
        el.disabled = true;
        const optAnswer = el.getAttribute('data-answer') || (el.querySelector('.mcq-option-text') ? el.querySelector('.mcq-option-text').textContent.trim() : el.textContent.trim());
        if (PlayerState.checkAnswer(optAnswer, q.correct_answer)) {
          el.classList.add('correct');
        }
      });
    }

    if (!willRetry) {
      PlayerState.results.push({
        question: q,
        questionId: q.id,
        questionText: q.question_text,
        questionType: q.question_type,
        correctAnswer: q.correct_answer,
        queueIndex: PlayerState.currentIndex,
        userAnswer: I18n.t('play.dontRememberLabel'),
        isCorrect: false,
        retries: PlayerState.currentRetries,
      });
    }

    saveProgress();

    const proceedFunc = () => {
      PlayerState.currentIndex++;
      renderQuestion();
    };

    if (submitBtn) {
      submitBtn.textContent = (PlayerState.currentIndex < PlayerState.questionsQueue.length - 1 || willRetry)
        ? I18n.t('play.next') + ' →'
        : I18n.t('play.finish') + ' 🎉';
      submitBtn.onclick = proceedFunc;
      submitBtn.style.display = 'inline-block';
    } else {
      feedback.innerHTML += `<br><button class="btn btn-primary mt-2" onclick="document.getElementById('hidden-next-btn').click()">${(PlayerState.currentIndex < PlayerState.questionsQueue.length - 1 || willRetry) ? I18n.t('play.next') + ' →' : I18n.t('play.finish') + ' 🎉'}</button>`;
      const hiddenBtn = document.createElement('button');
      hiddenBtn.id = 'hidden-next-btn';
      hiddenBtn.style.display = 'none';
      hiddenBtn.onclick = proceedFunc;
      feedback.appendChild(hiddenBtn);
    }
  }

  function renderResults() {
    const quizTitle = PlayerState.currentQuiz ? PlayerState.currentQuiz.title : '';
    const quizId = PlayerState.currentQuiz ? PlayerState.currentQuiz.id : 0;
    const isVocab = PlayerState.currentQuiz && PlayerState.currentQuiz.quiz_type === 'vocabulary';
    const finalResults = Array.isArray(PlayerState.results) ? [...PlayerState.results] : [];
    const total = finalResults.length;
    const correct = finalResults.filter(r => r.isCorrect).length;
    const incorrect = total - correct;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

    if (quizId) {
      clearSavedProgress(quizId, null, false);
    }

    const circumference = 2 * Math.PI * 65;
    const offset = circumference - (accuracy / 100) * circumference;

    let ringColor;
    if (accuracy >= 80) ringColor = '#10b981';
    else if (accuracy >= 50) ringColor = '#f59e0b';
    else ringColor = '#ef4444';

    const main = document.getElementById('main-content');
    main.innerHTML = `
      <div class="results-container">
        <div class="page-header text-center" style="margin-bottom: 20px;">
          <h1>${I18n.t('results.title')}</h1>
          <p style="font-size: 16px; color: var(--text-secondary); margin-top: 4px;">${Components.escapeHtml(quizTitle)}</p>
        </div>

        <div class="score-ring-container">
          <div class="score-ring">
            <svg width="160" height="160" viewBox="0 0 160 160">
              <circle class="score-ring-bg" cx="80" cy="80" r="65"/>
              <circle class="score-ring-fill" cx="80" cy="80" r="65"
                      stroke="${ringColor}"
                      stroke-dasharray="${circumference}"
                      stroke-dashoffset="${circumference}"
                      id="score-ring-circle"/>
            </svg>
            <div class="score-ring-text">
              <span class="score-percentage" id="score-text">0%</span>
              <span class="score-label">${I18n.t('results.accuracy')}</span>
            </div>
          </div>
        </div>

        <div class="results-summary">
          <div class="stat-card">
            <div class="stat-value correct-color">${correct}</div>
            <div class="stat-label">${I18n.t('results.correct')}</div>
          </div>
          <div class="stat-card">
            <div class="stat-value incorrect-color">${incorrect}</div>
            <div class="stat-label">${I18n.t('results.incorrect')}</div>
          </div>
          <div class="stat-card">
            <div class="stat-value total-color">${total}</div>
            <div class="stat-label">${I18n.t('results.total')}</div>
          </div>
          <div class="stat-card">
            <div class="stat-value accuracy-color">${accuracy}%</div>
            <div class="stat-label">${I18n.t('results.accuracy')}</div>
          </div>
        </div>

        <div class="card">
          <div class="results-filter" id="results-filter">
            <button class="filter-btn active" onclick="QuizPlayer.filterResults('all', this)">${I18n.t('results.filterAll')} (${total})</button>
            <button class="filter-btn" onclick="QuizPlayer.filterResults('correct', this)">${I18n.t('results.filterCorrect')} (${correct})</button>
            <button class="filter-btn" onclick="QuizPlayer.filterResults('incorrect', this)">${I18n.t('results.filterIncorrect')} (${incorrect})</button>
          </div>
          <div id="results-list">
            ${renderResultItems('all')}
          </div>
        </div>

        <div class="fixed-bottom-bar">
          <div class="fixed-bottom-bar-inner" style="max-width: 800px; justify-content: center; gap: 16px;">
            <button class="btn btn-ghost btn-lg" style="flex: 1; max-width: 240px; font-weight: 600;" onclick="App.navigate('dashboard')">
              ← ${I18n.t('results.backToList')}
            </button>
            ${quizId ? `<button class="btn btn-primary btn-lg" style="flex: 1; max-width: 240px; font-weight: 700; border-radius: 12px;" onclick="QuizPlayer.startQuiz(${quizId}, true)">
              🔄 ${I18n.t('results.playAgain')}
            </button>` : ''}
            ${(isVocab && quizId) ? `<button class="btn btn-secondary btn-lg" style="flex: 1; max-width: 240px; font-weight: 700; border-radius: 12px;" onclick="QuizPlayer.openQuestionTypeModal()">
              🎯 ${I18n.t('results.chooseQuestionType')}
            </button>` : ''}
          </div>
        </div>
      </div>
    `;

    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch(e) {}

    setTimeout(() => {
      const circle = document.getElementById('score-ring-circle');
      if (circle) {
        circle.style.strokeDashoffset = offset;
      }
      animateCounter('score-text', 0, accuracy, 1000);
    }, 200);
  }

  function animateCounter(elementId, start, end, duration) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const startTime = performance.now();
    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (end - start) * eased);
      el.textContent = current + '%';
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  }

  function renderResultItems(filter) {
    let filtered = PlayerState.results || [];
    if (filter === 'correct') filtered = filtered.filter(r => r.isCorrect);
    else if (filter === 'incorrect') filtered = filtered.filter(r => !r.isCorrect);

    if (filtered.length === 0) {
      return `<div class="text-center text-muted" style="padding: 24px;">—</div>`;
    }

    return filtered.map((r, i) => {
      const icon = r.isCorrect ? '✅' : '❌';
      
      let displayQText = (r.question && r.question.question_text) || r.questionText || '';
      if (displayQText.includes('|||')) {
        displayQText = displayQText.split('|||')[0];
      }
      if (displayQText.startsWith('🎧 ')) {
        displayQText = displayQText.substring(2).trim();
      }

      const rawCorrectAnswer = String((r.question && r.question.correct_answer) || r.correctAnswer || '');
      const displayAnswer = rawCorrectAnswer.includes('/')
        ? rawCorrectAnswer.split('/').join(' / ')
        : rawCorrectAnswer;

      let answerDetail;
      if (r.isCorrect) {
        answerDetail = `
          <span>${I18n.t('results.yourAnswer')}: <strong class="text-success">${Components.escapeHtml(r.userAnswer || '')}</strong></span>
          <br>
          <span>${I18n.t('results.correctAnswer')}: <span class="correct-answer-label">${Components.escapeHtml(displayAnswer)}</span></span>
        `;
      } else {
        answerDetail = `
          <span>${I18n.t('results.yourAnswer')}: <span class="user-answer-wrong">${Components.escapeHtml(r.userAnswer || I18n.t('results.noAnswer'))}</span></span>
          <br>
          <span>${I18n.t('results.correctAnswer')}: <span class="correct-answer-label">${Components.escapeHtml(displayAnswer)}</span></span>
        `;
      }

      const retriesText = r.retries > 0
        ? `<div class="result-retries">🔄 ${r.retries} ${I18n.t('results.retries')}</div>`
        : '';

      return `
        <div class="result-item">
          <span class="result-icon">${icon}</span>
          <div class="result-content">
            <div class="result-question">${Components.escapeHtml(displayQText)}</div>
            <div class="result-answer">${answerDetail}</div>
            ${retriesText}
          </div>
        </div>
      `;
    }).join('');
  }

  function filterResults(filter, btnEl = null) {
    document.querySelectorAll('#results-filter .filter-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    const target = btnEl || (typeof event !== 'undefined' && event ? event.target : null);
    if (target) {
      target.classList.add('active');
    }

    const listEl = document.getElementById('results-list');
    if (listEl) {
      listEl.innerHTML = renderResultItems(filter);
    }
  }

  return {
    renderSelectScreen,
    setPlayMode,
    startQuiz,
    resumeQuiz,
    saveProgress,
    getSavedProgress,
    clearSavedProgress,
    submitAnswer,
    submitMcqAnswer,
    handleDontRemember,
    playTTS,
    filterResults,
    filterByQuestionType,
    openQuestionTypeModal,
    selectQuestionTypeAndStart,
    buildFullVocabQuestions,
    toggleGridCollapse,
    toggleVoiceInput,
    showHttpsRedirectModal,
    setVocabInputMode,
    flipFlashcard,
    onFlashcardCardClick,
    submitFlashcardGrade,
    jumpToQuestion,
    clearInMemoryState
  };
})();

window.QuizPlayer = QuizPlayer;
