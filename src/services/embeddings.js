import { embedChunksLocally, embedQueryLocally } from './localEmbeddings';

const BATCH_SIZE = 25; // 25 chunks per request keeps payload size and rate limits optimal
const EMBEDDING_MODEL = 'text-embedding-004';
const OUTPUT_DIMENSIONS = 768;
const CLIENT_GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY;

/**
 * Helper to safely forward in-browser local AI progress to the UI modal without NaN issues.
 */
function handleLocalProgress(onProgress, lp, offset = 0, total = 1) {
  if (!onProgress) return;

  if (lp.stage === 'model_download') {
    onProgress({
      stage: 'model_download',
      message: lp.message || 'Downloading local AI model...',
      percentage: typeof lp.percentage === 'number' ? lp.percentage : 15
    });
    return;
  }

  const current = typeof lp.current === 'number' ? lp.current : 1;
  const chunkIndex = offset + current;
  const pct = Math.min(100, Math.round((chunkIndex / Math.max(1, total)) * 100));

  onProgress({
    stage: 'embedding',
    current: chunkIndex,
    total,
    message: `Local AI embedding chunk ${chunkIndex} of ${total} (${pct}%)...`,
    percentage: pct
  });
}

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
 * Embeds a single query string for cosine similarity search.
 * Tries serverless /api/embed -> client key -> In-Browser Local AI.
 * 
 * @param {string} text - Query text
 * @returns {Promise<number[]>} 768-dimension vector
 */
export async function embedQuery(text) {
  const cleanText = (text || '').trim();
  if (!cleanText) {
    throw new Error('Cannot embed empty query text.');
  }

  // 1. Try secure /api/embed endpoint
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

  // 2. Try direct client key if configured
  const directVector = await embedDirectlyWithClientKey(cleanText);
  if (Array.isArray(directVector) && directVector.length > 0) {
    return directVector;
  }

  // 3. Fallback to 100% In-Browser Local AI
  return embedQueryLocally(cleanText);
}

/**
 * Embeds a list of document chunks in batches, reporting progress and handling rate limits.
 * Tries /api/embed -> direct client batch -> local in-browser AI.
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

    while (retries > 0 && !batchEmbeddings) {
      try {
        const response = await fetch('/api/embed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texts })
        });

        if (response.status === 429) {
          retries--;
          if (retries <= 0) break;
          if (onProgress) {
            onProgress({
              stage: 'embedding',
              message: `Gemini API cooldown: retrying in 5s (${i}/${total} chunks indexed)...`,
              percentage: Math.round((i / total) * 100)
            });
          }
          await new Promise(res => setTimeout(res, 5000));
          continue;
        }

        if (response.ok) {
          const batchData = await response.json();
          if (Array.isArray(batchData?.embeddings) && batchData.embeddings.length === batch.length) {
            batchEmbeddings = batchData.embeddings;
            break;
          }
        }

        // If /api/embed returned 404 or other error, break to fallbacks
        break;
      } catch (err) {
        retries--;
        if (retries <= 0) break;
        await new Promise(res => setTimeout(res, 1500));
      }
    }

    // Fallback if server /api/embed was not available
    if (!batchEmbeddings) {
      // Try direct client API key if available
      if (CLIENT_GEMINI_KEY) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents?key=${CLIENT_GEMINI_KEY}`;
          const directRes = await fetch(url, {
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

          if (directRes.ok) {
            const dData = await directRes.json();
            if (Array.isArray(dData?.embeddings) && dData.embeddings.length === batch.length) {
              batchEmbeddings = dData.embeddings.map(e => e.values);
            }
          }
        } catch {
          // Direct client call failed, fall through to local AI
        }
      }

      // If still no embeddings, seamlessly switch to In-Browser Local AI for remaining chunks
      if (!batchEmbeddings) {
        if (onProgress) {
          onProgress({
            stage: 'embedding',
            message: 'Switching to In-Browser Local AI for document embeddings...',
            percentage: Math.round((i / total) * 100)
          });
        }
        const remainingChunks = validChunks.slice(i);
        const localResults = await embedChunksLocally(remainingChunks, (lp) => {
          handleLocalProgress(onProgress, lp, i, total);
        });
        return [...results, ...localResults];
      }
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

    if (i + BATCH_SIZE < validChunks.length) {
      await new Promise(res => setTimeout(res, 600));
    }
  }

  return results;
}
