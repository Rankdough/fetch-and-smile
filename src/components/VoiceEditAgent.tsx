import { useState, useCallback } from "react";
import { useConversation } from "@elevenlabs/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, Loader2, Volume2, VolumeX, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface VoiceEditAgentProps {
  content: string;
  onContentUpdate: (newContent: string) => void;
}

export function VoiceEditAgent({ content, onContentUpdate }: VoiceEditAgentProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [agentId, setAgentId] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const conversation = useConversation({
    onConnect: () => {
      console.log("Connected to voice agent");
      toast.success("Voice agent connected! Start speaking your edit instructions.");
    },
    onDisconnect: () => {
      console.log("Disconnected from voice agent");
      toast.info("Voice agent disconnected");
    },
    onMessage: async (message) => {
      console.log("Voice message:", message);
      
      // Handle user transcript - this is the edit instruction
      const messageAny = message as unknown as Record<string, unknown>;
      if (messageAny.type === "user_transcript") {
        const userTranscriptionEvent = messageAny.user_transcription_event as { user_transcript?: string } | undefined;
        const transcript = userTranscriptionEvent?.user_transcript;
        if (transcript) {
          setLastTranscript(transcript);
          await processEditInstruction(transcript);
        }
      }
    },
    onError: (error) => {
      console.error("Voice agent error:", error);
      toast.error("Voice agent error. Please try again.");
    },
  });

  const processEditInstruction = async (instruction: string) => {
    if (!content || !instruction.trim()) return;
    
    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("voice-edit-content", {
        body: { content, instruction },
      });

      if (error) throw error;
      if (!data?.content) throw new Error("No edited content returned");

      onContentUpdate(data.content);
      toast.success(`Applied: "${instruction}"`);
    } catch (error) {
      console.error("Edit processing error:", error);
      toast.error("Failed to apply edit. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const startConversation = useCallback(async () => {
    if (!agentId.trim()) {
      toast.error("Please enter your ElevenLabs Agent ID");
      setShowConfig(true);
      return;
    }

    setIsConnecting(true);
    try {
      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // For public agents (no authentication), connect directly with agent ID
      await conversation.startSession({
        agentId: agentId.trim(),
        connectionType: "webrtc",
      });
    } catch (error) {
      console.error("Failed to start conversation:", error);
      toast.error("Failed to connect voice agent. Check your Agent ID and microphone permissions.");
    } finally {
      setIsConnecting(false);
    }
  }, [conversation, agentId]);

  const stopConversation = useCallback(async () => {
    await conversation.endSession();
  }, [conversation]);

  const isConnected = conversation.status === "connected";

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2">
            <Mic className="h-4 w-4" />
            Voice Edit Agent
          </div>
          <div className="flex items-center gap-2">
            {isConnected && (
              <Badge variant={conversation.isSpeaking ? "default" : "secondary"}>
                {conversation.isSpeaking ? (
                  <><Volume2 className="h-3 w-3 mr-1" /> Speaking</>
                ) : (
                  <><VolumeX className="h-3 w-3 mr-1" /> Listening</>
                )}
              </Badge>
            )}
            <Badge variant={isConnected ? "default" : "outline"}>
              {isConnected ? "Connected" : "Disconnected"}
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Collapsible open={showConfig} onOpenChange={setShowConfig}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-start">
              <Settings2 className="h-4 w-4 mr-2" />
              {showConfig ? "Hide Configuration" : "Configure Agent ID"}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <div className="space-y-2">
              <Label htmlFor="agentId">ElevenLabs Agent ID</Label>
              <Input
                id="agentId"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                placeholder="Enter your ElevenLabs Agent ID"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Create an agent at{" "}
                <a
                  href="https://elevenlabs.io/conversational-ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  ElevenLabs Conversational AI
                </a>
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <div className="flex gap-2">
          {!isConnected ? (
            <Button
              onClick={startConversation}
              disabled={isConnecting || !agentId.trim()}
              className="flex-1"
            >
              {isConnecting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Connecting...</>
              ) : (
                <><Mic className="h-4 w-4 mr-2" /> Start Voice Editing</>
              )}
            </Button>
          ) : (
            <Button
              onClick={stopConversation}
              variant="destructive"
              className="flex-1"
            >
              <MicOff className="h-4 w-4 mr-2" /> Stop
            </Button>
          )}
        </div>

        {isProcessing && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Applying edit...
          </div>
        )}

        {lastTranscript && (
          <div className="text-sm">
            <span className="text-muted-foreground">Last instruction: </span>
            <span className="italic">"{lastTranscript}"</span>
          </div>
        )}

        {!content && (
          <p className="text-sm text-muted-foreground">
            Generate content first to enable voice editing.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
