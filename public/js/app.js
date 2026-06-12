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
        QuizEditor.render();
        break;
      case 'edit':
        QuizEditor.render(parseInt(params[0]));
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
    window.location.hash = param ? `${route}/${param}` : route;
  }

  function updateActiveNav(route) {
    const navMap = {
      'dashboard': null,
      'play': 'btn-play',
      'create': 'btn-create',
      'edit': 'btn-create',
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

  // Dashboard
  async function renderDashboard() {
    const main = document.getElementById('main-content');
    main.innerHTML = `
      <div class="page-header">
        <h1>${I18n.t('dashboard.title')}</h1>
        <p>${I18n.t('dashboard.subtitle')}</p>
      </div>
      <div class="card">
        <div class="card-header">
          <input type="text" class="form-input" id="search-quiz" 
                 placeholder="${I18n.t('dashboard.search')}" 
                 style="max-width: 300px;"
                 oninput="App.searchQuizzes(this.value)">
          <button class="btn btn-success" onclick="App.navigate('create')">
            ＋ ${I18n.t('nav.create')}
          </button>
        </div>
        <div id="quiz-list-container" class="loading-overlay">
          <div class="spinner"></div>
        </div>
      </div>
    `;
    loadDashboardQuizzes();
  }

  let allQuizzes = [];

  async function loadDashboardQuizzes() {
    try {
      const res = await fetch('/api/quizzes');
      allQuizzes = await res.json();
      document.getElementById('quiz-list-container').innerHTML =
        Components.renderQuizTable(allQuizzes);
    } catch (err) {
      document.getElementById('quiz-list-container').innerHTML =
        `<div class="text-center text-muted" style="padding: 40px;">${I18n.t('common.error')}</div>`;
    }
  }

  function searchQuizzes(query) {
    const q = query.toLowerCase().trim();
    if (!q) {
      document.getElementById('quiz-list-container').innerHTML =
        Components.renderQuizTable(allQuizzes);
      return;
    }
    const filtered = allQuizzes.filter(quiz =>
      quiz.title.toLowerCase().includes(q) || quiz.code.includes(q)
    );
    document.getElementById('quiz-list-container').innerHTML =
      Components.renderQuizTable(filtered);
  }

  // Settings page
  function renderSettings() {
    const shuffleEnabled = localStorage.getItem('quizmaster-shuffle') === 'true';
    const swapEnabled = localStorage.getItem('quizmaster-swap') === 'true';
    const duplicatesEnabled = localStorage.getItem('quizmaster-allow-duplicates') === 'true';
    const maxRetries = localStorage.getItem('quizmaster-max-retries') || '-1';
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
            <span class="toggle-label">${I18n.t('settings.swapQA')}</span>
            <span class="toggle-desc">${I18n.t('settings.swapQADesc')}</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="toggle-swap" ${swapEnabled ? 'checked' : ''}
                   onchange="App.updateSetting('swap', this.checked)">
            <span class="toggle-slider"></span>
          </label>
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
  }

  function updateSetting(key, value) {
    localStorage.setItem(`quizmaster-${key}`, value);
    Components.showToast('✅ ' + I18n.t('create.saved'), 'success');
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

  function editQuiz(id) {
    navigate('edit', id);
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
    searchQuizzes,
    showCodeModal,
    submitCode,
    closeModal,
    playQuiz,
    editQuiz,
    deleteQuiz,
    copyCode,
    updateSetting,
    changeLang,
    toggleMobileMenu,
  };
})();
