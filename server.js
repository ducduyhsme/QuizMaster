const express = require('express');
const cors = require('cors');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const {
  initDatabase,
  generateUniqueCode,
  users,
  quizzes,
  questions,
  sessions,
  bulkInsertQuestions,
  ensureWrongQuizForUser
} = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Ensure upload directories exist
const uploadsDir = path.join(__dirname, 'public', 'uploads');
const imagesDir = path.join(uploadsDir, 'images');
const audioDir = path.join(uploadsDir, 'audio');
const excelDir = path.join(uploadsDir, 'excel');
[uploadsDir, imagesDir, audioDir, excelDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Multer configs
const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, imagesDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});

const audioStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, audioDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});

const excelStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, excelDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `excel_${Date.now()}${ext}`);
  }
});

const uploadImage = multer({
  storage: imageStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i;
    if (allowed.test(path.extname(file.originalname))) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

const uploadAudio = multer({
  storage: audioStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(mp3|wav|ogg|m4a|aac|flac|wma)$/i;
    if (allowed.test(path.extname(file.originalname))) cb(null, true);
    else cb(new Error('Only audio files are allowed'));
  }
});

const uploadExcel = multer({
  storage: excelStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(xlsx|xls|csv)$/i;
    if (allowed.test(path.extname(file.originalname))) cb(null, true);
    else cb(new Error('Only Excel/CSV files are allowed'));
  }
});

// ============ Auth & Session Middleware ============
const activeSessions = new Map();

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.headers['x-session-token']) {
    token = req.headers['x-session-token'];
  }

  if (token && activeSessions.has(token)) {
    req.user = activeSessions.get(token);
    return next();
  }

  // Default to Admin user (userId = 1) if no token provided
  req.user = { userId: 1, username: 'admin' };
  next();
}

app.use(authenticate);

// ============ Authentication APIs ============

