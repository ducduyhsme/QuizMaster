const express = require('express');
const { pinyin } = require('pinyin-pro');

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const text = req.query.text || '';
    if (!text) {
      return res.json({ pinyin: '', pinyinNoSpaces: '', pinyinWithSpaces: '' });
    }

    const cleanText = String(text).replace(/<[^>]*>/g, '').trim();
    const pinyinWithSpaces = pinyin(cleanText, { toneType: 'symbol', type: 'string' });
    const pinyinNoSpaces = pinyin(cleanText, { toneType: 'symbol', separator: '', type: 'string' });

    res.json({
      pinyin: pinyinNoSpaces,
      pinyinNoSpaces,
      pinyinWithSpaces
    });
  } catch (err) {
    console.error('Pinyin conversion error:', err);
    res.status(500).json({ error: 'Pinyin conversion error' });
  }
});

module.exports = router;
