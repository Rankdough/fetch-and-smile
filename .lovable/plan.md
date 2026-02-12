

## Fix: Convert to Article - Fallback and Reliability

### Problem
When a user uploads an image-based PDF **and** pastes text content, the tool tries only the PDF, fails, and shows an error — completely ignoring the pasted text that could have been used instead.

### Changes

**1. Client-side fallback logic (`src/components/ConvertToArticleView.tsx`)**

Update the `handleConvert` function so that:
- If a file is uploaded, try to parse it first
- If file parsing fails or returns an error string (starts with `[`), **fall back to the pasted text** instead of showing an error
- Only show an error if both the file parse AND pasted text are empty
- Show a toast informing the user: "File couldn't be read — using pasted text instead"

**2. Client-side content cleaning (`src/components/ConvertToArticleView.tsx`)**

Add a `cleanSourceText` utility function that strips obvious non-article content from the pasted text **before** sending it to the edge function. This acts as a pre-filter to reduce noise:
- Lines matching common nav patterns (e.g., lines that are just "Home", "Blog", "About", "Contact")
- Cookie consent text patterns
- Copyright lines (matching "Little Helpers (c) 2025" etc.)
- "FOLLOW US", "MANY LINKS", "Site Map" lines
- "Heatmap", "Recording", "Area" overlay labels
- Shipping banners like "Ordered before..."
- Language selector lines like just "English"

This ensures the AI gets cleaner input even though the prompt also instructs stripping.

**3. No edge function changes needed**

The `convert-to-html` prompt already has thorough stripping instructions. The main fix is on the client side: proper fallback + pre-cleaning.

### Technical Details

```text
handleConvert flow (updated):

  uploadedFile exists?
    YES --> try parse-context-file
              success + valid text? --> use it
              fail or "[..." error? --> fall back to pastedText
    NO  --> use pastedText

  cleanSourceText(sourceText)  <-- strip nav/footer noise

  send to convert-to-html
```

