
CREATE TABLE public.brain_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'New conversation',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.brain_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.brain_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  source_insights JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.brain_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brain_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to brain_conversations" ON public.brain_conversations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to brain_chat_messages" ON public.brain_chat_messages FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_brain_chat_messages_conversation ON public.brain_chat_messages(conversation_id);
