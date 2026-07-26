const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'data', 'quiz.db');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db = null;

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password)).digest('hex');
}

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

  // 1. Users Table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Ensure Admin User (admin / admin) exists with ID 1
  let adminUser = queryOne('SELECT * FROM users WHERE username = ?', ['admin']);
  if (!adminUser) {
    db.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', ['admin', hashPassword('admin')]);
    adminUser = queryOne('SELECT * FROM users WHERE username = ?', ['admin']);
  }

  // 2. Quizzes Table
  db.run(`
    CREATE TABLE IF NOT EXISTS quizzes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER DEFAULT 1,
      code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      quiz_type TEXT DEFAULT 'question',
      vocab_lang TEXT DEFAULT NULL,
      meaning_lang TEXT DEFAULT NULL,
      visibility TEXT DEFAULT 'private',
      is_pinned INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Migrations for quizzes table
  try { db.run("ALTER TABLE quizzes ADD COLUMN quiz_type TEXT DEFAULT 'question'"); } catch (e) {}
  try { db.run("ALTER TABLE quizzes ADD COLUMN vocab_lang TEXT DEFAULT NULL"); } catch (e) {}
  try { db.run("ALTER TABLE quizzes ADD COLUMN meaning_lang TEXT DEFAULT NULL"); } catch (e) {}
  try { db.run("ALTER TABLE quizzes ADD COLUMN is_pinned INTEGER DEFAULT 0"); } catch (e) {}
  try { db.run("ALTER TABLE quizzes ADD COLUMN user_id INTEGER DEFAULT 1"); } catch (e) {}
  try { db.run("ALTER TABLE quizzes ADD COLUMN visibility TEXT DEFAULT 'private'"); } catch (e) {}

  // Update NULL user_id / NULL visibility for existing quizzes
  db.run("UPDATE quizzes SET user_id = 1 WHERE user_id IS NULL");
  db.run("UPDATE quizzes SET visibility = 'private' WHERE visibility IS NULL");

  // Ensure Admin's "Các từ sai/hay quên" pinned quiz exists
  ensureWrongQuizForUser(1);

  // 3. Questions Table
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

  try { db.run("ALTER TABLE questions ADD COLUMN ipa TEXT DEFAULT NULL"); } catch (e) {}
  try { db.run("ALTER TABLE questions ADD COLUMN question_type TEXT DEFAULT 'fill'"); } catch (e) {}

  // 4. Game Sessions Table (Unfinished progress for each quiz & qtype)
  db.run(`
    CREATE TABLE IF NOT EXISTS game_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      quiz_id INTEGER NOT NULL,
      qtype TEXT NOT NULL,
      session_data TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, quiz_id, qtype),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
    )
  `);

  // 5. User Settings Table
  db.run(`
    CREATE TABLE IF NOT EXISTS user_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      UNIQUE(user_id, key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create Indexes
  db.run('CREATE INDEX IF NOT EXISTS idx_quizzes_code ON quizzes(code)');
  db.run('CREATE INDEX IF NOT EXISTS idx_quizzes_user_id ON quizzes(user_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_quizzes_visibility ON quizzes(visibility)');
  db.run('CREATE INDEX IF NOT EXISTS idx_questions_quiz_id ON questions(quiz_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_game_sessions_user ON game_sessions(user_id)');

  saveDatabase();
  console.log('✅ Database initialized successfully');
  return db;
}

function ensureWrongQuizForUser(userId) {
  try {
    const wrongQuiz = queryOne("SELECT id FROM quizzes WHERE user_id = ? AND (is_pinned = 1 OR code = ?)", [userId, `WRONG_${userId}`]);
    if (!wrongQuiz) {
      const code = userId === 1 ? 'WRONG0' : `WRONG_${userId}`;
      db.run(
        "INSERT INTO quizzes (user_id, code, title, description, quiz_type, is_pinned, visibility) VALUES (?, ?, 'Các từ sai/hay quên', 'Danh sách các từ vựng bạn đã trả lời sai hoặc bấm Không nhớ', 'vocabulary', 1, 'private')",
        [userId, code]
      );
    }
  } catch (e) {
    console.error(`Error ensuring wrong quiz for user ${userId}:`, e);
  }
}

