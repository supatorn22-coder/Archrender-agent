// /api/generate.js — Vercel Serverless Function
// Proxies image generation to Google Gemini, keeping the API key server-side.
// Set GEMINI_API_KEY in Vercel → Project → Settings → Environment Variables.

export const config = {
  maxDuration: 60,
};

const MODELS = [
  'gemini-3.1-flash-image',
  'gemini-3.1-flash-image-preview',
  'gemini-2.5-flash-image',
  'gemini-3-pro-image',
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
    const { prompt, sketch, sketch2, mood, mode } = body || {};

    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

    // Sanitize base64: strip data-url prefix + any whitespace/newlines
    const clean = (b64) => {
      if (!b64 || typeof b64 !== 'string') return null;
      let s = b64.trim();
      if (s.startsWith('data:')) s = s.split(',')[1] || '';
      return s.replace(/\s/g, '');
    };
    const sketchB64 = clean(sketch);
    const sketch2B64 = clean(sketch2);
    const moodB64 = clean(mood);

    // ── PROMPT MODE — generate an optimized image-gen prompt only (cheap text model, saves tokens/cost) ──
    if (mode === 'prompt') {
      const sys = `You are an expert architectural visualization prompt engineer. Based on the description below, write ONE concise, vivid, ready-to-use image-generation prompt (for Midjourney/Stable Diffusion/Gemini) that would produce this architectural view. Output ONLY the prompt text, no preamble, no explanation, max 120 words.\n\nDESCRIPTION:\n${prompt}`;
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
        { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ contents:[{ role:'user', parts:[{text:sys}] }] }) }
      );
      const d = await r.json();
      if (d.error) return res.status(200).json({ error: d.error.message });
      const text = (d.candidates?.[0]?.content?.parts || []).map(p=>p.text||'').join('').trim();
      return res.status(200).json({ text: text || prompt, mode:'prompt' });
    }

    // Build Gemini parts: text first, then images
    const parts = [{ text: prompt }];
    if (sketchB64)  parts.push({ inline_data: { mime_type: 'image/jpeg', data: sketchB64 } });
    if (sketch2B64) parts.push({ inline_data: { mime_type: 'image/jpeg', data: sketch2B64 } });
    if (moodB64)    parts.push({ inline_data: { mime_type: 'image/jpeg', data: moodB64 } });

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

    // All models failed — fetch the list this key CAN access, to diagnose
    try {
      const lr = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
      const ld = await lr.json();
      const imageModels = (ld.models || [])
        .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map(m => m.name.replace('models/', ''))
        .filter(n => n.toLowerCase().includes('image'));
      if (imageModels.length) {
        lastErr += ` | Image models your key CAN use: ${imageModels.join(', ')}`;
      } else {
        const any = (ld.models || []).map(m => m.name.replace('models/', '')).slice(0, 8);
        lastErr += ` | No image-capable models found. Your key has access to: ${any.join(', ') || 'none'}. Enable billing + image generation at aistudio.google.com`;
      }
    } catch (e) {
      lastErr += ` | (could not list models: ${e.message})`;
    }

    return res.status(200).json({ error: lastErr });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
