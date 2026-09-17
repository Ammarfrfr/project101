/**
 * Builds the strict RAG context and system prompt from retrieved chunks.
 * @param {Array<{ document_name: string, page_number: number, text: string }>} sources 
 * @param {string} userQuery 
 * @returns {string} Formatted prompt
 */
export function buildRagPrompt(sources, userQuery) {
  const contextBlocks = (sources || []).map((source, idx) => {
    return `--- EXCERPT ${idx + 1} [Document: "${source.document_name}", Page: ${source.page_number}] ---
${source.text}`;
  }).join('\n\n');

  return `You are Dumroo AI, a precise document research and summarization assistant.

YOUR INSTRUCTIONS:
1. Answer the user's question thoroughly, accurately, and concisely using ONLY the provided excerpts below.
2. CITATION REQUIREMENT: After EVERY factual statement, summary sentence, or claim, you MUST cite the source page number using the format [p.X] where X is the page number (for example: "According to the findings, the model improved accuracy by 14% [p.5]. Multiple trials confirmed stability [p.12]."). If multiple pages support the claim, cite both like [p.5] [p.7].
3. STRICT GROUNDING: Do NOT invent facts or cite pages not provided in the excerpts. If the excerpts do not contain sufficient info to answer the question, state politely: "Based on the provided documents, I could not find information regarding..."
4. FORMATTING: Use clean Markdown with headers, concise bullet points, bold key phrases, and well-structured paragraphs.

EXCERPTS FROM DOCUMENTS:
${contextBlocks}

USER QUESTION:
${userQuery}

ANSWER (with [p.X] citations):`;
}

/**
 * Streams response securely through the /api/chat serverless backend.
 * 
 * @param {string} userQuery - The user's query
 * @param {Array<any>} sources - Retrieved chunk sources
 * @param {Function} onToken - Callback for streamed chunks (chunkText, accumulatedFullText)
 * @param {AbortSignal} [signal] - Optional abort signal
 * @returns {Promise<string>} Full response text
 */
export async function streamGeminiRagChat(userQuery, sources, onToken, signal) {
  const prompt = buildRagPrompt(sources, userQuery);

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
    signal
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(errorData.error || `Server chat error: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;

      const jsonStr = trimmed.slice(5).trim();
      if (!jsonStr || jsonStr === '[DONE]') continue;

      try {
        const parsed = JSON.parse(jsonStr);

        // Standard OpenAI/Groq SSE format
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          if (onToken) onToken(delta, fullText);
          continue;
        }

        // Gemini SSE format
        const parts = parsed.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.text) {
            fullText += part.text;
            if (onToken) onToken(part.text, fullText);
          }
        }
      } catch (err) {
        // ignore incomplete stream fragments
      }
    }
  }

  return fullText;
}
