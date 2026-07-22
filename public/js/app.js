// ============================================
// App - Main Application Router & Controller
// ============================================

const App = (() => {
  // Initialize
  function init() {
    // Set language from storage
    const savedLang = localStorage.getItem('quizmaster-lang') || 'vi';
    I18n.setLang(savedLang);

    // Brand click goes to dashboard
    document.querySelector('.navbar-brand').addEventListener('click', () => {
      navigate('dashboard');
    });

    // Handle hash routing
    window.addEventListener('hashchange', handleRoute);

    // Initial route
    handleRoute();
  }

  function handleRoute() {
    const hash = window.location.hash.slice(1) || 'dashboard';
    const [route, ...params] = hash.split('/');

    switch (route) {
      case 'dashboard':
        renderDashboard();
        break;
      case 'play':
        if (params[0]) {
          QuizPlayer.startQuiz(parseInt(params[0]));
        } else {
          QuizPlayer.renderSelectScreen();
        }
        break;
      case 'create':
        if (currentDashboardMode === 'vocabulary') {
          VocabEditor.render();
        } else {
          QuizEditor.render();
        }
        break;
      case 'create-vocab':
        VocabEditor.render();
        break;
      case 'edit':
        QuizEditor.render(parseInt(params[0]));
        break;
      case 'edit-vocab':
        VocabEditor.render(parseInt(params[0]));
        break;
      case 'import':
        QuizImport.render();
        break;
      case 'settings':
        renderSettings();
        break;
      default:
        renderDashboard();
    }

    // Update active nav state
    updateActiveNav(route);
  }

  function navigate(route, param = '') {
    const targetHash = param ? `${route}/${param}` : route;
    if (window.location.hash === `#${targetHash}`) {
      handleRoute();
    } else {
      window.location.hash = targetHash;
    }
  }

  function updateActiveNav(route) {
    const navMap = {
      'dashboard': null,
      'play': 'btn-play',
      'create': 'btn-create',
      'create-vocab': 'btn-create',
      'edit': 'btn-create',
      'edit-vocab': 'btn-create',
      'import': 'btn-import',
      'settings': 'btn-settings',
    };

    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.style.background = '';
      btn.style.borderColor = '';
    });

    const activeId = navMap[route];
    if (activeId) {
      const btn = document.getElementById(activeId);
      if (btn) {
        btn.style.background = 'rgba(99, 102, 241, 0.15)';
        btn.style.borderColor = 'rgba(99, 102, 241, 0.3)';
      }
    }
  }

  let currentDashboardMode = localStorage.getItem('quizmaster-dashboard-mode') || 'question';

  async function renderDashboard() {
    const main = document.getElementById('main-content');
    main.innerHTML = `
      <div class="page-header">
        <h1>${I18n.t('dashboard.title')}</h1>
        <p>${I18n.t('dashboard.subtitle')}</p>
      </div>

      <div class="mode-toggle">
        <button class="mode-btn ${currentDashboardMode === 'question' ? 'active' : ''}" id="mode-question-btn" onclick="App.setDashboardMode('question')">
          📝 <span data-i18n="dashboard.modeQuestion">Chế độ Câu hỏi</span>
        </button>
        <button class="mode-btn ${currentDashboardMode === 'vocabulary' ? 'active' : ''}" id="mode-vocab-btn" onclick="App.setDashboardMode('vocabulary')">
          🔤 <span data-i18n="dashboard.modeVocab">Chế độ Từ vựng</span>
        </button>
      </div>

      <div class="card">
        <div class="card-header">
          <input type="text" class="form-input" id="search-quiz" 
                 placeholder="${I18n.t('dashboard.search')}" 
                 style="max-width: 300px;"
                 oninput="App.searchQuizzes(this.value)">
          <button class="btn btn-success" onclick="App.createNewQuiz()">
            ＋ ${I18n.t('nav.create')}
          </button>
        </div>
        <div id="quiz-list-container" class="loading-overlay">
          <div class="spinner"></div>
        </div>
      </div>
    `;
    I18n.updateDOM();
    loadDashboardQuizzes();
  }

  function setDashboardMode(mode) {
    currentDashboardMode = mode;
    localStorage.setItem('quizmaster-dashboard-mode', mode);
    document.getElementById('mode-question-btn')?.classList.toggle('active', mode === 'question');
    document.getElementById('mode-vocab-btn')?.classList.toggle('active', mode === 'vocabulary');
    searchQuizzes(document.getElementById('search-quiz')?.value || '');
  }

  function createNewQuiz() {
    showCreateQuizModal();
  }

  function showCreateQuizModal() {
    const body = `
      <p style="text-align: center; color: var(--text-secondary); margin-bottom: 20px;" data-i18n="createModal.subtitle">
        ${I18n.t('createModal.subtitle')}
      </p>
      <div class="create-mode-options">
        <div class="create-mode-card" onclick="App.closeModal(); App.navigate('create');">
          <div style="font-size: 36px; margin-bottom: 12px;">📝</div>
          <h4 style="font-size: 16px; font-weight: 700; margin-bottom: 6px;" data-i18n="dashboard.modeQuestion">${I18n.t('dashboard.modeQuestion')}</h4>
          <p style="font-size: 13px; color: var(--text-muted); line-height: 1.4;" data-i18n="createModal.questionDesc">${I18n.t('createModal.questionDesc')}</p>
        </div>
        <div class="create-mode-card" onclick="App.closeModal(); App.navigate('create-vocab');">
          <div style="font-size: 36px; margin-bottom: 12px;">🔤</div>
          <h4 style="font-size: 16px; font-weight: 700; margin-bottom: 6px;" data-i18n="dashboard.modeVocab">${I18n.t('dashboard.modeVocab')}</h4>
          <p style="font-size: 13px; color: var(--text-muted); line-height: 1.4;" data-i18n="createModal.vocabDesc">${I18n.t('createModal.vocabDesc')}</p>
        </div>
      </div>
    `;
    const footer = `
      <button class="btn btn-ghost" onclick="App.closeModal()">${I18n.t('common.cancel')}</button>
    `;

    Components.showModal(I18n.t('createModal.title'), body, footer);
  }

  let allQuizzes = [];

  async function loadDashboardQuizzes() {
    try {
      const res = await fetch('/api/quizzes');
      allQuizzes = await res.json();
      searchQuizzes(document.getElementById('search-quiz')?.value || '');
    } catch (err) {
      document.getElementById('quiz-list-container').innerHTML =
        `<div class="text-center text-muted" style="padding: 40px;">${I18n.t('common.error')}</div>`;
    }
  }

  function searchQuizzes(query = '') {
    const q = query.toLowerCase().trim();
    let filtered = allQuizzes.filter(quiz => 
      (quiz.quiz_type || 'question') === currentDashboardMode
    );

    if (q) {
      filtered = filtered.filter(quiz =>
        quiz.title.toLowerCase().includes(q) || quiz.code.includes(q)
      );
    }
    
    document.getElementById('quiz-list-container').innerHTML =
      Components.renderQuizTable(filtered);
  }

  // Settings page
  function renderSettings() {
    const shuffleEnabled = localStorage.getItem('quizmaster-shuffle') === 'true';
    const swapEnabled = localStorage.getItem('quizmaster-swap') === 'true';
    const duplicatesEnabled = localStorage.getItem('quizmaster-allow-duplicates') === 'true';
    const maxRetries = localStorage.getItem('quizmaster-max-retries') || '-1';
    let rawAutoAdvance = localStorage.getItem('quizmaster-auto-advance') || '1500';
    let autoAdvanceNum = parseFloat(rawAutoAdvance);
    if (isNaN(autoAdvanceNum) || autoAdvanceNum < 0) {
      autoAdvanceNum = 1500;
    }
    const autoAdvance = autoAdvanceNum.toString();
    const presetValues = ['0', '500', '1000', '1500', '2000', '3000'];
    const isCustomAuto = !presetValues.includes(autoAdvance);
    const customSec = (autoAdvanceNum / 1000).toFixed(1);
    const currentLang = I18n.getLang();

    const main = document.getElementById('main-content');
    main.innerHTML = `
      <div class="page-header">
        <h1>${I18n.t('settings.title')}</h1>
        <p>${I18n.t('settings.subtitle')}</p>
      </div>

      <div class="card" style="margin-bottom: 24px;">
        <h3 class="settings-section-title">🎮 ${I18n.t('settings.gameplay')}</h3>
        
        <div class="toggle-group">
          <div class="toggle-info">
            <span class="toggle-label">${I18n.t('settings.shuffleQuestions')}</span>
            <span class="toggle-desc">${I18n.t('settings.shuffleQuestionsDesc')}</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="toggle-shuffle" ${shuffleEnabled ? 'checked' : ''}
                   onchange="App.updateSetting('shuffle', this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div class="toggle-group">
          <div class="toggle-info">
            <span class="toggle-label">${I18n.t('settings.allowDuplicates')}</span>
            <span class="toggle-desc">${I18n.t('settings.allowDuplicatesDesc')}</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="toggle-duplicates" ${duplicatesEnabled ? 'checked' : ''}
                   onchange="App.updateSetting('allow-duplicates', this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div class="toggle-group">
          <div class="toggle-info">
            <span class="toggle-label">${I18n.t('settings.maxRetries')}</span>
            <span class="toggle-desc">${I18n.t('settings.maxRetriesDesc')}</span>
          </div>
          <select class="form-select" id="max-retries-select" style="width: auto; min-width: 140px;"
                  onchange="App.updateSetting('max-retries', this.value)">
            <option value="0" ${maxRetries === '0' ? 'selected' : ''}>${I18n.t('settings.noRetry')}</option>
            <option value="1" ${maxRetries === '1' ? 'selected' : ''}>${I18n.t('settings.retryTimes', {count: 1})}</option>
            <option value="2" ${maxRetries === '2' ? 'selected' : ''}>${I18n.t('settings.retryTimes', {count: 2})}</option>
            <option value="3" ${maxRetries === '3' ? 'selected' : ''}>${I18n.t('settings.retryTimes', {count: 3})}</option>
            <option value="5" ${maxRetries === '5' ? 'selected' : ''}>${I18n.t('settings.retryTimes', {count: 5})}</option>
            <option value="-1" ${maxRetries === '-1' ? 'selected' : ''}>${I18n.t('settings.unlimited')}</option>
          </select>
        </div>

        <div class="toggle-group">
          <div class="toggle-info">
            <span class="toggle-label" data-i18n="settings.swapQA">${I18n.t('settings.swapQA')}</span>
            <span class="toggle-desc" data-i18n="settings.swapQADesc">${I18n.t('settings.swapQADesc')}</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="toggle-swap" ${swapEnabled ? 'checked' : ''}
                   onchange="App.updateSetting('swap', this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div class="toggle-group">
          <div class="toggle-info">
            <span class="toggle-label" data-i18n="settings.autoAdvance">${I18n.t('settings.autoAdvance')}</span>
            <span class="toggle-desc" data-i18n="settings.autoAdvanceDesc">${I18n.t('settings.autoAdvanceDesc')}</span>
          </div>
          <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            <select class="form-select" id="auto-advance-select" style="width: auto; min-width: 140px;"
                    onchange="App.onAutoAdvanceSelectChange(this.value)">
              <option value="0" ${autoAdvance === '0' ? 'selected' : ''}>${I18n.t('settings.instant')}</option>
              <option value="500" ${autoAdvance === '500' ? 'selected' : ''}>0.5s</option>
              <option value="1000" ${autoAdvance === '1000' ? 'selected' : ''}>1.0s</option>
              <option value="1500" ${autoAdvance === '1500' ? 'selected' : ''}>1.5s</option>
              <option value="2000" ${autoAdvance === '2000' ? 'selected' : ''}>2.0s</option>
              <option value="3000" ${autoAdvance === '3000' ? 'selected' : ''}>3.0s</option>
              <option value="custom" ${isCustomAuto ? 'selected' : ''}>${I18n.t('settings.custom')}</option>
            </select>
            <div id="auto-advance-custom-container" class="${isCustomAuto ? '' : 'hidden'}" style="display: flex; align-items: center; gap: 6px;">
              <input type="number" id="auto-advance-custom-input" class="form-input" style="width: 90px; padding: 8px 12px;"
                     min="0" max="10" step="0.1" value="${customSec}"
                     oninput="App.onAutoAdvanceCustomInput(this.value)">
              <span style="font-size: 14px; color: var(--text-secondary);">s</span>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <h3 class="settings-section-title">🌐 ${I18n.t('settings.language')}</h3>
        
        <div class="toggle-group">
          <div class="toggle-info">
            <span class="toggle-label">${I18n.t('settings.langLabel')}</span>
            <span class="toggle-desc">${I18n.t('settings.langDesc')}</span>
          </div>
          <select class="form-select" id="lang-select" style="width: auto; min-width: 160px;"
                  onchange="App.changeLang(this.value)">
            <option value="vi" ${currentLang === 'vi' ? 'selected' : ''}>🇻🇳 Tiếng Việt</option>
            <option value="en" ${currentLang === 'en' ? 'selected' : ''}>🇬🇧 English</option>
          </select>
        </div>
      </div>
    `;
    I18n.updateDOM();
  }

  function updateSetting(key, value) {
    localStorage.setItem(`quizmaster-${key}`, value);
    Components.showToast('✅ ' + I18n.t('create.saved'), 'success');
  }

  function onAutoAdvanceSelectChange(val) {
    const customContainer = document.getElementById('auto-advance-custom-container');
    if (val === 'custom') {
      customContainer?.classList.remove('hidden');
      const inputEl = document.getElementById('auto-advance-custom-input');
      const numSec = parseFloat(inputEl?.value || '1.5');
      const validSec = isNaN(numSec) || numSec < 0 ? 1.5 : numSec;
      updateSetting('auto-advance', Math.round(validSec * 1000).toString());
    } else {
      customContainer?.classList.add('hidden');
      updateSetting('auto-advance', val);
    }
  }

  function onAutoAdvanceCustomInput(val) {
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      updateSetting('auto-advance', Math.round(num * 1000).toString());
    }
  }

  function changeLang(lang) {
    I18n.setLang(lang);
    // Re-render the settings page and update all nav text
    renderSettings();
    I18n.updateDOM();
  }

  // Quiz Code Modal
  function showCodeModal() {
    const body = `
      <p style="text-align: center; color: var(--text-secondary); margin-bottom: 16px;">
        ${I18n.t('code.subtitle')}
      </p>
      <div class="code-input-group" id="code-input-group">
        <input type="text" class="code-digit" maxlength="1" data-index="0" inputmode="numeric">
        <input type="text" class="code-digit" maxlength="1" data-index="1" inputmode="numeric">
        <input type="text" class="code-digit" maxlength="1" data-index="2" inputmode="numeric">
        <input type="text" class="code-digit" maxlength="1" data-index="3" inputmode="numeric">
        <input type="text" class="code-digit" maxlength="1" data-index="4" inputmode="numeric">
        <input type="text" class="code-digit" maxlength="1" data-index="5" inputmode="numeric">
      </div>
      <div id="code-error" class="text-center text-danger" style="margin-top: 8px; font-size: 13px; display: none;"></div>
    `;
    const footer = `
      <button class="btn btn-ghost" onclick="App.closeModal()">${I18n.t('common.cancel')}</button>
      <button class="btn btn-primary" id="code-submit-btn" onclick="App.submitCode()">${I18n.t('code.submit')}</button>
    `;

    Components.showModal(I18n.t('code.title'), body, footer);

    // Setup code digit inputs
    setTimeout(() => {
      const inputs = document.querySelectorAll('.code-digit');
      inputs[0]?.focus();

      inputs.forEach((input, i) => {
        input.addEventListener('input', (e) => {
          const val = e.target.value;
          if (val && i < 5) {
            inputs[i + 1].focus();
          }
          // Auto-submit when all 6 digits entered
          const code = Array.from(inputs).map(inp => inp.value).join('');
          if (code.length === 6) {
            submitCode();
          }
        });

        input.addEventListener('keydown', (e) => {
          if (e.key === 'Backspace' && !input.value && i > 0) {
            inputs[i - 1].focus();
          }
        });

        // Allow paste
        input.addEventListener('paste', (e) => {
          e.preventDefault();
          const pasted = (e.clipboardData || window.clipboardData).getData('text').trim();
          if (/^\d{6}$/.test(pasted)) {
            inputs.forEach((inp, j) => { inp.value = pasted[j]; });
            inputs[5].focus();
            setTimeout(() => submitCode(), 100);
          }
        });
      });
    }, 200);
  }

  async function submitCode() {
    const inputs = document.querySelectorAll('.code-digit');
    const code = Array.from(inputs).map(inp => inp.value).join('');
    const errorEl = document.getElementById('code-error');

    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      if (errorEl) {
        errorEl.textContent = I18n.t('code.invalid');
        errorEl.style.display = 'block';
      }
      return;
    }

    try {
      const res = await fetch(`/api/quizzes/code/${code}`);
      if (!res.ok) {
        if (errorEl) {
          errorEl.textContent = I18n.t('code.notFound');
          errorEl.style.display = 'block';
        }
        return;
      }

      const quiz = await res.json();
      closeModal();
      QuizPlayer.startQuiz(quiz.id);
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = I18n.t('common.error');
        errorEl.style.display = 'block';
      }
    }
  }

  function closeModal() {
    Components.closeModal();
  }

  // Quiz Actions
  function playQuiz(id) {
    navigate('play', id);
  }

  function editQuiz(id, type = 'question') {
    if (type === 'vocabulary') {
      navigate('edit-vocab', id);
    } else {
      navigate('edit', id);
    }
  }

  function deleteQuiz(id, title) {
    Components.showConfirm(
      I18n.t('common.delete'),
      I18n.t('common.deleteQuizConfirm', { title }),
      async () => {
        try {
          const res = await fetch(`/api/quizzes/${id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('Delete failed');
          Components.showToast('🗑 Quiz deleted!', 'success');
          loadDashboardQuizzes();
        } catch (err) {
          Components.showToast(I18n.t('common.error'), 'error');
        }
      }
    );
  }

  // Copy code to clipboard
  function copyCode(code) {
    navigator.clipboard.writeText(code).then(() => {
      Components.showToast(I18n.t('common.copied'), 'success');
    }).catch(() => {
      // Fallback for http
      const textarea = document.createElement('textarea');
      textarea.value = code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      Components.showToast(I18n.t('common.copied'), 'success');
    });
  }

  // Mobile menu
  function toggleMobileMenu() {
    const menu = document.getElementById('mobile-menu');
    const overlay = document.getElementById('mobile-menu-overlay');
    menu.classList.toggle('active');
    overlay.classList.toggle('active');
  }

  // Init on DOM ready
  document.addEventListener('DOMContentLoaded', init);

  return {
    navigate,
    renderDashboard,
    renderSettings,
    searchQuizzes,
    showCodeModal,
    submitCode,
    closeModal,
    setDashboardMode,
    createNewQuiz,
    showCreateQuizModal,
    playQuiz,
    editQuiz,
    deleteQuiz,
    copyCode,
    updateSetting,
    onAutoAdvanceSelectChange,
    onAutoAdvanceCustomInput,
    changeLang,
    toggleMobileMenu,
  };
})();
