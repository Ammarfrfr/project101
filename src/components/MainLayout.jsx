import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Sidebar } from './Sidebar';
import { ChatView } from './ChatView';
import { UploadModal } from './UploadModal';
import { ChangePasswordModal } from './ChangePasswordModal';
import { getUserDocuments, deleteUserDocument } from '../services/ragPipeline';

export function MainLayout() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [searchAllDocs, setSearchAllDocs] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(true);

  // Load user's documents
  const loadDocuments = async () => {
    if (!user) return;
    try {
      const docs = await getUserDocuments(user.id);
      setDocuments(docs);
      
      // Select first document by default if none is selected
      if (docs.length > 0 && !selectedDocId && !searchAllDocs) {
        setSelectedDocId(docs[0].id);
      } else if (docs.length === 0) {
        setSelectedDocId(null);
      }
    } catch (err) {
      console.error('Error loading documents:', err);
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [user]);

  const handleDeleteDocument = async (docId) => {
    if (!user) return;
    try {
      await deleteUserDocument(docId, user.id);
      setDocuments(prev => prev.filter(d => d.id !== docId));
      if (selectedDocId === docId) {
        const remaining = documents.filter(d => d.id !== docId);
        setSelectedDocId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (err) {
      console.error('Error deleting document:', err);
      alert('Failed to delete document: ' + err.message);
    }
  };

  const handleUploadSuccess = (newDoc) => {
    setDocuments(prev => [newDoc, ...prev]);
    setSelectedDocId(newDoc.id);
    setSearchAllDocs(false);
  };

  const selectedDoc = documents.find(d => d.id === selectedDocId) || null;

  return (
    <div className="app-container">
      <Sidebar
        documents={documents}
        selectedDocId={selectedDocId}
        onSelectDoc={setSelectedDocId}
        searchAllDocs={searchAllDocs}
        onToggleSearchAll={setSearchAllDocs}
        onOpenUpload={() => setIsUploadModalOpen(true)}
        onDeleteDoc={handleDeleteDocument}
        onOpenChangePassword={() => setIsChangePasswordOpen(true)}
      />

      <ChatView
        userId={user?.id}
        selectedDoc={selectedDoc}
        searchAllDocs={searchAllDocs}
        documentsCount={documents.length}
        onOpenUpload={() => setIsUploadModalOpen(true)}
      />

      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        userId={user?.id}
        onUploadSuccess={handleUploadSuccess}
      />

      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />
    </div>
  );
}
