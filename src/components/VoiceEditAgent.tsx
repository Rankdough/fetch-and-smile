import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Mic, MicOff, Loader2, Send, Volume2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface VoiceEditAgentProps {
  content: string;
  onContentUpdate: (newContent: string) => void;
  onCreditUsed?: (action: string, details?: string) => void;
}

// Define types for Web Speech API
interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: { transcript: string };
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onresult: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  start(): void;
  stop(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

// Check if browser supports speech recognition
const getSpeechRecognition = (): SpeechRecognitionConstructor | null => {
  const win = window as unknown as { 
    SpeechRecognition?: SpeechRecognitionConstructor; 
    webkitSpeechRecognition?: SpeechRecognitionConstructor 
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
};

export function VoiceEditAgent({ content, onContentUpdate, onCreditUsed }: VoiceEditAgentProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [editHistory, setEditHistory] = useState<{ command: string; timestamp: Date }[]>([]);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalTranscriptRef = useRef("");
  const SpeechRecognition = getSpeechRecognition();
  const supportsVoice = !!SpeechRecognition;

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const processEditCommand = useCallback(async (command: string) => {
    if (!content || !command.trim()) return;
    
    setIsProcessing(true);
    try {
      console.log("Processing edit command:", command);
      
      const { data, error } = await supabase.functions.invoke("voice-edit-content", {
        body: { content, instruction: command },
      });

      if (error) throw error;
      if (!data?.content) throw new Error("No edited content returned");

      onContentUpdate(data.content);
      setEditHistory(prev => [...prev, { command, timestamp: new Date() }]);
      
      // Track credit usage
      onCreditUsed?.("Voice Edit", command);
      
      toast.success(`Applied: "${command}"`);
      finalTranscriptRef.current = "";
      setTranscript("");
    } catch (error) {
      console.error("Edit processing error:", error);
      toast.error("Failed to apply edit. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  }, [content, onContentUpdate, onCreditUsed]);

  const startRecording = useCallback(() => {
    if (!SpeechRecognition) {
      toast.error("Voice recognition not supported in this browser. Try Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      console.log("Speech recognition started");
      finalTranscriptRef.current = "";
      setTranscript("");
      setIsRecording(true);
    };

    recognition.onresult = (event) => {
      let finalTranscript = "";
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      if (finalTranscript) {
        finalTranscriptRef.current = `${finalTranscriptRef.current} ${finalTranscript}`
          .replace(/\s+/g, " ")
          .trim();
      }

      const nextTranscript = `${finalTranscriptRef.current} ${interimTranscript}`
        .replace(/\s+/g, " ")
        .trim();

      setTranscript(nextTranscript);
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      if (event.error !== "aborted") {
        toast.error(`Voice recognition error: ${event.error}`);
      }
      setIsRecording(false);
    };

    recognition.onend = () => {
      console.log("Speech recognition ended");
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, []);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const handleSendCommand = () => {
    if (transcript.trim()) {
      processEditCommand(transcript.trim());
    }
  };

  if (!content) {
    return null;
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4" />
            Voice Edit Commands
          </div>
          {isProcessing && (
            <Badge variant="secondary">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Processing...
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Speak or type editing commands like: "Extend the introduction by two paragraphs" or "Add three bullet points to the benefits section"
        </p>

        {/* Voice recording button */}
        <div className="flex gap-2">
          {supportsVoice && (
            <Button
              variant={isRecording ? "destructive" : "outline"}
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isProcessing}
              className="flex-shrink-0"
            >
              {isRecording ? (
                <>
                  <MicOff className="h-4 w-4 mr-2" />
                  Stop
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4 mr-2" />
                  Record
                </>
              )}
            </Button>
          )}
          
          <div className="flex-1 relative">
            <Textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder={isRecording ? "Listening... speak your edit command" : "Type your edit command here..."}
              className="min-h-[60px] pr-12 resize-none"
              disabled={isProcessing}
            />
            <Button
              size="icon"
              variant="ghost"
              className="absolute right-2 bottom-2"
              onClick={handleSendCommand}
              disabled={!transcript.trim() || isProcessing}
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {isRecording && (
          <div className="flex items-center gap-2 text-sm text-primary">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
            </span>
            Listening... speak your command, then click Stop and Send
          </div>
        )}

        {/* Recent edits */}
        {editHistory.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Recent edits:</p>
            <div className="space-y-1 max-h-24 overflow-y-auto">
              {editHistory.slice(-3).reverse().map((edit, idx) => (
                <div key={idx} className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
                  "{edit.command}"
                </div>
              ))}
            </div>
          </div>
        )}

        {!supportsVoice && (
          <p className="text-xs text-amber-600">
            Voice recording not supported in this browser. You can still type commands.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