app.post('/api/auth/register', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    const cleanUser = String(username).trim();
    if (cleanUser.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (password.length < 3) {
      return res.status(400).json({ error: 'Password must be at least 3 characters' });
    }

    const existing = users.findByUsername(cleanUser);
    if (existing) {
      return res.status(400).json({ error: 'Tên tài khoản đã tồn tại' });
    }

    const user = users.create(cleanUser, password);
    const token = crypto.randomBytes(24).toString('hex');
    const sessionObj = { userId: user.id, username: user.username };
    activeSessions.set(token, sessionObj);

    res.status(201).json({ user: sessionObj, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = users.findByUsername(String(username).trim());
    if (!user || !users.verifyPassword(user, password)) {
      return res.status(401).json({ error: 'Tài khoản hoặc mật khẩu không chính xác' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const sessionObj = { userId: user.id, username: user.username };
    activeSessions.set(token, sessionObj);

    res.json({ user: sessionObj, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.headers['x-session-token']) {
    token = req.headers['x-session-token'];
  }
  if (token) {
    activeSessions.delete(token);
  }
  res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
  res.json({ user: req.user });
});

app.post('/api/auth/change-password', (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Mật khẩu cũ và mật khẩu mới là bắt buộc' });
    }
    if (newPassword.length < 3) {
      return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 3 ký tự' });
    }

    const dbUser = users.findById(req.user.userId);
    const fullUser = users.findByUsername(dbUser.username);

    if (!users.verifyPassword(fullUser, oldPassword)) {
      return res.status(400).json({ error: 'Mật khẩu cũ không chính xác' });
    }

    users.changePassword(req.user.userId, newPassword);
    res.json({ success: true, message: 'Đã đổi mật khẩu thành công' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ Quizzes APIs ============

app.get('/api/quizzes', (req, res) => {
  try {
    const userQuizzes = quizzes.getAllForUser(req.user.userId);
    res.json(userQuizzes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function ensureVocabQuizUpToDate(quiz, qs) {
  if (!quiz || quiz.quiz_type !== 'vocabulary' || !qs || qs.length === 0) {
    return qs;
  }

  const hasIpa = qs.some(q => q.ipa && q.ipa.trim());
  const hasIpaMcq = qs.some(q => q.question_type === 'mcq_ipa_word' || q.question_type === 'mcq_ipa_meaning');

  if (hasIpa && !hasIpaMcq) {
    const wordMap = new Map();
    for (const q of qs) {
      if (q.question_type === 'fill_word_meaning') {
        const key = `${q.question_text}:${q.correct_answer}`;
        if (!wordMap.has(key)) {
          wordMap.set(key, { word: q.question_text, meaning: q.correct_answer, ipa: q.ipa || null });
        } else if (q.ipa && !wordMap.get(key).ipa) {
          wordMap.get(key).ipa = q.ipa;
        }
      }
    }

    if (wordMap.size === 0) {
      for (const q of qs) {
        if (q.question_type === 'fill_meaning_word') {
          const key = `${q.correct_answer}:${q.question_text}`;
          if (!wordMap.has(key)) {
            wordMap.set(key, { word: q.correct_answer, meaning: q.question_text, ipa: q.ipa || null });
          } else if (q.ipa && !wordMap.get(key).ipa) {
            wordMap.get(key).ipa = q.ipa;
          }
        }
      }
    }

    for (const q of qs) {
      if (q.ipa && q.ipa.trim()) {
        for (const [key, val] of wordMap.entries()) {
          if (!val.ipa && (q.question_text === val.word || q.correct_answer === val.word)) {
            val.ipa = q.ipa;
          }
        }
      }
    }

    const words = Array.from(wordMap.values());
    if (words.length >= 4) {
      const generatedQuestions = generateQuestionsFromVocab(words);
      questions.deleteByQuizId(quiz.id);
      bulkInsertQuestions(quiz.id, generatedQuestions);
      return questions.getByQuizId(quiz.id);
    }
  }

  return qs;
}

app.get('/api/quizzes/:id', (req, res) => {
  try {
    const quiz = quizzes.getById(parseInt(req.params.id));
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
    
    // Privacy check
    if (quiz.visibility === 'private' && Number(quiz.user_id) !== Number(req.user.userId)) {
      return res.status(403).json({ error: 'Quiz này ở chế độ Riêng tư' });
    }

    let qs = questions.getByQuizId(quiz.id);
    qs = ensureVocabQuizUpToDate(quiz, qs);
    res.json({ ...quiz, questions: qs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/quizzes/code/:code', (req, res) => {
  try {
    const quiz = quizzes.getByCode(req.params.code, req.user.userId);
    if (!quiz) return res.status(404).json({ error: 'Quiz không tồn tại hoặc ở chế độ Riêng tư' });
    let qs = questions.getByQuizId(quiz.id);
    qs = ensureVocabQuizUpToDate(quiz, qs);
    res.json({ ...quiz, questions: qs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/quizzes', (req, res) => {
  try {
    const { title, description, visibility = 'private' } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const code = generateUniqueCode();
    const quizId = quizzes.create(req.user.userId, code, title, description || '', 'question', null, null, visibility);
    const quiz = quizzes.getById(quizId);
    res.status(201).json(quiz);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/quizzes/:id', (req, res) => {
  try {
    const quizId = parseInt(req.params.id);
    const { title, description, visibility = 'private' } = req.body;
    const existing = quizzes.getById(quizId);
    if (!existing || Number(existing.user_id) !== Number(req.user.userId)) {
      return res.status(403).json({ error: 'Bạn không có quyền sửa Quiz này' });
    }

    quizzes.update(quizId, req.user.userId, title || existing.title, description ?? existing.description, existing.quiz_type, existing.vocab_lang, existing.meaning_lang, visibility);
    const updated = quizzes.getById(quizId);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/quizzes/:id', (req, res) => {
  try {
    const quizId = parseInt(req.params.id);
    const deleted = quizzes.delete(quizId, req.user.userId);
    if (!deleted) return res.status(403).json({ error: 'Không thể xóa Quiz này' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Vocabulary Quiz Routes ---

app.post('/api/quizzes/vocabulary', (req, res) => {
  try {
    const { title, description, vocab_lang, meaning_lang, words, visibility = 'private' } = req.body;
    if (!title || !words || !words.length) {
      return res.status(400).json({ error: 'Title and words are required' });
    }
    const code = generateUniqueCode();
    const quizId = quizzes.create(req.user.userId, code, title, description || '', 'vocabulary', vocab_lang, meaning_lang, visibility);
    
    const generatedQuestions = generateQuestionsFromVocab(words);
    bulkInsertQuestions(quizId, generatedQuestions);
    
    const quiz = quizzes.getById(quizId);
    res.status(201).json(quiz);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/quizzes/:id/vocabulary', (req, res) => {
  try {
    const quizId = parseInt(req.params.id);
    const { title, description, vocab_lang, meaning_lang, words, visibility = 'private' } = req.body;
    const quiz = quizzes.getById(quizId);
    if (!quiz || Number(quiz.user_id) !== Number(req.user.userId)) {
      return res.status(403).json({ error: 'Bạn không có quyền sửa Quiz này' });
    }
    
    quizzes.update(quizId, req.user.userId, title || quiz.title, description ?? quiz.description, 'vocabulary', vocab_lang, meaning_lang, visibility);
    
    questions.deleteByQuizId(quizId);
    
    if (words && words.length > 0) {
      const generatedQuestions = generateQuestionsFromVocab(words);
      bulkInsertQuestions(quizId, generatedQuestions);
    }
    
    const updated = quizzes.getById(quizId);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function generateQuestionsFromVocab(words) {
  const generated = [];
  if (words.length < 4) {
    words.forEach(w => {
      generated.push({ question_text: w.word, correct_answer: w.meaning, question_type: 'fill_word_meaning', ipa: w.ipa });
      generated.push({ question_text: w.meaning, correct_answer: w.word, question_type: 'fill_meaning_word', ipa: w.ipa });
      if (w.ipa) {
        generated.push({ question_text: w.ipa, correct_answer: w.word, question_type: 'fill_ipa_word', ipa: w.ipa });
        generated.push({ question_text: w.ipa, correct_answer: w.meaning, question_type: 'fill_ipa_meaning', ipa: w.ipa });
      }
      generated.push({ question_text: '🎧 ' + w.word, correct_answer: w.meaning, question_type: 'fill_listen_meaning', ipa: w.ipa });
      generated.push({ question_text: '🎧 ' + w.word, correct_answer: w.word, question_type: 'fill_listen_word', ipa: w.ipa });
    });
    return generated;
  }

  words.forEach((w, index) => {
    const getWrong = (key, correctVal) => {
      const distractors = [];
      const others = words.filter((_, i) => i !== index && words[i][key]);
      const shuffled = others.sort(() => 0.5 - Math.random());
      for (const opt of shuffled) {
        if (!distractors.includes(opt[key]) && opt[key] !== correctVal) {
          distractors.push(opt[key]);
        }
        if (distractors.length === 3) break;
      }
      return distractors;
    };

    generated.push({ question_text: w.word, correct_answer: w.meaning, question_type: 'fill_word_meaning', ipa: w.ipa });
    generated.push({ question_text: w.meaning, correct_answer: w.word, question_type: 'fill_meaning_word', ipa: w.ipa });
    generated.push({ question_text: '🎧 ' + w.word, correct_answer: w.meaning, question_type: 'fill_listen_meaning', ipa: w.ipa });
    generated.push({ question_text: '🎧 ' + w.word, correct_answer: w.word, question_type: 'fill_listen_word', ipa: w.ipa });
    if (w.ipa) {
      generated.push({ question_text: w.ipa, correct_answer: w.word, question_type: 'fill_ipa_word', ipa: w.ipa });
      generated.push({ question_text: w.ipa, correct_answer: w.meaning, question_type: 'fill_ipa_meaning', ipa: w.ipa });
    }

    const wrongMeanings = getWrong('meaning', w.meaning);
    if (wrongMeanings.length === 3) {
      const opts = [w.meaning, ...wrongMeanings].sort(() => 0.5 - Math.random());
      generated.push({ question_text: w.word + '|||' + JSON.stringify(opts), correct_answer: w.meaning, question_type: 'mcq_word_meaning', ipa: w.ipa });
      generated.push({ question_text: '🎧 ' + w.word + '|||' + JSON.stringify(opts), correct_answer: w.meaning, question_type: 'mcq_listen_meaning', ipa: w.ipa });
      if (w.ipa) {
        generated.push({ question_text: w.ipa + '|||' + JSON.stringify(opts), correct_answer: w.meaning, question_type: 'mcq_ipa_meaning', ipa: w.ipa });
      }
    }

    const wrongWords = getWrong('word', w.word);
    if (wrongWords.length === 3) {
      const opts = [w.word, ...wrongWords].sort(() => 0.5 - Math.random());
      generated.push({ question_text: w.meaning + '|||' + JSON.stringify(opts), correct_answer: w.word, question_type: 'mcq_meaning_word', ipa: w.ipa });
      generated.push({ question_text: '🎧 ' + w.word + '|||' + JSON.stringify(opts), correct_answer: w.word, question_type: 'mcq_listen_word', ipa: w.ipa });
      if (w.ipa) {
        generated.push({ question_text: w.ipa + '|||' + JSON.stringify(opts), correct_answer: w.word, question_type: 'mcq_ipa_word', ipa: w.ipa });
      }
    }

    if (w.ipa) {
      const wrongIPAs = getWrong('ipa', w.ipa);
      if (wrongIPAs.length === 3) {
        const opts = [w.ipa, ...wrongIPAs].sort(() => 0.5 - Math.random());
        generated.push({ question_text: w.meaning + '|||' + JSON.stringify(opts), correct_answer: w.ipa, question_type: 'mcq_meaning_ipa', ipa: w.ipa });
        generated.push({ question_text: w.word + '|||' + JSON.stringify(opts), correct_answer: w.ipa, question_type: 'mcq_word_ipa', ipa: w.ipa });
      }
    }
  });

  const dedupeTypes = new Set(['mcq_word_ipa', 'mcq_ipa_word', 'fill_ipa_word', 'fill_word_ipa', 'mcq_listen_word', 'fill_listen_word']);
  const seenDedupeKeys = new Set();

  const filteredGenerated = [];
  for (const q of generated) {
    if (dedupeTypes.has(q.question_type)) {
      const cleanPrompt = (q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0].trim().toLowerCase();
      const key = `${q.question_type}:${cleanPrompt}`;
      if (seenDedupeKeys.has(key)) continue;
      seenDedupeKeys.add(key);
    }
    filteredGenerated.push(q);
  }

  return filteredGenerated;
}

app.post('/api/quizzes/wrong-words/add', (req, res) => {
  try {
    const { word, meaning, ipa } = req.body;
    if (!word || !meaning) {
      return res.status(400).json({ error: 'Word and meaning are required' });
    }

    const cleanWord = String(word).trim();
    const cleanMeaning = String(meaning).trim();
    const cleanIpa = ipa ? String(ipa).trim() : '';

    if (!cleanWord || !cleanMeaning) {
      return res.status(400).json({ error: 'Word and meaning cannot be empty' });
    }

    ensureWrongQuizForUser(req.user.userId);
    const userQuizzes = quizzes.getAllForUser(req.user.userId);
    let wrongQuiz = userQuizzes.find(q => q.is_pinned === 1 || q.title === 'Các từ sai/hay quên');

    if (!wrongQuiz) {
      return res.status(500).json({ error: 'Could not find wrong words quiz' });
    }

    const qs = questions.getByQuizId(wrongQuiz.id);
    const wordMap = new Map();

    for (const q of qs) {
      let w = '', m = '', p = q.ipa || '';
      if (q.question_type === 'fill_word_meaning' || q.question_type === 'mcq_word_meaning') {
        w = (q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0].trim();
        m = (q.correct_answer || '').trim();
      } else if (q.question_type === 'fill_meaning_word' || q.question_type === 'mcq_meaning_word') {
        w = (q.correct_answer || '').trim();
        m = (q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0].trim();
      }
      if (w && m) {
        const key = w.toLowerCase() + ':::' + m.toLowerCase();
        if (!wordMap.has(key)) {
          wordMap.set(key, { word: w, meaning: m, ipa: p });
        } else if (p && !wordMap.get(key).ipa) {
          wordMap.get(key).ipa = p;
        }
      }
    }

    const targetKey = cleanWord.toLowerCase() + ':::' + cleanMeaning.toLowerCase();
    let updated = false;

    if (!wordMap.has(targetKey)) {
      wordMap.set(targetKey, { word: cleanWord, meaning: cleanMeaning, ipa: cleanIpa });
      updated = true;
    } else if (cleanIpa && !wordMap.get(targetKey).ipa) {
      wordMap.get(targetKey).ipa = cleanIpa;
      updated = true;
    }

    if (updated) {
      const allWords = Array.from(wordMap.values());
      const newQuestions = generateQuestionsFromVocab(allWords);
      questions.deleteByQuizId(wrongQuiz.id);
      bulkInsertQuestions(wrongQuiz.id, newQuestions);
      return res.json({ success: true, added: true, wordCount: allWords.length });
    }

    return res.json({ success: true, added: false, wordCount: wordMap.size });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ Community Hub APIs ============

app.get('/api/community/quizzes', (req, res) => {
  try {
    const publicQuizzes = quizzes.getPublicQuizzes(req.query.q || '');
    res.json(publicQuizzes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/community/clone/:id', (req, res) => {
  try {
    const quizId = parseInt(req.params.id);
    const newQuizId = quizzes.cloneToUser(quizId, req.user.userId);
    if (!newQuizId) {
      return res.status(404).json({ error: 'Quiz không tồn tại để sao chép' });
    }
    res.json({ success: true, newQuizId, message: 'Đã tải Quiz về bộ sưu tập cá nhân' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ Game Sessions APIs (Phiên chơi dở) ============

app.get('/api/sessions/vocab', (req, res) => {
  try {
    const groups = sessions.getByUserGroupedByQuiz(req.user.userId);
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sessions/save', (req, res) => {
  try {
    const { quizId, qtype, sessionData } = req.body;
    if (!quizId || !qtype || !sessionData) {
      return res.status(400).json({ error: 'quizId, qtype, and sessionData are required' });
    }
    sessions.save(req.user.userId, parseInt(quizId), qtype, sessionData);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/sessions/:id', (req, res) => {
  try {
    sessions.deleteById(parseInt(req.params.id), req.user.userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/sessions/quiz/:quizId/qtype/:qtype', (req, res) => {
  try {
    sessions.delete(req.user.userId, parseInt(req.params.quizId), req.params.qtype);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Question Management APIs ---

app.post('/api/quizzes/:id/questions', uploadImage.single('image'), (req, res) => {
  try {
    const quizId = parseInt(req.params.id);
    const quiz = quizzes.getById(quizId);
    if (!quiz || Number(quiz.user_id) !== Number(req.user.userId)) {
      return res.status(403).json({ error: 'Bạn không có quyền chỉnh sửa' });
    }

    const { question_text, correct_answer } = req.body;
    if (!question_text || !correct_answer) {
      return res.status(400).json({ error: 'Question text and correct answer are required' });
    }

    const imagePath = req.file ? `/uploads/images/${req.file.filename}` : null;
    const maxOrder = questions.getMaxOrder(quizId);
    const qId = questions.create(quizId, question_text, correct_answer, imagePath, null, maxOrder + 1);

    const question = questions.getById(qId);
    res.status(201).json(question);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/questions/:id', uploadImage.single('image'), (req, res) => {
  try {
    const qId = parseInt(req.params.id);
    const existing = questions.getById(qId);
    if (!existing) return res.status(404).json({ error: 'Question not found' });

    const quiz = quizzes.getById(existing.quiz_id);
    if (!quiz || Number(quiz.user_id) !== Number(req.user.userId)) {
      return res.status(403).json({ error: 'Bạn không có quyền chỉnh sửa' });
    }

    const { question_text, correct_answer } = req.body;
    let imagePath = existing.image_path;
    if (req.file) {
      imagePath = `/uploads/images/${req.file.filename}`;
    }

    questions.update(qId, question_text || existing.question_text, correct_answer || existing.correct_answer, imagePath, existing.audio_path);
    const updated = questions.getById(qId);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/questions/:id', (req, res) => {
  try {
    const qId = parseInt(req.params.id);
    const existing = questions.getById(qId);
    if (!existing) return res.status(404).json({ error: 'Question not found' });

    const quiz = quizzes.getById(existing.quiz_id);
    if (!quiz || Number(quiz.user_id) !== Number(req.user.userId)) {
      return res.status(403).json({ error: 'Bạn không có quyền xóa' });
    }

    questions.delete(qId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Excel Import API ---

app.post('/api/import/preview', uploadExcel.any(), (req, res) => {
  try {
    const file = (req.files && req.files.length > 0) ? req.files[0] : req.file;
    if (!file) return res.status(400).json({ error: 'Vui lòng chọn file Excel' });

    const mode = req.body.mode || 'question';
    const workbook = XLSX.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet);

    if (!rows || rows.length === 0) {
      return res.status(400).json({ error: 'File Excel rỗng hoặc không có dữ liệu' });
    }

    const preview = [];

    if (mode === 'vocabulary') {
      for (const row of rows) {
        let word = row['Từ vựng'] || row['Từ'] || row['Word'] || row['word'] || row['vocab'] || row['Vocabulary'] || '';
        let meaning = row['Nghĩa'] || row['Meaning'] || row['meaning'] || row['Dịch'] || row['dịch'] || row['Answer'] || row['answer'] || '';
        let ipa = row['Phiên âm (IPA)'] || row['Phiên âm'] || row['IPA'] || row['ipa'] || row['Phonetic'] || '';

        if (!word || !meaning) {
          const vals = Object.values(row);
          if (vals.length >= 2) {
            word = vals[0];
            meaning = vals[1];
            ipa = vals[2] || '';
          }
        }

        if (word && meaning) {
          preview.push({
            word: String(word).trim(),
            meaning: String(meaning).trim(),
            ipa: String(ipa || '').trim()
          });
        }
      }
    } else {
      for (const row of rows) {
        let qText = row['Câu hỏi'] || row['Question'] || row['câu hỏi'] || row['question'] || row['Title'] || row['title'] || '';
        let cAns = row['Đáp án'] || row['Answer'] || row['đáp án'] || row['answer'] || row['Đáp án đúng'] || row['Correct Answer'] || '';

        if (!qText || !cAns) {
          const vals = Object.values(row);
          if (vals.length >= 2) {
            qText = vals[0];
            cAns = vals[1];
          }
        }

        if (qText && cAns) {
          preview.push({
            question_text: String(qText).trim(),
            correct_answer: String(cAns).trim()
          });
        }
      }
    }

    if (preview.length === 0) {
      return res.status(400).json({ error: 'Không đọc được dữ liệu từ file Excel. Vui lòng kiểm tra định dạng cột.' });
    }

    res.json({ preview, total: preview.length, filename: file.originalname });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Lỗi khi xử lý file Excel' });
  }
});

app.post('/api/quizzes/import', uploadExcel.any(), (req, res) => {
  req.url = '/api/import/preview';
  app._router.handle(req, res);
});

// --- Excel Export APIs ---

app.get('/api/export/template/:mode', (req, res) => {
  try {
    const mode = req.params.mode;
    let data = [];
    let filename = 'Template_TuVung.xlsx';

    if (mode === 'vocabulary' || mode === 'vocab') {
      data = [
        ['Từ vựng', 'Nghĩa', 'Phiên âm (IPA)'],
        ['apple', 'quả táo', '/ˈæp.əl/'],
        ['banana', 'quả chuối', '/bəˈnæn.ə/'],
        ['cat', 'con mèo', '/kæt/']
      ];
      filename = 'Template_TuVung.xlsx';
    } else {
      data = [
        ['Câu hỏi', 'Đáp án'],
        ['Thủ đô của Việt Nam là gì?', 'Hà Nội'],
        ['1 + 1 = ?', '2']
      ];
      filename = 'Template_CauHoi.xlsx';
    }

    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/export/:id', (req, res) => {
  try {
    const quizId = parseInt(req.params.id);
    const quiz = quizzes.getById(quizId);
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz không tồn tại' });
    }

    const qs = questions.getByQuizId(quizId);
    let data = [];

    if (quiz.quiz_type === 'vocabulary') {
      const wordMap = new Map();
      for (const q of qs) {
        let w = '', m = '', p = q.ipa || '';
        if (q.question_type === 'fill_word_meaning' || q.question_type === 'mcq_word_meaning') {
          w = (q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0].trim();
          m = (q.correct_answer || '').trim();
        } else if (q.question_type === 'fill_meaning_word' || q.question_type === 'mcq_meaning_word') {
          w = (q.correct_answer || '').trim();
          m = (q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0].trim();
        } else if (!q.question_type || q.question_type === 'fill') {
          w = (q.question_text || '').trim();
          m = (q.correct_answer || '').trim();
        }

        if (w && m) {
          const key = w.toLowerCase() + ':::' + m.toLowerCase();
          if (!wordMap.has(key)) {
            wordMap.set(key, { word: w, meaning: m, ipa: p });
          } else if (p && !wordMap.get(key).ipa) {
            wordMap.get(key).ipa = p;
          }
        }
      }

      data.push(['Từ vựng', 'Nghĩa', 'Phiên âm (IPA)']);
      if (wordMap.size > 0) {
        for (const item of wordMap.values()) {
          data.push([item.word, item.meaning, item.ipa || '']);
        }
      } else {
        for (const q of qs) {
          data.push([q.question_text, q.correct_answer, q.ipa || '']);
        }
      }
    } else {
      data.push(['Câu hỏi', 'Đáp án']);
      for (const q of qs) {
        data.push([q.question_text, q.correct_answer]);
      }
    }

    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const safeTitle = (quiz.title || 'Quiz').replace(/[^a-zA-Z0-9_\-áàảãạăắằẳẵặâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬĐÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴ]/g, '_');
    const filename = `${safeTitle}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- TTS Proxy Endpoint ---

app.get('/api/tts', async (req, res) => {
  try {
    const text = req.query.text || '';
    const lang = req.query.lang || 'en';

    if (!text) {
      return res.status(400).send('Text parameter is required');
    }

    const cleanText = String(text).replace(/<[^>]*>/g, '').trim().substring(0, 200);
    
    let gLang = String(lang).toLowerCase().trim();
    if (gLang === 'zh') gLang = 'zh-CN';
    else if (gLang.includes('-')) gLang = gLang.split('-')[0];

    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleanText)}&tl=${gLang}&client=tw-ob`;

    const response = await fetch(ttsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      return res.status(500).send('TTS upstream error');
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.set('Content-Type', 'audio/mpeg');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (err) {
    console.error('TTS proxy error:', err);
    res.status(500).send('TTS proxy error');
  }
});

// Catch-all SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  if (err) {
    return res.status(500).json({ error: err.message });
  }
  next();
});

// Start Server
async function start() {
  try {
    await initDatabase();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🚀 Quiz App is running!`);
      console.log(`   Local:    http://localhost:${PORT}`);
      console.log(`   Network:  http://0.0.0.0:${PORT}\n`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
