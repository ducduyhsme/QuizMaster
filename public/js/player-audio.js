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

  return {
    playTTS,
    detectTextLanguage,
    getAudioContext
  };
})();

window.PlayerAudio = PlayerAudio;
