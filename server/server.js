require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) console.warn('Warning: OPENAI_API_KEY not set in .env');

app.post('/api/rewrite', async (req, res) => {
  try {
    const { original_text, style_profile } = req.body;
    if (!original_text) return res.status(400).json({ error: 'original_text required' });

    const prompt = buildPrompt(original_text, style_profile);

    // Call OpenAI Chat Completions (adjust model to one you have access to)
    const openaiResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a helpful assistant that rewrites text to match a user style profile.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 800
      })
    });

    if (!openaiResp.ok) {
      const txt = await openaiResp.text();
      console.error('OpenAI error:', txt);
      return res.status(500).json({ error: 'OpenAI error', details: txt });
    }

    const j = await openaiResp.json();
    const rewritten = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content
      ? j.choices[0].message.content.trim()
      : '';

    res.json({ rewritten_text: rewritten });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

function buildPrompt(original, style) {
  const tone = (style && style.tone) ? style.tone : 'friendly but concise';
  const signature = (style && style.signature) ? style.signature : '';
  return `
Rewrite the following email to match this style: Tone="${tone}". Signature="${signature}".
Rules:
- Preserve all facts and intent of the original.
- Keep length within ±25% of the original.
- Do not invent new facts.
Original message:
"""${original}"""
Return only the rewritten email text (no commentary).
`;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Style rewriter server listening on ${PORT}`));
