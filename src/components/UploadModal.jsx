import React, { useState, useRef } from 'react';
import { UploadCloud, X, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { uploadAndProcessDocument } from '../services/ragPipeline';

export function UploadModal({ isOpen, onClose, userId, onUploadSuccess }) {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile && droppedFile.type === 'application/pdf') {
      setFile(droppedFile);
      setError(null);
    } else {
      setError('Please select a valid PDF file.');
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setError(null);
    } else if (selectedFile) {
      setError('Please select a valid PDF file.');
    }
  };

  const handleStartUpload = async () => {
    if (!file || !userId) return;

    setIsUploading(true);
    setError(null);
    setProgress({ percentage: 5, message: 'Initiating document processing...', stage: 'init' });

    try {
      const doc = await uploadAndProcessDocument(file, userId, (p) => {
        setProgress(p);
      });

      // Done
      setTimeout(() => {
        setIsUploading(false);
        setFile(null);
        setProgress(null);
        if (onUploadSuccess) onUploadSuccess(doc);
        onClose();
      }, 1000);
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.message || 'An error occurred while uploading and embedding the PDF.');
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-container">
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Upload & Index Document</h2>
            <p className="modal-subtitle">PDF text is chunked into ~400-word segments and embedded with Gemini</p>
          </div>
          {!isUploading && (
            <button onClick={onClose} className="modal-close-btn" aria-label="Close modal">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="modal-body">
          {error && (
            <div className="alert-error">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-500" />
              <div className="text-sm font-medium text-red-700">{error}</div>
            </div>
          )}

          {!isUploading && !file && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`dropzone ${dragOver ? 'dropzone-active' : ''}`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="dropzone-icon-box">
                <UploadCloud className="w-8 h-8 text-amber-500" />
              </div>
              <p className="dropzone-primary-text">
                <span className="text-amber-600 font-semibold underline">Click to upload</span> or drag and drop
              </p>
              <p className="dropzone-secondary-text">
                PDF documents up to 300+ pages supported
              </p>
            </div>
          )}

          {file && !isUploading && (
            <div className="selected-file-card">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-600">
                  <FileText className="w-6 h-6" />
                </div>
                <div className="overflow-hidden">
                  <p className="file-name" title={file.name}>{file.name}</p>
                  <p className="file-size">{formatFileSize(file.size)}</p>
                </div>
              </div>
              <button
                onClick={() => setFile(null)}
                className="text-gray-400 hover:text-red-500 p-1"
                title="Remove file"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {isUploading && progress && (
            <div className="upload-progress-container">
              <div className="progress-header">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-amber-600 animate-spin" />
                  <span className="progress-status-text">{progress.message}</span>
                </div>
                <span className="progress-percentage">{progress.percentage}%</span>
              </div>

              <div className="progress-track">
                <div
                  className="progress-bar"
                  style={{ width: `${progress.percentage}%` }}
                />
              </div>

              <div className="progress-stages-grid">
                <div className={`stage-step ${progress.stage === 'parsing' ? 'stage-active' : (progress.percentage > 35 ? 'stage-done' : '')}`}>
                  <span className="step-dot" />
                  <span>1. PDF Extraction</span>
                </div>
                <div className={`stage-step ${progress.stage === 'chunking' ? 'stage-active' : (progress.percentage > 42 ? 'stage-done' : '')}`}>
                  <span className="step-dot" />
                  <span>2. Overlap Chunking</span>
                </div>
                <div className={`stage-step ${progress.stage === 'embedding' ? 'stage-active' : (progress.percentage > 85 ? 'stage-done' : '')}`}>
                  <span className="step-dot" />
                  <span>3. Vector Embeddings</span>
                </div>
                <div className={`stage-step ${progress.stage === 'saving_chunks' || progress.stage === 'done' ? 'stage-active' : ''}`}>
                  <span className="step-dot" />
                  <span>4. pgvector Index</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {!isUploading && (
            <>
              <button onClick={onClose} className="btn-secondary">
                Cancel
              </button>
              <button
                disabled={!file}
                onClick={handleStartUpload}
                className="btn-primary"
              >
                Start Processing & Embedding
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
