import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  Trash2, 
  Sparkles, 
  Layers, 
  FileText, 
  BrainCircuit, 
  HeartHandshake, 
  MessageSquare, 
  Star,
  AlertCircle
} from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import { executeRagQuery, getChatHistory, clearChatHistory } from '../services/ragPipeline';

export function ChatView({
  userId,
  selectedDoc,
  searchAllDocs,
  documentsCount,
  onOpenUpload
}) {
  const [messages, setMessages] = useState([]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [streamingSources, setStreamingSources] = useState([]);
  const [error, setError] = useState(null);
  
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Load chat history when selected document or search mode changes
  useEffect(() => {
    if (!userId) return;

    const docId = searchAllDocs ? null : (selectedDoc?.id || null);
    
    // Only fetch if we are in all-docs mode OR a doc is selected
    if (searchAllDocs || selectedDoc) {
      getChatHistory(userId, docId)
        .then(data => {
          setMessages(data || []);
        })
        .catch(err => {
          console.error('Failed to load chat history:', err);
        });
    } else {
      setMessages([]);
    }
  }, [userId, selectedDoc?.id, searchAllDocs]);

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText]);

  const handleClearHistory = async () => {
    if (!confirm('Are you sure you want to clear chat history for this conversation?')) return;
    try {
      const docId = searchAllDocs ? null : (selectedDoc?.id || null);
      await clearChatHistory(userId, docId);
      setMessages([]);
    } catch (err) {
      console.error('Error clearing chat history:', err);
    }
  };

  const handleSendMessage = async (e) => {
    e?.preventDefault();
    const query = inputQuery.trim();
    if (!query || isLoading || isStreaming) return;

    if (documentsCount === 0) {
      setError('Please upload at least one PDF document before asking questions.');
      return;
    }

    if (!searchAllDocs && !selectedDoc) {
      setError('Please select a document from the sidebar or toggle "All Docs" search mode.');
      return;
    }

    setError(null);
    setInputQuery('');
    
    // Add temporary user message to UI
    const tempUserMsg = {
      id: 'temp-user-' + Date.now(),
      role: 'user',
      content: query,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempUserMsg]);

    setIsLoading(true);
    setIsStreaming(true);
    setStreamingText('');
    setStreamingSources([]);

    // Abort controller for cancellations
    abortControllerRef.current = new AbortController();

    try {
      const docId = searchAllDocs ? null : selectedDoc.id;
      
      const result = await executeRagQuery({
        query,
        userId,
        documentId: docId,
        onToken: (token, fullText) => {
          setStreamingText(fullText);
        },
        signal: abortControllerRef.current.signal
      });

      // Once done, append assistant message with persistent record
      const assistantMsg = {
        id: 'assistant-' + Date.now(),
        role: 'assistant',
        content: result.answer,
        sources: result.sources,
        created_at: new Date().toISOString()
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      console.error('RAG Query Error:', err);
      setError(err.message || 'An error occurred while generating the answer.');
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      setStreamingText('');
      setStreamingSources([]);
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleStarterClick = (promptText) => {
    setInputQuery(promptText);
    textareaRef.current?.focus();
  };

  return (
    <main className="chat-main-container">
      {/* Top Navigation Bar */}
      <header className="chat-header">
        <div className="chat-header-info">
          <div className="flex items-center gap-2">
            {searchAllDocs ? (
              <div className="header-scope-icon bg-blue-50 text-blue-600 border border-blue-200">
                <Layers className="w-4 h-4" />
              </div>
            ) : (
              <div className="header-scope-icon bg-amber-50 text-amber-600 border border-amber-200">
                <FileText className="w-4 h-4" />
              </div>
            )}
            <div>
              <h1 className="header-title">
                {searchAllDocs 
                  ? 'All Documents (Global Library Search)' 
                  : (selectedDoc ? selectedDoc.name : 'Select or Upload a Document')}
              </h1>
              <p className="header-subtitle">
                {searchAllDocs 
                  ? `Searching across ${documentsCount} document${documentsCount === 1 ? '' : 's'}` 
                  : (selectedDoc 
                      ? `${selectedDoc.page_count || 1} pages • ${selectedDoc.chunk_count || 0} vector chunks indexed` 
                      : 'Upload a PDF or select an existing one from the sidebar')}
              </p>
            </div>
          </div>
        </div>

        {messages.length > 0 && (
          <button
            onClick={handleClearHistory}
            className="btn-clear-chat"
            title="Clear current chat"
          >
            <Trash2 className="w-4 h-4" />
            <span>Clear History</span>
          </button>
        )}
      </header>

      {/* Main Scrollable Chat Area */}
      <div className="chat-scroll-area">
        {error && (
          <div className="chat-error-banner">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {messages.length === 0 && !isStreaming ? (
          <div className="chat-empty-hero">
            <div className="hero-badge">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>AI Document Intelligence & Exact Citations</span>
            </div>

            <h2 className="hero-headline">
              Personal Learning <span className="hero-accent">Assistant</span>
            </h2>

            <p className="hero-description">
              Upload your documents to chat, summarize, and extract insights. Every factual claim is backed by inline <span className="text-amber-600 font-semibold">[p.X]</span> page citations and verifiable source excerpts.
            </p>

            {/* Feature Cards matching Dumroo screenshot */}
            <div className="features-grid">
              <div className="feature-card">
                <div className="feature-icon-box bg-blue-50 text-blue-600">
                  <BrainCircuit className="w-5 h-5" />
                </div>
                <div className="feature-card-content">
                  <h3 className="feature-title">Adaptive Intelligence</h3>
                  <p className="feature-text">Performs cosine vector search across page-tagged embeddings to retrieve the most relevant context.</p>
                </div>
              </div>

              <div className="feature-card">
                <div className="feature-icon-box bg-emerald-50 text-emerald-600">
                  <HeartHandshake className="w-5 h-5" />
                </div>
                <div className="feature-card-content">
                  <h3 className="feature-title">Verifiable Citations</h3>
                  <p className="feature-text">Every generated response includes exact source page numbers and collapsible source cards.</p>
                </div>
              </div>

              <div className="feature-card">
                <div className="feature-icon-box bg-purple-50 text-purple-600">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div className="feature-card-content">
                  <h3 className="feature-title">Natural Interaction</h3>
                  <p className="feature-text">Streamed responses with rich markdown formatting, bold keywords, and organized bullet points.</p>
                </div>
              </div>

              <div className="feature-card">
                <div className="feature-icon-box bg-amber-50 text-amber-600">
                  <Star className="w-5 h-5" />
                </div>
                <div className="feature-card-content">
                  <h3 className="feature-title">Fast Browser RAG</h3>
                  <p className="feature-text">100% client-side PDF parsing and vector indexing with Supabase pgvector backend.</p>
                </div>
              </div>
            </div>

            {/* Quick Starters */}
            {documentsCount > 0 ? (
              <div className="starter-prompts-container">
                <p className="starter-prompts-title">Try asking one of these questions:</p>
                <div className="starter-chips">
                  <button
                    onClick={() => handleStarterClick('Provide a comprehensive executive summary of this document and cite key pages.')}
                    className="starter-chip"
                  >
                    "Provide a comprehensive executive summary with page citations"
                  </button>
                  <button
                    onClick={() => handleStarterClick('What are the main conclusions, methodologies, or findings discussed?')}
                    className="starter-chip"
                  >
                    "What are the main conclusions and methodologies?"
                  </button>
                  <button
                    onClick={() => handleStarterClick('What critical recommendations or action items are proposed?')}
                    className="starter-chip"
                  >
                    "What critical recommendations or action items are proposed?"
                  </button>
                </div>
              </div>
            ) : (
              <div className="starter-upload-cta">
                <button onClick={onOpenUpload} className="btn-primary flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  <span>Upload your first PDF to begin</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="messages-list">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isStreaming={false}
              />
            ))}

            {/* Render active streaming message if currently generating */}
            {isStreaming && (
              <MessageBubble
                key="streaming-active"
                message={{
                  role: 'assistant',
                  content: streamingText,
                  sources: streamingSources
                }}
                isStreaming={true}
              />
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Floating Chat Input Bar */}
      <footer className="chat-input-wrapper">
        <form onSubmit={handleSendMessage} className="chat-input-card">
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              documentsCount === 0
                ? "Upload a PDF document first..."
                : (searchAllDocs 
                    ? "Ask anything across all uploaded documents..." 
                    : `Ask a question about ${selectedDoc?.name || 'selected document'}...`)
            }
            disabled={isLoading || isStreaming || documentsCount === 0}
            className="chat-textarea"
          />

          <div className="chat-input-actions">
            <span className="input-shortcut-hint">
              Press <kbd>Enter</kbd> to send, <kbd>Shift+Enter</kbd> for new line
            </span>

            <button
              type="submit"
              disabled={!inputQuery.trim() || isLoading || isStreaming || documentsCount === 0}
              className="chat-send-btn"
              aria-label="Send query"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </footer>
    </main>
  );
}
