const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
  initDatabase,
  quizzes,
  questions,
  settings,
  userSessions
} = require('./database');
const { ensureVocabQuizUpToDate } = require('./services/vocabService');

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

const uploadExcel = multer({
  storage: excelStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(xlsx|xls|csv)$/i;
    if (allowed.test(path.extname(file.originalname))) cb(null, true);
    else cb(new Error('Only Excel/CSV files are allowed'));
  }
});

// Auth & Session Middleware
const activeSessions = new Map();

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.headers['x-session-token']) {
    token = req.headers['x-session-token'];
  } else if (req.body && req.body.token) {
    token = req.body.token;
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (token) {
    if (activeSessions.has(token)) {
      req.user = activeSessions.get(token);
      return next();
    }
    const dbSession = userSessions.get(token);
    if (dbSession) {
      activeSessions.set(token, dbSession);
      req.user = dbSession;
      return next();
    }
  }

  if (req.body && req.body.userId) {
    req.user = { userId: parseInt(req.body.userId), username: 'user' };
    return next();
  }
  if (req.query && req.query.userId) {
    req.user = { userId: parseInt(req.query.userId), username: 'user' };
    return next();
  }

  req.user = { userId: 1, username: 'admin' };
  next();
}

app.use(authenticate);

// Real-Time SSE Sync
const sseClients = new Map();

function broadcastToUser(userId, payload, excludeRes = null) {
  const clients = sseClients.get(Number(userId));
  if (!clients || clients.size === 0) return;
  const message = `data: ${JSON.stringify(payload)}\n\n`;
  for (const clientRes of clients) {
    if (clientRes !== excludeRes) {
      try {
        clientRes.write(message);
      } catch (e) {
        clients.delete(clientRes);
      }
    }
  }
}

app.get('/api/sync/events', (req, res) => {
  const userId = req.user ? Number(req.user.userId) : null;
  if (!userId) {
    return res.status(401).end();
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (res.flushHeaders) res.flushHeaders();

  if (!sseClients.has(userId)) {
    sseClients.set(userId, new Set());
  }
  const userSet = sseClients.get(userId);
  userSet.add(res);

  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', userId })}\n\n`);

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (e) {
      clearInterval(heartbeat);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    userSet.delete(res);
    if (userSet.size === 0) {
      sseClients.delete(userId);
    }
  });
});

// Settings APIs
app.get('/api/settings', (req, res) => {
  try {
    const userSet = settings.getByUserId(req.user.userId);
    res.json(userSet || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings', (req, res) => {
  try {
    const settingsData = req.body;
    if (!settingsData || typeof settingsData !== 'object') {
      return res.status(400).json({ error: 'Invalid settings object' });
    }
    settings.save(req.user.userId, settingsData);

    broadcastToUser(req.user.userId, {
      type: 'SETTINGS_UPDATED',
      settings: settingsData,
      updatedAt: Date.now()
    }, res);

    res.json({ success: true, settings: settingsData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mount Routes
const createAuthRouter = require('./routes/auth');
const createQuestionsRouter = require('./routes/questions');
const createSessionsRouter = require('./routes/sessions');
const createImportExportRouter = require('./routes/import-export');

app.use('/api/auth', createAuthRouter(activeSessions));
app.use('/api/quizzes', require('./routes/quizzes'));
app.use('/api', createQuestionsRouter(uploadImage));
app.use('/api/sessions', createSessionsRouter(broadcastToUser));
app.use('/api/community', require('./routes/community'));
app.use('/api', createImportExportRouter(uploadExcel));
app.use('/api/tts', require('./routes/tts'));

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

function sanitizeAllVocabQuizzesInDatabase() {
  try {
    const allQuizzesList = quizzes.getAll();
    const vocabQuizzes = allQuizzesList.filter(q => q.quiz_type === 'vocabulary');
    let count = 0;
    for (const vq of vocabQuizzes) {
      const qs = questions.getByQuizId(vq.id);
      if (qs && qs.length > 0) {
        ensureVocabQuizUpToDate(vq, qs);
        count++;
      }
    }
    console.log(`✅ Cleaned up and updated ${count} vocabulary quizzes in database.`);
  } catch (err) {
    console.warn('Database vocab sanitization error:', err);
  }
}

// Start Server
async function start() {
  try {
    await initDatabase();
    sanitizeAllVocabQuizzesInDatabase();
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
