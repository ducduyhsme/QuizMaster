const { questions, bulkInsertQuestions } = require('../database');

function splitItems(str) {
  return String(str || '').split('/').map(s => s.trim()).filter(Boolean);
}

function extractCleanVocabFromQuestions(qs) {
  const wordMap = new Map();
  const directWordIpa = new Map();

  // 1. Identify specific word-to-ipa associations
  for (const q of qs) {
    const qtype = q.question_type || '';
    if (q.ipa && q.ipa.trim()) {
      if (qtype === 'fill_word_meaning' || qtype === 'mcq_word_meaning' || qtype === 'fill_word_ipa' || qtype === 'fill_listen_word') {
        const w = (q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0].trim();
        if (w && !w.includes('/')) directWordIpa.set(w.toLowerCase(), q.ipa.trim());
      } else if (qtype === 'fill_ipa_word') {
        const w = (q.correct_answer || '').trim();
        if (w && !w.includes('/')) directWordIpa.set(w.toLowerCase(), (q.question_text || '').trim());
      }
    }
  }

  // 2. Extract word-meaning pairs preserving all alternative answers
  for (const q of qs) {
    const qtype = q.question_type || '';
    let wArr = [], mArr = [];

    if (qtype === 'fill_word_meaning' || qtype === 'mcq_word_meaning') {
      wArr = splitItems((q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0]);
      mArr = splitItems(q.correct_answer);
    } else if (qtype === 'fill_meaning_word' || qtype === 'mcq_meaning_word') {
      wArr = splitItems(q.correct_answer);
      mArr = splitItems((q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0]);
    } else if (qtype === 'fill_word_ipa' || qtype === 'mcq_word_ipa') {
      wArr = splitItems((q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0]);
    } else if (qtype === 'fill_meaning_ipa' || qtype === 'mcq_meaning_ipa') {
      mArr = splitItems((q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0]);
    } else if (qtype === 'fill_ipa_word' || qtype === 'mcq_ipa_word') {
      wArr = splitItems(q.correct_answer);
    } else if (qtype === 'fill_ipa_meaning' || qtype === 'mcq_ipa_meaning') {
      mArr = splitItems(q.correct_answer);
    }

    wArr.forEach(w => {
      mArr.forEach(m => {
        if (w && m && w !== m) {
          const key = w.toLowerCase() + ':::' + m.toLowerCase();
          const p = directWordIpa.get(w.toLowerCase()) || (q.ipa ? q.ipa.trim() : null);
          if (!wordMap.has(key)) {
            wordMap.set(key, { word: w, meaning: m, ipa: p });
          } else if (p && !wordMap.get(key).ipa) {
            wordMap.get(key).ipa = p;
          }
        }
      });
    });
  }

  for (const q of qs) {
    if (q.ipa && q.ipa.trim()) {
      const cleanP = q.ipa.trim();
      const qText = (q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0].trim();
      const cAns = (q.correct_answer || '').trim();

      for (const [, val] of wordMap.entries()) {
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
  const wordToIpas = new Map();
  const meaningToIpas = new Map();
  const ipaToWords = new Map();
  const ipaToMeanings = new Map();
  const wordToWords = new Map();

  const allWordsList = [];
  const allMeaningsList = [];
  const allIpasList = [];

  words.forEach(w => {
    const rawW = String(w.word || '').trim();
    const rawM = String(w.meaning || '').trim();
    const rawP = w.ipa ? String(w.ipa).trim() : '';
    if (!rawW || !rawM) return;

    const subWords = splitItems(rawW);
    const subMeanings = splitItems(rawM);
    const subIpas = splitItems(rawP);

    subWords.forEach(cW => {
      if (!allWordsList.includes(cW)) allWordsList.push(cW);
      const lowerW = cW.toLowerCase();
      if (!wordToMeanings.has(lowerW)) wordToMeanings.set(lowerW, new Set());
      if (!wordToIpas.has(lowerW)) wordToIpas.set(lowerW, new Set());
      if (!wordToWords.has(lowerW)) wordToWords.set(lowerW, new Set());

      subWords.forEach(altW => wordToWords.get(lowerW).add(altW));
      subMeanings.forEach(cM => wordToMeanings.get(lowerW).add(cM));
      subIpas.forEach(cP => wordToIpas.get(lowerW).add(cP));
    });

    subMeanings.forEach(cM => {
      if (!allMeaningsList.includes(cM)) allMeaningsList.push(cM);
      const lowerM = cM.toLowerCase();
      if (!meaningToWords.has(lowerM)) meaningToWords.set(lowerM, new Set());
      if (!meaningToIpas.has(lowerM)) meaningToIpas.set(lowerM, new Set());

      subWords.forEach(cW => meaningToWords.get(lowerM).add(cW));
      subIpas.forEach(cP => meaningToIpas.get(lowerM).add(cP));
    });

    subIpas.forEach(cP => {
      if (!allIpasList.includes(cP)) allIpasList.push(cP);
      const lowerP = cP.toLowerCase();
      if (!ipaToWords.has(lowerP)) ipaToWords.set(lowerP, new Set());
      if (!ipaToMeanings.has(lowerP)) ipaToMeanings.set(lowerP, new Set());

      subWords.forEach(cW => ipaToWords.get(lowerP).add(cW));
      subMeanings.forEach(cM => ipaToMeanings.get(lowerP).add(cM));
    });
  });

  const getDistractors = (pool, excludeSet, count = 3) => {
    const normExclude = new Set(Array.from(excludeSet).map(s => String(s).trim().toLowerCase()));
    const validCandidates = pool.filter(item => !normExclude.has(String(item).trim().toLowerCase()));
    const shuffled = [...validCandidates].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  };

  words.forEach(w => {
    const rawW = String(w.word || '').trim();
    const rawM = String(w.meaning || '').trim();
    const rawP = w.ipa ? String(w.ipa).trim() : '';
    if (!rawW || !rawM) return;

    const subWords = splitItems(rawW);
    const subMeanings = splitItems(rawM);
    const subIpas = splitItems(rawP);

    subWords.forEach(cW => {
      const lowerW = cW.toLowerCase();
      const fillMeaningsForWord = Array.from(wordToMeanings.get(lowerW) || subMeanings).join(' / ');
      const fillIpasForWord = Array.from(wordToIpas.get(lowerW) || subIpas).join(' / ');
      const fillWordsForWord = Array.from(wordToWords.get(lowerW) || [cW]).join(' / ');
      const cP = Array.from(wordToIpas.get(lowerW) || subIpas)[0] || '';

      // 1. Fill-in: word prompt
      generated.push({ question_text: cW, correct_answer: fillMeaningsForWord, question_type: 'fill_word_meaning', ipa: fillIpasForWord || cP });
      generated.push({ question_text: '🎧 ' + cW, correct_answer: fillMeaningsForWord, question_type: 'fill_listen_meaning', ipa: fillIpasForWord || cP });
      generated.push({ question_text: '🎧 ' + cW, correct_answer: fillWordsForWord, question_type: 'fill_listen_word', ipa: fillIpasForWord || cP });
      if (fillIpasForWord) {
        generated.push({ question_text: cW, correct_answer: fillIpasForWord, question_type: 'fill_word_ipa', ipa: fillIpasForWord });
      }

      // 2. MCQ: word prompt
      if (words.length >= 4) {
        const excludeForWordMeaning = wordToMeanings.get(lowerW) || new Set(subMeanings);
        const wrongMeaningsForWord = getDistractors(allMeaningsList, excludeForWordMeaning, 3);
        const primaryMeaning = subMeanings[0] || Array.from(excludeForWordMeaning)[0];
        if (wrongMeaningsForWord.length === 3 && primaryMeaning) {
          const opts = [primaryMeaning, ...wrongMeaningsForWord].sort(() => 0.5 - Math.random());
          generated.push({ question_text: cW + '|||' + JSON.stringify(opts), correct_answer: primaryMeaning, question_type: 'mcq_word_meaning', ipa: cP });
          generated.push({ question_text: '🎧 ' + cW + '|||' + JSON.stringify(opts), correct_answer: primaryMeaning, question_type: 'mcq_listen_meaning', ipa: cP });
        }

        if (cP && allIpasList.length >= 4) {
          const wrongIpasForWord = getDistractors(allIpasList, wordToIpas.get(lowerW) || new Set([cP]), 3);
          if (wrongIpasForWord.length === 3) {
            const opts = [cP, ...wrongIpasForWord].sort(() => 0.5 - Math.random());
            generated.push({ question_text: cW + '|||' + JSON.stringify(opts), correct_answer: cP, question_type: 'mcq_word_ipa', ipa: cP });
          }
        }
      }
    });

    subMeanings.forEach(cM => {
      const lowerM = cM.toLowerCase();
      const fillWordsForMeaning = Array.from(meaningToWords.get(lowerM) || subWords).join(' / ');
      const fillIpasForMeaning = Array.from(meaningToIpas.get(lowerM) || subIpas).join(' / ');
      const cP = fillIpasForMeaning.split('/')[0].trim();

      // 1. Fill-in: meaning prompt
      generated.push({ question_text: cM, correct_answer: fillWordsForMeaning, question_type: 'fill_meaning_word', ipa: fillIpasForMeaning || cP });
      if (fillIpasForMeaning) {
        generated.push({ question_text: cM, correct_answer: fillIpasForMeaning, question_type: 'fill_meaning_ipa', ipa: fillIpasForMeaning });
      }

      // 2. MCQ: meaning prompt
      if (words.length >= 4) {
        const excludeForMeaningWord = meaningToWords.get(lowerM) || new Set(subWords);
        const wrongWordsForMeaning = getDistractors(allWordsList, excludeForMeaningWord, 3);
        const primaryWord = subWords[0] || Array.from(excludeForMeaningWord)[0];
        if (wrongWordsForMeaning.length === 3 && primaryWord) {
          const opts = [primaryWord, ...wrongWordsForMeaning].sort(() => 0.5 - Math.random());
          generated.push({ question_text: cM + '|||' + JSON.stringify(opts), correct_answer: primaryWord, question_type: 'mcq_meaning_word', ipa: cP });
          generated.push({ question_text: '🎧 ' + cM + '|||' + JSON.stringify(opts), correct_answer: primaryWord, question_type: 'mcq_listen_word', ipa: cP });
        }

        if (cP && allIpasList.length >= 4) {
          const validIpasForMeaning = meaningToIpas.get(lowerM) || new Set([cP]);
          const wrongIpasForMeaning = getDistractors(allIpasList, validIpasForMeaning, 3);
          if (wrongIpasForMeaning.length === 3) {
            const opts = [cP, ...wrongIpasForMeaning].sort(() => 0.5 - Math.random());
            generated.push({ question_text: cM + '|||' + JSON.stringify(opts), correct_answer: cP, question_type: 'mcq_meaning_ipa', ipa: cP });
          }
        }
      }
    });

    subIpas.forEach(cP => {
      const lowerP = cP.toLowerCase();
      const fillWordsForIpa = Array.from(ipaToWords.get(lowerP) || subWords).join(' / ');
      const fillMeaningsForIpa = Array.from(ipaToMeanings.get(lowerP) || subMeanings).join(' / ');

      // 1. Fill-in: ipa prompt
      generated.push({ question_text: cP, correct_answer: fillWordsForIpa, question_type: 'fill_ipa_word', ipa: cP });
      generated.push({ question_text: cP, correct_answer: fillMeaningsForIpa, question_type: 'fill_ipa_meaning', ipa: cP });

      // 2. MCQ: ipa prompt
      if (words.length >= 4) {
        const excludeForIpaWord = ipaToWords.get(lowerP) || new Set(subWords);
        const wrongWordsForIpa = getDistractors(allWordsList, excludeForIpaWord, 3);
        const primaryWord = subWords[0] || Array.from(excludeForIpaWord)[0];
        if (wrongWordsForIpa.length === 3 && primaryWord) {
          const opts = [primaryWord, ...wrongWordsForIpa].sort(() => 0.5 - Math.random());
          generated.push({ question_text: cP + '|||' + JSON.stringify(opts), correct_answer: primaryWord, question_type: 'mcq_ipa_word', ipa: cP });
        }

        const excludeForIpaMeaning = ipaToMeanings.get(lowerP) || new Set(subMeanings);
        const wrongMeaningsForIpa = getDistractors(allMeaningsList, excludeForIpaMeaning, 3);
        const primaryMeaning = subMeanings[0] || Array.from(excludeForIpaMeaning)[0];
        if (wrongMeaningsForIpa.length === 3 && primaryMeaning) {
          const opts = [primaryMeaning, ...wrongMeaningsForIpa].sort(() => 0.5 - Math.random());
          generated.push({ question_text: cP + '|||' + JSON.stringify(opts), correct_answer: primaryMeaning, question_type: 'mcq_ipa_meaning', ipa: cP });
        }
      }
    });
  });

  const dedupeTypes = new Set([
    'mcq_word_meaning', 'mcq_meaning_word', 'mcq_word_ipa', 'mcq_meaning_ipa', 'mcq_ipa_word', 'mcq_ipa_meaning', 'mcq_listen_word', 'mcq_listen_meaning',
    'fill_word_meaning', 'fill_meaning_word', 'fill_ipa_word', 'fill_ipa_meaning', 'fill_listen_word', 'fill_listen_meaning',
    'fill_word_ipa', 'fill_meaning_ipa'
  ]);
  const promptToQuestionMap = new Map();
  const filteredGenerated = [];

  for (const q of generated) {
    if (dedupeTypes.has(q.question_type)) {
      const cleanPrompt = (q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0].trim().toLowerCase();
      const key = `${q.question_type}:${cleanPrompt}`;
      if (promptToQuestionMap.has(key)) {
        const existingQ = promptToQuestionMap.get(key);
        // Merge correct_answer if different (for fill-in question types)
        if (q.question_type.startsWith('fill_') && q.correct_answer && existingQ.correct_answer) {
          const currentAns = existingQ.correct_answer.split('/').map(s => s.trim()).filter(Boolean);
          const newAns = q.correct_answer.split('/').map(s => s.trim()).filter(Boolean);
          existingQ.correct_answer = Array.from(new Set([...currentAns, ...newAns])).join(' / ');
        }
        // Merge ipa if different
        if (q.ipa && existingQ.ipa) {
          const currentIpas = existingQ.ipa.split('/').map(s => s.trim()).filter(Boolean);
          const newIpas = q.ipa.split('/').map(s => s.trim()).filter(Boolean);
          existingQ.ipa = Array.from(new Set([...currentIpas, ...newIpas])).join(' / ');
        } else if (q.ipa && !existingQ.ipa) {
          existingQ.ipa = q.ipa;
        }
        continue;
      }
      promptToQuestionMap.set(key, q);
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
