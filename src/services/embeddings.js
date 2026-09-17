const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;

const EMBEDDING_MODEL = 'gemini-embedding-001';
const BATCH_SIZE = 40; // Combine more chunks per API request to reduce total calls
const OUTPUT_DIMENSIONS = 768;

/**
 * Embeds a single query string for cosine similarity search.
 * @param {string} text - Query text
 * @returns {Promise<number[]>} 768-dimension vector
 */
export async function embedQuery(text) {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is not configured in VITE_GEMINI_API_KEY');
  }

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
    throw new Error(`Failed to generate query embedding: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  if (!data.embedding || !data.embedding.values) {
    throw new Error('Invalid embedding response format from Gemini');
  }

  return data.embedding.values;
}

/**
 * Embeds a list of document chunks in batches, reporting progress and handling rate limits.
 * @param {Array<{ chunkIndex: number, pageNumber: number, text: string }>} chunks 
 * @param {Function} onProgress - Callback { current, total, percentage, stage, message }
 * @returns {Promise<Array<{ chunkIndex: number, pageNumber: number, text: string, embedding: number[] }>>}
 */
export async function embedChunks(chunks, onProgress) {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is not configured in VITE_GEMINI_API_KEY');
  }

  const total = chunks.length;
  const results = [];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents?key=${GEMINI_API_KEY}`;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    
    const requests = batch.map(chunk => ({
      model: `models/${EMBEDDING_MODEL}`,
      content: {
        parts: [{ text: chunk.text }]
      },
      outputDimensionality: OUTPUT_DIMENSIONS
    }));

    let retries = 6;
    let success = false;
    let batchData = null;
    let waitMs = 2500;

    while (retries > 0 && !success) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests })
        });

        if (response.status === 429) {
          retries--;
          if (retries === 0) {
            throw new Error('Gemini free tier rate limit exceeded. Please wait a minute and try again or use a smaller document.');
          }
          if (onProgress) {
            onProgress({
              current: i,
              total,
              percentage: Math.round((i / total) * 100),
              stage: 'embedding',
              message: `Gemini rate limit cooldown (${Math.round(waitMs / 1000)}s)...`
            });
          }
          await new Promise(res => setTimeout(res, waitMs));
          waitMs = Math.min(waitMs * 1.8, 15000);
          continue;
        }

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Batch embedding error: ${response.status} - ${errText}`);
        }

        batchData = await response.json();
        success = true;
      } catch (err) {
        if (err.message.includes('rate limit') || err.message.includes('429')) {
          retries--;
          if (retries === 0) throw err;
          await new Promise(res => setTimeout(res, waitMs));
          waitMs = Math.min(waitMs * 1.8, 15000);
        } else {
          retries--;
          if (retries === 0) throw err;
          await new Promise(res => setTimeout(res, 2000));
        }
      }
    }

    const embeddings = batchData?.embeddings || [];
    for (let j = 0; j < batch.length; j++) {
      results.push({
        ...batch[j],
        embedding: embeddings[j]?.values || []
      });
    }

    if (onProgress) {
      const completed = Math.min(i + BATCH_SIZE, total);
      onProgress({
        current: completed,
        total,
        percentage: Math.round((completed / total) * 100),
        stage: 'embedding'
      });
    }

    // Small throttle between batches to prevent spamming the rate limiter
    if (i + BATCH_SIZE < chunks.length) {
      await new Promise(res => setTimeout(res, 800));
    }
  }

  return results;
}
