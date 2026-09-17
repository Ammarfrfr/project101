import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, User, Copy, Check } from 'lucide-react';
import { CitationBadge } from './CitationBadge';
import { SourcesPanel } from './SourcesPanel';

export function MessageBubble({ message, isStreaming }) {
  const [copied, setCopied] = React.useState(false);
  const isUser = message.role === 'user';

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Custom renderer to replace [p.X] citation patterns inside text nodes with CitationBadge
  const renderTextWithCitations = (text) => {
    if (typeof text !== 'string') return text;
    
    // Match patterns like [p.4], [p.12], [p. 15], [p.3, p.4]
    const citationRegex = /(\[p\.\s*\d+(?:\s*,\s*p\.\s*\d+)*\])/g;
    const parts = text.split(citationRegex);

    if (parts.length === 1) return text;

    return parts.map((part, index) => {
      if (citationRegex.test(part)) {
        return <CitationBadge key={index} pageText={part} />;
      }
      return part;
    });
  };

  // Custom components for ReactMarkdown to handle citations in paragraph and list items
  const markdownComponents = {
    p: ({ children, ...props }) => {
      const processedChildren = React.Children.map(children, child => {
        if (typeof child === 'string') {
          return renderTextWithCitations(child);
        }
        return child;
      });
      return <p className="markdown-p" {...props}>{processedChildren}</p>;
    },
    li: ({ children, ...props }) => {
      const processedChildren = React.Children.map(children, child => {
        if (typeof child === 'string') {
          return renderTextWithCitations(child);
        }
        return child;
      });
      return <li className="markdown-li" {...props}>{processedChildren}</li>;
    }
  };

  if (isUser) {
    return (
      <div className="message-row user-row">
        <div className="message-content user-bubble">
          <p className="user-text">{message.content}</p>
        </div>
        <div className="avatar user-avatar">
          <User className="w-4 h-4 text-white" />
        </div>
      </div>
    );
  }

  return (
    <div className="message-row assistant-row">
      <div className="avatar assistant-avatar">
        <Bot className="w-4 h-4 text-white" />
      </div>
      <div className="message-content assistant-card">
        <div className="assistant-header">
          <div className="flex items-center gap-1.5">
            <span className="assistant-label">Dumroo AI</span>
            {isStreaming && <span className="streaming-badge">Thinking & Generating...</span>}
          </div>
          {!isStreaming && message.content && (
            <button
              onClick={handleCopy}
              className="copy-btn"
              title="Copy answer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
            </button>
          )}
        </div>

        <div className="markdown-body">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {message.content}
          </ReactMarkdown>

          {isStreaming && <span className="typing-cursor" />}
        </div>

        {/* Sources Accordion */}
        {message.sources && message.sources.length > 0 && (
          <SourcesPanel sources={message.sources} />
        )}
      </div>
    </div>
  );
}
