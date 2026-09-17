const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;

const EMBEDDING_MODEL = 'gemini-embedding-001';
const BATCH_SIZE = 20; // 20 chunks per request keeps payload size and rate limits optimal
const OUTPUT_DIMENSIONS = 768;

/**
 * Embeds a single query string for cosine similarity search.
 * @param {string} text - Query text
 * @returns {Promise<number[]>} 768-dimension vector
 */
export async function embedQuery(text) {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is not configured. Please set VITE_GEMINI_API_KEY in your environment.');
  }

  const cleanText = (text || '').trim();
  if (!cleanText) {
    throw new Error('Cannot embed empty query text.');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;
  
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
    const errText = await response.text();
    throw new Error(`Failed to generate query embedding: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  const vector = data.embedding?.values;
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error('Gemini API returned an empty vector for the query.');
  }

  return vector;
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
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is missing. Make sure VITE_GEMINI_API_KEY is configured in your deployment settings.');
  }

  const validChunks = (chunks || []).filter(c => c && typeof c.text === 'string' && c.text.trim().length > 0);
  if (validChunks.length === 0) {
    throw new Error('No valid text content found in document to embed.');
  }

  const total = validChunks.length;
  const results = [];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents?key=${GEMINI_API_KEY}`;

  for (let i = 0; i < validChunks.length; i += BATCH_SIZE) {
    const batch = validChunks.slice(i, i + BATCH_SIZE);
    
    const requests = batch.map(chunk => ({
      model: `models/${EMBEDDING_MODEL}`,
      content: {
        parts: [{ text: chunk.text.trim() }]
      },
      outputDimensionality: OUTPUT_DIMENSIONS
    }));

    let retries = 6;
    let batchEmbeddings = null;
    let waitMs = 2500;

    while (retries > 0 && !batchEmbeddings) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests })
        });

        if (response.status === 429) {
          retries--;
          if (retries === 0) {
            throw new Error('Gemini API free tier rate limit reached. Please wait a minute and try again.');
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
          throw new Error(`Batch embedding request failed: ${response.status} - ${errText}`);
        }

        const batchData = await response.json();
        if (Array.isArray(batchData?.embeddings) && batchData.embeddings.length === batch.length) {
          batchEmbeddings = batchData.embeddings.map(e => e.values);
        } else {
          throw new Error('Incomplete embedding batch returned by Gemini API');
        }
      } catch (err) {
        if (err.message.includes('rate limit') || err.message.includes('429')) {
          retries--;
          if (retries === 0) throw err;
          await new Promise(res => setTimeout(res, waitMs));
          waitMs = Math.min(waitMs * 1.8, 15000);
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
        stage: 'embedding'
      });
    }

    // Small throttle between batches to avoid immediate rate limit triggers
    if (i + BATCH_SIZE < validChunks.length) {
      await new Promise(res => setTimeout(res, 600));
    }
  }

  return results;
}

