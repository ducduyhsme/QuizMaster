const CommunityView = (() => {
  const containerId = 'main-content';
  let activeFilter = 'all'; // 'all', 'vocabulary', 'question'

  async function render() {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="page-header" style="margin-bottom: 24px;">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
          <div>
            <h1 style="font-size: 28px; font-weight: 800; display: flex; align-items: center; gap: 10px;">
              <span>🌐</span> ${I18n.t('community.title')}
            </h1>
            <p style="font-size: 14px; color: var(--text-secondary); margin-top: 4px;">
              ${I18n.t('community.subtitle')}
            </p>
          </div>
          <div id="community-stats-bar" style="display: flex; gap: 12px; flex-wrap: wrap;"></div>
        </div>
      </div>

      <div class="card mb-6" style="padding: 20px 24px; margin-bottom: 24px; border-radius: var(--radius-lg);">
        <div style="display: flex; gap: 16px; align-items: center; flex-wrap: wrap; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 280px;">
            <div style="position: relative; width: 100%;">
              <input type="text" id="community-search-input" class="form-input" 
                     placeholder="${I18n.t('community.searchPlaceholder')}" 
                     oninput="CommunityView.onSearchInput(this.value)"
                     style="padding-left: 16px; font-size: 14px;">
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <div class="btn-group" style="display: flex; gap: 6px; background: var(--bg-glass); padding: 4px; border-radius: 10px; border: 1px solid var(--border-color);">
              <button class="btn btn-sm ${activeFilter === 'all' ? 'btn-primary' : 'btn-ghost'}" id="filter-all-btn" onclick="CommunityView.setFilter('all')" style="border-radius: 8px;">
                ${I18n.t('community.filterAll')}
              </button>
              <button class="btn btn-sm ${activeFilter === 'vocabulary' ? 'btn-primary' : 'btn-ghost'}" id="filter-vocab-btn" onclick="CommunityView.setFilter('vocabulary')" style="border-radius: 8px;">
                ${I18n.t('community.filterVocab')}
              </button>
              <button class="btn btn-sm ${activeFilter === 'question' ? 'btn-primary' : 'btn-ghost'}" id="filter-question-btn" onclick="CommunityView.setFilter('question')" style="border-radius: 8px;">
                ${I18n.t('community.filterQuestion')}
              </button>
            </div>

            <button class="btn btn-ghost btn-sm" onclick="CommunityView.loadQuizzes()" title="${I18n.t('community.refresh')}" style="padding: 8px 14px;">
              ${I18n.t('community.refresh')}
            </button>
          </div>
        </div>
      </div>

      <div id="community-quiz-list" class="quiz-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 24px;">
        <div style="grid-column: 1 / -1; text-align: center; padding: 60px 0;">
          <div class="spinner"></div>
        </div>
      </div>
    `;

    loadQuizzes();
  }

  function setFilter(filter) {
    activeFilter = filter;
    document.getElementById('filter-all-btn')?.classList.toggle('btn-primary', filter === 'all');
    document.getElementById('filter-all-btn')?.classList.toggle('btn-ghost', filter !== 'all');
    
    document.getElementById('filter-vocab-btn')?.classList.toggle('btn-primary', filter === 'vocabulary');
    document.getElementById('filter-vocab-btn')?.classList.toggle('btn-ghost', filter !== 'vocabulary');

    document.getElementById('filter-question-btn')?.classList.toggle('btn-primary', filter === 'question');
    document.getElementById('filter-question-btn')?.classList.toggle('btn-ghost', filter !== 'question');

    loadQuizzes(document.getElementById('community-search-input')?.value || '');
  }

  let searchTimeout = null;
  function onSearchInput(val) {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      loadQuizzes(val);
    }, 300);
  }

  async function loadQuizzes(query = '') {
    const listContainer = document.getElementById('community-quiz-list');
    if (!listContainer) return;

    try {
      const url = query ? `/api/community/quizzes?q=${encodeURIComponent(query)}` : '/api/community/quizzes';
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || I18n.t('common.error'));
      let quizzes = Array.isArray(data) ? data : [];

      // Filter by type
      if (activeFilter !== 'all') {
        quizzes = quizzes.filter(q => (q.quiz_type || 'question') === activeFilter);
      }

      // Update stats bar
      updateStatsBar(data);

      if (!quizzes || quizzes.length === 0) {
        listContainer.innerHTML = `
          <div class="card" style="grid-column: 1 / -1; text-align: center; padding: 64px 24px; border-radius: 16px;">
            <div style="font-size: 56px; margin-bottom: 16px; opacity: 0.8;">🌐</div>
            <h3 style="font-size: 20px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">
              ${query ? I18n.t('community.emptySearchTitle') : I18n.t('community.emptyTitle')}
            </h3>
            <p style="font-size: 14px; color: var(--text-secondary); max-width: 480px; margin: 0 auto 24px; line-height: 1.6;">
              ${I18n.t('community.emptyHint')}
            </p>
          </div>
        `;
        return;
      }

      listContainer.innerHTML = quizzes.map(q => {
        const title = Components.escapeHtml(q.title);
        const desc = Components.escapeHtml(q.description || I18n.t('community.noDescription'));
        const ownerName = Components.escapeHtml(q.owner_name || 'Admin');
        const count = q.question_count || 0;
        const isVocab = q.quiz_type === 'vocabulary';

        const typeBadge = isVocab
          ? `<span style="background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">${I18n.t('dashboard.typeVocab')}</span>`
          : `<span style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">${I18n.t('dashboard.typeQuestion')}</span>`;

        const publicBadge = `<span style="background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">${I18n.t('community.publicBadge')}</span>`;

        return `
          <div class="card" style="display: flex; flex-direction: column; justify-content: space-between; border-radius: 16px; padding: 24px; position: relative; border-top: 4px solid ${isVocab ? '#a855f7' : '#3b82f6'}; transition: transform 0.2s ease, box-shadow 0.2s ease;">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; gap: 8px; flex-wrap: wrap;">
                ${typeBadge}
                ${publicBadge}
              </div>

              <h3 style="font-size: 19px; font-weight: 800; color: var(--text-primary); margin-bottom: 8px; line-height: 1.35;">
                ${title}
              </h3>

              <p style="font-size: 13px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 20px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 40px;">
                ${desc}
              </p>
            </div>

            <div>
              <div style="display: flex; align-items: center; justify-content: space-between; background: var(--bg-glass); padding: 10px 14px; border-radius: 10px; border: 1px solid var(--border-color); font-size: 13px; margin-bottom: 16px;">
                <span style="color: var(--text-secondary); display: flex; align-items: center; gap: 6px;">
                  ${I18n.t('community.authorLabel', { name: `<strong style="color: var(--text-primary);">${ownerName}</strong>` })}
                </span>
                <span style="color: var(--text-accent); font-weight: 700;">
                  ${I18n.t('community.questionCount', { count })}
                </span>
              </div>

              <div style="display: flex; gap: 10px;">
                <button class="btn btn-primary btn-sm" onclick="CommunityView.playQuiz(${q.id})" style="flex: 1; padding: 10px; font-weight: 700; font-size: 13px; border-radius: 10px; display: flex; justify-content: center; align-items: center; gap: 6px;">
                  ${I18n.t('community.playNow')}
                </button>
                <button class="btn btn-ghost btn-sm" onclick="CommunityView.cloneQuiz(${q.id})" title="${I18n.t('community.cloneTitle')}" style="padding: 10px 14px; font-weight: 600; font-size: 13px; border-radius: 10px; display: flex; justify-content: center; align-items: center; gap: 6px;">
                  ${I18n.t('community.clone')}
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');

    } catch (err) {
      listContainer.innerHTML = `
        <div class="card text-center" style="padding: 40px 24px; color: #ef4444; grid-column: 1 / -1; border-radius: 16px;">
          ⚠️ ${Components.escapeHtml(err.message)}
        </div>
      `;
    }
  }

  function updateStatsBar(quizzes) {
    const statsContainer = document.getElementById('community-stats-bar');
    if (!statsContainer || !Array.isArray(quizzes)) return;

    const total = quizzes.length;
    const authors = new Set(quizzes.map(q => q.owner_name)).size;

    statsContainer.innerHTML = `
      <div style="background: var(--bg-glass); padding: 6px 14px; border-radius: 10px; border: 1px solid var(--border-color); font-size: 13px; color: var(--text-secondary);">
        ${I18n.t('community.totalQuizzes', { total: `<strong style="color: var(--text-accent);">${total}</strong>` })}
      </div>
      <div style="background: var(--bg-glass); padding: 6px 14px; border-radius: 10px; border: 1px solid var(--border-color); font-size: 13px; color: var(--text-secondary);">
        ${I18n.t('community.authors', { count: `<strong style="color: #4ade80;">${authors}</strong>` })}
      </div>
    `;
  }

  function playQuiz(quizId) {
    if (window.App && typeof App.playQuiz === 'function') {
      App.playQuiz(quizId);
    } else if (window.QuizPlayer && typeof QuizPlayer.startQuiz === 'function') {
      QuizPlayer.startQuiz(quizId);
    }
  }

  async function cloneQuiz(quizId) {
    try {
      const res = await fetch(`/api/community/clone/${quizId}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sao chép thất bại');
      Components.showToast('🎉 ' + I18n.t('community.cloneSuccess'), 'success');
    } catch (err) {
      Components.showToast(err.message, 'error');
    }
  }

  return {
    render,
    setFilter,
    onSearchInput,
    loadQuizzes,
    playQuiz,
    cloneQuiz
  };
})();

window.CommunityView = CommunityView;
