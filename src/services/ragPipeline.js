import { supabase } from '../lib/supabaseClient';
import { parsePdf } from './pdfParser';
import { chunkPages } from './chunker';
import { embedChunks, embedQuery } from './embeddings';
import { streamGeminiRagChat } from './geminiChat';

/**
 * Uploads, parses, chunks, embeds, and stores a PDF document in Supabase.
 * 
 * @param {File} file 
 * @param {string} userId 
 * @param {Function} onProgress - Progress reporter
 * @returns {Promise<any>} Created document record
 */
export async function uploadAndProcessDocument(file, userId, onProgress) {
  // Step 1: Parse PDF
  if (onProgress) {
    onProgress({ stage: 'parsing', message: `Parsing PDF (${file.name})...`, percentage: 10 });
  }
  const parsedData = await parsePdf(file, (p) => {
    if (onProgress) {
      onProgress({
        stage: 'parsing',
        message: `Extracting text from page ${p.current} of ${p.total}...`,
        percentage: Math.round((p.current / p.total) * 30) // 0% - 30%
      });
    }
  });

  if (!parsedData.pages || parsedData.pages.length === 0) {
    throw new Error('No readable text could be extracted from this PDF. Please ensure it is not a scanned image.');
  }

  // Step 2: Create Document entry in Supabase
  if (onProgress) {
    onProgress({ stage: 'saving_doc', message: 'Creating document metadata in database...', percentage: 35 });
  }
  
  const { data: docRecord, error: docError } = await supabase
    .from('documents')
    .insert({
      user_id: userId,
      name: parsedData.name,
      page_count: parsedData.pageCount,
      file_size_bytes: parsedData.fileSizeBytes,
      chunk_count: 0
    })
    .select()
    .single();

  if (docError) {
    throw new Error(`Failed to save document: ${docError.message}`);
  }

  // Step 3: Chunk text with overlap
  if (onProgress) {
    onProgress({ stage: 'chunking', message: 'Chunking pages into ~400 word segments...', percentage: 40 });
  }
  const rawChunks = chunkPages(parsedData.pages);

  if (rawChunks.length === 0) {
    throw new Error('Failed to generate chunks from document text.');
  }

  // Step 4: Embed chunks with Gemini text-embedding-004
  if (onProgress) {
    onProgress({ stage: 'embedding', message: `Generating embeddings for ${rawChunks.length} chunks...`, percentage: 45 });
  }
  
  const chunksWithEmbeddings = await embedChunks(rawChunks, (ep) => {
    if (onProgress) {
      // Scale embedding progress from 45% to 85%
      const embeddingPct = 45 + Math.round((ep.current / ep.total) * 40);
      onProgress({
        stage: 'embedding',
        message: ep.message || `Embedding chunk ${ep.current} of ${ep.total}...`,
        percentage: embeddingPct
      });
    }
  });

  // Step 5: Batch insert chunks into Supabase table
  if (onProgress) {
    onProgress({ stage: 'saving_chunks', message: 'Storing vector embeddings in Supabase pgvector...', percentage: 90 });
  }

  const DB_BATCH_SIZE = 50;
  for (let i = 0; i < chunksWithEmbeddings.length; i += DB_BATCH_SIZE) {
    const batch = chunksWithEmbeddings.slice(i, i + DB_BATCH_SIZE).map(c => ({
      document_id: docRecord.id,
      user_id: userId,
      text: c.text,
      page_number: c.pageNumber,
      chunk_index: c.chunkIndex,
      embedding: c.embedding
    }));

    const { error: chunkError } = await supabase
      .from('chunks')
      .insert(batch);

    if (chunkError) {
      // Clean up orphaned document
      await supabase.from('documents').delete().eq('id', docRecord.id);
      throw new Error(`Failed to store vector chunks: ${chunkError.message}`);
    }
  }

  // Update chunk count on document
  await supabase
    .from('documents')
    .update({ chunk_count: chunksWithEmbeddings.length })
    .eq('id', docRecord.id);

  if (onProgress) {
    onProgress({ stage: 'done', message: 'Document processed and indexed successfully!', percentage: 100 });
  }

  return {
    ...docRecord,
    chunk_count: chunksWithEmbeddings.length
  };
}

/**
 * Executes a full RAG query:
 * 1. Embed query
 * 2. RPC match_documents
 * 3. Stream LLM summary with inline citations
 * 4. Persist messages to Supabase
 * 
 * @param {string} query 
 * @param {string} userId 
 * @param {string|null} documentId - null means all user documents
 * @param {Function} onToken - stream callback
 * @param {AbortSignal} [signal]
 */
export async function executeRagQuery({ query, userId, documentId, onToken, signal }) {
  // 1. Generate query embedding
  const queryEmbedding = await embedQuery(query);

  // 2. Call Supabase match_documents function (Cosine similarity)
  const { data: matchedChunks, error: matchError } = await supabase.rpc('match_documents', {
    query_embedding: queryEmbedding,
    match_count: 6,
    filter_document_id: documentId || null,
    filter_user_id: userId
  });

  if (matchError) {
    throw new Error(`Vector similarity search failed: ${matchError.message}`);
  }

  if (!matchedChunks || matchedChunks.length === 0) {
    // Return empty source response
    const fallbackMessage = "I couldn't find any relevant excerpts in your uploaded documents to answer this question. Try uploading a document or asking about a topic covered in your files.";
    if (onToken) onToken(fallbackMessage, fallbackMessage);
    return {
      answer: fallbackMessage,
      sources: []
    };
  }

  // 3. Save User Message in database
  await supabase.from('chat_messages').insert({
    user_id: userId,
    document_id: documentId || null,
    role: 'user',
    content: query,
    sources: []
  });

  // 4. Stream response from Gemini 2.0 Flash
  const fullAnswer = await streamGeminiRagChat(query, matchedChunks, onToken, signal);

  // 5. Save Assistant Message in database
  await supabase.from('chat_messages').insert({
    user_id: userId,
    document_id: documentId || null,
    role: 'assistant',
    content: fullAnswer,
    sources: matchedChunks.map(m => ({
      id: m.id,
      document_id: m.document_id,
      document_name: m.document_name,
      page_number: m.page_number,
      text: m.text,
      similarity: m.similarity
    }))
  });

  return {
    answer: fullAnswer,
    sources: matchedChunks
  };
}

/**
 * Fetch all documents for a user
 */
export async function getUserDocuments(userId) {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Delete a document and all related chunks (cascade in DB handles chunks)
 */
export async function deleteUserDocument(documentId, userId) {
  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', documentId)
    .eq('user_id', userId);

  if (error) throw error;
}

/**
 * Fetch chat history for selected document or all-docs view
 */
export async function getChatHistory(userId, documentId) {
  let query = supabase
    .from('chat_messages')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (documentId) {
    query = query.eq('document_id', documentId);
  } else {
    query = query.is('document_id', null);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Clear chat history
 */
export async function clearChatHistory(userId, documentId) {
  let query = supabase
    .from('chat_messages')
    .delete()
    .eq('user_id', userId);

  if (documentId) {
    query = query.eq('document_id', documentId);
  } else {
    query = query.is('document_id', null);
  }

  const { error } = await query;
  if (error) throw error;
}
