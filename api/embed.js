/**
 * Vercel Serverless Function: /api/embed
 * Securely proxies embeddings requests to Google Gemini text-embedding-004
 * Works seamlessly in Vercel Serverless (Hobby plan) and local Vite dev server.
 */

export default async function handler(req, res) {
  // Support CORS for cross-origin or dev requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ 
      error: 'GEMINI_API_KEY is not configured in Vercel environment variables or local .env file.' 
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { text, texts } = body;

    // Single query embedding
    if (typeof text === 'string' && text.trim().length > 0) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/text-embedding-004',
          content: {
            parts: [{ text: text.trim() }]
          },
          outputDimensionality: 768
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: `Gemini embed error: ${errText}` });
      }

      const data = await response.json();
      return res.status(200).json({ embedding: data.embedding?.values });
    }

    // Batch embedding (micro-batches of 10 chunks)
    if (Array.isArray(texts) && texts.length > 0) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${apiKey}`;
      const requests = texts.map(t => ({
        model: 'models/text-embedding-004',
        content: {
          parts: [{ text: (t || '').trim() }]
        },
        outputDimensionality: 768
      }));

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests })
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: `Gemini batch embed error: ${errText}` });
      }

      const batchData = await response.json();
      const embeddings = (batchData.embeddings || []).map(e => e.values);
      return res.status(200).json({ embeddings });
    }

    return res.status(400).json({ error: 'Request body must contain either "text" (string) or "texts" (array of strings).' });
  } catch (err) {
    console.error('Server /api/embed error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error in embedding endpoint' });
  }
}

