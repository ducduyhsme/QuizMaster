const express = require('express');
const XLSX = require('xlsx');
const { quizzes, questions } = require('../database');

function createImportExportRouter(uploadExcel) {
  const router = express.Router();

  router.post('/import/preview', uploadExcel.any(), (req, res) => {
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

  router.post('/quizzes/import', uploadExcel.any(), (req, res) => {
    req.url = '/api/import/preview';
    router.handle(req, res);
  });

  router.get('/export/template/:mode', (req, res) => {
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

  router.get('/export/:id', (req, res) => {
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

  return router;
}

module.exports = createImportExportRouter;
