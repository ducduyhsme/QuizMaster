const { questions, bulkInsertQuestions } = require('../database');

function extractCleanVocabFromQuestions(qs) {
  const wordMap = new Map();

  for (const q of qs) {
    const qtype = q.question_type || '';
    let w = '', m = '', p = q.ipa ? String(q.ipa).split('/')[0].trim() : '';

    if (qtype === 'fill_word_meaning' || qtype === 'mcq_word_meaning') {
      w = (q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0].split('/')[0].trim();
      m = (q.correct_answer || '').split('/')[0].trim();
    } else if (qtype === 'fill_meaning_word' || qtype === 'mcq_meaning_word') {
      w = (q.correct_answer || '').split('/')[0].trim();
      m = (q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0].split('/')[0].trim();
    } else if (qtype === 'fill_word_ipa' || qtype === 'mcq_word_ipa') {
      w = (q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0].split('/')[0].trim();
      if (!p) p = (q.correct_answer || '').split('/')[0].trim();
    } else if (qtype === 'fill_meaning_ipa' || qtype === 'mcq_meaning_ipa') {
      m = (q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0].split('/')[0].trim();
      if (!p) p = (q.correct_answer || '').split('/')[0].trim();
    } else if (qtype === 'fill_ipa_word' || qtype === 'mcq_ipa_word') {
      w = (q.correct_answer || '').split('/')[0].trim();
      if (!p) p = (q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0].split('/')[0].trim();
    } else if (qtype === 'fill_ipa_meaning' || qtype === 'mcq_ipa_meaning') {
      m = (q.correct_answer || '').split('/')[0].trim();
      if (!p) p = (q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0].split('/')[0].trim();
    }

    if (w && m && w !== m && w !== p && m !== p) {
      w = w.split('/')[0].trim();
      m = m.split('/')[0].trim();

      const key = w.toLowerCase() + ':::' + m.toLowerCase();
      if (!wordMap.has(key)) {
        wordMap.set(key, { word: w, meaning: m, ipa: p || null });
      } else if (p && !wordMap.get(key).ipa) {
        wordMap.get(key).ipa = p;
      }
    }
  }

  for (const q of qs) {
    if (q.ipa && q.ipa.trim()) {
      const cleanP = String(q.ipa).split('/')[0].trim();
      const qText = (q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0].split('/')[0].trim();
      const cAns = (q.correct_answer || '').split('/')[0].trim();

      for (const [key, val] of wordMap.entries()) {
        if (!val.ipa && (qText === val.word || cAns === val.word || qText === val.meaning || cAns === val.meaning)) {
          val.ipa = cleanP;
        }
      }
    }
  }

  return Array.from(wordMap.values());
}

function ensureVocabQuizUpToDate(quiz, qs) {
  if (!quiz || quiz.quiz_type !== 'vocabulary' || !qs || qs.length === 0) {
    return qs;
  }

  const words = extractCleanVocabFromQuestions(qs);
  if (words.length >= 4) {
    const generatedQuestions = generateQuestionsFromVocab(words);
    questions.deleteByQuizId(quiz.id);
    bulkInsertQuestions(quiz.id, generatedQuestions);
    return questions.getByQuizId(quiz.id);
  }

  return qs;
}

