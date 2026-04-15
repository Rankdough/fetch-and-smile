import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Brain, FileText, BookOpen, MessageSquare, History, Send, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
  sourceInsights?: { id: string; title: string; insight_type: string }[];
}

const BrainAsk = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = async () => {
    const question = input.trim();
    if (!question || isStreaming) return;

    const userMsg: Message = { role: "user", content: question };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsStreaming(true);

    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ask-brain`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ question, history: messages }),
        }
      );

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${resp.status}`);
      }

      if (!resp.body) throw new Error("No stream body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantContent = "";
      let sourceInsights: Message["sourceInsights"] = [];
      let done = false;

      while (!done) {
        const { done: readerDone, value } = await reader.read();
        if (readerDone) break;
        buffer += decoder.decode(value, { stream: true });

        let nlIdx: number;
        while ((nlIdx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nlIdx);
          buffer = buffer.slice(nlIdx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { done = true; break; }

          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.sources) { sourceInsights = parsed.sources; continue; }
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent, sourceInsights } : m);
                }
                return [...prev, { role: "assistant", content: assistantContent, sourceInsights }];
              });
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, something went wrong." }]);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleSaveOutput = async () => {
    const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
    if (!lastAssistant) return;
    const lastUser = [...messages].reverse().find(m => m.role === "user");

    await supabase.from("brain_outputs").insert({
      title: lastUser?.content?.slice(0, 100) || "Brain output",
      output_type: "answer",
      generated_text: lastAssistant.content,
      insight_ids: lastAssistant.sourceInsights?.map(s => s.id) || [],
    });
    toast({ title: "Output saved" });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-2">
            <FileText className="h-4 w-4" /> Content Generator
          </Button>
          <div className="flex items-center gap-2 ml-auto">
            <Brain className="h-5 w-5 text-primary" />
            <span className="font-semibold text-lg">SEO Brain</span>
          </div>
          <nav className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => navigate("/seo-brain/library")} className="gap-2"><BookOpen className="h-4 w-4" />Library</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/seo-brain/insights")} className="gap-2"><FileText className="h-4 w-4" />Insights</Button>
            <Button variant="default" size="sm" className="gap-2"><MessageSquare className="h-4 w-4" />Ask</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/seo-brain/outputs")} className="gap-2"><History className="h-4 w-4" />Outputs</Button>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Ask Your SEO Brain</h1>
          {messages.some(m => m.role === "assistant") && (
            <Button variant="outline" size="sm" onClick={handleSaveOutput} className="gap-2"><Save className="h-4 w-4" />Save Output</Button>
          )}
        </div>

        <ScrollArea className="flex-1 mb-4 border rounded-lg p-4 min-h-[400px]" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-20">
              <Brain className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>Ask anything about your SEO knowledge base.</p>
              <p className="text-sm mt-1">Your brain insights will be used as context.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-lg px-4 py-3 ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm max-w-none dark:prose-invert">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                        {msg.sourceInsights && msg.sourceInsights.length > 0 && (
                          <div className="mt-3 pt-2 border-t flex gap-1 flex-wrap">
                            <span className="text-xs text-muted-foreground mr-1">Sources:</span>
                            {msg.sourceInsights.map(s => (
                              <Badge key={s.id} variant="secondary" className="text-xs">{s.title}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}
              {isStreaming && messages[messages.length - 1]?.role === "user" && (
                <div className="flex justify-start"><div className="bg-muted rounded-lg px-4 py-3"><Loader2 className="h-4 w-4 animate-spin" /></div></div>
              )}
            </div>
          )}
        </ScrollArea>

        <div className="flex gap-2">
          <Textarea
            placeholder="Ask a question about your SEO knowledge..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            className="resize-none"
          />
          <Button onClick={handleSend} disabled={!input.trim() || isStreaming} className="px-4">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </main>
    </div>
  );
};

export default BrainAsk;
