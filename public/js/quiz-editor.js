// ============================================
// Quiz Editor - Create & Edit Quizzes (Fill & MCQ4)
// ============================================

const QuizEditor = (() => {
  let editingQuizId = null;
  let defaultQuestionTypeMode = 'fill'; // 'fill' or 'mcq4'
  let questionsList = [];
  let pendingUploads = {};

  function render(quizId = null, defaultTypeMode = 'fill') {
    editingQuizId = quizId;
    defaultQuestionTypeMode = ['mcq4', 'fill_word_ipa', 'fill_meaning_ipa'].includes(defaultTypeMode) ? defaultTypeMode : 'fill';
    questionsList = [];
    pendingUploads = {};

    let modeSubtitle = '(Tự luận)';
    if (defaultQuestionTypeMode === 'mcq4') modeSubtitle = '(Trắc nghiệm 4 đáp án)';
    else if (defaultQuestionTypeMode === 'fill_word_ipa') modeSubtitle = '(Từ → điền Phiên âm)';
    else if (defaultQuestionTypeMode === 'fill_meaning_ipa') modeSubtitle = '(Nghĩa → điền Phiên âm)';

    const main = document.getElementById('main-content');
    const isEdit = !!quizId;

    main.innerHTML = `
      <div style="padding-bottom: 80px;">
        <div class="page-header">
          <h1>${I18n.t(isEdit ? 'create.editTitle' : 'create.title')} ${modeSubtitle}</h1>
        </div>
        <div class="card" style="margin-bottom: 32px;">
          <div class="form-group">
            <label class="form-label">${I18n.t('create.quizTitle')}</label>
            <input type="text" class="form-input" id="quiz-title" placeholder="${I18n.t('create.quizTitlePlaceholder')}">
          </div>
          <div class="form-group">
            <label class="form-label">${I18n.t('create.description')}</label>
            <textarea class="form-textarea" id="quiz-description" placeholder="${I18n.t('create.descriptionPlaceholder')}" rows="2"></textarea>
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">🔒 Quyền riêng tư</label>
            <select id="quiz-visibility" class="form-select">
              <option value="private" selected>🔒 Riêng tư (Private) — Ẩn mã code, chỉ mình bạn xem được</option>
              <option value="unlisted">🔗 Không công khai (Unlisted) — Có mã code chia sẻ, ẩn khỏi Cộng đồng</option>
              <option value="public">🌐 Công khai (Public) — Hiển thị trên trang Cộng đồng chia sẻ</option>
            </select>
          </div>
        </div>

        <div class="card" style="margin-bottom: 32px;">
          <div class="card-header">
            <h2 class="card-title">${I18n.t('create.questions')}</h2>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-success" onclick="QuizEditor.addQuestion()">
                ＋ ${I18n.t('create.addQuestion')}
              </button>
            </div>
          </div>
          <div id="questions-container" class="editor-question-list">
            <div class="empty-state" style="padding: 40px;">
              <span class="empty-icon" style="font-size: 40px;">📝</span>
              <p>${I18n.t('create.noQuestions')}</p>
            </div>
          </div>
        </div>
      </div>

      <div class="fixed-bottom-bar">
        <div class="fixed-bottom-bar-inner">
          <button class="btn btn-ghost btn-lg" onclick="App.navigate('dashboard')">${I18n.t('create.cancel')}</button>
          <div style="display: flex; gap: 12px; align-items: center;">
            ${isEdit ? `<a href="/api/export/${quizId}" class="btn btn-ghost btn-lg" download style="display: inline-flex; align-items: center; gap: 6px;">📤 ${I18n.t('export.downloadExcel')}</a>` : ''}
            <button class="btn btn-primary btn-lg" onclick="QuizEditor.save()" style="padding: 12px 28px; font-weight: 700; border-radius: 12px; cursor: pointer;">💾 ${I18n.t('create.save')}</button>
          </div>
        </div>
      </div>
    `;

    if (isEdit) {
      loadQuiz(quizId);
    } else {
      // Add initial question
      addQuestion(defaultQuestionTypeMode);
    }
  }

  async function loadQuiz(quizId) {
    try {
      const res = await fetch(`/api/quizzes/${quizId}`);
      if (!res.ok) throw new Error('Quiz not found');
      const quiz = await res.json();

      document.getElementById('quiz-title').value = quiz.title;
      document.getElementById('quiz-description').value = quiz.description || '';
      const visSelect = document.getElementById('quiz-visibility');
      if (visSelect) visSelect.value = quiz.visibility || 'private';

      questionsList = (quiz.questions || []).map(q => {
        let isMcq = false;
        let promptText = q.question_text || '';
        let options = ['', '', '', ''];
        let correctOptIndex = 0; // 0-based

        if (promptText.includes('|||')) {
          isMcq = true;
          const parts = promptText.split('|||');
          promptText = parts[0];
          try {
            const parsedOpts = JSON.parse(parts[1]);
            if (Array.isArray(parsedOpts)) {
              options = [
                parsedOpts[0] || '',
                parsedOpts[1] || '',
                parsedOpts[2] || '',
                parsedOpts[3] || ''
              ];
            }
          } catch (e) {}

          const normCorrect = String(q.correct_answer || '').trim().toLowerCase();
          const foundIdx = options.findIndex(o => String(o).trim().toLowerCase() === normCorrect);
          correctOptIndex = foundIdx >= 0 ? foundIdx : 0;
        }

        return {
          id: q.id,
          question_type: isMcq ? 'mcq4' : (q.question_type || 'fill'),
          prompt_text: promptText,
          question_text: q.question_text,
          correct_answer: q.correct_answer,
          options,
          correct_option: correctOptIndex,
          image_path: q.image_path,
          audio_path: q.audio_path,
        };
      });

      renderQuestionsList();
    } catch (err) {
      Components.showToast(I18n.t('common.error'), 'error');
      console.error(err);
    }
  }

  function addQuestion(forcedType = null) {
    syncQuestionsFromDOM();
    const qType = forcedType || defaultQuestionTypeMode;
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    questionsList.push({
      tempId,
      question_type: qType,
      prompt_text: '',
      question_text: '',
      correct_answer: '',
      options: ['', '', '', ''],
      correct_option: 0, // Option 1
      image_path: null,
      audio_path: null,
    });

    renderQuestionsList();

    setTimeout(() => {
      const inputs = document.querySelectorAll('.q-text-input, .q-prompt-input');
      if (inputs.length > 0) inputs[inputs.length - 1].focus();
    }, 100);
  }

  function removeQuestion(index) {
    questionsList.splice(index, 1);
    renderQuestionsList();
  }

  function changeQuestionType(index, newType) {
    syncQuestionsFromDOM();
    if (questionsList[index]) {
      questionsList[index].question_type = newType;
      renderQuestionsList();
    }
  }

  function renderQuestionsList() {
    const container = document.getElementById('questions-container');

    if (questionsList.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 40px;">
          <span class="empty-icon" style="font-size: 40px;">📝</span>
          <p>${I18n.t('create.noQuestions')}</p>
        </div>
      `;
      return;
    }

    container.innerHTML = questionsList.map((q, i) => {
      const idx = i;
      const isMcq = q.question_type === 'mcq4';
      const isFillWordIpa = q.question_type === 'fill_word_ipa';
      const isFillMeaningIpa = q.question_type === 'fill_meaning_ipa';
      const mediaHTML = renderMediaSection(q, idx);

      let questionFieldsHTML = '';

      if (isMcq) {
        questionFieldsHTML = `
          <div class="form-group" style="margin-bottom: 12px;">
            <label class="form-label" style="font-size: 13px; font-weight: 600;">Nội dung câu hỏi trắc nghiệm</label>
            <input type="text" class="form-input q-prompt-input" 
                   placeholder="Nhập câu hỏi (ví dụ: Thủ đô của Việt Nam là gì?)" 
                   value="${Components.escapeHtml(q.prompt_text || q.question_text || '')}">
          </div>
          <div class="form-group" style="margin-bottom: 12px;">
            <label class="form-label" style="font-size: 13px; font-weight: 600;">4 Lựa chọn & Đáp án đúng</label>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              ${[0, 1, 2, 3].map(optIdx => `
                <div style="display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.03); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color, #374151);">
                  <input type="radio" name="correct_opt_${idx}" value="${optIdx}" ${Number(q.correct_option) === optIdx ? 'checked' : ''} style="accent-color: #10b981; cursor: pointer;" title="Chọn làm đáp án đúng">
                  <span style="font-size: 12px; font-weight: 700; color: var(--text-secondary);">Option ${optIdx + 1}:</span>
                  <input type="text" class="form-input q-option-input" data-optindex="${optIdx}" 
                         placeholder="Lựa chọn ${optIdx + 1}" 
                         value="${Components.escapeHtml((q.options && q.options[optIdx]) || '')}" style="flex: 1;">
                </div>
              `).join('')}
            </div>
            <p style="font-size: 12px; color: var(--text-muted); margin-top: 6px;">💡 Tích vào ô tròn radio trước Option tương ứng để chọn đáp án đúng.</p>
          </div>
        `;
      } else {
        let qLabel = 'Nội dung câu hỏi tự luận';
        let qPlaceholder = I18n.t('create.questionPlaceholder') || 'Nhập câu hỏi...';
        let aLabel = 'Đáp án đúng (có thể cách nhau bởi dấu /)';
        let aPlaceholder = I18n.t('create.answerPlaceholder') || 'Nhập đáp án...';

        if (isFillWordIpa) {
          qLabel = 'Từ vựng (Đề bài hiển thị)';
          qPlaceholder = 'Nhập từ (ví dụ: 周末 hoặc Weekend)...';
          aLabel = 'Phiên âm đúng (Điền phiên âm, có thể cách nhau bởi dấu /)';
          aPlaceholder = 'Nhập phiên âm (ví dụ: zhōumò)...';
        } else if (isFillMeaningIpa) {
          qLabel = 'Nghĩa của từ (Đề bài hiển thị)';
          qPlaceholder = 'Nhập nghĩa (ví dụ: cuối tuần)...';
          aLabel = 'Phiên âm đúng (Điền phiên âm, có thể cách nhau bởi dấu /)';
          aPlaceholder = 'Nhập phiên âm (ví dụ: zhōumò)...';
        }

        questionFieldsHTML = `
          <div class="form-group" style="margin-bottom: 12px;">
            <label class="form-label" style="font-size: 13px; font-weight: 600;">${qLabel}</label>
            <input type="text" class="form-input q-text-input" 
                   placeholder="${qPlaceholder}" 
                   value="${Components.escapeHtml(q.question_text || q.prompt_text || '')}">
          </div>
          <div class="form-group answers-group" style="margin-bottom: 12px;">
            <label class="form-label" style="font-size: 13px; font-weight: 600;">${aLabel}</label>
            ${(q.correct_answer || '').split('/').map((ans, aIdx) => `
              <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                <input type="text" class="form-input q-answer-input" 
                       placeholder="${aPlaceholder}" 
                       value="${Components.escapeHtml(ans)}">
                ${aIdx > 0 ? `<button class="btn btn-sm btn-ghost" onclick="QuizEditor.removeAnswerOption(${idx}, ${aIdx})">✕</button>` : ''}
              </div>
            `).join('')}
            <button class="btn btn-sm btn-ghost" onclick="QuizEditor.addAnswerOption(${idx})" style="margin-top: 4px;">
              ${I18n.t('create.addAnswer')}
            </button>
          </div>
        `;
      }

      return `
        <div class="editor-question-item" data-index="${idx}" style="background: var(--card-bg, rgba(255,255,255,0.02)); border: 1px solid var(--border-color, #374151); padding: 16px; border-radius: 12px; margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span class="editor-question-number" style="font-weight: 700;">Câu ${i + 1}</span>
              <select class="form-select q-type-select" onchange="QuizEditor.changeQuestionType(${idx}, this.value)" style="padding: 4px 8px; font-size: 13px; border-radius: 8px;">
                <option value="fill" ${q.question_type === 'fill' ? 'selected' : ''}>✍️ Tự luận (Fill-in)</option>
                <option value="mcq4" ${q.question_type === 'mcq4' ? 'selected' : ''}>⚡ Trắc nghiệm 4 đáp án (MCQ)</option>
                <option value="fill_word_ipa" ${q.question_type === 'fill_word_ipa' ? 'selected' : ''}>🔤 Từ → điền Phiên âm</option>
                <option value="fill_meaning_ipa" ${q.question_type === 'fill_meaning_ipa' ? 'selected' : ''}>📖 Nghĩa → điền Phiên âm</option>
              </select>
            </div>
            <button class="btn btn-sm btn-danger" onclick="QuizEditor.removeQuestion(${idx})" title="${I18n.t('common.delete')}">🗑 Xóa</button>
          </div>
          <div class="editor-question-content">
            ${questionFieldsHTML}
            ${mediaHTML}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderMediaSection(q, idx) {
    let imagePreview = '';
    let audioPreview = '';

    if (q.image_path) {
      imagePreview = `
        <div class="media-preview-item">
          🖼 ${q.image_path.split('/').pop()}
          <span class="remove-media" onclick="QuizEditor.removeMedia(${idx}, 'image')">✕</span>
        </div>
      `;
    }
    if (q.audio_path) {
      audioPreview = `
        <div class="media-preview-item">
          🔊 ${q.audio_path.split('/').pop()}
          <span class="remove-media" onclick="QuizEditor.removeMedia(${idx}, 'audio')">✕</span>
        </div>
      `;
    }

    return `
      <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-start; margin-top: 8px;">
        <label class="file-upload-btn">
          ${I18n.t('create.addImage')}
          <input type="file" accept="image/*" onchange="QuizEditor.uploadMedia(${idx}, 'image', this)">
        </label>
        <label class="file-upload-btn">
          ${I18n.t('create.addAudio')}
          <input type="file" accept="audio/*" onchange="QuizEditor.uploadMedia(${idx}, 'audio', this)">
        </label>
      </div>
      <div class="media-preview" style="margin-top: 6px;">
        ${imagePreview}${audioPreview}
      </div>
    `;
  }

  function addAnswerOption(index) {
    syncQuestionsFromDOM();
    if (questionsList[index]) {
      questionsList[index].correct_answer += '/';
      renderQuestionsList();
    }
  }

  function removeAnswerOption(qIndex, aIndex) {
    syncQuestionsFromDOM();
    if (questionsList[qIndex]) {
      const answers = (questionsList[qIndex].correct_answer || '').split('/');
      answers.splice(aIndex, 1);
      questionsList[qIndex].correct_answer = answers.join('/');
      renderQuestionsList();
    }
  }

  async function uploadMedia(index, type, input) {
    const file = input.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append(type, file);

    try {
      const res = await fetch(`/api/upload/${type}`, { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();

      if (type === 'image') {
        questionsList[index].image_path = data.path;
      } else {
        questionsList[index].audio_path = data.path;
      }

      renderQuestionsList();
      Components.showToast(`${type === 'image' ? '🖼' : '🔊'} Upload successful!`, 'success');
    } catch (err) {
      Components.showToast(`Upload failed: ${err.message}`, 'error');
    }
  }

  function removeMedia(index, type) {
    if (type === 'image') {
      questionsList[index].image_path = null;
    } else {
      questionsList[index].audio_path = null;
    }
    renderQuestionsList();
  }

  function syncQuestionsFromDOM() {
    const items = document.querySelectorAll('.editor-question-item');
    items.forEach((item, i) => {
      if (!questionsList[i]) return;

      const typeSelect = item.querySelector('.q-type-select');
      if (typeSelect) {
        questionsList[i].question_type = typeSelect.value;
      }

      const isMcq = questionsList[i].question_type === 'mcq4';

      if (isMcq) {
        const promptInput = item.querySelector('.q-prompt-input');
        const optionInputs = item.querySelectorAll('.q-option-input');
        const checkedRadio = item.querySelector(`input[name="correct_opt_${i}"]:checked`);

        const promptVal = promptInput ? promptInput.value.trim() : '';
        const optsVal = Array.from(optionInputs).map(inp => inp.value.trim());
        const correctOptIdx = checkedRadio ? parseInt(checkedRadio.value, 10) : 0;

        questionsList[i].prompt_text = promptVal;
        questionsList[i].options = optsVal;
        questionsList[i].correct_option = correctOptIdx;
        questionsList[i].question_text = `${promptVal}|||${JSON.stringify(optsVal)}`;
        questionsList[i].correct_answer = optsVal[correctOptIdx] || optsVal[0] || '';
      } else {
        const qInput = item.querySelector('.q-text-input');
        const aInputs = item.querySelectorAll('.q-answer-input');

        if (qInput) {
          questionsList[i].question_text = qInput.value.trim();
          questionsList[i].prompt_text = qInput.value.trim();
        }
        if (aInputs.length > 0) {
          questionsList[i].correct_answer = Array.from(aInputs).map(inp => inp.value.trim()).join('/');
        }
      }
    });
  }

  async function save() {
    const title = document.getElementById('quiz-title').value.trim();
    const description = document.getElementById('quiz-description').value.trim();

    if (!title) {
      Components.showToast(I18n.t('create.quizTitlePlaceholder'), 'warning');
      document.getElementById('quiz-title').focus();
      return;
    }

    syncQuestionsFromDOM();

    // Filter valid questions
    const validQuestions = questionsList.filter(q => {
      if (q.question_type === 'mcq4') {
        const pText = (q.prompt_text || q.question_text || '').split('|||')[0].trim();
        const hasOptions = Array.isArray(q.options) && q.options.some(o => String(o).trim() !== '');
        return pText && hasOptions && q.correct_answer;
      }
      return (q.question_text || '').trim() && (q.correct_answer || '').trim();
    });

    if (validQuestions.length === 0) {
      Components.showToast(I18n.t('create.noQuestions'), 'warning');
      return;
    }

    try {
      let quizId;
      const visibility = document.getElementById('quiz-visibility')?.value || 'private';

      if (editingQuizId) {
        await fetch(`/api/quizzes/${editingQuizId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, description, visibility })
        });
        quizId = editingQuizId;

        const existingRes = await fetch(`/api/quizzes/${quizId}`);
        const existingQuiz = await existingRes.json();

        for (const eq of (existingQuiz.questions || [])) {
          const stillExists = validQuestions.find(vq => vq.id === eq.id);
          if (!stillExists) {
            await fetch(`/api/questions/${eq.id}`, { method: 'DELETE' });
          }
        }

        for (let i = 0; i < validQuestions.length; i++) {
          const q = validQuestions[i];
          const payload = {
            question_text: q.question_text,
            correct_answer: q.correct_answer,
            image_path: q.image_path,
            audio_path: q.audio_path,
            question_type: q.question_type || 'fill',
            ipa: (q.question_type === 'fill_word_ipa' || q.question_type === 'fill_meaning_ipa') ? q.correct_answer : (q.ipa || null),
          };

          if (q.id) {
            await fetch(`/api/questions/${q.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
          } else {
            await fetch(`/api/quizzes/${quizId}/questions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
          }
        }
      } else {
        const createRes = await fetch('/api/quizzes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, description, visibility })
        });
        if (!createRes.ok) {
          const errData = await createRes.json();
          throw new Error(errData.error || 'Failed to create quiz');
        }
        const newQuiz = await createRes.json();
        quizId = newQuiz.id;

        for (const q of validQuestions) {
          await fetch(`/api/quizzes/${quizId}/questions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              question_text: q.question_text,
              correct_answer: q.correct_answer,
              image_path: q.image_path,
              audio_path: q.audio_path,
              question_type: q.question_type || 'fill',
              ipa: (q.question_type === 'fill_word_ipa' || q.question_type === 'fill_meaning_ipa') ? q.correct_answer : (q.ipa || null),
            })
          });
        }
      }

      Components.showToast(I18n.t('create.saved'), 'success');
      App.navigate('dashboard');
    } catch (err) {
      Components.showToast(`${I18n.t('common.error')}: ${err.message}`, 'error');
      console.error(err);
    }
  }

  return {
    render,
    addQuestion,
    removeQuestion,
    changeQuestionType,
    addAnswerOption,
    removeAnswerOption,
    uploadMedia,
    removeMedia,
    save,
  };
})();

window.QuizEditor = QuizEditor;
