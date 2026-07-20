const express = require('express');
const cors = require('cors');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { initDatabase, generateUniqueCode, quizzes, questions, bulkInsertQuestions } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure upload directories exist
const uploadsDir = path.join(__dirname, 'public', 'uploads');
const imagesDir = path.join(uploadsDir, 'images');
const audioDir = path.join(uploadsDir, 'audio');
const excelDir = path.join(uploadsDir, 'excel');
[uploadsDir, imagesDir, audioDir, excelDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Multer config for images
const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, imagesDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});

// Multer config for audio
const audioStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, audioDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});

// Multer config for excel
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
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

const uploadAudio = multer({
  storage: audioStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(mp3|wav|ogg|m4a|aac|flac|wma)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  }
});

const uploadExcel = multer({
  storage: excelStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(xlsx|xls|csv)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel/CSV files are allowed'));
    }
  }
});

// ============ API Routes ============

// --- Quizzes ---

app.get('/api/quizzes', (req, res) => {
  try {
    const allQuizzes = quizzes.getAll();
    res.json(allQuizzes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/quizzes/:id', (req, res) => {
  try {
    const quiz = quizzes.getById(parseInt(req.params.id));
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
    const qs = questions.getByQuizId(quiz.id);
    res.json({ ...quiz, questions: qs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/quizzes/code/:code', (req, res) => {
  try {
    const quiz = quizzes.getByCode(req.params.code);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
    const qs = questions.getByQuizId(quiz.id);
    res.json({ ...quiz, questions: qs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/quizzes', (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const code = generateUniqueCode();
    const quizId = quizzes.create(code, title, description || '');
    const quiz = quizzes.getById(quizId);
    res.status(201).json(quiz);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/quizzes/vocabulary', (req, res) => {
  try {
    const { title, description, vocab_lang, meaning_lang, words } = req.body;
    if (!title || !words || !words.length) {
      return res.status(400).json({ error: 'Title and words are required' });
    }
    const code = generateUniqueCode();
    const quizId = quizzes.create(code, title, description || '', 'vocabulary', vocab_lang, meaning_lang);
    
    // Generate questions from words
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
    const { title, description, vocab_lang, meaning_lang, words } = req.body;
    const quiz = quizzes.getById(quizId);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
    
    quizzes.update(quizId, title || quiz.title, description ?? quiz.description, 'vocabulary', vocab_lang, meaning_lang);
    
    // Replace all questions
    questions.deleteByQuizId(quizId);
    
    // Generate questions from words
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
    }

    const wrongWords = getWrong('word', w.word);
    if (wrongWords.length === 3) {
      const opts = [w.word, ...wrongWords].sort(() => 0.5 - Math.random());
      generated.push({ question_text: w.meaning + '|||' + JSON.stringify(opts), correct_answer: w.word, question_type: 'mcq_meaning_word', ipa: w.ipa });
      generated.push({ question_text: '🎧 ' + w.word + '|||' + JSON.stringify(opts), correct_answer: w.word, question_type: 'mcq_listen_word', ipa: w.ipa });
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

  return generated;
}

app.put('/api/quizzes/:id', (req, res) => {
  try {
    const { title, description } = req.body;
    const quiz = quizzes.getById(parseInt(req.params.id));
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
    quizzes.update(parseInt(req.params.id), title || quiz.title, description ?? quiz.description);
    const updated = quizzes.getById(parseInt(req.params.id));
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/quizzes/:id', (req, res) => {
  try {
    const quizId = parseInt(req.params.id);
    const quiz = quizzes.getById(quizId);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
    // Delete associated media files
    const qs = questions.getByQuizId(quizId);
    qs.forEach(q => {
      if (q.image_path) {
        const imgPath = path.join(__dirname, 'public', q.image_path);
        if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
      }
      if (q.audio_path) {
        const audPath = path.join(__dirname, 'public', q.audio_path);
        if (fs.existsSync(audPath)) fs.unlinkSync(audPath);
      }
    });
    quizzes.delete(quizId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Questions ---

app.post('/api/quizzes/:id/questions', (req, res) => {
  try {
    const quizId = parseInt(req.params.id);
    const quiz = quizzes.getById(quizId);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
    const { question_text, correct_answer, image_path, audio_path } = req.body;
    if (!question_text || !correct_answer) {
      return res.status(400).json({ error: 'question_text and correct_answer are required' });
    }
    const maxOrder = questions.getMaxOrder(quizId);
    const orderIndex = (maxOrder ?? -1) + 1;
    const questionId = questions.create(
      quizId, question_text, correct_answer,
      image_path || null, audio_path || null, orderIndex
    );
    const question = questions.getById(questionId);
    res.status(201).json(question);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/questions/:id', (req, res) => {
  try {
    const questionId = parseInt(req.params.id);
    const question = questions.getById(questionId);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    const { question_text, correct_answer, image_path, audio_path } = req.body;
    questions.update(
      questionId,
      question_text || question.question_text,
      correct_answer || question.correct_answer,
      image_path !== undefined ? image_path : question.image_path,
      audio_path !== undefined ? audio_path : question.audio_path
    );
    const updated = questions.getById(questionId);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/questions/:id', (req, res) => {
  try {
    const questionId = parseInt(req.params.id);
    const question = questions.getById(questionId);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    if (question.image_path) {
      const imgPath = path.join(__dirname, 'public', question.image_path);
      if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
    }
    if (question.audio_path) {
      const audPath = path.join(__dirname, 'public', question.audio_path);
      if (fs.existsSync(audPath)) fs.unlinkSync(audPath);
    }
    questions.delete(questionId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- File Upload ---

app.post('/api/upload/image', uploadImage.single('image'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image file uploaded' });
    const filePath = `/uploads/images/${req.file.filename}`;
    res.json({ path: filePath, filename: req.file.filename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/upload/audio', uploadAudio.single('audio'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });
    const filePath = `/uploads/audio/${req.file.filename}`;
    res.json({ path: filePath, filename: req.file.filename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Excel Export ---

app.get('/api/export/template/question', (req, res) => {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Question Text', 'Correct Answer'],
    ['What is the capital of France?', 'Paris'],
    ['1 + 1 = ?', '2'],
    ['How many days in a week?', '7']
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="question_template.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

app.get('/api/export/template/vocabulary', (req, res) => {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Từ vựng (Word)', 'Nghĩa (Meaning)', 'Phiên âm (IPA)'],
    ['Apple', 'Quả táo', '/ˈæp.əl/'],
    ['Banana', 'Quả chuối', '/bəˈnæn.ə/'],
    ['Cat', 'Con mèo', '/kæt/']
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="vocabulary_template.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

app.get('/api/export/:id', (req, res) => {
  try {
    const quizId = parseInt(req.params.id);
    const quiz = quizzes.getById(quizId);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
    const qs = questions.getByQuizId(quizId);

    let data;
    if (quiz.quiz_type === 'vocabulary') {
      // Reconstruct vocab list from questions
      const vocabMap = new Map();
      qs.forEach(q => {
        if (q.question_type === 'fill_word_meaning') {
          vocabMap.set(q.question_text, { word: q.question_text, meaning: q.correct_answer, ipa: q.ipa });
        }
      });
      data = [['Từ vựng (Word)', 'Nghĩa (Meaning)', 'Phiên âm (IPA)']];
      for (const v of vocabMap.values()) {
        data.push([v.word, v.meaning, v.ipa || '']);
      }
    } else {
      data = [['Question Text', 'Correct Answer']];
      qs.forEach(q => {
        data.push([q.question_text, q.correct_answer]);
      });
    }

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Quiz');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename="quiz_${quiz.code}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Excel Import ---

app.post('/api/import', uploadExcel.single('excel'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No Excel file uploaded' });

    const mode = req.body.mode || 'question';
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (data.length < 2) {
      return res.status(400).json({ error: 'Excel file must have at least a header row and one data row' });
    }

    const header = data[0].map(h => String(h).trim().toLowerCase());
    
    let questionsList = [];
    let vocabList = [];
    
    if (mode === 'vocabulary') {
      let wCol = 0, mCol = 1, iCol = 2; // Default
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || !row[wCol]) continue;
        const word = String(row[wCol]).trim();
        const meaning = String(row[mCol] || '').trim();
        const ipa = String(row[iCol] || '').trim();
        if (word && meaning) {
          vocabList.push({ word, meaning, ipa });
        }
      }
      if (vocabList.length === 0) {
        return res.status(400).json({ error: 'No valid vocabulary found in the Excel file' });
      }
      
      const title = req.body.title || path.basename(req.file.originalname, path.extname(req.file.originalname));
      const code = generateUniqueCode();
      const vocabLang = req.body.vocab_lang || 'en';
      const meaningLang = req.body.meaning_lang || 'vi';
      const quizId = quizzes.create(code, title, req.body.description || '', 'vocabulary', vocabLang, meaningLang);
      
      const generatedQuestions = generateQuestionsFromVocab(vocabList);
      bulkInsertQuestions(quizId, generatedQuestions);
      
      const quiz = quizzes.getById(quizId);
      const qs = questions.getByQuizId(quizId);
      fs.unlinkSync(req.file.path);
      return res.status(201).json({ ...quiz, questions: qs, imported_count: vocabList.length });
      
    } else {
      let qCol = header.findIndex(h => h.includes('question'));
      let aCol = header.findIndex(h => h.includes('answer') || h.includes('correct'));
      if (qCol === -1) qCol = 0;
      if (aCol === -1) aCol = 1;

      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || !row[qCol]) continue;
        const questionText = String(row[qCol]).trim();
        const correctAnswerRaw = String(row[aCol] || '').trim();
        const correctAnswer = correctAnswerRaw.split(/\r?\n/).map(s => s.trim()).filter(s => s).join('/');
        if (questionText && correctAnswer) {
          questionsList.push({ question_text: questionText, correct_answer: correctAnswer });
        }
      }

      if (questionsList.length === 0) {
        return res.status(400).json({ error: 'No valid questions found in the Excel file' });
      }

      const title = req.body.title || path.basename(req.file.originalname, path.extname(req.file.originalname));
      const code = generateUniqueCode();
      const quizId = quizzes.create(code, title, req.body.description || '');
      bulkInsertQuestions(quizId, questionsList);

      const quiz = quizzes.getById(quizId);
      const qs = questions.getByQuizId(quizId);
      fs.unlinkSync(req.file.path);
      return res.status(201).json({ ...quiz, questions: qs, imported_count: questionsList.length });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/import/preview', uploadExcel.single('excel'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No Excel file uploaded' });

    const mode = req.body.mode || 'question';
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    fs.unlinkSync(req.file.path);

    if (data.length < 2) {
      return res.status(400).json({ error: 'Excel file must have at least a header row and one data row' });
    }

    const header = data[0].map(h => String(h).trim().toLowerCase());
    const preview = [];
    
    if (mode === 'vocabulary') {
      let wCol = 0, mCol = 1, iCol = 2; // Default
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || !row[wCol]) continue;
        const word = String(row[wCol]).trim();
        const meaning = String(row[mCol] || '').trim();
        const ipa = String(row[iCol] || '').trim();
        if (word && meaning) {
          preview.push({ word, meaning, ipa });
        }
      }
    } else {
      let qCol = header.findIndex(h => h.includes('question'));
      let aCol = header.findIndex(h => h.includes('answer') || h.includes('correct'));
      if (qCol === -1) qCol = 0;
      if (aCol === -1) aCol = 1;

      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || !row[qCol]) continue;
        const questionText = String(row[qCol]).trim();
        const correctAnswerRaw = String(row[aCol] || '').trim();
        const correctAnswer = correctAnswerRaw.split(/\r?\n/).map(s => s.trim()).filter(s => s).join('/');
        if (questionText && correctAnswer) {
          preview.push({ question_text: questionText, correct_answer: correctAnswer });
        }
      }
    }

    res.json({ preview, total: preview.length, filename: req.file.originalname });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Catch-all: serve index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  if (err) {
    return res.status(500).json({ error: err.message });
  }
  next();
});

// Start server after database initialization
async function start() {
  try {
    await initDatabase();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🚀 Quiz App is running!`);
      console.log(`   Local:    http://localhost:${PORT}`);
      console.log(`   Network:  http://0.0.0.0:${PORT}`);
      console.log(`\n   Share your quiz with others by sharing your IP address!`);
      console.log(`   They can access at: http://YOUR_IP:${PORT}\n`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
