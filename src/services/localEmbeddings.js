import { pipeline, env } from '@xenova/transformers';

// Tell transformers.js to load models from Hugging Face Hub directly
env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL_NAME = 'Xenova/bge-base-en-v1.5';
let extractorInstance = null;
let loadingPromise = null;

/**
 * Initializes and caches the in-browser transformer model.
 * @param {Function} onProgress - Progress reporter for model downloading
 */
export async function getLocalEmbeddingExtractor(onProgress) {
  if (extractorInstance) {
    return extractorInstance;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    try {
      const extractor = await pipeline('feature-extraction', MODEL_NAME, {
        quantized: true,
        progress_callback: (p) => {
          if (onProgress && p.status === 'progress') {
            const pct = Math.round((p.loaded / (p.total || 1)) * 100);
            onProgress({
              stage: 'model_download',
              message: `Loading in-browser embedding model (${pct}%)...`,
              percentage: pct
            });
          }
        }
      });
      extractorInstance = extractor;
      return extractor;
    } catch (err) {
      loadingPromise = null;
      throw new Error(`Failed to load in-browser embedding model: ${err.message}`);
    }
  })();

  return loadingPromise;
}

/**
 * Generates an in-browser 768-dim normalized embedding vector for a query.
 * @param {string} text 
 * @returns {Promise<number[]>} 768-dimension vector
 */
export async function embedQueryLocally(text) {
  const extractor = await getLocalEmbeddingExtractor();
  const cleanText = (text || '').trim();
  const output = await extractor(cleanText, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

/**
 * Generates in-browser embeddings for chunks with progress reporting.
 * 100% Free, 0 API Calls, Unlimited Chunks.
 * 
 * @param {Array<{ chunkIndex: number, pageNumber: number, text: string }>} chunks 
 * @param {Function} onProgress 
 * @returns {Promise<Array<{ chunkIndex: number, pageNumber: number, text: string, embedding: number[] }>>}
 */
export async function embedChunksLocally(chunks, onProgress) {
  const extractor = await getLocalEmbeddingExtractor(onProgress);
  const total = chunks.length;
  const results = [];

  for (let i = 0; i < total; i++) {
    const chunk = chunks[i];
    const output = await extractor(chunk.text, { pooling: 'mean', normalize: true });
    const vector = Array.from(output.data);

    results.push({
      ...chunk,
      embedding: vector
    });

    if (onProgress) {
      const completed = i + 1;
      onProgress({
        current: completed,
        total,
        percentage: Math.round((completed / total) * 100),
        stage: 'embedding',
        message: `Local AI embedding chunk ${completed} of ${total} (${Math.round((completed / total) * 100)}%)...`
      });
    }

    // Yield main thread every 5 chunks so UI remains buttery smooth
    if (i % 5 === 0) {
      await new Promise(res => setTimeout(res, 0));
    }
  }

  return results;
}
