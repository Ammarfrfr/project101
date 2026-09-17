import * as pdfjsLib from 'pdfjs-dist';

// Configure the worker source for pdfjs in Vite
// Using worker script URL
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '4.10.38'}/pdf.worker.min.mjs`;

/**
 * Parses an uploaded PDF file in the browser, extracting text per page.
 * @param {File} file - PDF file from file input
 * @param {Function} onProgress - Callback for parsing progress { current, total, percentage }
 * @returns {Promise<{ name: string, pageCount: number, pages: Array<{ pageNumber: number, text: string }> }>}
 */
export async function parsePdf(file, onProgress) {
  const arrayBuffer = await file.arrayBuffer();
  
  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer,
    useSystemFonts: true,
    isEvalSupported: false
  });

  const pdfDoc = await loadingTask.promise;
  const pageCount = pdfDoc.numPages;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const page = await pdfDoc.getPage(pageNumber);
    const textContent = await page.getTextContent();
    
    // Join text chunks cleanly
    const pageText = textContent.items
      .map(item => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (pageText.length > 0) {
      pages.push({
        pageNumber,
        text: pageText
      });
    }

    if (onProgress) {
      onProgress({
        current: pageNumber,
        total: pageCount,
        percentage: Math.round((pageNumber / pageCount) * 100),
        stage: 'parsing'
      });
    }
  }

  return {
    name: file.name,
    pageCount,
    fileSizeBytes: file.size,
    pages
  };
}
