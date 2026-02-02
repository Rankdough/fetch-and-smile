import { useState, useEffect, useMemo } from "react";
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
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Folder, FolderPlus, Trash2, Loader2, ImageIcon } from "lucide-react";
import type { ArticleImage } from "@/components/ArticleImagesPanel";

export interface ImageFolder {
  id: string;
  name: string;
  created_at: string;
}

interface FolderWithCount extends ImageFolder {
  imageCount: number;
}

interface ImageFolderManagerProps {
  selectedFolderId: string | null;
  onFolderChange: (folderId: string | null) => void;
  onFoldersLoaded?: (folders: ImageFolder[]) => void;
  allImages?: ArticleImage[];
  folderAssignments?: { folder_id: string; file_path: string }[];
}

export function ImageFolderManager({
  selectedFolderId,
  onFolderChange,
  onFoldersLoaded,
  allImages = [],
  folderAssignments = [],
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

  // Calculate folder counts and get images per folder
  const foldersWithCounts = useMemo((): FolderWithCount[] => {
    return folders.map((folder) => {
      const count = folderAssignments.filter((a) => a.folder_id === folder.id).length;
      return { ...folder, imageCount: count };
    });
  }, [folders, folderAssignments]);

  // Get images for a specific folder
  const getImagesForFolder = (folderId: string): ArticleImage[] => {
    const filePaths = folderAssignments
      .filter((a) => a.folder_id === folderId)
      .map((a) => a.file_path);
    return allImages.filter((img) => filePaths.includes(img.filePath));
  };

  // Get total image count
  const totalImageCount = allImages.length;

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

      const newFolders = [...folders, data].sort((a, b) => a.name.localeCompare(b.name));
      setFolders(newFolders);
      onFoldersLoaded?.(newFolders);
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

      const newFolders = folders.filter((f) => f.id !== folderId);
      setFolders(newFolders);
      onFoldersLoaded?.(newFolders);
      
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

  // Render folder option with hover preview
  const FolderOption = ({ folder }: { folder: FolderWithCount }) => {
    const folderImages = getImagesForFolder(folder.id);
    
    return (
      <HoverCard openDelay={200} closeDelay={100}>
        <HoverCardTrigger asChild>
          <SelectItem value={folder.id} className="cursor-pointer">
            <span className="flex items-center gap-2">
              <span>{folder.name}</span>
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {folder.imageCount}
              </span>
            </span>
          </SelectItem>
        </HoverCardTrigger>
        <HoverCardContent side="right" align="start" className="w-64 p-2">
          <p className="text-sm font-medium mb-2">{folder.name}</p>
          {folderImages.length > 0 ? (
            <div className="grid grid-cols-3 gap-1">
              {folderImages.slice(0, 6).map((img) => (
                <div
                  key={img.filePath}
                  className="aspect-square rounded overflow-hidden bg-muted"
                >
                  <img
                    src={img.url}
                    alt={img.alt}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
              {folderImages.length > 6 && (
                <div className="aspect-square rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
                  +{folderImages.length - 6}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center py-4 text-muted-foreground">
              <ImageIcon className="h-6 w-6 mb-1 opacity-50" />
              <span className="text-xs">No images yet</span>
            </div>
          )}
        </HoverCardContent>
      </HoverCard>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading folders...
      </div>
    );
  }

  // Get selected folder name and count for display
  const selectedFolder = foldersWithCounts.find((f) => f.id === selectedFolderId);
  const displayValue = selectedFolder
    ? `${selectedFolder.name} (${selectedFolder.imageCount})`
    : `All images (${totalImageCount})`;

  return (
    <div className="flex items-center gap-2">
      <Folder className="h-4 w-4 text-muted-foreground" />
      
      <Select
        value={selectedFolderId || "all"}
        onValueChange={(value) => onFolderChange(value === "all" ? null : value)}
      >
        <SelectTrigger className="flex-1 h-8">
          <SelectValue>{displayValue}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">
            <span className="flex items-center gap-2">
              <span>All images</span>
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {totalImageCount}
              </span>
            </span>
          </SelectItem>
          {foldersWithCounts.map((folder) => (
            <FolderOption key={folder.id} folder={folder} />
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

            {foldersWithCounts.length > 0 && (
              <div className="border-t pt-4 mt-4">
                <p className="text-sm font-medium mb-2">Existing folders:</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {foldersWithCounts.map((folder) => (
                    <div
                      key={folder.id}
                      className="flex items-center justify-between py-1 px-2 rounded hover:bg-muted"
                    >
                      <span className="text-sm flex items-center gap-2">
                        {folder.name}
                        <span className="text-xs text-muted-foreground">
                          ({folder.imageCount} {folder.imageCount === 1 ? "image" : "images"})
                        </span>
                      </span>
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