function generateQuestionsFromVocab(words) {
  const generated = [];
  if (!words || words.length === 0) return generated;

  const wordToMeanings = new Map();
  const meaningToWords = new Map();
  const ipaToWords = new Map();
  const ipaToMeanings = new Map();
  const wordToIpa = new Map();

  const allWordsList = [];
  const allMeaningsList = [];
  const allIpasList = [];

  words.forEach(w => {
    const cW = String(w.word || '').split('/')[0].trim();
    const cM = String(w.meaning || '').split('/')[0].trim();
    const cP = w.ipa ? String(w.ipa).split('/')[0].trim() : '';

    if (!cW || !cM) return;

    const lowerW = cW.toLowerCase();
    const lowerM = cM.toLowerCase();
    const lowerP = cP.toLowerCase();

    if (!allWordsList.includes(cW)) allWordsList.push(cW);
    if (!allMeaningsList.includes(cM)) allMeaningsList.push(cM);
    if (cP && !allIpasList.includes(cP)) allIpasList.push(cP);

    if (!wordToMeanings.has(lowerW)) wordToMeanings.set(lowerW, new Set());
    wordToMeanings.get(lowerW).add(cM);

    if (!meaningToWords.has(lowerM)) meaningToWords.set(lowerM, new Set());
    meaningToWords.get(lowerM).add(cW);

    if (cP) {
      wordToIpa.set(lowerW, cP);

      if (!ipaToWords.has(lowerP)) ipaToWords.set(lowerP, new Set());
      ipaToWords.get(lowerP).add(cW);

      if (!ipaToMeanings.has(lowerP)) ipaToMeanings.set(lowerP, new Set());
      ipaToMeanings.get(lowerP).add(cM);
    }
  });

  const getDistractors = (pool, excludeSet, count = 3) => {
    const normExclude = new Set(Array.from(excludeSet).map(s => String(s).trim().toLowerCase()));
    const validCandidates = pool.filter(item => !normExclude.has(String(item).trim().toLowerCase()));
    const shuffled = [...validCandidates].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  };

  words.forEach(w => {
    const cW = String(w.word || '').split('/')[0].trim();
    const cM = String(w.meaning || '').split('/')[0].trim();
    const cP = w.ipa ? String(w.ipa).split('/')[0].trim() : '';
    if (!cW || !cM) return;

    const lowerW = cW.toLowerCase();
    const lowerM = cM.toLowerCase();
    const lowerP = cP.toLowerCase();

    const fillMeaningsForWord = Array.from(wordToMeanings.get(lowerW) || [cM]).join(' / ');
    const fillWordsForMeaning = Array.from(meaningToWords.get(lowerM) || [cW]).join(' / ');
    const fillWordsForIpa = cP ? Array.from(ipaToWords.get(lowerP) || [cW]).join(' / ') : cW;
    const fillMeaningsForIpa = cP ? Array.from(ipaToMeanings.get(lowerP) || [cM]).join(' / ') : cM;

    // 1. Fill-in question types (6 types)
    generated.push({ question_text: cW, correct_answer: fillMeaningsForWord, question_type: 'fill_word_meaning', ipa: cP });
    generated.push({ question_text: cM, correct_answer: fillWordsForMeaning, question_type: 'fill_meaning_word', ipa: cP });
    generated.push({ question_text: '🎧 ' + cW, correct_answer: fillMeaningsForWord, question_type: 'fill_listen_meaning', ipa: cP });
    generated.push({ question_text: '🎧 ' + cW, correct_answer: cW, question_type: 'fill_listen_word', ipa: cP });

    if (cP) {
      generated.push({ question_text: cP, correct_answer: fillWordsForIpa, question_type: 'fill_ipa_word', ipa: cP });
      generated.push({ question_text: cP, correct_answer: fillMeaningsForIpa, question_type: 'fill_ipa_meaning', ipa: cP });
    }

    // 2. MCQ question types (8 types)
    if (words.length >= 4) {
      // mcq_word_meaning
      const excludeForWordMeaning = wordToMeanings.get(lowerW) || new Set([cM]);
      const wrongMeaningsForWord = getDistractors(allMeaningsList, excludeForWordMeaning, 3);
      if (wrongMeaningsForWord.length === 3) {
        const opts = [cM, ...wrongMeaningsForWord].sort(() => 0.5 - Math.random());
        generated.push({ question_text: cW + '|||' + JSON.stringify(opts), correct_answer: cM, question_type: 'mcq_word_meaning', ipa: cP });
        generated.push({ question_text: '🎧 ' + cW + '|||' + JSON.stringify(opts), correct_answer: cM, question_type: 'mcq_listen_meaning', ipa: cP });
      }

      // mcq_meaning_word
      const excludeForMeaningWord = meaningToWords.get(lowerM) || new Set([cW]);
      const wrongWordsForMeaning = getDistractors(allWordsList, excludeForMeaningWord, 3);
      if (wrongWordsForMeaning.length === 3) {
        const opts = [cW, ...wrongWordsForMeaning].sort(() => 0.5 - Math.random());
        generated.push({ question_text: cM + '|||' + JSON.stringify(opts), correct_answer: cW, question_type: 'mcq_meaning_word', ipa: cP });
        generated.push({ question_text: '🎧 ' + cW + '|||' + JSON.stringify(opts), correct_answer: cW, question_type: 'mcq_listen_word', ipa: cP });
      }

      // mcq_word_ipa
      if (cP && allIpasList.length >= 4) {
        const wrongIpasForWord = getDistractors(allIpasList, new Set([cP]), 3);
        if (wrongIpasForWord.length === 3) {
          const opts = [cP, ...wrongIpasForWord].sort(() => 0.5 - Math.random());
          generated.push({ question_text: cW + '|||' + JSON.stringify(opts), correct_answer: cP, question_type: 'mcq_word_ipa', ipa: cP });
        }
      }

      // mcq_meaning_ipa
      if (cP && allIpasList.length >= 4) {
        const validIpasForMeaning = new Set(
          Array.from(meaningToWords.get(lowerM) || [])
            .map(w => wordToIpa.get(w.toLowerCase()))
            .filter(Boolean)
        );
        const wrongIpasForMeaning = getDistractors(allIpasList, validIpasForMeaning, 3);
        if (wrongIpasForMeaning.length === 3) {
          const opts = [cP, ...wrongIpasForMeaning].sort(() => 0.5 - Math.random());
          generated.push({ question_text: cM + '|||' + JSON.stringify(opts), correct_answer: cP, question_type: 'mcq_meaning_ipa', ipa: cP });
        }
      }

      // mcq_ipa_word
      if (cP) {
        const excludeForIpaWord = ipaToWords.get(lowerP) || new Set([cW]);
        const wrongWordsForIpa = getDistractors(allWordsList, excludeForIpaWord, 3);
        if (wrongWordsForIpa.length === 3) {
          const opts = [cW, ...wrongWordsForIpa].sort(() => 0.5 - Math.random());
          generated.push({ question_text: cP + '|||' + JSON.stringify(opts), correct_answer: cW, question_type: 'mcq_ipa_word', ipa: cP });
        }
      }

      // mcq_ipa_meaning
      if (cP) {
        const excludeForIpaMeaning = ipaToMeanings.get(lowerP) || new Set([cM]);
        const wrongMeaningsForIpa = getDistractors(allMeaningsList, excludeForIpaMeaning, 3);
        if (wrongMeaningsForIpa.length === 3) {
          const opts = [cM, ...wrongMeaningsForIpa].sort(() => 0.5 - Math.random());
          generated.push({ question_text: cP + '|||' + JSON.stringify(opts), correct_answer: cM, question_type: 'mcq_ipa_meaning', ipa: cP });
        }
      }
    }
  });

  const dedupeTypes = new Set([
    'mcq_word_meaning', 'mcq_meaning_word', 'mcq_word_ipa', 'mcq_meaning_ipa', 'mcq_ipa_word', 'mcq_ipa_meaning', 'mcq_listen_word', 'mcq_listen_meaning',
    'fill_word_meaning', 'fill_meaning_word', 'fill_ipa_word', 'fill_ipa_meaning', 'fill_listen_word', 'fill_listen_meaning'
  ]);
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

module.exports = {
  extractCleanVocabFromQuestions,
  ensureVocabQuizUpToDate,
  generateQuestionsFromVocab
};
