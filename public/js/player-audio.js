// ============================================
// Player Audio - TTS & Web Audio Manager
// ============================================

const PlayerAudio = (() => {
  let activeAudioFallback = null;
  let audioContext = null;

  function getAudioContext() {
    if (!audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) audioContext = new AudioCtx();
    }
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume();
    }
    return audioContext;
  }

  function detectTextLanguage(text, fallbackLang = 'en') {
    if (!text) return fallbackLang || 'en';
    const str = String(text).trim();

    if (/[\u4e00-\u9fa5\u3400-\u4dbf]/.test(str)) {
      return 'zh';
    }
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(str)) {
      return 'ja';
    }
    if (/[\uac00-\ud7af\u1100-\u11ff]/.test(str)) {
      return 'ko';
    }
    if (/[\u0400-\u04ff]/.test(str)) {
      return 'ru';
    }

    return fallbackLang || 'en';
  }

  function playTTS(text, langCode = 'en') {
    if (!text) return;

    const savedVolume = localStorage.getItem('quizmaster-volume');
    const volumeSetting = savedVolume !== null ? parseFloat(savedVolume) : 0.5;
    const finalVolumeSetting = isNaN(volumeSetting) ? 0.5 : Math.max(0, Math.min(2.0, volumeSetting));

    if (finalVolumeSetting === 0) return;

    const cleanText = text.replace(/<[^>]*>/g, '').trim();
    if (!cleanText) return;

    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }

    if (activeAudioFallback) {
      try {
        activeAudioFallback.pause();
        activeAudioFallback.currentTime = 0;
      } catch (e) {}
      activeAudioFallback = null;
    }

    const effectiveLang = detectTextLanguage(cleanText, langCode);
    fallbackServerAudio(cleanText, effectiveLang, finalVolumeSetting);
  }

  function fallbackServerAudio(text, langCode, volumeSetting) {
    try {
      const langPrefix = (langCode || 'en').toLowerCase().split('-')[0].split('_')[0];
      const gLang = langPrefix === 'zh' ? 'zh-CN' : langPrefix;

      const audioUrl = `/api/tts?text=${encodeURIComponent(text)}&lang=${gLang}`;
      const audio = new Audio(audioUrl);
      audio.crossOrigin = 'anonymous';

      const gainMultiplier = volumeSetting;

      try {
        const ctx = getAudioContext();
        if (ctx) {
          const source = ctx.createMediaElementSource(audio);
          const gainNode = ctx.createGain();
          gainNode.gain.value = gainMultiplier;
          source.connect(gainNode);
          gainNode.connect(ctx.destination);
        } else {
          audio.volume = Math.min(1.0, gainMultiplier);
        }
      } catch (e) {
        audio.volume = Math.min(1.0, gainMultiplier);
      }

      activeAudioFallback = audio;
      audio.play().catch(e => console.warn('Server audio play error:', e));
    } catch (e) {
      console.warn('Fallback audio failed:', e);
    }
  }

  // --- Speech to Text (Voice Input) ---
  let activeRecognition = null;
  let isListening = false;

  function isSpeechRecognitionSupported() {
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  function mapLangToBcp47(langCode) {
    const code = (langCode || 'en').toLowerCase().split('-')[0].split('_')[0];
    switch (code) {
      case 'zh': return 'zh-CN';
      case 'ja': return 'ja-JP';
      case 'ko': return 'ko-KR';
      case 'vi': return 'vi-VN';
      case 'en': return 'en-US';
      case 'fr': return 'fr-FR';
      case 'de': return 'de-DE';
      case 'ru': return 'ru-RU';
      case 'es': return 'es-ES';
      default: return 'en-US';
    }
  }

  function getQuestionSpeechConfig(question, quiz) {
    if (!question) {
      return { targetType: 'word', targetLang: 'zh-CN' };
    }

    const qtype = String(question.question_type || '');
    let targetType = 'word';

    if (qtype.endsWith('_ipa') || qtype === 'fill_word_ipa' || qtype === 'fill_meaning_ipa') {
      targetType = 'ipa';
    } else if (qtype.endsWith('_meaning') || qtype === 'fill_word_meaning' || qtype === 'fill_listen_meaning' || qtype === 'fill_ipa_meaning') {
      targetType = 'meaning';
    } else if (qtype.endsWith('_word') || qtype === 'fill_meaning_word' || qtype === 'fill_listen_word' || qtype === 'fill_ipa_word') {
      targetType = 'word';
    } else {
      // General question mode 'fill'
      if (question.ipa && question.correct_answer === question.ipa) {
        targetType = 'ipa';
      } else if (question._word && question.correct_answer === question._word) {
        targetType = 'word';
      } else if (question._meaning && question.correct_answer === question._meaning) {
        targetType = 'meaning';
      } else {
        const lang = detectTextLanguage(question.correct_answer || '');
        targetType = (lang === 'vi' || /^[a-zà-ỹ\s]+$/i.test(question.correct_answer || '')) ? 'meaning' : 'word';
      }
    }

    let targetLang = 'vi-VN';
    if (targetType === 'meaning') {
      const mLang = (quiz?.meaning_lang || 'vi').toLowerCase();
      targetLang = mLang === 'vi' ? 'vi-VN' : (mLang === 'en' ? 'en-US' : mLang);
    } else if (targetType === 'word') {
      const vLang = (quiz?.vocab_lang || detectTextLanguage(question.correct_answer || question._word || '', 'en')).toLowerCase();
      targetLang = mapLangToBcp47(vLang);
    } else if (targetType === 'ipa') {
      // For pinyin/ipa, user pronounces the word or sound in target language
      const vLang = (quiz?.vocab_lang || detectTextLanguage(question._word || question.question_text || '', 'zh')).toLowerCase();
      targetLang = mapLangToBcp47(vLang);
    }

    return { targetType, targetLang };
  }

  async function processRecognizedSpeech(rawTranscript, question, quiz, targetType) {
    if (!rawTranscript) return '';
    let text = String(rawTranscript).trim().replace(/[。，,.!?:;？!]/g, '').trim();

    if (targetType === 'meaning') {
      return text.toLowerCase();
    }

    if (targetType === 'word') {
      return text;
    }

    if (targetType === 'ipa') {
      // 1. Direct match with current question word: return exact IPA
      if (question) {
        const cleanPromptWord = (question._word || question.question_text || '').replace(/^🎧\s*/, '').split('|||')[0].split('/')[0].trim();
        if (cleanPromptWord && cleanPromptWord.toLowerCase() === text.toLowerCase()) {
          return question._ipa || question.ipa || question.correct_answer;
        }
      }

      // 2. Search in quiz questions / vocabulary pool
      const pool = (window.PlayerState && PlayerState.allVocabQuestions && PlayerState.allVocabQuestions.length > 0)
        ? PlayerState.allVocabQuestions
        : (quiz?.questions || []);

      for (const item of pool) {
        const iWord = (item._word || item.question_text || '').replace(/^🎧\s*/, '').split('|||')[0].split('/')[0].trim();
        const iIpa = item._ipa || item.ipa || '';
        if (iWord && iIpa && iWord.toLowerCase() === text.toLowerCase()) {
          return iIpa.split('/')[0].trim();
        }
      }

      // 3. If contains Chinese characters, convert to Pinyin via server endpoint
      if (/[\u4e00-\u9fa5]/.test(text)) {
        try {
          const res = await fetch(`/api/pinyin?text=${encodeURIComponent(text)}`);
          if (res.ok) {
            const data = await res.json();
            if (data && data.pinyin) {
              return data.pinyin;
            }
          }
        } catch (e) {
          console.warn('Pinyin API conversion failed:', e);
        }
      }

      return text.toLowerCase();
    }

    return text;
  }

  function startVoiceRecognition({ question, quiz, onStart, onInterim, onFinal, onError, onEnd }) {
    if (!isSpeechRecognitionSupported()) {
      if (onError) onError('not-supported');
      return;
    }

    stopVoiceRecognition();

    const config = getQuestionSpeechConfig(question, quiz);
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

    try {
      const recognition = new SpeechRec();
      recognition.lang = config.targetLang;
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 3;

      activeRecognition = recognition;

      recognition.onstart = () => {
        isListening = true;
        if (onStart) onStart(config);
      };

      recognition.onresult = async (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const trans = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += trans;
          } else {
            interimTranscript += trans;
          }
        }

        if (interimTranscript && onInterim) {
          onInterim(interimTranscript, config);
        }

        if (finalTranscript) {
          stopVoiceRecognition();
          const processed = await processRecognizedSpeech(finalTranscript, question, quiz, config.targetType);
          if (onFinal) onFinal(processed, config);
        }
      };

      recognition.onerror = (event) => {
        isListening = false;
        if (onError) onError(event.error || 'recognition-error');
      };

      recognition.onend = () => {
        isListening = false;
        activeRecognition = null;
        if (onEnd) onEnd();
      };

      recognition.start();
    } catch (err) {
      isListening = false;
      activeRecognition = null;
      if (onError) onError(err.message || 'start-failed');
    }
  }

  function stopVoiceRecognition() {
    if (activeRecognition) {
      try {
        activeRecognition.abort();
      } catch (e) {}
      activeRecognition = null;
    }
    isListening = false;
  }

  function getIsListening() {
    return isListening;
  }

  return {
    playTTS,
    detectTextLanguage,
    getAudioContext,
    isSpeechRecognitionSupported,
    getQuestionSpeechConfig,
    startVoiceRecognition,
    stopVoiceRecognition,
    getIsListening,
    processRecognizedSpeech
  };
})();

window.PlayerAudio = PlayerAudio;
