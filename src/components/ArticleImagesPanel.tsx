import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, X, Copy, ImagePlus, GripVertical, Wand2, Cloud, FolderInput } from "lucide-react";
import { ImageFolderManager, type ImageFolder } from "@/components/ImageFolderManager";
import { useImageFolders } from "@/hooks/useImageFolders";

export interface ArticleImage {
  name: string;
  url: string;
  alt: string;
  filePath: string;
}

interface ArticleImagesPanelProps {
  images: ArticleImage[];
  onImagesChange: (images: ArticleImage[]) => void;
  onAllocateLogically?: (imagesToAllocate: ArticleImage[]) => void;
  isAllocating?: boolean;
  hasContent?: boolean;
}

export function ArticleImagesPanel({ 
  images, 
  onImagesChange,
  onAllocateLogically,
  isAllocating = false,
  hasContent = false,
}: ArticleImagesPanelProps) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingFromCloud, setIsLoadingFromCloud] = useState(false);
  const [allocateCount, setAllocateCount] = useState(1);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [folders, setFolders] = useState<ImageFolder[]>([]);
  
  const { 
    assignments,
    assignToFolder, 
    removeFromFolder, 
    getFolderForImage, 
    getImagesInFolder,
    refresh: refreshFolderData 
  } = useImageFolders();

  // Filter images by selected folder
  const filteredImages = useMemo(() => {
    if (!selectedFolderId) return images;
    const folderFilePaths = getImagesInFolder(selectedFolderId);
    return images.filter((img) => folderFilePaths.includes(img.filePath));
  }, [images, selectedFolderId, getImagesInFolder]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);

    try {
      const newImages: ArticleImage[] = [];

      for (const file of Array.from(files)) {
        // Sanitize filename
        const sanitizedName = file.name
          .replace(/['']/g, "")
          .replace(/[^\w\s.-]/g, "_");
        const filePath = `${Date.now()}-${sanitizedName}`;

        // Upload to article-images bucket
        const { error } = await supabase.storage
          .from("article-images")
          .upload(filePath, file);

        if (error) {
          console.error("Upload error:", error);
          toast({
            title: "Upload failed",
            description: `Failed to upload ${file.name}: ${error.message}`,
            variant: "destructive",
          });
          continue;
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from("article-images")
          .getPublicUrl(filePath);

        newImages.push({
          name: file.name,
          url: urlData.publicUrl,
          alt: file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "),
          filePath,
        });
      }

      if (newImages.length > 0) {
        onImagesChange([...images, ...newImages]);
        
        // Auto-assign to selected folder if one is active
        if (selectedFolderId) {
          for (const img of newImages) {
            await assignToFolder(img.filePath, selectedFolderId);
          }
        }
        
        const folderName = selectedFolderId 
          ? folders.find(f => f.id === selectedFolderId)?.name 
          : null;
        
        toast({
          title: "Images uploaded",
          description: folderName 
            ? `${newImages.length} image(s) added to "${folderName}"`
            : `${newImages.length} image(s) uploaded successfully`,
        });
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload images",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (index: number) => {
    const image = images[index];
    
    try {
      // Delete from storage
      const { error } = await supabase.storage
        .from("article-images")
        .remove([image.filePath]);

      if (error) {
        console.error("Delete error:", error);
      }

      // Remove from state regardless of storage deletion result
      onImagesChange(images.filter((_, i) => i !== index));
      
      toast({
        title: "Image removed",
        description: `${image.name} has been deleted`,
      });
    } catch (error) {
      console.error("Delete error:", error);
      // Still remove from UI
      onImagesChange(images.filter((_, i) => i !== index));
    }
  };

  const handleCopyMarkdown = (image: ArticleImage) => {
    const markdown = `![${image.alt}](${image.url})`;
    navigator.clipboard.writeText(markdown);
    toast({
      title: "Copied!",
      description: "Image markdown copied to clipboard",
    });
  };

  const handleDragStart = (e: React.DragEvent, image: ArticleImage) => {
    // Set the data that will be transferred
    const imageData = JSON.stringify({
      type: "article-image",
      url: image.url,
      alt: image.alt,
      name: image.name,
    });
    e.dataTransfer.setData("application/json", imageData);
    e.dataTransfer.setData("text/plain", `![${image.alt}](${image.url})`);
    e.dataTransfer.effectAllowed = "copy";
    
    // Create a custom drag image
    const dragImage = document.createElement("div");
    dragImage.textContent = `📷 ${image.name}`;
    dragImage.style.cssText = "position: absolute; top: -1000px; padding: 8px 12px; background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); border-radius: 6px; font-size: 12px; white-space: nowrap;";
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 0, 0);
    setTimeout(() => document.body.removeChild(dragImage), 0);
  };

  const loadFromCloud = async () => {
    setIsLoadingFromCloud(true);
    try {
      // List all files in the article-images bucket
      const { data: files, error } = await supabase.storage
        .from("article-images")
        .list("", { limit: 100, sortBy: { column: "created_at", order: "desc" } });

      if (error) {
        throw error;
      }

      if (!files || files.length === 0) {
        toast({
          title: "No images found",
          description: "Your cloud storage is empty",
        });
        return;
      }

      // Filter out any existing images by filePath to avoid duplicates
      const existingPaths = new Set(images.map(img => img.filePath));
      const newFiles = files.filter(file => !existingPaths.has(file.name));

      if (newFiles.length === 0) {
        toast({
          title: "All synced",
          description: "All cloud images are already loaded",
        });
        return;
      }

      // Get public URLs for each file
      const cloudImages: ArticleImage[] = newFiles.map(file => {
        const { data: urlData } = supabase.storage
          .from("article-images")
          .getPublicUrl(file.name);

        // Extract original filename from the timestamped name
        const originalName = file.name.replace(/^\d+-/, "");

        return {
          name: originalName,
          url: urlData.publicUrl,
          alt: originalName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "),
          filePath: file.name,
        };
      });

      onImagesChange([...images, ...cloudImages]);
      toast({
        title: "Images loaded!",
        description: `${cloudImages.length} image(s) loaded from cloud storage`,
      });
    } catch (error) {
      console.error("Load from cloud error:", error);
      toast({
        title: "Failed to load",
        description: error instanceof Error ? error.message : "Could not load images from cloud",
        variant: "destructive",
      });
    } finally {
      setIsLoadingFromCloud(false);
    }
  };

  // Handle assigning image to a folder
  const handleAssignToFolder = async (filePath: string, folderId: string | null) => {
    if (folderId) {
      const success = await assignToFolder(filePath, folderId);
      if (success) {
        toast({
          title: "Image added to folder",
          description: `Image moved to ${folders.find(f => f.id === folderId)?.name}`,
        });
      }
    } else {
      const success = await removeFromFolder(filePath);
      if (success) {
        toast({
          title: "Image removed from folder",
        });
      }
    }
  };

  return (
    <div className="space-y-3">
      {/* Folder selector */}
      <ImageFolderManager
        selectedFolderId={selectedFolderId}
        onFolderChange={setSelectedFolderId}
        onFoldersLoaded={setFolders}
        allImages={images}
        folderAssignments={assignments}
      />

      <p className="text-sm text-muted-foreground">
        <strong>Drag & drop</strong> images into the preview, or use <strong>Allocate Logically</strong> for AI placement.
      </p>

      {/* Upload and Cloud Load buttons */}
      <div className="flex gap-2">
        <div className="flex-1">
          <Label htmlFor="article-images" className="sr-only">
            Upload images
          </Label>
          <Input
            id="article-images"
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
            multiple
            onChange={handleUpload}
            disabled={isUploading || isAllocating || isLoadingFromCloud}
            className="cursor-pointer bg-input border-2 border-input-border"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={loadFromCloud}
          disabled={isUploading || isAllocating || isLoadingFromCloud}
          title="Load images from cloud storage"
        >
          {isLoadingFromCloud ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Cloud className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Allocate Logically section */}
      {filteredImages.length > 0 && hasContent && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="allocate-count" className="text-xs whitespace-nowrap">
              Images to place:
            </Label>
            <select
              id="allocate-count"
              value={allocateCount}
              onChange={(e) => setAllocateCount(Number(e.target.value))}
              className="flex-1 h-8 px-2 text-sm rounded-md border border-input bg-background"
              disabled={isAllocating}
            >
              {Array.from({ length: filteredImages.length }, (_, i) => i + 1).map((num) => (
                <option key={num} value={num}>
                  {num} {num === 1 ? "image" : "images"}
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => onAllocateLogically?.(filteredImages.slice(0, allocateCount))}
            disabled={isAllocating || !hasContent}
          >
            {isAllocating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Placing images...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4 mr-2" />
                Allocate Logically
              </>
            )}
          </Button>
        </div>
      )}

      {/* Loading indicator */}
      {isUploading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Uploading images...
        </div>
      )}

      {/* Image grid */}
      {filteredImages.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {filteredImages.map((image, index) => (
            <div
              key={image.filePath}
              className="relative group rounded-lg border bg-muted/50 p-2 space-y-2 cursor-grab active:cursor-grabbing"
              draggable
              onDragStart={(e) => handleDragStart(e, image)}
            >
              {/* Drag handle indicator */}
              <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 rounded p-0.5">
                <GripVertical className="h-3 w-3 text-muted-foreground" />
              </div>
              
              {/* Thumbnail */}
              <div className="aspect-square w-full overflow-hidden rounded-md bg-background">
                <img
                  src={image.url}
                  alt={image.alt}
                  className="h-full w-full object-cover pointer-events-none"
                  loading="lazy"
                  draggable={false}
                />
              </div>

              {/* Image name */}
              <p className="text-xs text-muted-foreground truncate" title={image.name}>
                {image.name}
              </p>

              {/* Folder assignment dropdown */}
              {folders.length > 0 && (
                <Select
                  value={getFolderForImage(image.filePath) || "none"}
                  onValueChange={(value) => handleAssignToFolder(image.filePath, value === "none" ? null : value)}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <FolderInput className="h-3 w-3 mr-1" />
                    <SelectValue placeholder="No folder" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No folder</SelectItem>
                    {folders.map((folder) => (
                      <SelectItem key={folder.id} value={folder.id}>
                        {folder.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Actions */}
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-7 text-xs"
                  onClick={() => handleCopyMarkdown(image)}
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copy
                </Button>
                <Button
                  variant="destructive"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleDelete(images.findIndex(img => img.filePath === image.filePath))}
                  title="Remove image"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {filteredImages.length === 0 && !isUploading && (
        <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 text-center">
          <ImagePlus className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">
            {selectedFolderId ? "No images in this folder" : "No images uploaded yet"}
          </p>
          <p className="text-xs text-muted-foreground/75 mt-1">
            Supports JPG, PNG, GIF, WebP, SVG
          </p>
        </div>
      )}
    </div>
  );
}
