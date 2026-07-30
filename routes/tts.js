const express = require('express');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const text = req.query.text || '';
    const lang = req.query.lang || 'en';

    if (!text) {
      return res.status(400).send('Text parameter is required');
    }

    const cleanText = String(text).replace(/<[^>]*>/g, '').trim().substring(0, 200);
    
    let rawLang = String(lang).toLowerCase().trim();
    const isChinese = rawLang === 'zh' || rawLang === 'zh-cn' || rawLang.startsWith('zh');

    // 1. Try Baidu Translate TTS first for Chinese text
    if (isChinese) {
      try {
        const baiduUrl = `https://fanyi.baidu.com/gettts?lan=zh&text=${encodeURIComponent(cleanText)}&spd=3&source=web`;
        const baiduRes = await fetch(baiduUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://fanyi.baidu.com/'
          }
        });

        if (baiduRes.ok) {
          const arrayBuffer = await baiduRes.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          if (buffer.length > 0) {
            res.set('Content-Type', 'audio/mpeg');
            res.set('Access-Control-Allow-Origin', '*');
            res.set('Cache-Control', 'public, max-age=86400');
            return res.send(buffer);
          }
        }
      } catch (baiduErr) {
        console.warn('Baidu TTS proxy error, falling back to Google TTS:', baiduErr.message);
      }
    }

    // 2. Default or Fallback: Google Translate TTS
    let gLang = rawLang;
    if (gLang === 'zh') gLang = 'zh-CN';
    else if (gLang.includes('-')) gLang = gLang.split('-')[0];

    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleanText)}&tl=${gLang}&client=tw-ob`;

    const response = await fetch(ttsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      return res.status(500).send('TTS upstream error');
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.set('Content-Type', 'audio/mpeg');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (err) {
    console.error('TTS proxy error:', err);
    res.status(500).send('TTS proxy error');
  }
});

module.exports = router;