function saveDatabase() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

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

// User CRUD & Auth
const users = {
  findByUsername(username) {
    return queryOne('SELECT * FROM users WHERE LOWER(username) = LOWER(?)', [username]);
  },
  findById(id) {
    return queryOne('SELECT id, username, created_at FROM users WHERE id = ?', [id]);
  },
  create(username, password) {
    const passwordHash = hashPassword(password);
    db.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, passwordHash]);
    const user = queryOne('SELECT id, username FROM users WHERE username = ?', [username]);
    saveDatabase();
    if (user) {
      ensureWrongQuizForUser(user.id);
    }
    return user;
  },
  verifyPassword(user, password) {
    return user && user.password_hash === hashPassword(password);
  },
  changePassword(userId, newPassword) {
    const passwordHash = hashPassword(newPassword);
    runSql('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);
  }
};

// Quiz CRUD
const quizzes = {
  getAll() {
    return queryAll('SELECT * FROM quizzes');
  },

  getAllForUser(userId) {
    return queryAll(`
      SELECT q.*, 
             (SELECT COUNT(*) FROM questions qu WHERE qu.quiz_id = q.id) as question_count 
      FROM quizzes q 
      WHERE q.user_id = ? 
      ORDER BY q.is_pinned DESC, q.created_at DESC
    `, [userId]);
  },

  getPublicQuizzes(searchQuery = '') {
    if (searchQuery) {
      const q = `%${searchQuery}%`;
      return queryAll(`
        SELECT q.*, u.username as owner_name,
               (SELECT COUNT(*) FROM questions qu WHERE qu.quiz_id = q.id) as question_count
        FROM quizzes q
        JOIN users u ON q.user_id = u.id
        WHERE q.visibility = 'public' AND (q.title LIKE ? OR q.description LIKE ?)
        ORDER BY q.created_at DESC
      `, [q, q]);
    }
    return queryAll(`
      SELECT q.*, u.username as owner_name,
             (SELECT COUNT(*) FROM questions qu WHERE qu.quiz_id = q.id) as question_count
      FROM quizzes q
      JOIN users u ON q.user_id = u.id
      WHERE q.visibility = 'public'
      ORDER BY q.created_at DESC
    `);
  },

  getById(id) {
    return queryOne('SELECT * FROM quizzes WHERE id = ?', [id]);
  },

  getByCode(code, userId = null) {
    const quiz = queryOne('SELECT * FROM quizzes WHERE code = ?', [code]);
    if (!quiz) return null;
    
    // Privacy check:
    // If Private, only owner can access
    if (quiz.visibility === 'private') {
      if (userId && Number(quiz.user_id) === Number(userId)) {
        return quiz;
      }
      return null; // Access denied for private quiz
    }

    // Unlisted or Public is accessible via code
    return quiz;
  },

  create(userId, code, title, description, quizType = 'question', vocabLang = null, meaningLang = null, visibility = 'private') {
    db.run(
      'INSERT INTO quizzes (user_id, code, title, description, quiz_type, vocab_lang, meaning_lang, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, code, title, description, quizType, vocabLang, meaningLang, visibility]
    );
    const result = queryOne('SELECT last_insert_rowid() as id');
    const insertedId = result ? result.id : null;
    saveDatabase();
    if (!insertedId) {
      const quiz = queryOne('SELECT id FROM quizzes WHERE code = ?', [code]);
      return quiz ? quiz.id : null;
    }
    return insertedId;
  },

  update(id, userId, title, description, quizType = 'question', vocabLang = null, meaningLang = null, visibility = 'private') {
    runSql(
      'UPDATE quizzes SET title = ?, description = ?, quiz_type = ?, vocab_lang = ?, meaning_lang = ?, visibility = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
      [title, description, quizType, vocabLang, meaningLang, visibility, id, userId]
    );
  },

  delete(id, userId) {
    // Check ownership
    const quiz = queryOne('SELECT id FROM quizzes WHERE id = ? AND user_id = ?', [id, userId]);
    if (!quiz) return false;
    
    runSql('DELETE FROM questions WHERE quiz_id = ?', [id]);
    runSql('DELETE FROM game_sessions WHERE quiz_id = ?', [id]);
    runSql('DELETE FROM quizzes WHERE id = ?', [id]);
    return true;
  },

  cloneToUser(quizId, targetUserId) {
    const original = queryOne('SELECT * FROM quizzes WHERE id = ?', [quizId]);
    if (!original) return null;

    const newCode = generateUniqueCode();
    const newTitle = `${original.title} (Sao chép)`;
    const newQuizId = quizzes.create(
      targetUserId,
      newCode,
      newTitle,
      original.description,
      original.quiz_type,
      original.vocab_lang,
      original.meaning_lang,
      'private'
    );

    const origQuestions = questions.getByQuizId(quizId);
    if (origQuestions && origQuestions.length > 0) {
      bulkInsertQuestions(newQuizId, origQuestions);
    }
    return newQuizId;
  }
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

// Game Sessions CRUD (Folder -> Question Type files)
const sessions = {
  getByUserGroupedByQuiz(userId) {
    const rows = queryAll(`
      SELECT s.*, q.title as quiz_title, q.quiz_type, q.vocab_lang, q.meaning_lang, q.code as quiz_code
      FROM game_sessions s
      JOIN quizzes q ON s.quiz_id = q.id
      WHERE s.user_id = ?
      ORDER BY s.updated_at DESC
    `, [userId]);

    // Group by quiz
    const groupsMap = new Map();
    for (const r of rows) {
      if (!groupsMap.has(r.quiz_id)) {
        groupsMap.set(r.quiz_id, {
          quiz_id: r.quiz_id,
          quiz_title: r.quiz_title,
          quiz_code: r.quiz_code,
          quiz_type: r.quiz_type,
          vocab_lang: r.vocab_lang,
          meaning_lang: r.meaning_lang,
          sessions: []
        });
      }

      let parsedData = {};
      try {
        parsedData = JSON.parse(r.session_data);
      } catch (e) {}

      groupsMap.get(r.quiz_id).sessions.push({
        session_id: r.id,
        qtype: r.qtype,
        updated_at: r.updated_at,
        current_index: parsedData.currentQuestionIndex || 0,
        total_questions: (parsedData.queue && parsedData.queue.length > 0) ? parsedData.queue.length : (parsedData.questions ? parsedData.questions.length : 0),
        score: parsedData.score || 0,
        wrong_count: parsedData.wrongCount || 0,
        mode: parsedData.mode || 'mcq',
        session_data: parsedData
      });
    }

    return Array.from(groupsMap.values());
  },

  getAllForUser(userId) {
    return this.getByUserGroupedByQuiz(userId);
  },

  getOne(userId, quizId, qtype) {
    return queryOne('SELECT * FROM game_sessions WHERE user_id = ? AND quiz_id = ? AND qtype = ?', [userId, quizId, qtype]);
  },

  save(userId, quizId, qtype, sessionDataObj) {
    const dataStr = typeof sessionDataObj === 'string' ? sessionDataObj : JSON.stringify(sessionDataObj);
    const existing = queryOne('SELECT id FROM game_sessions WHERE user_id = ? AND quiz_id = ? AND qtype = ?', [userId, quizId, qtype]);
    if (existing) {
      runSql('UPDATE game_sessions SET session_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [dataStr, existing.id]);
    } else {
      runSql('INSERT INTO game_sessions (user_id, quiz_id, qtype, session_data) VALUES (?, ?, ?, ?)', [userId, quizId, qtype, dataStr]);
    }
  },

  delete(userId, quizId, qtype) {
    runSql('DELETE FROM game_sessions WHERE user_id = ? AND quiz_id = ? AND qtype = ?', [userId, quizId, qtype]);
  },

  deleteById(id, userId) {
    runSql('DELETE FROM game_sessions WHERE id = ? AND user_id = ?', [id, userId]);
  }
};

module.exports = {
  initDatabase,
  generateUniqueCode,
  users,
  quizzes,
  questions,
  sessions,
  bulkInsertQuestions,
  ensureWrongQuizForUser
};
