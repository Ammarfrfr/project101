import { embedChunksLocally, embedQueryLocally } from './localEmbeddings';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;

const EMBEDDING_MODEL = 'gemini-embedding-001';
const BATCH_SIZE = 25; // 25 chunks per request keeps payload size and rate limits optimal
const OUTPUT_DIMENSIONS = 768;

/**
 * Embeds a single query string for cosine similarity search.
 * Uses Gemini API if available, otherwise seamlessly falls back to In-Browser AI.
 * 
 * @param {string} text - Query text
 * @returns {Promise<number[]>} 768-dimension vector
 */
export async function embedQuery(text) {
  const cleanText = (text || '').trim();
  if (!cleanText) {
    throw new Error('Cannot embed empty query text.');
  }

  // If no Gemini API key configured, use in-browser Transformer model
  if (!GEMINI_API_KEY) {
    return embedQueryLocally(cleanText);
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${EMBEDDING_MODEL}`,
        content: {
          parts: [{ text: cleanText }]
        },
        outputDimensionality: OUTPUT_DIMENSIONS
      })
    });

    if (!response.ok) {
      // Fallback to local in-browser embedding
      console.warn('Gemini query embed failed, falling back to in-browser embedding.');
      return embedQueryLocally(cleanText);
    }

    const data = await response.json();
    const vector = data.embedding?.values;
    if (!Array.isArray(vector) || vector.length === 0) {
      return embedQueryLocally(cleanText);
    }

    return vector;
  } catch (err) {
    console.warn('Gemini embedQuery network error, using in-browser fallback:', err);
    return embedQueryLocally(cleanText);
  }
}


/**
 * Embeds a single text piece as fallback
 */
async function embedSingleChunk(text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${EMBEDDING_MODEL}`,
      content: {
        parts: [{ text: text.trim() }]
      },
      outputDimensionality: OUTPUT_DIMENSIONS
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Single embed error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  return data.embedding?.values;
}

/**
 * Embeds a list of document chunks in batches, reporting progress and handling rate limits.
 * @param {Array<{ chunkIndex: number, pageNumber: number, text: string }>} chunks 
 * @param {Function} onProgress - Callback { current, total, percentage, stage, message }
 * @returns {Promise<Array<{ chunkIndex: number, pageNumber: number, text: string, embedding: number[] }>>}
 */
export async function embedChunks(chunks, onProgress) {
  const validChunks = (chunks || []).filter(c => c && typeof c.text === 'string' && c.text.trim().length > 0);
  if (validChunks.length === 0) {
    throw new Error('No valid text content found in document to embed.');
  }

  // If no Gemini API key configured, use in-browser Transformer embedding directly
  if (!GEMINI_API_KEY) {
    if (onProgress) {
      onProgress({ stage: 'embedding', message: 'Using In-Browser Local AI for 100% free embeddings...', percentage: 48 });
    }
    return embedChunksLocally(validChunks, onProgress);
  }

  const total = validChunks.length;
  const results = [];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents?key=${GEMINI_API_KEY}`;
  const BATCH_SIZE = 25;

  for (let i = 0; i < validChunks.length; i += BATCH_SIZE) {
    const batch = validChunks.slice(i, i + BATCH_SIZE);
    
    const requests = batch.map(chunk => ({
      model: `models/${EMBEDDING_MODEL}`,
      content: {
        parts: [{ text: chunk.text.trim() }]
      },
      outputDimensionality: OUTPUT_DIMENSIONS
    }));

    let retries = 10;
    let batchEmbeddings = null;

    while (retries > 0 && !batchEmbeddings) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests })
        });

        if (response.status === 429) {
          const errData = await response.json().catch(() => null);
          const errMsg = errData?.error?.message || '';

          // If daily quota (1000 requests) is exhausted, switch seamlessly to in-browser embedding for remaining chunks!
          if (errMsg.includes('limit: 1000') || errMsg.includes('generativelanguage.googleapis.com/embed_content_free_tier_requests') || errMsg.includes('billing')) {
            if (onProgress) {
              onProgress({
                stage: 'embedding',
                message: 'Gemini daily quota reached. Switching to In-Browser AI embeddings...',
                percentage: Math.round((i / total) * 100)
              });
            }
            const remainingChunks = validChunks.slice(i);
            const localResults = await embedChunksLocally(remainingChunks, (lp) => {
              if (onProgress) {
                const combinedPct = Math.round((i / total) * 100) + Math.round((lp.current / remainingChunks.length) * (100 - Math.round((i / total) * 100)));
                onProgress({
                  stage: 'embedding',
                  message: `Local AI embedding chunk ${i + lp.current} of ${total}...`,
                  percentage: combinedPct
                });
              }
            });
            return [...results, ...localResults];
          }

          retries--;
          // Parse Google's exact retry delay if provided (e.g. "Please retry in 28.4s")
          let waitSeconds = 15;
          const match = errMsg.match(/retry in ([0-9.]+)s/i);
          if (match) {
            const sec = Math.ceil(parseFloat(match[1]));
            if (!isNaN(sec) && sec > 0) waitSeconds = Math.min(sec + 2, 45);
          }

          if (retries <= 0) {
            throw new Error(`Gemini API rate limit reached. Please wait a minute or try a smaller document.`);
          }

          // Live countdown timer in the progress modal
          for (let s = waitSeconds; s > 0; s--) {
            if (onProgress) {
              onProgress({
                current: i,
                total,
                percentage: Math.round((i / total) * 100),
                stage: 'embedding',
                message: `Gemini API cooldown: resuming in ${s}s (${i}/${total} chunks indexed)...`
              });
            }
            await new Promise(res => setTimeout(res, 1000));
          }
          continue;
        }

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Batch embedding request failed: ${response.status} - ${errText}`);
        }

        const batchData = await response.json();
        if (Array.isArray(batchData?.embeddings) && batchData.embeddings.length === batch.length) {
          batchEmbeddings = batchData.embeddings.map(e => e.values);
        } else {
          throw new Error('Incomplete embedding batch returned by Gemini API');
        }
      } catch (err) {
        if (err.message.includes('rate limit') || err.message.includes('quota') || err.message.includes('429')) {
          retries--;
          if (retries <= 0) throw err;
          await new Promise(res => setTimeout(res, 5000));
        } else if (retries > 1) {
          retries--;
          await new Promise(res => setTimeout(res, 2000));
        } else {
          // Fallback: Embed individually if batch API failed
          try {
            batchEmbeddings = [];
            for (const item of batch) {
              const singleVec = await embedSingleChunk(item.text);
              batchEmbeddings.push(singleVec);
            }
          } catch (singleErr) {
            throw new Error(`Embedding failed for chunk batch: ${err.message}`);
          }
        }
      }
    }

    if (!batchEmbeddings || batchEmbeddings.length !== batch.length) {
      throw new Error(`Failed to generate embeddings for batch starting at index ${i}`);
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

    // Small throttle between batches to avoid spamming the rate limiter
    if (i + BATCH_SIZE < validChunks.length) {
      await new Promise(res => setTimeout(res, 1200));
    }
  }

  return results;
}


