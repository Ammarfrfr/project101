import React, { useState } from 'react';
import { ChevronDown, ChevronUp, FileText, Sparkles, ExternalLink } from 'lucide-react';

export function SourcesPanel({ sources }) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedChunkId, setExpandedChunkId] = useState(null);

  if (!sources || sources.length === 0) return null;

  return (
    <div className="sources-container">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="sources-toggle-btn"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-500" />
          <span className="font-semibold text-xs uppercase tracking-wider text-gray-700">
            Retrieved Sources ({sources.length})
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <span>{isOpen ? 'Hide sources' : 'View cited excerpts'}</span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {isOpen && (
        <div className="sources-grid">
          {sources.map((source, index) => {
            const isExpanded = expandedChunkId === (source.id || index);
            const similarityPct = source.similarity 
              ? Math.round(source.similarity * 100) 
              : null;

            return (
              <div key={source.id || index} className="source-card">
                <div className="source-card-header">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <FileText className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                    <span className="source-doc-name" title={source.document_name}>
                      {source.document_name || 'Document'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="source-page-badge">
                      Page {source.page_number}
                    </span>
                    {similarityPct !== null && (
                      <span className="source-similarity-badge" title="Cosine Similarity Score">
                        {similarityPct}% match
                      </span>
                    )}
                  </div>
                </div>

                <p className={`source-excerpt ${isExpanded ? 'expanded' : 'collapsed'}`}>
                  "{source.text}"
                </p>

                {source.text.length > 180 && (
                  <button
                    onClick={() => setExpandedChunkId(isExpanded ? null : (source.id || index))}
                    className="source-expand-btn"
                  >
                    {isExpanded ? 'Show less' : 'Read full excerpt'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
