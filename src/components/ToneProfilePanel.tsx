import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Mic2,
  Upload,
  Trash2,
  FileText,
  Loader2,
  ChevronDown,
  ChevronRight,
  Check,
  Sparkles,
  MessageSquareQuote,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface ToneCharacteristics {
  formality?: string;
  personality?: string;
  pace?: string;
  vocabulary?: string;
  sentence_structure?: string;
  perspective?: string;
  emotional_tone?: string;
  humor_level?: string;
  persuasion_style?: string;
}

interface ToneProfile {
  id: string;
  name: string;
  source_file_name: string;
  summary: string | null;
  characteristics: ToneCharacteristics;
  example_phrases: string[] | null;
  is_active: boolean;
  created_at: string;
}

interface ToneProfilePanelProps {
  selectedProfileId: string | null;
  onProfileSelect: (profileId: string | null) => void;
  useFirstPerson?: boolean;
  onUseFirstPersonChange?: (value: boolean) => void;
}

export const ToneProfilePanel = ({ selectedProfileId, onProfileSelect, useFirstPerson = false, onUseFirstPersonChange }: ToneProfilePanelProps) => {
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<ToneProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  
  // Form state for new profile
  const [profileName, setProfileName] = useState("");
  const [pastedContent, setPastedContent] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("tone_profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Cast the data to match our interface
      const typedProfiles = (data || []).map(p => ({
        ...p,
        characteristics: (p.characteristics || {}) as ToneCharacteristics,
      }));
      
      setProfiles(typedProfiles);
    } catch (error) {
      console.error("Error fetching tone profiles:", error);
      toast({
        title: "Error",
        description: "Failed to load tone profiles",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProfile = async () => {
    if (!profileName.trim()) {
      toast({
        title: "Name required",
        description: "Please enter a name for this tone profile",
        variant: "destructive",
      });
      return;
    }

    let content = pastedContent;
    let fileName = "pasted-content";

    // If file uploaded, parse its content
    if (uploadedFile) {
      fileName = uploadedFile.name;
      
      // Check if it's a binary document that needs parsing
      const isBinaryDoc = uploadedFile.type === "application/pdf" || 
        uploadedFile.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        uploadedFile.type === "application/msword" ||
        uploadedFile.name.endsWith(".docx") ||
        uploadedFile.name.endsWith(".doc") ||
        uploadedFile.name.endsWith(".pdf");

      if (isBinaryDoc) {
        try {
          // Use the parse-context-file function to extract text
          const formData = new FormData();
          formData.append("file", uploadedFile);

          const { data: parseResult, error: parseError } = await supabase.functions.invoke(
            "parse-context-file",
            { body: formData }
          );

          if (parseError) throw parseError;
          content = parseResult.content || "";
          
          if (!content.trim()) {
            throw new Error("Could not extract text from document");
          }
        } catch (e) {
          console.error("Document parse error:", e);
          toast({
            title: "Document parse error",
            description: e instanceof Error ? e.message : "Could not parse the document",
            variant: "destructive",
          });
          return;
        }
      } else {
        // Plain text files can be read directly
        try {
          content = await uploadedFile.text();
        } catch (e) {
          toast({
            title: "File read error",
            description: "Could not read the uploaded file",
            variant: "destructive",
          });
          return;
        }
      }
    }

    if (!content.trim()) {
      toast({
        title: "Content required",
        description: "Please paste content or upload a file to analyze",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);

    try {
      const { data, error } = await supabase.functions.invoke("extract-tone", {
        body: {
          content,
          fileName,
          profileName: profileName.trim(),
        },
      });

      if (error) throw error;

      toast({
        title: "Tone profile created!",
        description: `Extracted ${Object.keys(data.analysis?.characteristics || {}).length} characteristics`,
      });

      // Reset form and close dialog
      setProfileName("");
      setPastedContent("");
      setUploadedFile(null);
      setDialogOpen(false);

      // Refresh the list
      await fetchProfiles();
    } catch (error) {
      console.error("Error creating tone profile:", error);
      toast({
        title: "Extraction failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    try {
      const { error } = await supabase
        .from("tone_profiles")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setProfiles((prev) => prev.filter((p) => p.id !== id));
      
      // If deleted profile was selected, deselect it
      if (selectedProfileId === id) {
        onProfileSelect(null);
      }

      toast({
        title: "Deleted",
        description: `${name} removed`,
      });
    } catch (error) {
      console.error("Error deleting:", error);
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleSelectProfile = (profileId: string) => {
    if (selectedProfileId === profileId) {
      onProfileSelect(null);
    } else {
      onProfileSelect(profileId);
    }
  };

  const selectedProfile = profiles.find(p => p.id === selectedProfileId);

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mic2 className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Tone of Voice Profiles</h3>
        </div>
        <Badge variant="secondary">
          {profiles.length} profile{profiles.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {/* Writing Perspective Toggle */}
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">First-person writing</Label>
          <p className="text-xs text-muted-foreground">
            {useFirstPerson ? 'Article will use "I", "we", "our"' : 'Article will use neutral third-person'}
          </p>
        </div>
        <Switch
          checked={useFirstPerson}
          onCheckedChange={onUseFirstPersonChange}
        />
      </div>

      {/* Selected Profile Display */}
      {selectedProfile && (
        <div className="rounded-lg border border-primary bg-primary/5 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">Active: {selectedProfile.name}</span>
          </div>
          {selectedProfile.summary && (
            <p className="text-xs text-muted-foreground">{selectedProfile.summary}</p>
          )}
        </div>
      )}

      {/* Add New Profile Button */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="w-full">
            <Sparkles className="h-4 w-4 mr-2" />
            Create New Tone Profile
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Tone Profile</DialogTitle>
            <DialogDescription>
              Upload a document or paste text to analyze its tone of voice.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="profile-name">Profile Name</Label>
              <Input
                id="profile-name"
                placeholder="e.g., Brand Voice, Casual Blog, Technical Docs"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Upload a Document (Optional)</Label>
              <div className="flex gap-2">
                <Input
                  type="file"
                  accept=".txt,.md,.doc,.docx,.pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setUploadedFile(file);
                      setPastedContent("");
                    }
                  }}
                />
              </div>
              {uploadedFile && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  {uploadedFile.name}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setUploadedFile(null)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="paste-content">Or Paste Text Content</Label>
              <Textarea
                id="paste-content"
                placeholder="Paste a transcript, blog post, or any text that represents your desired tone..."
                className="min-h-[150px]"
                value={pastedContent}
                onChange={(e) => {
                  setPastedContent(e.target.value);
                  setUploadedFile(null);
                }}
                disabled={!!uploadedFile}
              />
              <p className="text-xs text-muted-foreground">
                The more text you provide, the better the analysis will be.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={handleCreateProfile}
              disabled={isCreating || (!pastedContent.trim() && !uploadedFile)}
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Analyze & Create
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Profiles List */}
      <ScrollArea className="h-[250px]">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : profiles.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Mic2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No tone profiles yet</p>
            <p className="text-sm">Create one to match your brand voice</p>
          </div>
        ) : (
          <div className="space-y-2">
            {profiles.map((profile) => (
              <Collapsible
                key={profile.id}
                open={expandedItems.has(profile.id)}
                onOpenChange={() => toggleExpanded(profile.id)}
              >
                <div
                  className={`border rounded-lg p-3 space-y-2 transition-colors ${
                    selectedProfileId === profile.id
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <CollapsibleTrigger className="flex items-start gap-2 text-left flex-1">
                      {expandedItems.has(profile.id) ? (
                        <ChevronDown className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{profile.name}</p>
                        {profile.summary && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                            {profile.summary}
                          </p>
                        )}
                      </div>
                    </CollapsibleTrigger>
                    <div className="flex items-center gap-2">
                      <Button
                        variant={selectedProfileId === profile.id ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleSelectProfile(profile.id)}
                      >
                        {selectedProfileId === profile.id ? (
                          <>
                            <Check className="h-3 w-3 mr-1" />
                            Active
                          </>
                        ) : (
                          "Use"
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleDelete(profile.id, profile.name)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  </div>

                  <CollapsibleContent className="space-y-3 pt-2">
                    {/* Characteristics */}
                    <div className="pl-6 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Characteristics:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(profile.characteristics).map(([key, value]) => (
                          <Badge key={key} variant="secondary" className="text-xs">
                            {key.replace(/_/g, " ")}: {value}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Example Phrases */}
                    {profile.example_phrases && profile.example_phrases.length > 0 && (
                      <div className="pl-6 space-y-1">
                        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                          <MessageSquareQuote className="h-3 w-3" />
                          Example Phrases:
                        </p>
                        <ul className="text-xs space-y-1">
                          {profile.example_phrases.slice(0, 3).map((phrase, idx) => (
                            <li key={idx} className="text-muted-foreground italic">
                              "{phrase}"
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground pl-6">
                      Source: {profile.source_file_name}
                    </p>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ))}
          </div>
        )}
      </ScrollArea>
    </Card>
  );
};
