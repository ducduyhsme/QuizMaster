// ============================================
// Vocab Editor Module
// ============================================

const VocabEditor = (() => {
  const container = document.getElementById('main-content');
  let vocabList = [];
  let existingQuiz = null;

  const languages = [
    { code: 'en', name: 'Anh' },
    { code: 'zh', name: 'Trung' },
    { code: 'vi', name: 'Việt' },
    { code: 'ko', name: 'Hàn' },
    { code: 'ru', name: 'Nga' },
    { code: 'fr', name: 'Pháp' },
    { code: 'ja', name: 'Nhật' }
  ];

  async function render(quizId = null) {
    vocabList = [];
    existingQuiz = null;

    if (quizId) {
      try {
        const res = await fetch(`/api/quizzes/${quizId}`);
        if (!res.ok) throw new Error('Quiz not found');
        existingQuiz = await res.json();
        
        // Reconstruct vocabList from questions
        const vocabMap = new Map();
        existingQuiz.questions.forEach(q => {
          if (q.question_type === 'fill_word_meaning') {
            vocabMap.set(q.question_text, { word: q.question_text, meaning: q.correct_answer, ipa: q.ipa });
          }
        });
        vocabList = Array.from(vocabMap.values()).map((v, i) => ({ id: `v_${Date.now()}_${i}`, ...v }));
      } catch (err) {
        Components.showToast(I18n.t('common.error'), 'error');
        window.location.hash = '#dashboard';
        return;
      }
    }

    container.innerHTML = `
      <div class="page-header">
        <h1 data-i18n="${quizId ? 'vocab.editTitle' : 'vocab.createTitle'}">${quizId ? 'Sửa bộ từ vựng' : 'Tạo bộ từ vựng'}</h1>
      </div>

      <div class="card mb-6">
        <div class="form-group">
          <label class="form-label" data-i18n="create.quizTitle">Tên Quiz</label>
          <input type="text" id="vocab-title" class="form-input" data-i18n-placeholder="create.quizTitlePlaceholder" placeholder="Nhập tên quiz..." value="${existingQuiz ? Components.escapeHtml(existingQuiz.title) : ''}">
        </div>
        <div class="form-group">
          <label class="form-label" data-i18n="create.description">Mô tả</label>
          <textarea id="vocab-description" class="form-textarea" data-i18n-placeholder="create.descriptionPlaceholder" placeholder="Nhập mô tả (tùy chọn)...">${existingQuiz ? Components.escapeHtml(existingQuiz.description) : ''}</textarea>
        </div>
      </div>

      <div class="card mb-6">
        <div class="card-header">
          <h2 class="card-title">Nhập danh sách từ vựng — <span id="vocab-count-label" data-i18n="vocab.count">Số từ: 0</span></h2>
        </div>
        
        <div class="vocab-input-section">
          <div class="vocab-input-col">
            <label class="form-label" data-i18n="vocab.vocabLang">Ngôn ngữ Từ vựng</label>
            <select id="vocab-lang" class="form-select">
              ${languages.map(l => `<option value="${l.code}" ${(existingQuiz && existingQuiz.vocab_lang === l.code) || (!existingQuiz && l.code === 'en') ? 'selected' : ''}>${l.name}</option>`).join('')}
            </select>
            <textarea id="bulk-words" class="form-textarea" data-i18n-placeholder="vocab.textareaWord" placeholder="Mỗi dòng 1 từ" style="height: 200px;"></textarea>
          </div>
          <div class="vocab-input-col">
            <label class="form-label" data-i18n="vocab.meaningLang">Ngôn ngữ cột Nghĩa</label>
            <select id="meaning-lang" class="form-select">
              ${languages.map(l => `<option value="${l.code}" ${(existingQuiz && existingQuiz.meaning_lang === l.code) || (!existingQuiz && l.code === 'vi') ? 'selected' : ''}>${l.name}</option>`).join('')}
            </select>
            <textarea id="bulk-meanings" class="form-textarea" data-i18n-placeholder="vocab.textareaMeaning" placeholder="Mỗi dòng 1 nghĩa" style="height: 200px;"></textarea>
          </div>
          <div class="vocab-input-col">
            <label class="form-label" data-i18n="vocab.ipa">Phiên âm (IPA)</label>
            <div style="height: 44px;"></div> <!-- Spacer to match select height -->
            <textarea id="bulk-ipas" class="form-textarea" data-i18n-placeholder="vocab.textareaIpa" placeholder="Có thể để trống" style="height: 200px;"></textarea>
          </div>
        </div>
        
        <div class="flex justify-between items-center">
          <button id="add-bulk-btn" class="btn btn-ghost">
            <span data-i18n="vocab.addToList">Thêm vào danh sách</span>
          </button>
        </div>
      </div>
      
      <div class="card mb-6">
        <div class="table-container">
          <table class="table vocab-table">
            <thead>
              <tr>
                <th width="5%" data-i18n="vocab.colNum">#</th>
                <th width="30%" data-i18n="vocab.colWord">Từ</th>
                <th width="30%" data-i18n="vocab.colMeaning">Nghĩa</th>
                <th width="20%" data-i18n="vocab.colIpa">Phiên âm</th>
                <th width="15%" data-i18n="vocab.colAction">Thao tác</th>
              </tr>
            </thead>
            <tbody id="vocab-list">
              <!-- Vocab rows will be injected here -->
            </tbody>
          </table>
        </div>
      </div>

      <div class="flex justify-between items-center mt-6 mb-8">
        <button id="cancel-btn" class="btn btn-ghost" data-i18n="common.cancel">Hủy</button>
        <div style="display: flex; gap: 8px;">
          ${existingQuiz ? `<a href="/api/export/${existingQuiz.id}" class="btn btn-ghost btn-lg" download>📤 ${I18n.t('export.downloadExcel')}</a>` : ''}
          <button id="save-quiz-btn" class="btn btn-primary btn-lg">
            <span class="btn-icon">💾</span> <span data-i18n="vocab.save">Lưu thành Quiz</span>
          </button>
        </div>
      </div>
    `;

    I18n.updateDOM();
    updateCountLabel();
    renderVocabList();
    setupEventListeners();
  }

  function updateCountLabel() {
    const el = document.getElementById('vocab-count-label');
    if (el) {
      el.textContent = I18n.t('vocab.count', { count: vocabList.length });
    }
  }

  function renderVocabList() {
    const listEl = document.getElementById('vocab-list');
    listEl.innerHTML = '';
    
    if (vocabList.length === 0) {
      listEl.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">Chưa có từ vựng nào</td></tr>`;
      return;
    }

    vocabList.forEach((v, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td><input type="text" value="${Components.escapeHtml(v.word)}" data-id="${v.id}" data-field="word" class="vocab-inline-edit"></td>
        <td><input type="text" value="${Components.escapeHtml(v.meaning)}" data-id="${v.id}" data-field="meaning" class="vocab-inline-edit"></td>
        <td><input type="text" value="${Components.escapeHtml(v.ipa || '')}" data-id="${v.id}" data-field="ipa" class="vocab-inline-edit"></td>
        <td>
          <div class="actions-cell">
            <button class="btn btn-ghost btn-sm move-up-btn" data-index="${idx}" ${idx === 0 ? 'disabled' : ''}>↑</button>
            <button class="btn btn-ghost btn-sm move-down-btn" data-index="${idx}" ${idx === vocabList.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="btn btn-ghost btn-sm delete-vocab-btn text-danger" data-id="${v.id}">🗑</button>
          </div>
        </td>
      `;
      listEl.appendChild(tr);
    });

    // Inline edit listeners
    document.querySelectorAll('.vocab-inline-edit').forEach(input => {
      input.addEventListener('change', (e) => {
        const id = e.target.getAttribute('data-id');
        const field = e.target.getAttribute('data-field');
        const item = vocabList.find(i => i.id === id);
        if (item) {
          item[field] = e.target.value.trim();
        }
      });
    });

    // Move buttons
    document.querySelectorAll('.move-up-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.getAttribute('data-index'));
        if (idx > 0) {
          [vocabList[idx - 1], vocabList[idx]] = [vocabList[idx], vocabList[idx - 1]];
          renderVocabList();
        }
      });
    });

    document.querySelectorAll('.move-down-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.getAttribute('data-index'));
        if (idx < vocabList.length - 1) {
          [vocabList[idx + 1], vocabList[idx]] = [vocabList[idx], vocabList[idx + 1]];
          renderVocabList();
        }
      });
    });

    // Delete buttons
    document.querySelectorAll('.delete-vocab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        vocabList = vocabList.filter(i => i.id !== id);
        updateCountLabel();
        renderVocabList();
      });
    });
  }

  function setupEventListeners() {
    document.getElementById('add-bulk-btn').addEventListener('click', () => {
      const words = document.getElementById('bulk-words').value.split('\n');
      const meanings = document.getElementById('bulk-meanings').value.split('\n');
      const ipas = document.getElementById('bulk-ipas').value.split('\n');
      
      let added = 0;
      const maxLen = Math.max(words.length, meanings.length);
      for (let i = 0; i < maxLen; i++) {
        const w = (words[i] || '').trim();
        const m = (meanings[i] || '').trim();
        const ipa = (ipas[i] || '').trim();
        
        if (w && m) {
          vocabList.push({ id: 'v_' + Date.now() + '_' + added, word: w, meaning: m, ipa: ipa });
          added++;
        }
      }
      
      if (added > 0) {
        document.getElementById('bulk-words').value = '';
        document.getElementById('bulk-meanings').value = '';
        document.getElementById('bulk-ipas').value = '';
        updateCountLabel();
        renderVocabList();
        Components.showToast(`Đã thêm ${added} từ vào danh sách`, 'success');
      } else {
        Components.showToast('Vui lòng nhập ít nhất 1 từ và 1 nghĩa tương ứng', 'warning');
      }
    });

    document.getElementById('save-quiz-btn').addEventListener('click', async () => {
      const title = document.getElementById('vocab-title').value.trim();
      if (!title) return Components.showToast('Vui lòng nhập tên Quiz', 'warning');
      if (vocabList.length === 0) return Components.showToast('Danh sách từ vựng trống', 'warning');
      
      const payload = {
        title,
        description: document.getElementById('vocab-description').value.trim(),
        vocab_lang: document.getElementById('vocab-lang').value,
        meaning_lang: document.getElementById('meaning-lang').value,
        words: vocabList.map(v => ({ word: v.word, meaning: v.meaning, ipa: v.ipa }))
      };
      
      try {
        let url = '/api/quizzes/vocabulary';
        let method = 'POST';
        if (existingQuiz) {
          url = `/api/quizzes/${existingQuiz.id}/vocabulary`;
          method = 'PUT';
        }
        
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to save');
        }
        
        Components.showToast(I18n.t('create.saved'), 'success');
        window.location.hash = '#dashboard';
      } catch (err) {
        Components.showToast(err.message, 'error');
      }
    });

    document.getElementById('cancel-btn').addEventListener('click', () => {
      window.location.hash = '#dashboard';
    });
  }

  return { render };
})();
