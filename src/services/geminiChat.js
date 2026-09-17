const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;

// Reliable models with fallback order to prevent 503 capacity issues
const GEMINI_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-flash-latest',
  'gemini-3.5-flash'
];

/**
 * Builds the strict RAG context and system prompt from retrieved chunks.
 * @param {Array<{ document_name: string, page_number: number, text: string }>} sources 
 * @param {string} userQuery 
 * @returns {string} Formatted prompt
 */
function buildRagPrompt(sources, userQuery) {
  const contextBlocks = sources.map((source, idx) => {
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
 * Streams chat completion from Groq API (llama-3.3-70b-versatile).
 */
async function streamGroqChat(prompt, onToken, signal) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      stream: true
    }),
    signal
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API Error (${response.status}): ${errText}`);
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
      const dataStr = trimmed.slice(5).trim();
      if (dataStr === '[DONE]') continue;

      try {
        const parsed = JSON.parse(dataStr);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          if (onToken) onToken(delta, fullText);
        }
      } catch (err) {
        // ignore parse error
      }
    }
  }

  return fullText;
}

/**
 * Streams response from Gemini with automatic multi-model failover on 503 high demand.
 * 
 * @param {string} userQuery - The user's query
 * @param {Array<any>} sources - Retrieved chunk sources
 * @param {Function} onToken - Callback for streamed chunks (chunkText, accumulatedFullText)
 * @param {AbortSignal} [signal] - Optional abort signal
 * @returns {Promise<string>} Full response text
 */
export async function streamGeminiRagChat(userQuery, sources, onToken, signal) {
  const prompt = buildRagPrompt(sources, userQuery);

  // If Groq key is provided, use Groq (ultra fast 500 tokens/sec)
  if (GROQ_API_KEY) {
    return streamGroqChat(prompt, onToken, signal);
  }

  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is not configured in VITE_GEMINI_API_KEY');
  }

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      topP: 0.95,
      maxOutputTokens: 2048
    }
  };

  let lastError = null;

  // Try available models in failover order if Google returns 503
  for (const modelName of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal
      });

      if (response.status === 503 || response.status === 404) {
        lastError = new Error(`Model ${modelName} unavailable (${response.status})`);
        continue; // Failover to next model
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini Chat API Error (${response.status}): ${errorText}`);
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
            const candidates = parsed.candidates || [];
            if (candidates.length > 0) {
              const parts = candidates[0]?.content?.parts || [];
              for (const part of parts) {
                if (part.text) {
                  fullText += part.text;
                  if (onToken) {
                    onToken(part.text, fullText);
                  }
                }
              }
            }
          } catch (err) {
            console.warn('Error parsing SSE json chunk:', err);
          }
        }
      }

      return fullText;
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      lastError = err;
    }
  }

  throw lastError || new Error('All Gemini chat models currently experiencing high demand. Please retry in a moment.');
}
