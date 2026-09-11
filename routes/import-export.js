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
        // Question Mode: Multiple Choice & Fill-in (Open-ended)
        for (const row of rows) {
          let qText = row['Question Text'] || row['Câu hỏi'] || row['Question'] || row['câu hỏi'] || row['question'] || row['Title'] || row['title'] || '';
          let qType = row['Question Type'] || row['Loại câu hỏi'] || '';
          let opt1 = row['Option 1'] || row['Lựa chọn 1'] || '';
          let opt2 = row['Option 2'] || row['Lựa chọn 2'] || '';
          let opt3 = row['Option 3'] || row['Lựa chọn 3'] || '';
          let opt4 = row['Option 4'] || row['Lựa chọn 4'] || '';
          let opt5 = row['Option 5'] || row['Lựa chọn 5'] || '';
          let rawCorrect = row['Correct Answer'] || row['Đáp án'] || row['Answer'] || row['đáp án'] || row['answer'] || row['Đáp án đúng'] || '';

          // Fallback to position-based values if column names don't match
          if (!qText && !rawCorrect) {
            const vals = Object.values(row);
            if (vals.length >= 2) {
              qText = vals[0];
              rawCorrect = vals[1];
            }
          }

          const qTextStr = String(qText || '').trim();
          const qTypeStr = String(qType || '').trim();

          // Skip sample instruction rows if present in template
          if (qTextStr.includes('(required)') || qTypeStr.includes('(default is Multiple Choice)') || qTextStr === 'Text of the question') {
            continue;
          }

          if (!qTextStr) continue;

          // Check if it is a Multiple Choice question with options
          const hasOptions = (opt1 !== '' || opt2 !== '');
          if (hasOptions) {
            const rawOpts = [opt1, opt2, opt3, opt4, opt5]
              .map(o => String(o || '').trim())
              .filter(o => o !== '');

            if (rawOpts.length >= 2) {
              let correctAnsText = String(rawCorrect || '').trim();
              const numChoice = parseInt(correctAnsText, 10);

              if (!isNaN(numChoice) && numChoice >= 1 && numChoice <= rawOpts.length) {
                correctAnsText = rawOpts[numChoice - 1];
              } else if (!rawOpts.some(o => o.toLowerCase() === correctAnsText.toLowerCase())) {
                correctAnsText = rawOpts[0];
              }

              const formattedQText = `${qTextStr}|||${JSON.stringify(rawOpts)}`;
              preview.push({
                question_text: formattedQText,
                correct_answer: correctAnsText,
                question_type: 'mcq4'
              });
              continue;
            }
          }

          // Open-ended / Fill-in question
          if (qTextStr && rawCorrect !== undefined && rawCorrect !== null) {
            let determinedType = 'fill';
            const lowerType = qTypeStr.toLowerCase();
            if ((lowerType.includes('từ') && lowerType.includes('phiên âm')) || (lowerType.includes('word') && lowerType.includes('ipa')) || lowerType === 'fill_word_ipa') {
              determinedType = 'fill_word_ipa';
            } else if ((lowerType.includes('nghĩa') && lowerType.includes('phiên âm')) || (lowerType.includes('meaning') && lowerType.includes('ipa')) || lowerType === 'fill_meaning_ipa') {
              determinedType = 'fill_meaning_ipa';
            }

            preview.push({
              question_text: qTextStr,
              correct_answer: String(rawCorrect).trim(),
              question_type: determinedType
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
        // Matching QuizMasterMultipleChoices.xlsx structure
        data = [
          ['Question Text', 'Question Type', 'Option 1', 'Option 2', 'Option 3', 'Option 4', 'Option 5', 'Correct Answer'],
          ['Thủ đô của Việt Nam là gì?', 'Multiple Choice', 'Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng', 'Hải Phòng', '', '1'],
          ['1 + 1 = ?', 'Open-Ended', '', '', '', '', '', '2']
        ];
        filename = 'Template_QuizMaster_CauHoi.xlsx';
      }

      const worksheet = XLSX.utils.aoa_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Create a Quiz');
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
        // Export Question Mode matching QuizMasterMultipleChoices.xlsx
        data.push(['Question Text', 'Question Type', 'Option 1', 'Option 2', 'Option 3', 'Option 4', 'Option 5', 'Correct Answer']);
        for (const q of qs) {
          let qText = q.question_text || '';
          if (qText.includes('|||')) {
            const parts = qText.split('|||');
            const promptText = parts[0];
            let opts = [];
            try { opts = JSON.parse(parts[1]); } catch(e) {}

            const opt1 = opts[0] || '';
            const opt2 = opts[1] || '';
            const opt3 = opts[2] || '';
            const opt4 = opts[3] || '';
            const opt5 = opts[4] || '';

            const correctNorm = String(q.correct_answer || '').trim().toLowerCase();
            const foundIdx = opts.findIndex(o => String(o).trim().toLowerCase() === correctNorm);
            const correctAnsVal = foundIdx >= 0 ? String(foundIdx + 1) : q.correct_answer;

            data.push([promptText, 'Multiple Choice', opt1, opt2, opt3, opt4, opt5, correctAnsVal]);
          } else if (q.question_type === 'fill_word_ipa') {
            data.push([qText, 'Từ -> điền Phiên âm', '', '', '', '', '', q.correct_answer]);
          } else if (q.question_type === 'fill_meaning_ipa') {
            data.push([qText, 'Nghĩa -> điền Phiên âm', '', '', '', '', '', q.correct_answer]);
          } else {
            data.push([qText, 'Open-Ended', '', '', '', '', '', q.correct_answer]);
          }
        }
      }

      const worksheet = XLSX.utils.aoa_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Create a Quiz');
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
