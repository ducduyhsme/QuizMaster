const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'quiz.db');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db = null;

async function initDatabase() {
  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');

  // Initialize schema
  db.run(`
    CREATE TABLE IF NOT EXISTS quizzes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      quiz_type TEXT DEFAULT 'question',
      vocab_lang TEXT DEFAULT NULL,
      meaning_lang TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migrate existing quizzes table
  try {
    db.run("ALTER TABLE quizzes ADD COLUMN quiz_type TEXT DEFAULT 'question'");
    db.run("ALTER TABLE quizzes ADD COLUMN vocab_lang TEXT DEFAULT NULL");
    db.run("ALTER TABLE quizzes ADD COLUMN meaning_lang TEXT DEFAULT NULL");
  } catch (e) {
    // Ignore if columns already exist
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id INTEGER NOT NULL,
      question_text TEXT NOT NULL,
      correct_answer TEXT NOT NULL,
      image_path TEXT DEFAULT NULL,
      audio_path TEXT DEFAULT NULL,
      order_index INTEGER DEFAULT 0,
      ipa TEXT DEFAULT NULL,
      question_type TEXT DEFAULT 'fill',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
    )
  `);

  // Migrate existing questions table
  try {
    db.run("ALTER TABLE questions ADD COLUMN ipa TEXT DEFAULT NULL");
    db.run("ALTER TABLE questions ADD COLUMN question_type TEXT DEFAULT 'fill'");
  } catch (e) {
    // Ignore if columns already exist
  }

  // Create indexes if not exist
  db.run('CREATE INDEX IF NOT EXISTS idx_quizzes_code ON quizzes(code)');
  db.run('CREATE INDEX IF NOT EXISTS idx_questions_quiz_id ON questions(quiz_id)');

  saveDatabase();
  console.log('✅ Database initialized');
  return db;
}

function saveDatabase() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// Helper to run queries and get results as array of objects
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const results = queryAll(sql, params);
  return results.length > 0 ? results[0] : null;
}

function runSql(sql, params = []) {
  db.run(sql, params);
  saveDatabase();
}

// Generate a unique 6-digit code
function generateUniqueCode() {
  let code;
  let attempts = 0;
  do {
    code = String(Math.floor(100000 + Math.random() * 900000));
    attempts++;
    if (attempts > 1000) throw new Error('Unable to generate unique code');
    const existing = queryOne('SELECT code FROM quizzes WHERE code = ?', [code]);
    if (!existing) break;
  } while (true);
  return code;
}

// Quiz CRUD
const quizzes = {
  getAll() {
    return queryAll(`
      SELECT q.*, 
             (SELECT COUNT(*) FROM questions qu WHERE qu.quiz_id = q.id) as question_count 
      FROM quizzes q 
      ORDER BY q.created_at DESC
    `);
  },

  getById(id) {
    return queryOne('SELECT * FROM quizzes WHERE id = ?', [id]);
  },

  getByCode(code) {
    return queryOne('SELECT * FROM quizzes WHERE code = ?', [code]);
  },

  create(code, title, description, quizType = 'question', vocabLang = null, meaningLang = null) {
    // Run insert without saving yet so last_insert_rowid() is valid
    db.run('INSERT INTO quizzes (code, title, description, quiz_type, vocab_lang, meaning_lang) VALUES (?, ?, ?, ?, ?, ?)', [code, title, description, quizType, vocabLang, meaningLang]);
    const result = queryOne('SELECT last_insert_rowid() as id');
    const insertedId = result ? result.id : null;
    saveDatabase();
    if (!insertedId) {
      // Fallback: find by code
      const quiz = queryOne('SELECT id FROM quizzes WHERE code = ?', [code]);
      return quiz ? quiz.id : null;
    }
    return insertedId;
  },

  update(id, title, description, quizType = 'question', vocabLang = null, meaningLang = null) {
    runSql('UPDATE quizzes SET title = ?, description = ?, quiz_type = ?, vocab_lang = ?, meaning_lang = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [title, description, quizType, vocabLang, meaningLang, id]);
  },

  delete(id) {
    // Delete questions first (CASCADE may not work with sql.js foreign keys in all cases)
    runSql('DELETE FROM questions WHERE quiz_id = ?', [id]);
    runSql('DELETE FROM quizzes WHERE id = ?', [id]);
  },
};

// Question CRUD
const questions = {
  getByQuizId(quizId) {
    return queryAll('SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_index ASC', [quizId]);
  },

  getById(id) {
    return queryOne('SELECT * FROM questions WHERE id = ?', [id]);
  },

  create(quizId, questionText, correctAnswer, imagePath, audioPath, orderIndex, ipa = null, questionType = 'fill') {
    db.run(
      'INSERT INTO questions (quiz_id, question_text, correct_answer, image_path, audio_path, order_index, ipa, question_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [quizId, questionText, correctAnswer, imagePath, audioPath, orderIndex, ipa, questionType]
    );
    const result = queryOne('SELECT last_insert_rowid() as id');
    const insertedId = result ? result.id : null;
    saveDatabase();
    return insertedId;
  },

  update(id, questionText, correctAnswer, imagePath, audioPath, ipa = null, questionType = 'fill') {
    runSql(
      'UPDATE questions SET question_text = ?, correct_answer = ?, image_path = ?, audio_path = ?, ipa = ?, question_type = ? WHERE id = ?',
      [questionText, correctAnswer, imagePath, audioPath, ipa, questionType, id]
    );
  },

  delete(id) {
    runSql('DELETE FROM questions WHERE id = ?', [id]);
  },

  deleteByQuizId(quizId) {
    runSql('DELETE FROM questions WHERE quiz_id = ?', [quizId]);
  },

  getMaxOrder(quizId) {
    const result = queryOne('SELECT MAX(order_index) as max_order FROM questions WHERE quiz_id = ?', [quizId]);
    return result ? result.max_order : -1;
  },
};

// Bulk insert questions
function bulkInsertQuestions(quizId, questionList) {
  let orderIndex = 0;
  for (const q of questionList) {
    db.run(
      'INSERT INTO questions (quiz_id, question_text, correct_answer, image_path, audio_path, order_index, ipa, question_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [quizId, q.question_text, q.correct_answer, q.image_path || null, q.audio_path || null, orderIndex++, q.ipa || null, q.question_type || 'fill']
    );
  }
  saveDatabase();
}

module.exports = {
  initDatabase,
  generateUniqueCode,
  quizzes,
  questions,
  bulkInsertQuestions,
};
