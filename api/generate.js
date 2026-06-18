// /api/generate.js — Vercel Serverless Function
// Proxies image generation to Google Gemini (Nano Banana), keeping the API key server-side.
// Set GEMINI_API_KEY in Vercel → Project → Settings → Environment Variables, then Redeploy.

const MODELS = [
  'gemini-3-pro-image',
  'gemini-3.1-flash-image',
  'gemini-2.5-flash-image',
];

export const config = {
  api: { bodyParser: { sizeLimit: '12mb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not set on server. ตั้งค่าใน Vercel → Settings → Environment Variables แล้ว Redeploy' });
  }

  // parse body (Vercel may pass string or object)
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { prompt = '', ratio = '16:9', sketches = [], refs = [], mode = 'render' } = body || {};

  if (!prompt) {
    return res.status(400).json({ error: 'missing prompt' });
  }

  // ── PROMPT MODE: cheap text model writes a ready-to-use image prompt ──
  if (mode === 'prompt') {
    try {
      const text = await callTextModel(key, prompt);
      return res.status(200).json({ text });
    } catch (e) {
      return res.status(502).json({ error: `prompt generation failed: ${e.message || e}` });
    }
  }

  // ── RENDER MODE: image generation ──
  // build Gemini content parts
  const parts = [];
  if (Array.isArray(sketches) && sketches.length) {
    parts.push({ text: 'INPUT SKETCH / PLAN (ground truth — reproduce this exact design, geometry and layout):' });
    sketches.forEach(s => {
      if (s && s.data) parts.push({ inlineData: { mimeType: s.mime || 'image/png', data: s.data } });
    });
  }
  if (Array.isArray(refs) && refs.length) {
    parts.push({ text: 'STYLE REFERENCE ONLY (use for look/material/mood — do NOT copy its geometry):' });
    refs.forEach(r => {
      if (r && r.data) parts.push({ inlineData: { mimeType: r.mime || 'image/png', data: r.data } });
    });
  }
  parts.push({ text: prompt });

  let lastErr = '';
  for (const model of MODELS) {
    try {
      const img = await callGemini(model, key, parts);
      if (img) return res.status(200).json({ image: img, model });
      lastErr = `model ${model}: no image returned`;
    } catch (e) {
      lastErr = `model ${model}: ${e.message || e}`;
      // try next model on 400/404/429, otherwise keep trying too
    }
  }
  return res.status(502).json({ error: lastErr || 'generation failed on all models' });
}

async function callGemini(model, key, parts) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

  // primary: IMAGE only
  let r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ['IMAGE'], temperature: 0.35 },
    }),
  });

  if (!r.ok) {
    let detail = '';
    try { const j = await r.json(); detail = j.error?.message || ''; } catch {}
    // fallback: some models require TEXT+IMAGE modalities
    if (r.status === 400 && /responseModalities|IMAGE|modal/i.test(detail)) {
      r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'], temperature: 0.35 },
        }),
      });
      if (!r.ok) {
        let d2 = '';
        try { const j2 = await r.json(); d2 = j2.error?.message || ''; } catch {}
        throw new Error(`${r.status}: ${d2 || r.statusText}`);
      }
    } else {
      throw new Error(`${r.status}: ${detail || r.statusText}`);
    }
  }

  const data = await r.json();
  return extractImage(data);
}

function extractImage(data) {
  const cand = data?.candidates?.[0];
  const parts = cand?.content?.parts || [];
  for (const p of parts) {
    if (p.inlineData?.data) return p.inlineData.data;
    if (p.inline_data?.data) return p.inline_data.data;
  }
  return null;
}

// cheap text model — writes a ready-to-use image prompt (~0.04 baht/call)
async function callTextModel(key, prompt) {
  const model = 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7 },
    }),
  });
  if (!r.ok) {
    let d = '';
    try { const j = await r.json(); d = j.error?.message || ''; } catch {}
    throw new Error(`${r.status}: ${d || r.statusText}`);
  }
  const data = await r.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map(p => p.text || '').join('').trim();
}

