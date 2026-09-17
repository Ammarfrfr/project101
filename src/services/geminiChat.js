const CLIENT_GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const CLIENT_GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY;

const GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash',
  'gemini-1.5-pro'
];

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
 * Direct client-side streaming fallback if /api/chat is not yet deployed or unreachable.
 */
async function streamDirectClientChat(prompt, onToken, signal) {
  if (CLIENT_GROQ_KEY) {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CLIENT_GROQ_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        stream: true
      }),
      signal
    });

    if (groqRes.ok) {
      return consumeStream(groqRes, onToken);
    }
  }

  if (!CLIENT_GEMINI_KEY) {
    throw new Error('Chat service is unavailable. Please check your Gemini API key or backend deployment.');
  }

  const requestBody = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, topP: 0.95, maxOutputTokens: 2048 }
  };

  for (const modelName of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse&key=${CLIENT_GEMINI_KEY}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal
      });

      if (response.status === 503 || response.status === 404) continue;
      if (!response.ok) continue;

      return consumeStream(response, onToken);
    } catch (err) {
      if (err.name === 'AbortError') throw err;
    }
  }

  throw new Error('All Gemini chat models currently experiencing high demand. Please retry in a moment.');
}

async function consumeStream(response, onToken) {
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
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          if (onToken) onToken(delta, fullText);
          continue;
        }

        const parts = parsed.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.text) {
            fullText += part.text;
            if (onToken) onToken(part.text, fullText);
          }
        }
      } catch {
        // ignore incomplete stream chunks
      }
    }
  }

  return fullText;
}

/**
 * Streams response securely through /api/chat with client-side fallback.
 * 
 * @param {string} userQuery - The user's query
 * @param {Array<any>} sources - Retrieved chunk sources
 * @param {Function} onToken - Callback for streamed chunks (chunkText, accumulatedFullText)
 * @param {AbortSignal} [signal] - Optional abort signal
 * @returns {Promise<string>} Full response text
 */
export async function streamGeminiRagChat(userQuery, sources, onToken, signal) {
  const prompt = buildRagPrompt(sources, userQuery);

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal
    });

    if (response.ok) {
      return consumeStream(response, onToken);
    }
  } catch (err) {
    if (err.name === 'AbortError') throw err;
  }

  // Fallback to direct client streaming if /api/chat is not available
  return streamDirectClientChat(prompt, onToken, signal);
}
