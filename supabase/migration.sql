-- ==============================================================================
-- Dumroo AI / Document RAG - Supabase SQL Schema & Vector Search Function
-- Run this in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- ==============================================================================

-- 1. Enable pgvector extension
create extension if not exists vector;

-- 2. Documents table (tracks uploaded PDFs per user)
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  page_count integer default 0,
  chunk_count integer default 0,
  file_size_bytes bigint default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Chunks table with 768-dim vector embedding (Gemini text-embedding-004)
create table if not exists public.chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  text text not null,
  page_number integer not null,
  chunk_index integer not null,
  embedding vector(768),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Chat messages table (persists history per document or workspace)
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  document_id uuid references public.documents(id) on delete cascade, -- null means workspace-wide / all docs
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  sources jsonb default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Indexes for fast lookup and similarity search
create index if not exists idx_chunks_document_id on public.chunks(document_id);
create index if not exists idx_chunks_user_id on public.chunks(user_id);
create index if not exists idx_documents_user_id on public.documents(user_id);
create index if not exists idx_chat_messages_user_doc on public.chat_messages(user_id, document_id);
create index if not exists idx_chat_messages_created_at on public.chat_messages(created_at asc);

-- Vector index for cosine distance (HNSW works with empty tables and scales gracefully)
create index if not exists idx_chunks_embedding on public.chunks 
using hnsw (embedding vector_cosine_ops);

-- 6. Enable Row Level Security (RLS)
alter table public.documents enable row level security;
alter table public.chunks enable row level security;
alter table public.chat_messages enable row level security;

-- 7. RLS Policies for Documents
drop policy if exists "Users can manage their own documents" on public.documents;
create policy "Users can manage their own documents"
  on public.documents for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 8. RLS Policies for Chunks
drop policy if exists "Users can manage their own chunks" on public.chunks;
create policy "Users can manage their own chunks"
  on public.chunks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 9. RLS Policies for Chat Messages
drop policy if exists "Users can manage their own messages" on public.chat_messages;
create policy "Users can manage their own messages"
  on public.chat_messages for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 10. Cosine Similarity Matching Function (RPC)
create or replace function match_documents (
  query_embedding vector(768),
  match_count int default 6,
  filter_document_id uuid default null,
  filter_user_id uuid default null
)
returns table (
  id uuid,
  document_id uuid,
  document_name text,
  text text,
  page_number int,
  chunk_index int,
  similarity float
)
language plpgsql
security definer
as $$
#variable_conflict use_variable
begin
  return query
  select
    c.id,
    c.document_id,
    d.name as document_name,
    c.text,
    c.page_number,
    c.chunk_index,
    (1 - (c.embedding <=> query_embedding))::float as similarity
  from public.chunks c
  join public.documents d on c.document_id = d.id
  where
    (filter_user_id is null or c.user_id = filter_user_id)
    and (filter_document_id is null or c.document_id = filter_document_id)
  order by c.embedding <=> query_embedding
  limit match_count;
end;
$$;
