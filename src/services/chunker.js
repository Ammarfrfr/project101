/**
 * Splits extracted pages into ~400 word chunks with 50-word overlap,
 * preserving page number tagging.
 * 
 * @param {Array<{ pageNumber: number, text: string }>} pages 
 * @param {number} chunkSizeWords - target words per chunk (default: 400)
 * @param {number} overlapWords - overlap words between chunks (default: 50)
 * @returns {Array<{ chunkIndex: number, pageNumber: number, text: string }>}
 */
export function chunkPages(pages, chunkSizeWords = 400, overlapWords = 50) {
  const chunks = [];
  let globalChunkIndex = 0;

  for (const page of pages) {
    const words = page.text.split(/\s+/).filter(Boolean);
    
    if (words.length === 0) continue;

    // If the page is shorter than or roughly equal to chunk size, make 1 chunk
    if (words.length <= chunkSizeWords) {
      chunks.push({
        chunkIndex: globalChunkIndex++,
        pageNumber: page.pageNumber,
        text: words.join(' ')
      });
      continue;
    }

    // Sliding window over words
    const step = chunkSizeWords - overlapWords;
    for (let i = 0; i < words.length; i += step) {
      const chunkWords = words.slice(i, i + chunkSizeWords);
      
      // Avoid creating tiny residual chunks at the end
      if (chunkWords.length < 30 && chunks.length > 0 && i > 0) {
        // Append to previous chunk if very short
        chunks[chunks.length - 1].text += ' ' + chunkWords.join(' ');
        break;
      }

      chunks.push({
        chunkIndex: globalChunkIndex++,
        pageNumber: page.pageNumber,
        text: chunkWords.join(' ')
      });

      // If we reached the end of the word array, stop
      if (i + chunkSizeWords >= words.length) {
        break;
      }
    }
  }

  return chunks;
}
