import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, X, Copy, ImagePlus, GripVertical, Wand2 } from "lucide-react";

export interface ArticleImage {
  name: string;
  url: string;
  alt: string;
  filePath: string;
}

interface ArticleImagesPanelProps {
  images: ArticleImage[];
  onImagesChange: (images: ArticleImage[]) => void;
  onAllocateLogically?: () => void;
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
        toast({
          title: "Images uploaded",
          description: `${newImages.length} image(s) uploaded successfully`,
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

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        <strong>Drag & drop</strong> images into the preview, or use <strong>Allocate Logically</strong> for AI placement.
      </p>

      {/* Upload input */}
      <div>
        <Label htmlFor="article-images" className="sr-only">
          Upload images
        </Label>
        <Input
          id="article-images"
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
          multiple
          onChange={handleUpload}
          disabled={isUploading || isAllocating}
          className="cursor-pointer bg-input border-2 border-input-border"
        />
      </div>

      {/* Allocate Logically button */}
      {images.length > 0 && hasContent && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={onAllocateLogically}
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
              Allocate Logically ({images.length} images)
            </>
          )}
        </Button>
      )}

      {/* Loading indicator */}
      {isUploading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Uploading images...
        </div>
      )}

      {/* Image grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {images.map((image, index) => (
            <div
              key={index}
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
                  onClick={() => handleDelete(index)}
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
      {images.length === 0 && !isUploading && (
        <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 text-center">
          <ImagePlus className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">
            No images uploaded yet
          </p>
          <p className="text-xs text-muted-foreground/75 mt-1">
            Supports JPG, PNG, GIF, WebP, SVG
          </p>
        </div>
      )}
    </div>
  );
}
