import { embedChunksLocally, embedQueryLocally } from './localEmbeddings';

const BATCH_SIZE = 25; // 25 chunks per request keeps payload size and rate limits optimal

/**
 * Embeds a single query string for cosine similarity search.
 * Uses secure serverless endpoint /api/embed, otherwise seamlessly falls back to In-Browser AI.
 * 
 * @param {string} text - Query text
 * @returns {Promise<number[]>} 768-dimension vector
 */
export async function embedQuery(text) {
  const cleanText = (text || '').trim();
  if (!cleanText) {
    throw new Error('Cannot embed empty query text.');
  }

  try {
    const response = await fetch('/api/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: cleanText })
    });

    if (!response.ok) {
      console.warn('Backend /api/embed query failed, using local in-browser model fallback.');
      return embedQueryLocally(cleanText);
    }

    const data = await response.json();
    const vector = data.embedding;
    if (!Array.isArray(vector) || vector.length === 0) {
      return embedQueryLocally(cleanText);
    }

    return vector;
  } catch (err) {
    console.warn('Query embed network error, using local in-browser fallback:', err);
    return embedQueryLocally(cleanText);
  }
}

/**
 * Embeds a list of document chunks in batches, reporting progress and handling rate limits.
 * Uses secure serverless endpoint /api/embed, with graceful local in-browser AI fallback.
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

    let retries = 5;
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
          if (retries <= 0) {
            // Switch to local embedding
            if (onProgress) {
              onProgress({
                stage: 'embedding',
                message: 'Gemini rate limit reached. Switching seamlessly to In-Browser AI embeddings...',
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

        if (!response.ok) {
          // If server reports missing key or non-200, switch to local in-browser AI
          console.warn(`API /api/embed error (${response.status}), switching to in-browser embedding...`);
          if (onProgress) {
            onProgress({
              stage: 'embedding',
              message: 'Using In-Browser Local AI for document embeddings...',
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

        const batchData = await response.json();
        if (Array.isArray(batchData?.embeddings) && batchData.embeddings.length === batch.length) {
          batchEmbeddings = batchData.embeddings;
        } else {
          throw new Error('Incomplete embedding batch returned by server API');
        }
      } catch (err) {
        retries--;
        if (retries <= 0) {
          console.warn('API connection failed, falling back to in-browser local embeddings:', err);
          if (onProgress) {
            onProgress({
              stage: 'embedding',
              message: 'Using In-Browser Local AI for remaining chunks...',
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
        await new Promise(res => setTimeout(res, 1500));
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

    // Small throttle between batches
    if (i + BATCH_SIZE < validChunks.length) {
      await new Promise(res => setTimeout(res, 600));
    }
  }

  return results;
}
