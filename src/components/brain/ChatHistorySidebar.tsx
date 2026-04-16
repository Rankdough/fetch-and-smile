import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, MessageSquare, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ChatHistorySidebarProps {
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  refreshTrigger: number;
}

const ChatHistorySidebar = ({ activeConversationId, onSelect, onNew, refreshTrigger }: ChatHistorySidebarProps) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const fetchConversations = async () => {
    const { data } = await supabase
      .from("brain_conversations")
      .select("*")
      .order("updated_at", { ascending: false });
    if (data) setConversations(data);
  };

  useEffect(() => { fetchConversations(); }, [refreshTrigger]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await supabase.from("brain_conversations").delete().eq("id", id);
    if (activeConversationId === id) onNew();
    fetchConversations();
  };

  return (
    <div className="w-64 border-r bg-muted/30 flex flex-col h-full">
      <div className="p-3 border-b">
        <Button variant="outline" size="sm" className="w-full gap-2" onClick={onNew}>
          <Plus className="h-4 w-4" /> New Chat
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {conversations.map(conv => (
            <button
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={cn(
                "w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 group hover:bg-muted transition-colors",
                activeConversationId === conv.id && "bg-muted font-medium"
              )}
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate flex-1">{conv.title}</span>
              <Trash2
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                onClick={(e) => handleDelete(e, conv.id)}
              />
            </button>
          ))}
          {conversations.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No conversations yet</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default ChatHistorySidebar;
