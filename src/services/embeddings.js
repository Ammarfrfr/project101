import { embedQueryLocally } from './localEmbeddings';

// Batch size 10 ensures each serverless API request takes < 1-2s, safely under Vercel Hobby 10s limit
const BATCH_SIZE = 10;
const EMBEDDING_MODEL = 'text-embedding-004';
const OUTPUT_DIMENSIONS = 768;
const CLIENT_GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY;

/**
 * Direct client-side embedding via Google Gemini text-embedding-004 if VITE_GEMINI_API_KEY is available.
 */
async function embedDirectlyWithClientKey(cleanText) {
  if (!CLIENT_GEMINI_KEY) return null;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${CLIENT_GEMINI_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text: cleanText }] },
        outputDimensionality: OUTPUT_DIMENSIONS
      })
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.embedding?.values || null;
  } catch {
    return null;
  }
}

/**
 * Direct client-side batch embedding via Google Gemini text-embedding-004.
 */
async function embedBatchDirectlyWithClientKey(texts) {
  if (!CLIENT_GEMINI_KEY) return null;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents?key=${CLIENT_GEMINI_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: texts.map(t => ({
          model: `models/${EMBEDDING_MODEL}`,
          content: { parts: [{ text: t }] },
          outputDimensionality: OUTPUT_DIMENSIONS
        }))
      })
    });

    if (!response.ok) return null;
    const data = await response.json();
    if (Array.isArray(data?.embeddings) && data.embeddings.length === texts.length) {
      return data.embeddings.map(e => e.values);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Embeds a single query string for cosine similarity search.
 * Tries serverless /api/embed -> direct client key -> fast single-query local fallback.
 * 
 * @param {string} text - Query text
 * @returns {Promise<number[]>} 768-dimension vector
 */
export async function embedQuery(text) {
  const cleanText = (text || '').trim();
  if (!cleanText) {
    throw new Error('Cannot embed empty query text.');
  }

  // 1. Try secure /api/embed endpoint (works in Vercel production & local dev server)
  try {
    const response = await fetch('/api/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: cleanText })
    });

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.embedding) && data.embedding.length > 0) {
        return data.embedding;
      }
    }
  } catch {
    // API endpoint unreachable, continue to fallbacks
  }

  // 2. Try direct client key if configured in .env as VITE_GEMINI_API_KEY
  const directVector = await embedDirectlyWithClientKey(cleanText);
  if (Array.isArray(directVector) && directVector.length > 0) {
    return directVector;
  }

  // 3. Fast fallback for single query
  return embedQueryLocally(cleanText);
}

/**
 * Embeds a list of document chunks in micro-batches (10 chunks per call),
 * fully compatible with Vercel Hobby plan 10s serverless timeout,
 * with automatic retries, backoff, and responsive UI yielding.
 * 
 * @param {Array<{ chunkIndex: number, pageNumber: number, text: string }>} chunks 
 * @param {Function} onProgress - Callback { current, total, percentage, stage, message }
 * @returns {Promise<Array<{ chunkIndex: number, pageNumber: number, text: string, embedding: number[] }>>}
 */
export async function embedChunks(chunks, onProgress) {
  const validChunks = (chunks || []).filter(c => c && typeof c.text === 'string' && c.text.trim().length > 0);
  if (validChunks.length === 0) {
    throw new Error('No valid text content found in document to embed.');
  }

  const total = validChunks.length;
  const results = [];

  for (let i = 0; i < validChunks.length; i += BATCH_SIZE) {
    const batch = validChunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map(chunk => chunk.text.trim());

    let retries = 3;
    let batchEmbeddings = null;
    let lastErrorMsg = null;

    while (retries > 0 && !batchEmbeddings) {
      try {
        const response = await fetch('/api/embed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texts })
        });

        if (response.status === 429) {
          retries--;
          const waitTime = (4 - retries) * 2000;
          if (onProgress) {
            onProgress({
              stage: 'embedding',
              message: `Gemini API rate limit cooldown: waiting ${waitTime / 1000}s (${i}/${total} chunks indexed)...`,
              percentage: Math.round((i / total) * 100)
            });
          }
          await new Promise(res => setTimeout(res, waitTime));
          continue;
        }

        if (response.ok) {
          const batchData = await response.json();
          if (Array.isArray(batchData?.embeddings) && batchData.embeddings.length === batch.length) {
            batchEmbeddings = batchData.embeddings;
            break;
          }
        } else {
          const errData = await response.json().catch(() => ({}));
          lastErrorMsg = errData.error || `Server returned ${response.status}`;
          break; // Don't retry non-429 server errors immediately
        }
      } catch (err) {
        retries--;
        lastErrorMsg = err.message;
        if (retries <= 0) break;
        await new Promise(res => setTimeout(res, 1500));
      }
    }

    // Fallback: Try direct client API key if server endpoint had an issue
    if (!batchEmbeddings) {
      batchEmbeddings = await embedBatchDirectlyWithClientKey(texts);
    }

    // If still failed, throw an informative error rather than freezing the user's browser tab
    if (!batchEmbeddings) {
      throw new Error(
        lastErrorMsg
          ? `Embedding failed at chunk ${i + 1}/${total}: ${lastErrorMsg}. Please check that GEMINI_API_KEY is properly set in Vercel Environment Variables.`
          : `Failed to generate embeddings for document chunks. Please check your Gemini API key and network connection.`
      );
    }

    for (let j = 0; j < batch.length; j++) {
      const vector = batchEmbeddings[j];
      if (!Array.isArray(vector) || vector.length === 0) {
        throw new Error(`Embedding vector for chunk ${i + j + 1} is empty.`);
      }
      results.push({
        ...batch[j],
        embedding: vector
      });
    }

    if (onProgress) {
      const completed = Math.min(i + BATCH_SIZE, total);
      onProgress({
        current: completed,
        total,
        percentage: Math.round((completed / total) * 100),
        stage: 'embedding',
        message: `Embedded ${completed} of ${total} chunks (${Math.round((completed / total) * 100)}%)...`
      });
    }

    // Short yield between batches keeps the browser UI smooth and avoids API rate spikes
    await new Promise(res => setTimeout(res, 250));
  }

  return results;
}
