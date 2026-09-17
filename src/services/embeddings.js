import { embedQueryLocally } from './localEmbeddings';

// Batch size 25: 4x fewer requests, keeping well under Gemini free tier 100 RPM ceiling
const BATCH_SIZE = 25;
const EMBEDDING_MODEL = 'gemini-embedding-001';
const OUTPUT_DIMENSIONS = 768;
const CLIENT_GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// Exponential backoff delays in milliseconds for rate-limit retries
const RETRY_DELAYS = [3000, 6000, 12000, 20000, 30000];

/**
 * Direct client-side embedding via Google Gemini gemini-embedding-001 if VITE_GEMINI_API_KEY is available.
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
 * Direct client-side batch embedding via Google Gemini gemini-embedding-001.
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
 * Embeds a list of document chunks in micro-batches (25 chunks per call),
 * fully compatible with Vercel Hobby plan 10s serverless timeout,
 * with rate-limit throttling (1200ms gap = ~50 RPM max, well under Gemini's 100 RPM free limit),
 * automatic exponential backoff retries on 429, and responsive UI progress yielding.
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

    let attempt = 0;
    const maxAttempts = RETRY_DELAYS.length;
    let batchEmbeddings = null;
    let lastErrorMsg = null;

    while (attempt <= maxAttempts && !batchEmbeddings) {
      try {
        const response = await fetch('/api/embed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texts })
        });

        if (response.status === 429) {
          if (attempt < maxAttempts) {
            const waitTime = RETRY_DELAYS[attempt];
            attempt++;
            if (onProgress) {
              onProgress({
                stage: 'embedding',
                message: `Gemini rate limit cooldown: waiting ${waitTime / 1000}s before retry (attempt ${attempt}/${maxAttempts})...`,
                percentage: Math.round((i / total) * 100)
              });
            }
            await new Promise(res => setTimeout(res, waitTime));
            continue;
          } else {
            lastErrorMsg = 'Gemini free tier rate limit exceeded (100 RPM). Please wait a minute and try again.';
            break;
          }
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
          break; // Don't loop endlessly on non-429 server errors
        }
      } catch (err) {
        if (attempt < maxAttempts) {
          const waitTime = RETRY_DELAYS[attempt];
          attempt++;
          if (onProgress) {
            onProgress({
              stage: 'embedding',
              message: `Network glitch: retrying in ${waitTime / 1000}s (${i}/${total} chunks done)...`,
              percentage: Math.round((i / total) * 100)
            });
          }
          await new Promise(res => setTimeout(res, waitTime));
        } else {
          lastErrorMsg = err.message;
          break;
        }
      }
    }

    // Fallback: Try direct client API key if server endpoint had an issue
    if (!batchEmbeddings && CLIENT_GEMINI_KEY) {
      batchEmbeddings = await embedBatchDirectlyWithClientKey(texts);
    }

    // If still failed, throw an informative error rather than freezing the user's browser tab
    if (!batchEmbeddings) {
      throw new Error(
        lastErrorMsg
          ? `Embedding failed at chunk ${i + 1}/${total}: ${lastErrorMsg}`
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

    // 1200ms throttle between batches keeps request rate at ~50 RPM (Gemini free tier allows 100 RPM)
    await new Promise(res => setTimeout(res, 1200));
  }

  return results;
}
