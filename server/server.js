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
    const { original_text, tone, user_instructions } = req.body;
    if (!original_text) return res.status(400).json({ error: 'original_text required' });

    const prompt = buildPrompt(original_text, tone || 'friendly', user_instructions || '');

    const openaiResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + OPENAI_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You rewrite emails according to user tone and instructions.' },
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
    const rewritten = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content)
      ? j.choices[0].message.content.trim()
      : '';

    return res.json({ rewritten_text: rewritten });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});

function buildPrompt(original, tone, instructions) {
  return [
    "User style instructions:",
    "- Tone: " + tone,
    "- Extra instructions: " + instructions,
    "",
    "Rewrite the following email to match the user's style and instructions.",
    "Rules:",
    "1) Preserve all facts and intent.",
    "2) Keep length roughly the same unless asked to shorten/lengthen.",
    "3) Do not invent new facts.",
    "4) Keep any technical details unchanged.",
    "",
    "Original email:",
    '"""' + original + '"""',
    "",
    "Return only the rewritten email text."
  ].join("\n");
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, function() { console.log('Style rewriter server listening on ' + PORT); });
