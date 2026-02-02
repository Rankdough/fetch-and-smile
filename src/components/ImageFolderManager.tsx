import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Folder, FolderPlus, Trash2, Loader2 } from "lucide-react";

export interface ImageFolder {
  id: string;
  name: string;
  created_at: string;
}

interface ImageFolderManagerProps {
  selectedFolderId: string | null;
  onFolderChange: (folderId: string | null) => void;
  onFoldersLoaded?: (folders: ImageFolder[]) => void;
}

export function ImageFolderManager({
  selectedFolderId,
  onFolderChange,
  onFoldersLoaded,
}: ImageFolderManagerProps) {
  const { toast } = useToast();
  const [folders, setFolders] = useState<ImageFolder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  // Load folders on mount
  useEffect(() => {
    loadFolders();
  }, []);

  const loadFolders = async () => {
    try {
      const { data, error } = await supabase
        .from("image_folders")
        .select("*")
        .order("name");

      if (error) throw error;

      setFolders(data || []);
      onFoldersLoaded?.(data || []);
    } catch (error) {
      console.error("Failed to load folders:", error);
      toast({
        title: "Failed to load folders",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;

    setIsCreating(true);
    try {
      const { data, error } = await supabase
        .from("image_folders")
        .insert({ name: newFolderName.trim() })
        .select()
        .single();

      if (error) throw error;

      setFolders((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewFolderName("");
      setDialogOpen(false);
      
      toast({
        title: "Folder created",
        description: `"${data.name}" folder has been created`,
      });

      // Auto-select the new folder
      onFolderChange(data.id);
    } catch (error) {
      console.error("Failed to create folder:", error);
      toast({
        title: "Failed to create folder",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const deleteFolder = async (folderId: string) => {
    const folder = folders.find((f) => f.id === folderId);
    if (!folder) return;

    try {
      const { error } = await supabase
        .from("image_folders")
        .delete()
        .eq("id", folderId);

      if (error) throw error;

      setFolders((prev) => prev.filter((f) => f.id !== folderId));
      
      // If we deleted the selected folder, reset to "All"
      if (selectedFolderId === folderId) {
        onFolderChange(null);
      }

      toast({
        title: "Folder deleted",
        description: `"${folder.name}" has been deleted`,
      });
    } catch (error) {
      console.error("Failed to delete folder:", error);
      toast({
        title: "Failed to delete folder",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading folders...
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Folder className="h-4 w-4 text-muted-foreground" />
      
      <Select
        value={selectedFolderId || "all"}
        onValueChange={(value) => onFolderChange(value === "all" ? null : value)}
      >
        <SelectTrigger className="flex-1 h-8">
          <SelectValue placeholder="All images" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All images</SelectItem>
          {folders.map((folder) => (
            <SelectItem key={folder.id} value={folder.id}>
              {folder.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="icon" className="h-8 w-8" title="Create folder">
            <FolderPlus className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <Input
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createFolder();
              }}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={createFolder} disabled={!newFolderName.trim() || isCreating}>
                {isCreating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create"
                )}
              </Button>
            </div>

            {folders.length > 0 && (
              <div className="border-t pt-4 mt-4">
                <p className="text-sm font-medium mb-2">Existing folders:</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {folders.map((folder) => (
                    <div
                      key={folder.id}
                      className="flex items-center justify-between py-1 px-2 rounded hover:bg-muted"
                    >
                      <span className="text-sm">{folder.name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive hover:text-destructive"
                        onClick={() => deleteFolder(folder.id)}
                        title="Delete folder"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
