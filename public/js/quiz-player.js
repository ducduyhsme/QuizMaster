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

  function renderSelectScreen() {
    const main = document.getElementById('main-content');
    main.innerHTML = `
      <div class="page-header">
        <h1>${I18n.t('play.title')}</h1>
        <p>${I18n.t('play.subtitle')}</p>
      </div>
      <div id="play-quiz-list" class="loading-overlay"><div class="spinner"></div></div>
    `;
    loadQuizList();
  }

  async function loadQuizList() {
    try {
      const res = await fetch('/api/quizzes');
      const quizzes = await res.json();
      const container = document.getElementById('play-quiz-list');
      container.classList.remove('loading-overlay');

      if (quizzes.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <span class="empty-icon">🎮</span>
            <h3>${I18n.t('dashboard.empty')}</h3>
            <p>${I18n.t('dashboard.emptyHint')}</p>
          </div>
        `;
        return;
      }

      container.innerHTML = quizzes.map(q => `
        <div class="card" style="margin-bottom: 12px; cursor: pointer; display: flex; align-items: center; justify-content: space-between;"
             onclick="QuizPlayer.startQuiz(${q.id})">
          <div>
            <h3 style="font-size: 17px; font-weight: 700; margin-bottom: 4px;">${Components.escapeHtml(q.title)}</h3>
            <span class="text-muted" style="font-size: 13px;">
              ${q.question_count || 0} ${I18n.t('table.questions').toLowerCase()} · 
              <span class="code-badge" style="font-size: 12px;">${q.code}</span>
            </span>
          </div>
          <button class="btn btn-primary" onclick="event.stopPropagation(); QuizPlayer.startQuiz(${q.id})">
            ▶ ${I18n.t('play.start')}
          </button>
        </div>
      `).join('');
    } catch (err) {
      Components.showToast(I18n.t('common.error'), 'error');
    }
  }

  async function startQuiz(quizId) {
    try {
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
        const ansCount = q.correct_answer.split('/').filter(a => a.trim()).length || 1;
        for (let i = 0; i < ansCount; i++) {
          questionsQueue.push({ ...q });
        }
      });

      // Shuffle if enabled
      if (settings.shuffleQuestions) {
        questionsQueue = shuffleArray(questionsQueue);
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

  function renderQuestion() {
    if (currentIndex >= questionsQueue.length) {
      renderResults();
      return;
    }

    const q = questionsQueue[currentIndex];
    currentRetries = q._failedTries || 0;
    answered = false;
    const total = questionsQueue.length;
    const progress = ((currentIndex) / total) * 100;

    const main = document.getElementById('main-content');

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

        <div class="question-card" id="question-card" style="position: relative;">
          <div style="position: absolute; top: 16px; right: 16px; display: flex; gap: 4px; flex-wrap: wrap; max-width: 50%; justify-content: flex-end;">
            ${(usedAnswers[q.id] || []).map(ans => 
              `<span style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600;">${Components.escapeHtml(ans)}</span>`
            ).join('')}
          </div>
          <div class="question-number">
            ${I18n.t('play.questionOf', { current: currentIndex + 1, total })}
          </div>
          <div class="question-text">${Components.escapeHtml(q.question_text)}</div>
          ${mediaHTML}
          <div class="answer-input-group">
            <input type="text" class="answer-input" id="answer-input" 
                   placeholder="${I18n.t('play.answerPlaceholder')}"
                   autocomplete="off" spellcheck="false"
                   onkeydown="if(event.key==='Enter') QuizPlayer.submitAnswer()">
            <button class="answer-submit-btn" id="submit-btn" onclick="QuizPlayer.submitAnswer()">
              ${I18n.t('play.submit')}
            </button>
          </div>
          <div class="answer-feedback" id="answer-feedback"></div>
        </div>
      </div>
    `;

    // Focus input
    setTimeout(() => {
      document.getElementById('answer-input')?.focus();
    }, 100);
  }

  function submitAnswer() {
    if (answered) return;

    const input = document.getElementById('answer-input');
    const feedback = document.getElementById('answer-feedback');
    const submitBtn = document.getElementById('submit-btn');
    const userAnswer = input.value.trim();

    if (!userAnswer) {
      input.focus();
      return;
    }

    const q = questionsQueue[currentIndex];
    const isCorrect = checkAnswer(userAnswer, q.correct_answer);

    const normalize = (str) => str.trim().toLowerCase().normalize('NFC').replace(/\s+/g, ' ');

    if (isCorrect) {
      const normalizedAnswer = normalize(userAnswer);
      const isDuplicate = !settings.allowDuplicates && (usedAnswers[q.id] || []).some(a => normalize(a) === normalizedAnswer);

      if (isDuplicate) {
        input.classList.remove('incorrect', 'correct');
        input.style.borderColor = '#f59e0b';
        feedback.className = 'answer-feedback show';
        feedback.style.color = '#f59e0b';
        feedback.textContent = I18n.t('play.alreadyAnswered');
        return;
      }

      if (!usedAnswers[q.id]) usedAnswers[q.id] = [];
      usedAnswers[q.id].push(userAnswer);

      // Correct!
      answered = true;
      input.style.borderColor = '';
      input.classList.add('correct');
      input.classList.remove('incorrect');
      feedback.className = 'answer-feedback show correct';
      feedback.style.color = '';
      feedback.textContent = I18n.t('play.correct');
      submitBtn.textContent = currentIndex < questionsQueue.length - 1
        ? I18n.t('play.next') + ' →'
        : I18n.t('play.finish') + ' 🎉';
      submitBtn.onclick = () => {
        results.push({
          question: q,
          userAnswer,
          isCorrect: true,
          retries: q._failedTries || 0,
        });
        currentIndex++;
        renderQuestion();
      };
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
      input.style.borderColor = '';
      input.classList.add('incorrect');
      input.classList.remove('correct');

      // Show correct answer
      feedback.style.color = '';
      const displayAnswer = q.correct_answer.includes('/')
        ? q.correct_answer.split('/').join(' / ')
        : q.correct_answer;

      feedback.className = 'answer-feedback show incorrect';
      feedback.innerHTML = I18n.t('play.incorrect', { answer: `<strong>${Components.escapeHtml(displayAnswer)}</strong>` });

      // Allow next attempt after showing answer
      answered = true;
      submitBtn.textContent = (currentIndex < questionsQueue.length - 1 || willRetry)
        ? I18n.t('play.next') + ' →'
        : I18n.t('play.finish') + ' 🎉';
      
      submitBtn.onclick = () => {
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
      let answerDetail;

      if (r.isCorrect) {
        if (r.retries === 0) {
          answerDetail = `<span class="text-success">${I18n.t('results.firstTry')}</span>`;
        } else {
          answerDetail = `
            <span>${I18n.t('results.yourAnswer')}: <strong>${Components.escapeHtml(r.userAnswer)}</strong></span>
          `;
        }
      } else {
        const displayAnswer = r.question.correct_answer.includes('/')
          ? r.question.correct_answer.split('/').join(' / ')
          : r.question.correct_answer;
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
            <div class="result-question">${Components.escapeHtml(r.question.question_text)}</div>
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
    startQuiz,
    submitAnswer,
    filterResults,
  };
})();
