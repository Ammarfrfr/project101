import * as pdfjsLib from 'pdfjs-dist';

// Configure the worker source for pdfjs in Vite
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '4.10.38'}/pdf.worker.min.mjs`;

/**
 * Checks if an extracted page is boilerplate/non-informative (TOC, copyright, dedication, blank).
 * @param {string} text - Cleaned page text
 * @param {number} pageNumber - 1-indexed page number
 * @param {number} totalPages - Total pages in PDF
 * @returns {boolean} True if boilerplate
 */
function isBoilerplatePage(text, pageNumber, totalPages) {
  if (!text || text.trim().length === 0) return true;

  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const lower = text.toLowerCase();

  // 1. Very sparse pages (< 15 words) on multi-page documents (unless it is a tiny 1-3 page PDF)
  if (totalPages > 5 && wordCount < 15) {
    return true;
  }

  // 2. Early document pages (pages 1 to 12) checking for copyright/disclaimer/publisher data
  if (pageNumber <= 12) {
    // Copyright page heuristics
    const isCopyright = (
      (lower.includes('all rights reserved') || lower.includes('copyright ©') || lower.includes('copyright (c)')) &&
      (lower.includes('printed in') || lower.includes('published by') || lower.includes('isbn') || lower.includes('cataloging-in-publication') || lower.includes('reproduced or transmitted'))
    );
    if (isCopyright) return true;

    // Dedication / Praise page heuristics (very short)
    const isDedication = (
      (lower.startsWith('dedicated to') || lower.startsWith('this book is dedicated') || lower.includes('for my parents') || lower.includes('for my wife') || lower.includes('for my children')) &&
      wordCount < 45
    );
    if (isDedication) return true;

    // Table of contents heuristics
    const isTableOfContents = (
      (lower.includes('table of contents') || lower.startsWith('contents') || lower.includes('chapter 1') && lower.includes('chapter 2') && lower.includes('chapter 3')) &&
      (lower.includes('...') || (text.match(/\b\d{1,3}\b/g) || []).length > 8)
    );
    if (isTableOfContents && wordCount < 300) return true;
  }

  // 3. Back-of-the-book pure index pages with just numbers and keywords
  if (pageNumber > totalPages - 8 && totalPages > 20) {
    const isIndexOrBiblio = (
      (lower.startsWith('index') || lower.startsWith('subject index') || lower.startsWith('author index')) &&
      (text.match(/,\s*\d{1,3}/g) || []).length > 15
    );
    if (isIndexOrBiblio) return true;
  }

  return false;
}

/**
 * Parses an uploaded PDF file in the browser, extracting text per page and filtering boilerplate.
 * @param {File} file - PDF file from file input
 * @param {Function} onProgress - Callback for parsing progress { current, total, percentage, stage, message }
 * @returns {Promise<{ name: string, pageCount: number, filteredPageCount: number, pages: Array<{ pageNumber: number, text: string }> }>}
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
  let skippedBoilerplateCount = 0;

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const page = await pdfDoc.getPage(pageNumber);
    const textContent = await page.getTextContent();
    
    // Join text chunks cleanly
    const rawText = textContent.items
      .map(item => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Check if this page is boilerplate (TOC, copyright, dedication, empty)
    if (isBoilerplatePage(rawText, pageNumber, pageCount)) {
      skippedBoilerplateCount++;
    } else {
      pages.push({
        pageNumber,
        text: rawText
      });
    }

    if (onProgress) {
      onProgress({
        current: pageNumber,
        total: pageCount,
        percentage: Math.round((pageNumber / pageCount) * 100),
        stage: 'parsing',
        message: skippedBoilerplateCount > 0 
          ? `Extracting text (p.${pageNumber}/${pageCount}, filtered ${skippedBoilerplateCount} boilerplate pages)...`
          : `Extracting text from page ${pageNumber} of ${pageCount}...`
      });
    }
  }

  return {
    name: file.name,
    pageCount,
    filteredPageCount: skippedBoilerplateCount,
    fileSizeBytes: file.size,
    pages
  };
}

