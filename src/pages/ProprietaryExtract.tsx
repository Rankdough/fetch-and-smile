// Proprietary Mode — Stage 1 extraction flow.
// 5 steps: business type → brief → existing knowledge → interview → review.
// Non-destructive: lives at /proprietary/extract. Nothing else in the app is touched.

import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, ArrowLeft, Send, Sparkles, Brain, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";

import {
  BUSINESS_TYPES,
  PUBLICATION_DESTINATIONS,
  UNIT_TYPES,
  MIN_WORDS_PER_MANDATORY_UNIT,
  isMandatory,
  unitWordCount,
  type UnitType,
  type BusinessType,
} from "@/lib/proprietaryUnits";
import { logProprietaryEvent } from "@/lib/proprietaryAnalytics";
import { ExistingKnowledgePanel } from "@/components/proprietary/ExistingKnowledgePanel";
import { SlotProgressGrid, type SlotState } from "@/components/proprietary/SlotProgressGrid";
import { UnitTypeChip } from "@/components/proprietary/UnitTypeChip";

type Step = "business" | "brief" | "existing" | "interview" | "review";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface SavedUnit {
  id: string;
  unit_type: string;
  title: string;
  word_count: number;
  below_floor: boolean;
}

const ProprietaryExtract = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("business");
  const [businessType, setBusinessType] = useState<BusinessType>("service_business");
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [destination, setDestination] = useState<string>("human_blog");

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [filledTypes, setFilledTypes] = useState<UnitType[]>([]);
  const [interviewComplete, setInterviewComplete] = useState(false);

  const [extracting, setExtracting] = useState(false);
  const [savedUnits, setSavedUnits] = useState<SavedUnit[]>([]);
  const [rejected, setRejected] = useState<Array<{ unit_type: string; reason: string }>>([]);
  const [mveSatisfied, setMveSatisfied] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Heuristic slot state during chat: count user-turn words per inferred type.
  // (Authoritative state comes from the extract pass.)
  const slotStates: SlotState[] = UNIT_TYPES.map((t) => {
    const filled = filledTypes.includes(t);
    // Rough word allocation per type so the progress bar moves visibly.
    const totalUserWords = messages.filter(m => m.role === "user").reduce((a, m) => a + unitWordCount(m.content), 0);
    const perType = Math.floor(totalUserWords / Math.max(1, UNIT_TYPES.length));
    return {
      type: t,
      words: filled ? Math.max(perType, MIN_WORDS_PER_MANDATORY_UNIT) : perType,
      satisfied: filled,
    };
  });
  const liveMveSatisfied = (() => {
    const userWords = (type: UnitType) => {
      // crude: split user words proportionally — overridden post-extract
      return slotStates.find(s => s.type === type)?.words ?? 0;
    };
    return userWords("case") >= MIN_WORDS_PER_MANDATORY_UNIT && userWords("outcome") >= MIN_WORDS_PER_MANDATORY_UNIT;
  })();

  const startInterview = useCallback(async (filled: UnitType[]) => {
    setFilledTypes(filled);
    // Create a fresh conversation
    const { data: conv, error } = await supabase
      .from("brain_conversations")
      .insert({ title: `Proprietary: ${topic.slice(0, 60)}` })
      .select("id")
      .single();
    if (error || !conv) {
      toast({ title: "Could not start interview", variant: "destructive" });
      return;
    }
    setConversationId(conv.id);
    setMessages([]);
    setStep("interview");
    logProprietaryEvent("extract_started", { businessType, topic, filledTypes: filled });

    // Seed the interview with a kick-off message from the assistant so the user has somewhere to start.
    const opener = `Let's get specific. To start: ${
      filled.includes("case")
        ? "your brain already covers a relevant case. Tell me about an outcome from that case — a specific number, timeframe, or measurable result."
        : "tell me about one specific situation related to " + topic + ". Who was involved, what happened, and when?"
    }`;
    setMessages([{ role: "assistant", content: opener }]);
    await supabase.from("brain_chat_messages").insert({
      conversation_id: conv.id,
      role: "assistant",
      content: opener,
    });
  }, [topic, businessType, toast]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isStreaming || !conversationId) return;

    setMessages(prev => [...prev, { role: "user", content: text }]);
    setInput("");
    setIsStreaming(true);

    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/interview-agent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            mode: "chat",
            conversationId,
            userMessage: text,
            brief: {
              businessType,
              topic,
              audience,
              publicationDestination: destination,
              filledTypes,
            },
          }),
        }
      );

      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        throw new Error(e.error || `Error ${resp.status}`);
      }
      if (!resp.body) throw new Error("No stream body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantContent = "";
      let done = false;

      while (!done) {
        const { done: rDone, value } = await reader.read();
        if (rDone) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistantContent += delta;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
                }
                return [...prev, { role: "assistant", content: assistantContent }];
              });
            }
          } catch { /* partial */ }
        }
      }

      if (assistantContent.includes("[INTERVIEW_COMPLETE]")) {
        setInterviewComplete(true);
        logProprietaryEvent("interview_complete_signal", { conversationId });
      }
    } catch (err: any) {
      toast({ title: "Interview error", description: err.message, variant: "destructive" });
    } finally {
      setIsStreaming(false);
    }
  };

  const handleExtract = async () => {
    if (!conversationId) return;
    setExtracting(true);
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/interview-agent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            mode: "extract",
            conversationId,
            brief: { businessType, topic, audience, publicationDestination: destination },
          }),
        }
      );
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Extraction failed");
      setSavedUnits(data.saved || []);
      setRejected(data.rejected || []);
      setMveSatisfied(!!data.mveSatisfied);
      logProprietaryEvent("extract_completed", {
        savedCount: (data.saved || []).length,
        rejectedCount: (data.rejected || []).length,
        mveSatisfied: !!data.mveSatisfied,
      });
      setStep("review");
    } catch (err: any) {
      toast({ title: "Extraction failed", description: err.message, variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  };

  const Header = (
    <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Home
        </Button>
        <div className="flex items-center gap-2 ml-auto">
          <Sparkles className="h-5 w-5 text-primary" />
          <span className="font-semibold text-lg">Proprietary Mode</span>
          <Badge variant="outline" className="text-xs ml-1">Stage 1 · Extract</Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/seo-brain/insights")} className="gap-2 ml-auto">
          <Brain className="h-4 w-4" /> Brain
        </Button>
      </div>
    </header>
  );

  return (
    <div className="min-h-screen bg-background">
      {Header}

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* STEP 1 — business type */}
        {step === "business" && (
          <Card className="max-w-xl mx-auto">
            <CardHeader><CardTitle>What kind of business are you extracting from?</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                The interview adapts to your business type. Six branches plus a generic fallback.
              </p>
              <Select value={businessType} onValueChange={v => setBusinessType(v as BusinessType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BUSINESS_TYPES.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex justify-end">
                <Button onClick={() => setStep("brief")}>Next</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* STEP 2 — brief */}
        {step === "brief" && (
          <Card className="max-w-xl mx-auto">
            <CardHeader><CardTitle>What are you writing about?</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Topic</Label>
                <Input value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. choosing youth basketball jerseys for a rec league" />
              </div>
              <div className="space-y-2">
                <Label>Audience (one sentence)</Label>
                <Input value={audience} onChange={e => setAudience(e.target.value)} placeholder="e.g. a rec league coordinator ordering jerseys for the first time" />
              </div>
              <div className="space-y-2">
                <Label>Publication destination</Label>
                <Select value={destination} onValueChange={setDestination}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PUBLICATION_DESTINATIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep("business")}>Back</Button>
                <Button onClick={() => setStep("existing")} disabled={!topic.trim()}>Next</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* STEP 3 — existing knowledge */}
        {step === "existing" && (
          <div className="max-w-3xl mx-auto space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Existing knowledge</h2>
              <p className="text-sm text-muted-foreground">
                Decide what to reuse before the interview starts. The interview will only fill gaps.
              </p>
            </div>
            <ExistingKnowledgePanel
              topic={topic}
              businessType={businessType}
              onContinue={(sel) => startInterview(sel.filledTypes)}
            />
            <div>
              <Button variant="outline" onClick={() => setStep("brief")}>Back</Button>
            </div>
          </div>
        )}

        {/* STEP 4 — interview */}
        {step === "interview" && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr,300px] gap-4">
            <Card className="flex flex-col h-[70vh]">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  Interview
                  {interviewComplete && <Badge>Complete</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-3">
                <ScrollArea className="flex-1 border rounded p-3" ref={scrollRef}>
                  <div className="space-y-3">
                    {messages.map((m, i) => (
                      <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                          {m.role === "assistant" ? (
                            <div className="prose prose-sm max-w-none dark:prose-invert">
                              <ReactMarkdown>{m.content.replace("[INTERVIEW_COMPLETE]", "").trim()}</ReactMarkdown>
                            </div>
                          ) : <p>{m.content}</p>}
                        </div>
                      </div>
                    ))}
                    {isStreaming && messages[messages.length - 1]?.role === "user" && (
                      <div className="flex justify-start"><div className="bg-muted rounded-lg px-3 py-2"><Loader2 className="h-4 w-4 animate-spin" /></div></div>
                    )}
                  </div>
                </ScrollArea>

                <div className="flex gap-2">
                  <Textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder={interviewComplete ? "Interview complete — extract when ready." : "Be specific. Name a case, a number, a moment."}
                    rows={2}
                    className="resize-none"
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    disabled={isStreaming}
                  />
                  <Button onClick={handleSend} disabled={!input.trim() || isStreaming}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <Button variant="outline" size="sm" onClick={() => setStep("existing")}>Back</Button>
                  <Button
                    onClick={handleExtract}
                    disabled={extracting || messages.filter(m => m.role === "user").length === 0}
                  >
                    {extracting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Extracting…</> : "Extract knowledge units"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <SlotProgressGrid slots={slotStates} mveSatisfied={liveMveSatisfied || interviewComplete} />
          </div>
        )}

        {/* STEP 5 — review */}
        {step === "review" && (
          <div className="max-w-3xl mx-auto space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Extraction complete
                  <Badge variant={mveSatisfied ? "default" : "outline"}>
                    {mveSatisfied ? "MVE satisfied" : "MVE not satisfied"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {mveSatisfied
                    ? "You have at least one case and one outcome unit, each clearing the 80-word floor. Generation can be unlocked in Stage 3."
                    : "You don't yet have one case and one outcome both clearing 80 words. You can continue the interview or save what you have."}
                </p>
              </CardContent>
            </Card>

            {savedUnits.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Saved to brain ({savedUnits.length})</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {savedUnits.map(u => (
                    <div key={u.id} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                      <UnitTypeChip unitType={u.unit_type} wordCount={u.word_count} />
                      <span className="font-medium">{u.title}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {rejected.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Rejected ({rejected.length})</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {rejected.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <X className="h-4 w-4 text-destructive shrink-0" />
                      <Badge variant="outline" className="text-xs">{r.unit_type}</Badge>
                      <span>{r.reason}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("interview")}>Continue interview</Button>
              <Button onClick={() => navigate("/seo-brain/insights")}>View brain</Button>
              <Button variant="outline" onClick={() => {
                setStep("business"); setMessages([]); setConversationId(null);
                setSavedUnits([]); setRejected([]); setInterviewComplete(false);
              }}>Start new extraction</Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default ProprietaryExtract;
