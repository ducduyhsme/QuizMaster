const CommunityView = (() => {
  const containerId = 'main-content';

  async function render() {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="page-header">
        <h1>🌐 Cộng đồng chia sẻ</h1>
        <p>Khám phá và học hỏi từ bộ sưu tập Quiz công khai do cộng đồng người dùng QuizMaster chia sẻ</p>
      </div>

      <div class="card mb-6" style="padding: 16px 20px;">
        <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
          <div class="search-box flex-1" style="margin: 0; min-width: 240px;">
            <span class="search-icon">🔍</span>
            <input type="text" id="community-search-input" class="search-input" placeholder="Tìm kiếm quiz công khai..." oninput="CommunityView.onSearchInput(this.value)">
          </div>
          <button class="btn btn-ghost" onclick="CommunityView.loadQuizzes()">🔄 Làm mới</button>
        </div>
      </div>

      <div id="community-quiz-list" class="quiz-grid">
        <div class="flex justify-center items-center" style="padding: 40px; grid-column: 1 / -1;">
          <div class="spinner"></div>
        </div>
      </div>
    `;

    loadQuizzes();
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
      if (!res.ok) throw new Error('Không thể tải danh sách Cộng đồng');
      const quizzes = await res.json();

      if (!quizzes || quizzes.length === 0) {
        listContainer.innerHTML = `
          <div class="card text-center" style="padding: 48px 24px; grid-column: 1 / -1;">
            <div style="font-size: 48px; margin-bottom: 16px;">🌐</div>
            <h3 style="font-size: 18px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">
              ${query ? 'Không tìm thấy Quiz công khai nào khớp với tìm kiếm' : 'Chưa có Quiz công khai nào trên Cộng đồng'}
            </h3>
            <p style="font-size: 14px; color: var(--text-secondary); max-width: 450px; margin: 0 auto 20px;">
              Hãy là người đầu tiên chia sẻ Quiz của bạn bằng cách chuyển quyền riêng tư thành <b>Công khai (Public)</b> khi tạo hoặc sửa Quiz!
            </p>
          </div>
        `;
        return;
      }

      listContainer.innerHTML = quizzes.map(q => {
        const title = Components.escapeHtml(q.title);
        const desc = Components.escapeHtml(q.description || 'Không có mô tả');
        const ownerName = Components.escapeHtml(q.owner_name || 'Khuyết danh');
        const count = q.question_count || 0;
        const typeBadge = q.quiz_type === 'vocabulary' 
          ? `<span class="badge badge-primary">📖 ${I18n.t('type.vocabulary')}</span>` 
          : `<span class="badge badge-accent">❓ ${I18n.t('type.question')}</span>`;

        return `
          <div class="card quiz-card flex flex-col justify-between" style="position: relative; border-top: 4px solid var(--text-accent);">
            <div>
              <div class="flex justify-between items-start mb-2" style="gap: 8px; flex-wrap: wrap;">
                ${typeBadge}
                <span class="badge badge-ghost">🌐 Công khai</span>
              </div>
              <h3 class="quiz-title" style="font-size: 18px; font-weight: 800; margin-bottom: 8px;">${title}</h3>
              <p class="quiz-desc" style="font-size: 13px; color: var(--text-secondary); margin-bottom: 12px; line-clamp: 2; -webkit-line-clamp: 2; display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden;">
                ${desc}
              </p>
            </div>

            <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border-color);">
              <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-secondary); margin-bottom: 12px;">
                <span>👤 Tác giả: <b>${ownerName}</b></span>
                <span>📝 ${count} câu</span>
              </div>

              <div style="display: flex; gap: 8px;">
                <button class="btn btn-primary flex-1 btn-sm" onclick="CommunityView.playQuiz(${q.id})">
                  ▶ Chơi ngay
                </button>
                <button class="btn btn-ghost btn-sm" onclick="CommunityView.cloneQuiz(${q.id})" title="Tải về bộ sưu tập cá nhân">
                  📥 Sao chép
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');

    } catch (err) {
      listContainer.innerHTML = `
        <div class="card text-center" style="padding: 32px; color: #ef4444; grid-column: 1 / -1;">
          ⚠️ ${Components.escapeHtml(err.message)}
        </div>
      `;
    }
  }

  async function playQuiz(quizId) {
    try {
      const res = await fetch(`/api/quizzes/${quizId}`);
      if (!res.ok) throw new Error('Không thể tải Quiz');
      const quiz = await res.json();

      if (window.QuizPlayer && typeof QuizPlayer.play === 'function') {
        QuizPlayer.play(quiz);
      }
    } catch (err) {
      Components.showToast(err.message, 'error');
    }
  }

  async function cloneQuiz(quizId) {
    try {
      const res = await fetch(`/api/community/clone/${quizId}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sao chép thất bại');
      Components.showToast('🎉 ' + data.message, 'success');
    } catch (err) {
      Components.showToast(err.message, 'error');
    }
  }

  return {
    render,
    onSearchInput,
    loadQuizzes,
    playQuiz,
    cloneQuiz
  };
})();
