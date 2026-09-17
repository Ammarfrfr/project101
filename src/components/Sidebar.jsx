import React from 'react';
import { 
  FileText, 
  Plus, 
  Trash2, 
  LogOut, 
  Layers, 
  FileSearch, 
  Sparkles,
  BookOpen
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function Sidebar({
  documents,
  selectedDocId,
  onSelectDoc,
  searchAllDocs,
  onToggleSearchAll,
  onOpenUpload,
  onDeleteDoc
}) {
  const { user, signOut } = useAuth();

  return (
    <aside className="sidebar">
      {/* Brand Header */}
      <div className="sidebar-header">
        <div className="flex items-center gap-2.5">
          <div className="brand-logo-icon">
            <span className="brand-infinity">∞</span>
          </div>
          <div>
            <div className="flex items-center gap-1">
              <span className="brand-title">Dumroo<span className="brand-title-accent">.ai</span></span>
            </div>
            <span className="brand-tagline">Document RAG & Citations</span>
          </div>
        </div>
      </div>

      {/* Upload Action Button */}
      <div className="sidebar-actions">
        <button onClick={onOpenUpload} className="btn-upload-cta">
          <Plus className="w-4 h-4" />
          <span>Upload PDF Document</span>
        </button>
      </div>

      {/* Search Scope Switcher */}
      <div className="search-scope-card">
        <div className="search-scope-header">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Search Scope</span>
        </div>
        <div className="search-scope-buttons">
          <button
            onClick={() => onToggleSearchAll(false)}
            className={`scope-btn ${!searchAllDocs ? 'scope-btn-active' : ''}`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>This Doc</span>
          </button>
          <button
            onClick={() => onToggleSearchAll(true)}
            className={`scope-btn ${searchAllDocs ? 'scope-btn-active' : ''}`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>All Docs</span>
          </button>
        </div>
        <p className="search-scope-desc">
          {searchAllDocs 
            ? 'Queries search across all indexed chunks in your library.' 
            : 'Queries focus strictly on the currently selected document.'}
        </p>
      </div>

      {/* Documents List */}
      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Your Documents ({documents.length})
          </span>
        </div>

        <div className="documents-list">
          {documents.length === 0 ? (
            <div className="empty-docs-state">
              <FileSearch className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-xs text-gray-500 font-medium">No documents uploaded</p>
              <p className="text-[11px] text-gray-400 mt-1">Upload a PDF to start citing and summarizing with AI</p>
            </div>
          ) : (
            documents.map((doc) => {
              const isSelected = selectedDocId === doc.id && !searchAllDocs;
              return (
                <div
                  key={doc.id}
                  onClick={() => {
                    onSelectDoc(doc.id);
                    if (searchAllDocs) onToggleSearchAll(false);
                  }}
                  className={`document-item ${isSelected ? 'document-item-active' : ''}`}
                >
                  <div className="doc-icon-container">
                    <FileText className="w-4 h-4 text-amber-600" />
                  </div>
                  
                  <div className="doc-info">
                    <p className="doc-name" title={doc.name}>{doc.name}</p>
                    <div className="doc-meta">
                      <span>{doc.page_count || 1} {doc.page_count === 1 ? 'page' : 'pages'}</span>
                      <span className="meta-dot">•</span>
                      <span>{doc.chunk_count || 0} chunks</span>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete "${doc.name}" and its indexed chunks?`)) {
                        onDeleteDoc(doc.id);
                      }
                    }}
                    className="doc-delete-btn"
                    title="Delete document"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* User Footer */}
      <div className="sidebar-footer">
        <div className="user-profile">
          <div className="user-avatar-sm">
            {user?.email?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="user-text-details">
            <p className="user-email-text" title={user?.email}>{user?.email}</p>
            <span className="user-status-badge">Supabase Auth</span>
          </div>
        </div>
        <button
          onClick={signOut}
          className="logout-btn"
          title="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}
