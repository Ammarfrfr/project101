import React from 'react';
import { BookOpen } from 'lucide-react';

/**
 * CitationBadge renders inline citation badges like [p.4] with amber highlight.
 */
export function CitationBadge({ pageText, onClick }) {
  // Extract number from "[p.4]" or "p.4" or "4"
  const cleanPage = pageText.replace(/[\[\]]/g, '').trim();

  return (
    <span
      className="inline-citation-badge"
      title={`Source: ${cleanPage}`}
      onClick={onClick}
    >
      <BookOpen className="w-3 h-3 citation-icon" />
      <span>{cleanPage}</span>
    </span>
  );
}
