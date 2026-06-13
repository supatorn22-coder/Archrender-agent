// /api/generate.js — Vercel Serverless Function
// Proxies image generation to Google Gemini, keeping the API key server-side.
// Set GEMINI_API_KEY in Vercel → Project → Settings → Environment Variables.

export const config = {
  api: {
    bodyParser: { sizeLimit: '10mb' }
  }
};

const MODELS = [
  'gemini-3.1-flash-image',
  'gemini-2.5-flash-image',
  'gemini-2.0-flash-exp',
];

export default async function handler(req, res) {
  // CORS (same-origin in production, but harmless to allow)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not set in Vercel environment variables.' });
  }

  try {
    // Vercel parses JSON body automatically; fall back to manual parse if needed.
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { prompt, sketch, mood } = body || {};

    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

    // Sanitize base64: strip data-url prefix + any whitespace/newlines
    const clean = (b64) => {
      if (!b64 || typeof b64 !== 'string') return null;
      let s = b64.trim();
      if (s.startsWith('data:')) s = s.split(',')[1] || '';
      return s.replace(/\s/g, '');
    };
    const sketchB64 = clean(sketch);
    const moodB64 = clean(mood);

    // Build Gemini parts: text first, then images
    const parts = [{ text: prompt }];
    if (sketchB64) parts.push({ inline_data: { mime_type: 'image/jpeg', data: sketchB64 } });
    if (moodB64)   parts.push({ inline_data: { mime_type: 'image/jpeg', data: moodB64 } });

    let lastErr = 'All models failed';

    for (const model of MODELS) {
      try {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts }],
              generationConfig: { responseModalities: ['IMAGE', 'TEXT'], temperature: 0.8 }
            })
          }
        );

        const d = await r.json();

        if (d.error) { lastErr = `${model}: ${d.error.message}`; continue; }

        // Extract image + text from response
        let image = null, mime = 'image/png', text = '';
        const respParts = d.candidates?.[0]?.content?.parts || [];
        for (const p of respParts) {
          if (p.inlineData?.data)      { image = p.inlineData.data; mime = p.inlineData.mimeType || 'image/png'; }
          else if (p.inline_data?.data){ image = p.inline_data.data; mime = p.inline_data.mime_type || 'image/png'; }
          else if (p.text) text += p.text;
        }

        if (image) {
          return res.status(200).json({ image, mime, text, model });
        }
        // No image — keep last text as the error/explanation, try next model
        lastErr = text || `${model}: no image returned`;
      } catch (e) {
        lastErr = `${model}: ${e.message}`;
      }
    }

    return res.status(200).json({ error: lastErr });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
