
# Plan: Add Article Images Upload Feature

## Overview
Add a new form section that allows uploading images for articles. Images will be stored in a public Lovable Cloud storage bucket and can be inserted into the generated content. The uploaded image URLs will work in the exported HTML since they're hosted on a CDN.

## Architecture

### Storage
- Create a new **public** storage bucket called `article-images` 
- Images stored with sanitized filenames and timestamps to prevent conflicts
- Public bucket ensures images are accessible when HTML is exported and opened elsewhere

### User Interface
- New Section 11: "Article Images" in the form panel (after Color Palette)
- Upload multiple images at once (accept jpg, png, gif, webp, svg)
- Display uploaded images as thumbnails with:
  - Preview of the image
  - Copy URL button (for manual insertion)
  - Delete button
  - Image name
- Optional: Add caption/alt text for each image

### Image Insertion Options
Two approaches for the user:
1. **Manual**: Copy the image URL and paste it into the generated content using edit mode
2. **Auto-suggest**: Pass image URLs to the AI during generation, letting it place `![description](url)` tags at appropriate points in the article

## Implementation Steps

### Step 1: Create Storage Bucket
Create a migration to add the `article-images` public storage bucket with appropriate RLS policies allowing anonymous uploads and public reads.

```sql
-- Create public bucket for article images
INSERT INTO storage.buckets (id, name, public)
VALUES ('article-images', 'article-images', true);

-- Allow public read access
CREATE POLICY "Public can view article images"
ON storage.objects FOR SELECT
USING (bucket_id = 'article-images');

-- Allow uploads (anonymous for now, can restrict later)
CREATE POLICY "Anyone can upload article images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'article-images');

-- Allow delete
CREATE POLICY "Anyone can delete article images"
ON storage.objects FOR DELETE
USING (bucket_id = 'article-images');
```

### Step 2: Add State Management
In `src/pages/Index.tsx`:
- New state: `articleImages` - array of `{ name: string, url: string, alt: string }`
- New state: `isUploadingImage` - loading indicator
- Add localStorage persistence for `articleImages`
- Add to `handleClearForm` to reset images

### Step 3: Create Image Upload Handler
```typescript
const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = e.target.files;
  if (!files) return;
  
  setIsUploadingImage(true);
  
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
      // Handle error
      continue;
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from("article-images")
      .getPublicUrl(filePath);
    
    setArticleImages(prev => [...prev, {
      name: file.name,
      url: urlData.publicUrl,
      alt: file.name.replace(/\.[^/.]+$/, "")
    }]);
  }
  
  setIsUploadingImage(false);
};
```

### Step 4: Build UI Section
Add Section 11 in the form panel:

```
Section 11: Article Images
├── Upload input (multiple, accept image types)
├── Loading indicator while uploading
└── Image grid:
    └── For each image:
        ├── Thumbnail preview (64x64)
        ├── File name (truncated)
        ├── Copy URL button (copies markdown: ![alt](url))
        └── Delete button (X)
```

Visual design:
- Grid of 2-3 columns for image cards
- Each card shows thumbnail, name, copy/delete actions
- Uses same styling as Context Files section

### Step 5: Optional AI Integration
Modify `generate-content` edge function to accept `articleImages` array and include them in the prompt:

```typescript
// In generate-content/index.ts
if (articleImages && Array.isArray(articleImages) && articleImages.length > 0) {
  userPrompt += `

ARTICLE IMAGES TO USE:
You have ${articleImages.length} images available to place in the article. Insert them at relevant points using markdown image syntax.
${articleImages.map((img, i) => `${i + 1}. ![${img.alt}](${img.url})`).join("\n")}

Place these images throughout the article at logical locations, typically after relevant paragraphs.`;
}
```

### Step 6: Update Export Logic
The current HTML export already converts markdown images to `<img>` tags via ReactMarkdown. Since images are stored in a public bucket with CDN URLs, they will work correctly in exported HTML without additional changes.

## Files to Create/Modify

| File | Changes |
|------|---------|
| Migration SQL | Create `article-images` bucket with RLS policies |
| `src/pages/Index.tsx` | Add state, upload handler, UI section, pass to generation |
| `supabase/functions/generate-content/index.ts` | Accept articleImages parameter, include in prompt |

## User Workflow

1. Open "Article Images" section
2. Click to upload images (or drag and drop)
3. See thumbnails appear with copy/delete options
4. Generate article - AI will place images automatically OR
5. After generation, use Edit mode to manually insert images using copied URLs
6. Export HTML - images remain functional via CDN URLs

## Technical Notes

- Images are NOT base64-encoded in database (follows best practices)
- Public bucket means no authentication required to view images
- CDN-hosted for fast loading globally
- Filename sanitization prevents upload errors (same as context files fix)
- Local storage persistence means images survive page refresh

