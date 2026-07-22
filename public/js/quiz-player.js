// ============================================
// Quiz Player - Gameplay & Results
// ============================================

const QuizPlayer = (() => {
  let currentQuiz = null;
  let questionsQueue = [];
  let currentIndex = 0;
  let results = [];
  let currentRetries = 0;
  let answered = false;
  let settings = {};
  let usedAnswers = {};
  let allVocabQuestions = [];
  let selectedQuestionType = 'all';
  let currentPlayMode = localStorage.getItem('quizmaster-play-mode') || localStorage.getItem('quizmaster-dashboard-mode') || 'question';
  let cachedPlayQuizzes = null;
  let cachedTypeCounts = null;

  const PROGRESS_KEY_PREFIX = 'quizmaster-progress-';
  let saveProgressTimer = null;

  function saveProgress() {
    if (!currentQuiz || !currentQuiz.id) return;
    if (saveProgressTimer) clearTimeout(saveProgressTimer);

    saveProgressTimer = setTimeout(() => {
      try {
        const lightweightQueue = questionsQueue.map(q => ({
          id: q.id,
          _failedTries: q._failedTries,
          question_type: q.question_type
        }));
        const progressData = {
          quizId: currentQuiz.id,
          currentIndex,
          queue: lightweightQueue,
          selectedQuestionType,
          results,
          usedAnswers,
          updatedAt: Date.now()
        };
        localStorage.setItem(PROGRESS_KEY_PREFIX + currentQuiz.id, JSON.stringify(progressData));
      } catch (e) {
        console.warn('Unable to save progress to localStorage', e);
      }
    }, 150);
  }

  function getSavedProgress(quizId) {
    try {
      const data = localStorage.getItem(PROGRESS_KEY_PREFIX + quizId);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  }

  function clearSavedProgress(quizId) {
    if (!quizId) return;
    if (saveProgressTimer) clearTimeout(saveProgressTimer);
    localStorage.removeItem(PROGRESS_KEY_PREFIX + quizId);
  }

  function renderSelectScreen() {
    const main = document.getElementById('main-content');
    main.innerHTML = `
      <div class="page-header">
        <h1>${I18n.t('play.title')}</h1>
        <p>${I18n.t('play.subtitle')}</p>
      </div>

      <div class="mode-toggle" style="margin-bottom: 24px;">
        <button class="mode-btn ${currentPlayMode === 'question' ? 'active' : ''}" id="play-mode-question-btn" onclick="QuizPlayer.setPlayMode('question')">
          📝 <span data-i18n="dashboard.modeQuestion">${I18n.t('dashboard.modeQuestion')}</span>
        </button>
        <button class="mode-btn ${currentPlayMode === 'vocabulary' ? 'active' : ''}" id="play-mode-vocab-btn" onclick="QuizPlayer.setPlayMode('vocabulary')">
          🔤 <span data-i18n="dashboard.modeVocab">${I18n.t('dashboard.modeVocab')}</span>
        </button>
      </div>

      <div id="play-quiz-list" class="loading-overlay"><div class="spinner"></div></div>
    `;
    loadQuizList();
  }

  function setPlayMode(mode) {
    currentPlayMode = mode;
    localStorage.setItem('quizmaster-play-mode', mode);
    document.getElementById('play-mode-question-btn')?.classList.toggle('active', mode === 'question');
    document.getElementById('play-mode-vocab-btn')?.classList.toggle('active', mode === 'vocabulary');
    renderFilteredPlayQuizList();
  }

  async function loadQuizList(forceFetch = false) {
    try {
      const container = document.getElementById('play-quiz-list');
      if (!cachedPlayQuizzes || forceFetch) {
        const res = await fetch('/api/quizzes');
        cachedPlayQuizzes = await res.json();
      }
      if (container) container.classList.remove('loading-overlay');
      renderFilteredPlayQuizList();
    } catch (err) {
      Components.showToast(I18n.t('common.error'), 'error');
    }
  }

  function renderFilteredPlayQuizList() {
    const container = document.getElementById('play-quiz-list');
    if (!container || !cachedPlayQuizzes) return;

    const filtered = cachedPlayQuizzes.filter(q => (q.quiz_type || 'question') === currentPlayMode);

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
      const saved = getSavedProgress(q.id);
      const savedQueue = saved ? (saved.queue || saved.questionsQueue || []) : [];
      const hasSaved = saved && savedQueue.length > 0 && (saved.currentIndex || 0) < savedQueue.length;
      const savedBadge = hasSaved
        ? `<span class="resume-badge" style="display: inline-block; margin-top: 4px; background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600;">💾 ${I18n.t('resume.badge', { current: Math.min((saved.currentIndex || 0) + 1, savedQueue.length), total: savedQueue.length })}</span>`
        : '';

      return `
        <div class="card" style="margin-bottom: 12px; cursor: pointer; display: flex; align-items: center; justify-content: space-between;"
             onclick="QuizPlayer.startQuiz(${q.id})">
          <div>
            <h3 style="font-size: 17px; font-weight: 700; margin-bottom: 4px;">${Components.escapeHtml(q.title)}</h3>
            <span class="text-muted" style="font-size: 13px;">
              ${q.question_count || 0} ${I18n.t('table.questions').toLowerCase()} · 
              <span class="code-badge" style="font-size: 12px;">${q.code}</span>
            </span>
            ${savedBadge ? `<div>${savedBadge}</div>` : ''}
          </div>
          <button class="btn btn-primary" onclick="event.stopPropagation(); QuizPlayer.startQuiz(${q.id})">
            ${hasSaved ? '▶ ' + I18n.t('resume.continue') : '▶ ' + I18n.t('play.start')}
          </button>
        </div>
      `;
    }).join('');
  }

  function showResumeModal(saved, quizId) {
    const savedQueue = saved.queue || saved.questionsQueue || [];
    const total = savedQueue.length;
    const currentNum = Math.min((saved.currentIndex || 0) + 1, total);
    const correctCount = (saved.results || []).filter(r => r.isCorrect).length;

    const body = `
      <div style="text-align: center; padding: 12px 0;">
        <div style="font-size: 44px; margin-bottom: 12px;">💾</div>
        <p style="font-size: 15px; color: var(--text-secondary); margin-bottom: 14px; line-height: 1.5;">
          ${I18n.t('resume.message', { current: currentNum, total })}
        </p>
        <div style="display: inline-flex; gap: 12px; background: var(--bg-glass); padding: 8px 16px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); font-size: 13px; color: var(--text-muted);">
          <span>${I18n.t('results.correct')}: <strong style="color: #10b981;">${correctCount}</strong></span>
          <span>·</span>
          <span>${I18n.t('results.total')}: <strong>${total}</strong></span>
        </div>
      </div>
    `;

    const footer = `
      <button class="btn btn-ghost" onclick="QuizPlayer.startQuiz(${quizId}, true)">
        🔄 ${I18n.t('resume.startNew')}
      </button>
      <button class="btn btn-primary" onclick="QuizPlayer.resumeQuiz(${quizId})">
        ▶ ${I18n.t('resume.continue')}
      </button>
    `;

    Components.showModal(I18n.t('resume.title'), body, footer);
  }

  function buildFullVocabQuestions(quiz, settingsObj) {
    if (!quiz || !quiz.questions) return [];
    let raw = [...quiz.questions];
    if (settingsObj.swapQA) {
      raw = raw.map(q => ({
        ...q,
        question_text: q.correct_answer.split('/').join(' / '),
        correct_answer: q.question_text,
      }));
    }
    const fullList = [];
    const dedupeTypes = new Set(['mcq_word_ipa', 'mcq_ipa_word', 'fill_ipa_word', 'fill_word_ipa']);
    const seenDedupeKeys = new Set();

    raw.forEach(q => {
      if (dedupeTypes.has(q.question_type)) {
        const cleanPrompt = (q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0].trim().toLowerCase();
        const key = `${q.question_type}:${cleanPrompt}`;
        if (seenDedupeKeys.has(key)) return;
        seenDedupeKeys.add(key);
      }

      const isMcq = q.question_type && q.question_type.startsWith('mcq_');
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

  async function resumeQuiz(quizId) {
    try {
      Components.closeModal();
      const saved = getSavedProgress(quizId);
      if (!saved) {
        startQuiz(quizId, true);
        return;
      }

      const res = await fetch(`/api/quizzes/${quizId}`);
      if (!res.ok) throw new Error('Quiz not found');
      currentQuiz = await res.json();

      settings = {
        shuffleQuestions: localStorage.getItem('quizmaster-shuffle') === 'true',
        swapQA: localStorage.getItem('quizmaster-swap') === 'true',
        allowDuplicates: localStorage.getItem('quizmaster-allow-duplicates') === 'true',
        maxRetries: parseInt(localStorage.getItem('quizmaster-max-retries') || '-1', 10),
      };

      if (currentQuiz.quiz_type === 'vocabulary') {
        allVocabQuestions = buildFullVocabQuestions(currentQuiz, settings);
        cachedTypeCounts = null;
      } else {
        allVocabQuestions = [];
        cachedTypeCounts = null;
      }

      let rawQuestions = [...currentQuiz.questions];
      if (settings.swapQA) {
        rawQuestions = rawQuestions.map(q => ({
          ...q,
          question_text: q.correct_answer.split('/').join(' / '),
          correct_answer: q.question_text,
        }));
      }

      const questionMap = new Map(rawQuestions.map(q => [q.id, q]));
      const savedQueue = saved.queue || saved.questionsQueue || [];
      questionsQueue = savedQueue.map(item => {
        const fullQ = questionMap.get(item.id) || item;
        return {
          ...fullQ,
          _failedTries: item._failedTries,
          question_type: item.question_type || fullQ.question_type
        };
      });

      currentIndex = saved.currentIndex || 0;
      selectedQuestionType = saved.selectedQuestionType || 'all';
      results = saved.results || [];
      usedAnswers = saved.usedAnswers || {};

      Components.showToast('✅ ' + I18n.t('resume.savedNotice'), 'success');
      renderQuestion();
    } catch (err) {
      startQuiz(quizId, true);
    }
  }

  async function startQuiz(quizId, forceNew = false) {
    try {
      const saved = getSavedProgress(quizId);
      const savedQueue = saved ? (saved.queue || saved.questionsQueue || []) : [];
      if (saved && !forceNew && savedQueue.length > 0 && (saved.currentIndex || 0) < savedQueue.length) {
        showResumeModal(saved, quizId);
        return;
      }

      Components.closeModal();

      if (forceNew) {
        clearSavedProgress(quizId);
      }

      const res = await fetch(`/api/quizzes/${quizId}`);
      if (!res.ok) throw new Error('Quiz not found');
      currentQuiz = await res.json();

      if (!currentQuiz.questions || currentQuiz.questions.length === 0) {
        Components.showToast('This quiz has no questions.', 'warning');
        return;
      }

      // Load settings
      settings = {
        shuffleQuestions: localStorage.getItem('quizmaster-shuffle') === 'true',
        swapQA: localStorage.getItem('quizmaster-swap') === 'true',
        allowDuplicates: localStorage.getItem('quizmaster-allow-duplicates') === 'true',
        maxRetries: parseInt(localStorage.getItem('quizmaster-max-retries') || '-1', 10),
      };

      // Prepare questions
      let rawQueue = [...currentQuiz.questions];

      // Apply swap if enabled
      if (settings.swapQA) {
        rawQueue = rawQueue.map(q => ({
          ...q,
          question_text: q.correct_answer.split('/').join(' / '),
          correct_answer: q.question_text,
        }));
      }

      questionsQueue = [];
      rawQueue.forEach(q => {
        const isMcq = q.question_type && q.question_type.startsWith('mcq_');
        if (isMcq) {
          questionsQueue.push({ ...q });
        } else {
          const ansCount = q.correct_answer.split('/').filter(a => a.trim()).length || 1;
          for (let i = 0; i < ansCount; i++) {
            questionsQueue.push({ ...q });
          }
        }
      });

      // Shuffle if enabled
      if (settings.shuffleQuestions) {
        questionsQueue = shuffleArray(questionsQueue);
      }

      // For vocabulary quizzes, save the full list so we can filter by type
      if (currentQuiz.quiz_type === 'vocabulary') {
        allVocabQuestions = buildFullVocabQuestions(currentQuiz, settings);
        cachedTypeCounts = null;
        questionsQueue = [...allVocabQuestions];
        if (settings.shuffleQuestions) {
          questionsQueue = shuffleArray(questionsQueue);
        }
        // Apply type filter if one was selected
        if (selectedQuestionType !== 'all') {
          questionsQueue = questionsQueue.filter(q => q.question_type === selectedQuestionType);
        }
      } else {
        allVocabQuestions = [];
        cachedTypeCounts = null;
        selectedQuestionType = 'all';
      }

      currentIndex = 0;
      results = [];
      usedAnswers = {};
      renderQuestion();
    } catch (err) {
      Components.showToast(I18n.t('common.error'), 'error');
      console.error(err);
    }
  }

  function shuffleArray(arr) {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  function getUsedAnswersKey(question) {
    if (!question) return '';
    if (!question.question_type) return question.id;
    const cleanPrompt = (question.question_text || '').replace(/^🎧\s*/, '').split('|||')[0].trim().toLowerCase();
    let target = 'ans';
    if (question.question_type.endsWith('_meaning')) target = 'meaning';
    else if (question.question_type.endsWith('_word')) target = 'word';
    else if (question.question_type.endsWith('_ipa')) target = 'ipa';
    return `${cleanPrompt}_${target}`;
  }

  function renderQuestion() {
    if (currentIndex >= questionsQueue.length) {
      renderResults();
      return;
    }

    saveProgress();

    const q = questionsQueue[currentIndex];
    currentRetries = q._failedTries || 0;
    answered = false;
    const total = questionsQueue.length;
    const progress = ((currentIndex) / total) * 100;

    const main = document.getElementById('main-content');

    // Parse question text and options
    let displayQuestionText = q.question_text;
    let options = [];
    const isMcq = q.question_type && q.question_type.startsWith('mcq_');
    const isListen = q.question_type && (q.question_type.startsWith('fill_listen_') || q.question_type.startsWith('mcq_listen_'));
    const answerKey = getUsedAnswersKey(q);
    const answeredChips = !isMcq ? (usedAnswers[answerKey] || []) : [];

    if (displayQuestionText.includes('|||')) {
      const parts = displayQuestionText.split('|||');
      displayQuestionText = parts[0];
      try { options = JSON.parse(parts[1]); } catch(e) {}
    }

    if (displayQuestionText.startsWith('🎧 ')) {
      displayQuestionText = displayQuestionText.substring(2).trim();
    }

    // Determine TTS language if it's vocab mode
    let langToSpeak = 'en';
    if (currentQuiz.quiz_type === 'vocabulary') {
      const isMeaningPrompt = q.question_type === 'fill_meaning_word' || q.question_type === 'mcq_meaning_word' || q.question_type === 'mcq_meaning_ipa';
      langToSpeak = isMeaningPrompt ? currentQuiz.meaning_lang : currentQuiz.vocab_lang;
    }

    // Build media HTML
    let mediaHTML = '';
    if (q.image_path || q.audio_path) {
      mediaHTML = '<div class="question-media">';
      if (q.image_path) {
        mediaHTML += `<img src="${q.image_path}" alt="Question image" loading="lazy">`;
      }
      if (q.audio_path) {
        mediaHTML += `<audio controls src="${q.audio_path}"></audio>`;
      }
      mediaHTML += '</div>';
    }

    let questionTextHTML = '';
    const isMeaningOrIpaPrompt = q.question_type === 'fill_meaning_word' || 
                                q.question_type === 'mcq_meaning_word' || 
                                q.question_type === 'mcq_meaning_ipa' || 
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
      // Auto-play TTS when question appears
      setTimeout(() => playTTS(displayQuestionText, langToSpeak), 300);
    } else {
      // Only show TTS button for vocab mode when it's NOT a meaning or IPA prompt
      let ttsBtn = '';
      if (currentQuiz.quiz_type === 'vocabulary' && !isMeaningOrIpaPrompt) {
        ttsBtn = `<button class="tts-btn" onclick="QuizPlayer.playTTS('${Components.escapeHtml(displayQuestionText).replace(/'/g, "\\'")}', '${langToSpeak}')">🔊</button>`;
      }
      questionTextHTML = `<div class="question-text">${Components.escapeHtml(displayQuestionText)} ${ttsBtn}</div>`;
    }

    // Build Answer HTML
    let answerInputHTML = '';
    if (isMcq) {
      answerInputHTML = `
        <div class="mcq-options" id="mcq-options-container">
          ${options.map(opt => `
            <button class="mcq-option" onclick="QuizPlayer.submitMcqAnswer(this, '${Components.escapeHtml(opt).replace(/'/g, "\\'")}')">
              ${Components.escapeHtml(opt)}
            </button>
          `).join('')}
        </div>
      `;
    } else {
      const placeholderText = (currentQuiz.quiz_type === 'vocabulary' && q.question_type)
        ? I18n.t('qtype.' + q.question_type + '_desc')
        : I18n.t('play.answerPlaceholder');

      answerInputHTML = `
        <div class="answer-input-group">
          <input type="text" class="answer-input" id="answer-input" 
                 placeholder="${placeholderText}"
                 autocomplete="off" spellcheck="false"
                 onkeydown="if(event.key==='Enter') QuizPlayer.submitAnswer()">
          <button class="answer-submit-btn" id="submit-btn" onclick="QuizPlayer.submitAnswer()">
            ${I18n.t('play.submit')}
          </button>
        </div>
      `;
    }

    // Build question type selector for vocabulary quizzes
    let questionTypeSelectorHTML = '';
    if (currentQuiz.quiz_type === 'vocabulary') {
      questionTypeSelectorHTML = buildQuestionTypeSelector();
    }

    main.innerHTML = `
      <div class="quiz-player">
        <div class="quiz-progress">
          <div class="progress-bar-container">
            <div class="progress-bar" style="width: ${progress}%"></div>
          </div>
          <div class="progress-info">
            <span>${I18n.t('play.questionOf', { current: currentIndex + 1, total })}</span>
            <span class="retry-count" id="retry-display">
              🔄 ${I18n.t('play.retries')}: <span id="retry-count">${currentRetries}</span>
            </span>
          </div>
        </div>

        ${currentQuiz.quiz_type === 'vocabulary' && q.question_type && !isMcq ? `
          <div class="vocab-hint-banner">
            <span class="vocab-hint-icon">🎯</span>
            <span class="vocab-hint-label">${I18n.t('play.typeHintLabel')}:</span>
            <span class="vocab-hint-text">${I18n.t('qtype.' + q.question_type + '_desc')}</span>
          </div>
        ` : ''}

        <div class="question-card" id="question-card" style="position: relative;">
          <div style="position: absolute; top: 16px; right: 16px; display: flex; gap: 4px; flex-wrap: wrap; max-width: 50%; justify-content: flex-end;">
            ${answeredChips.map(ans => 
              `<span style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600;">✓ ${Components.escapeHtml(ans)}</span>`
            ).join('')}
          </div>
          <div class="question-number" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span>${I18n.t('play.questionOf', { current: currentIndex + 1, total })}</span>
            ${currentQuiz.quiz_type === 'vocabulary' && q.question_type && !isMcq ? `
              <span class="vocab-qtype-badge">🎯 ${I18n.t('qtype.' + q.question_type + '_desc')}</span>
            ` : ''}
          </div>
          ${questionTextHTML}
          ${mediaHTML}
          ${answerInputHTML}
          <div class="answer-feedback" id="answer-feedback"></div>
          
          <div class="auto-advance-bar-container" id="auto-advance-container">
            <div class="auto-advance-bar" id="auto-advance-bar"></div>
          </div>
        </div>

        ${questionTypeSelectorHTML}
      </div>
    `;

    // Focus input if fill-in-the-blank
    if (!isMcq) {
      setTimeout(() => {
        document.getElementById('answer-input')?.focus();
      }, 100);
    }
  }

  function playTTS(text, langCode) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    if (langCode === 'en') utterance.lang = 'en-US';
    else if (langCode === 'vi') utterance.lang = 'vi-VN';
    else if (langCode === 'zh') utterance.lang = 'zh-CN';
    else if (langCode === 'fr') utterance.lang = 'fr-FR';
    else if (langCode === 'ko') utterance.lang = 'ko-KR';
    else if (langCode === 'ru') utterance.lang = 'ru-RU';
    else if (langCode === 'ja') utterance.lang = 'ja-JP';
    window.speechSynthesis.speak(utterance);
  }

  function getTypeCounts() {
    if (cachedTypeCounts) return cachedTypeCounts;
    const counts = {};
    for (let i = 0; i < allVocabQuestions.length; i++) {
      const t = allVocabQuestions[i].question_type || 'unknown';
      counts[t] = (counts[t] || 0) + 1;
    }
    cachedTypeCounts = counts;
    return counts;
  }

  // Build question type selector buttons for vocabulary quizzes
  function buildQuestionTypeSelector() {
    const typeCounts = getTypeCounts();

    // Define the order and icons for question types
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
      { key: 'fill_ipa_word', icon: '✏️', colorClass: 'qtype-fill' },
      { key: 'fill_ipa_meaning', icon: '✏️', colorClass: 'qtype-fill' },
      { key: 'fill_listen_word', icon: '✏️', colorClass: 'qtype-fill' },
      { key: 'fill_listen_meaning', icon: '✏️', colorClass: 'qtype-fill' },
    ];

    // Only show types that actually have questions
    const availableTypes = typeDefinitions.filter(td => typeCounts[td.key] > 0);
    if (availableTypes.length <= 1) return ''; // No point showing selector if only 1 type

    const allCount = allVocabQuestions.length;
    let buttons = `
      <button class="qtype-chip ${selectedQuestionType === 'all' ? 'active qtype-all' : ''}" 
              onclick="QuizPlayer.filterByQuestionType('all')">
        <span class="qtype-chip-icon">📚</span>
        <span class="qtype-chip-label">${I18n.t('qtype.all')}</span>
        <span class="qtype-chip-count">${allCount}</span>
      </button>
    `;

    availableTypes.forEach(td => {
      const count = typeCounts[td.key];
      const isActive = selectedQuestionType === td.key;
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
    selectedQuestionType = type;
    // Re-filter from allVocabQuestions
    if (type === 'all') {
      questionsQueue = [...allVocabQuestions];
    } else {
      questionsQueue = allVocabQuestions.filter(q => q.question_type === type);
    }
    // Shuffle if enabled
    if (settings.shuffleQuestions) {
      questionsQueue = shuffleArray(questionsQueue);
    }
    currentIndex = 0;
    results = [];
    usedAnswers = {};
    renderQuestion();
  }

  function submitMcqAnswer(btnEl, userAnswer) {
    if (answered) return;
    // Visually mark the selected option immediately
    document.querySelectorAll('.mcq-option').forEach(el => el.classList.remove('selected'));
    btnEl.classList.add('selected');
    // Delegate to submitAnswer logic
    submitAnswer(userAnswer, btnEl);
  }

  function submitAnswer(overrideAnswer = null, btnEl = null) {
    if (answered) return;

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

    const q = questionsQueue[currentIndex];
    const isMcq = q.question_type && q.question_type.startsWith('mcq_');
    const isCorrect = checkAnswer(userAnswer, q.correct_answer);
    
    const feedback = document.getElementById('answer-feedback');
    let submitBtn = document.getElementById('submit-btn');

    const normalize = (str) => str.trim().toLowerCase().normalize('NFC').replace(/\s+/g, ' ');
    const answerKey = getUsedAnswersKey(q);

    if (isCorrect) {
      const normalizedAnswer = normalize(userAnswer);
      const isDuplicate = !isMcq && !settings.allowDuplicates && (usedAnswers[answerKey] || []).some(a => normalize(a) === normalizedAnswer);

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

      if (!usedAnswers[answerKey]) usedAnswers[answerKey] = [];
      usedAnswers[answerKey].push(userAnswer);

      // Correct!
      answered = true;
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
        results.push({
          question: q,
          userAnswer,
          isCorrect: true,
          retries: q._failedTries || 0,
        });
        currentIndex++;
        renderQuestion();
      };

      if (submitBtn) {
        submitBtn.textContent = currentIndex < questionsQueue.length - 1
          ? I18n.t('play.next') + ' →'
          : I18n.t('play.finish') + ' 🎉';
        submitBtn.onclick = proceedFunc;
      }

      // Auto-advance logic
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
      // Incorrect
      const currentFailures = q._failedTries || 0;
      let willRetry = false;
      
      if (settings.maxRetries === -1 || currentFailures < settings.maxRetries) {
        willRetry = true;
        const retryQ = { ...q, _failedTries: currentFailures + 1 };
        const insertIndex = currentIndex + 1 + 7;
        if (insertIndex >= questionsQueue.length) {
          questionsQueue.push(retryQ);
        } else {
          questionsQueue.splice(insertIndex, 0, retryQ);
        }
      } else {
        q._finalFailure = true;
      }

      currentRetries = currentFailures + 1;
      document.getElementById('retry-count').textContent = currentRetries;
      if (input) {
        input.style.borderColor = '';
        input.classList.add('incorrect');
        input.classList.remove('correct');
      }

      if (btnEl) {
        btnEl.classList.add('incorrect');
      }

      // Show correct answer
      feedback.style.color = '';
      const displayAnswer = q.correct_answer.includes('/')
        ? q.correct_answer.split('/').join(' / ')
        : q.correct_answer;

      feedback.className = 'answer-feedback show incorrect';
      feedback.innerHTML = I18n.t('play.incorrect', { answer: `<strong>${Components.escapeHtml(displayAnswer)}</strong>` });

      // Highlight the correct button if it's MCQ
      if (isMcq) {
        document.querySelectorAll('.mcq-option').forEach(el => {
          el.disabled = true;
          if (checkAnswer(el.textContent.trim(), q.correct_answer)) {
            el.classList.add('correct');
          }
        });
      }

      // Allow next attempt after showing answer
      answered = true;
      
      const proceedFunc = () => {
        if (!willRetry) {
          results.push({
            question: q,
            userAnswer,
            isCorrect: false,
            retries: currentRetries,
          });
        }
        currentIndex++;
        renderQuestion();
      };

      if (submitBtn) {
        submitBtn.textContent = (currentIndex < questionsQueue.length - 1 || willRetry)
          ? I18n.t('play.next') + ' →'
          : I18n.t('play.finish') + ' 🎉';
        submitBtn.onclick = proceedFunc;
      } else {
        // If it's MCQ, auto-advance on incorrect too? Or wait for click?
        // Let's add a "Next" button for MCQ since there's no input form.
        feedback.innerHTML += `<br><button class="btn btn-danger mt-2" onclick="document.getElementById('hidden-next-btn').click()">${I18n.t('play.next')} →</button>`;
        // create a hidden button to attach the proceedFunc
        const hiddenBtn = document.createElement('button');
        hiddenBtn.id = 'hidden-next-btn';
        hiddenBtn.style.display = 'none';
        hiddenBtn.onclick = proceedFunc;
        feedback.appendChild(hiddenBtn);
      }
    }
  }

  function checkAnswer(userAnswer, correctAnswer) {
    const normalize = (str) => str.trim().toLowerCase()
      .normalize('NFC')
      .replace(/\s+/g, ' ');

    const userNorm = normalize(userAnswer);

    // Support multiple correct answers separated by /
    const acceptedAnswers = correctAnswer.split('/').map(a => normalize(a));

    return acceptedAnswers.some(a => a === userNorm);
  }

  function renderResults() {
    clearSavedProgress(currentQuiz ? currentQuiz.id : null);
    const total = results.length;
    const correct = results.filter(r => r.isCorrect).length;
    const incorrect = total - correct;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

    // SVG ring
    const circumference = 2 * Math.PI * 65;
    const offset = circumference - (accuracy / 100) * circumference;

    // Determine ring color
    let ringColor;
    if (accuracy >= 80) ringColor = '#10b981';
    else if (accuracy >= 50) ringColor = '#f59e0b';
    else ringColor = '#ef4444';

    const main = document.getElementById('main-content');
    main.innerHTML = `
      <div class="results-container">
        <div class="page-header text-center">
          <h1>${I18n.t('results.title')}</h1>
          <p style="font-size: 17px; color: var(--text-secondary);">${Components.escapeHtml(currentQuiz.title)}</p>
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
            <button class="filter-btn active" onclick="QuizPlayer.filterResults('all')">${I18n.t('results.filterAll')} (${total})</button>
            <button class="filter-btn" onclick="QuizPlayer.filterResults('correct')">${I18n.t('results.filterCorrect')} (${correct})</button>
            <button class="filter-btn" onclick="QuizPlayer.filterResults('incorrect')">${I18n.t('results.filterIncorrect')} (${incorrect})</button>
          </div>
          <div id="results-list">
            ${renderResultItems('all')}
          </div>
        </div>

        <div class="btn-group" style="justify-content: center; margin-top: 24px;">
          <button class="btn btn-primary btn-lg" onclick="QuizPlayer.startQuiz(${currentQuiz.id})">
            🔄 ${I18n.t('results.playAgain')}
          </button>
          <button class="btn btn-ghost btn-lg" onclick="App.navigate('dashboard')">
            ← ${I18n.t('results.backToList')}
          </button>
        </div>
      </div>
    `;

    // Animate score ring
    setTimeout(() => {
      const circle = document.getElementById('score-ring-circle');
      if (circle) {
        circle.style.strokeDashoffset = offset;
      }
      // Animate percentage text
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
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      const current = Math.round(start + (end - start) * eased);
      el.textContent = current + '%';
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  }

  function renderResultItems(filter) {
    let filtered = results;
    if (filter === 'correct') filtered = results.filter(r => r.isCorrect);
    else if (filter === 'incorrect') filtered = results.filter(r => !r.isCorrect);

    if (filtered.length === 0) {
      return `<div class="text-center text-muted" style="padding: 24px;">—</div>`;
    }

    return filtered.map((r, i) => {
      const icon = r.isCorrect ? '✅' : '❌';
      
      // Clean up display question text (remove ||| options and 🎧 prefix)
      let displayQText = r.question.question_text || '';
      if (displayQText.includes('|||')) {
        displayQText = displayQText.split('|||')[0];
      }
      if (displayQText.startsWith('🎧 ')) {
        displayQText = displayQText.substring(2).trim();
      }

      const displayAnswer = r.question.correct_answer.includes('/')
        ? r.question.correct_answer.split('/').join(' / ')
        : r.question.correct_answer;

      let answerDetail;
      if (r.isCorrect) {
        answerDetail = `
          <span>${I18n.t('results.yourAnswer')}: <strong class="text-success">${Components.escapeHtml(r.userAnswer)}</strong></span>
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

  function filterResults(filter) {
    // Update filter buttons
    document.querySelectorAll('#results-filter .filter-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    event.target.classList.add('active');

    // Re-render results
    document.getElementById('results-list').innerHTML = renderResultItems(filter);
  }

  return {
    renderSelectScreen,
    setPlayMode,
    startQuiz,
    resumeQuiz,
    getSavedProgress,
    clearSavedProgress,
    submitAnswer,
    submitMcqAnswer,
    playTTS,
    filterResults,
    filterByQuestionType,
  };
})();
