import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, Library, ImageIcon } from "lucide-react";
import type { ArticleImage } from "@/components/ArticleImagesPanel";
import type { ImageFolder } from "@/components/ImageFolderManager";

interface ImageLibraryBrowserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingImages: ArticleImage[];
  folders: ImageFolder[];
  assignments: { folder_id: string; file_path: string }[];
  onImagesSelected: (images: ArticleImage[]) => void;
}

interface LibraryImage extends ArticleImage {
  folderNames: string[];
}

export function ImageLibraryBrowser({
  open,
  onOpenChange,
  existingImages,
  folders,
  assignments,
  onImagesSelected,
}: ImageLibraryBrowserProps) {
  const { toast } = useToast();
  const [allImages, setAllImages] = useState<LibraryImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  // Load all images when dialog opens
  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setSearch("");
      return;
    }
    loadAllImages();
  }, [open]);

  const loadAllImages = async () => {
    setIsLoading(true);
    try {
      const loaded: LibraryImage[] = [];
      const seenPaths = new Set<string>();

      // 1. Load cloud storage images
      const { data: files, error } = await supabase.storage
        .from("article-images")
        .list("", { limit: 500, sortBy: { column: "created_at", order: "desc" } });

      if (error) throw error;

      for (const file of files || []) {
        if (seenPaths.has(file.name)) continue;
        seenPaths.add(file.name);

        const { data: urlData } = supabase.storage
          .from("article-images")
          .getPublicUrl(file.name);

        const originalName = file.name.replace(/^\d+-/, "");
        const folderNames = getFolderNames(file.name);

        loaded.push({
          name: originalName,
          url: urlData.publicUrl,
          alt: originalName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "),
          filePath: file.name,
          folderNames,
        });
      }

      // 2. Add URL-based images from assignments
      for (const a of assignments) {
        if (!a.file_path.startsWith("url:")) continue;
        if (seenPaths.has(a.file_path)) continue;
        seenPaths.add(a.file_path);

        const url = a.file_path.replace(/^url:/, "");
        try {
          const urlObj = new URL(url);
          const pathParts = urlObj.pathname.split("/").filter(Boolean);
          const rawName = pathParts[pathParts.length - 1] || "image";
          const name = decodeURIComponent(rawName);
          const folderNames = getFolderNames(a.file_path);

          loaded.push({
            name,
            url,
            alt: name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "),
            filePath: a.file_path,
            folderNames,
          });
        } catch {
          // skip invalid
        }
      }

      setAllImages(loaded);
    } catch (error) {
      console.error("Failed to load library:", error);
      toast({
        title: "Failed to load image library",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getFolderNames = (filePath: string): string[] => {
    const folderIds = assignments
      .filter((a) => a.file_path === filePath)
      .map((a) => a.folder_id);
    return folderIds
      .map((id) => folders.find((f) => f.id === id)?.name)
      .filter(Boolean) as string[];
  };

  const existingPaths = useMemo(
    () => new Set(existingImages.map((img) => img.filePath)),
    [existingImages]
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return allImages;
    const q = search.toLowerCase();
    return allImages.filter(
      (img) =>
        img.name.toLowerCase().includes(q) ||
        img.folderNames.some((f) => f.toLowerCase().includes(q))
    );
  }, [allImages, search]);

  const toggleSelect = (filePath: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  };

  const handleConfirm = () => {
    const picked = allImages
      .filter((img) => selected.has(img.filePath))
      .map(({ folderNames, ...rest }) => rest as ArticleImage);
    onImagesSelected(picked);
    onOpenChange(false);
    toast({
      title: "Images added",
      description: `${picked.length} image(s) added to this article`,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Library className="h-5 w-5" />
            Image Library ({allImages.length})
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or folder..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-muted-foreground">
            <ImageIcon className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">{search ? "No images match your search" : "No images in library"}</p>
          </div>
        ) : (
          <ScrollArea className="flex-1 max-h-[50vh]">
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 p-1">
              {filtered.map((img) => {
                const alreadyAdded = existingPaths.has(img.filePath);
                const isSelected = selected.has(img.filePath);

                return (
                  <button
                    key={img.filePath}
                    type="button"
                    className={`relative rounded-lg border-2 overflow-hidden transition-all text-left ${
                      alreadyAdded
                        ? "border-muted opacity-50 cursor-not-allowed"
                        : isSelected
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-transparent hover:border-muted-foreground/30"
                    }`}
                    onClick={() => !alreadyAdded && toggleSelect(img.filePath)}
                    disabled={alreadyAdded}
                  >
                    <div className="aspect-square bg-muted">
                      <img
                        src={img.url}
                        alt={img.alt}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>

                    {/* Checkbox overlay */}
                    {!alreadyAdded && (
                      <div className="absolute top-1.5 left-1.5">
                        <Checkbox
                          checked={isSelected}
                          className="bg-background/80 border-background/80"
                          tabIndex={-1}
                        />
                      </div>
                    )}

                    {alreadyAdded && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                        <span className="text-[10px] font-medium bg-muted px-1.5 py-0.5 rounded">
                          Already added
                        </span>
                      </div>
                    )}

                    <div className="p-1.5">
                      <p className="text-[10px] truncate text-muted-foreground">{img.name}</p>
                      {img.folderNames.length > 0 && (
                        <p className="text-[9px] truncate text-muted-foreground/70">
                          {img.folderNames.join(", ")}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={selected.size === 0}>
            Add {selected.size > 0 ? `${selected.size} image${selected.size > 1 ? "s" : ""}` : "selected"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
