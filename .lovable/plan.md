

## Plan: "Use for Article" button on blog ideas

### Approach
Add a small button next to each blog idea in KeywordClustering that writes the idea's data to localStorage (same keys the content generator reads on mount) and navigates to `/`.

### What gets pre-filled
From the blog idea and its parent cluster:
- **Topic** (`seo-generator-formData.topic`) = blog idea title
- **Keywords** (`seo-generator-keywords`) = blog idea's `target_keywords` array
- **Instructions** (`seo-generator-formData.instructions`) = blog idea description + reason as guidance context

The cluster's `content_type` and `description` can also be folded into instructions for additional context.

### Changes

**File: `src/components/keyword-research/KeywordClustering.tsx`**

1. Accept `useNavigate` from react-router-dom (add import)
2. Add a `sendToGenerator` function that:
   - Sets `localStorage["seo-generator-formData"]` with `{ topic: idea.title, length: "medium", outline: "", instructions: <cluster description + idea description + reason> }`
   - Sets `localStorage["seo-generator-keywords"]` with `idea.target_keywords`
   - Clears other generator keys that don't apply (gap analysis, format reference, etc.) so stale data doesn't leak -- OR leave them untouched so user's existing settings persist. Safer to leave untouched.
   - Navigates to `/`
3. Add a small "Use for Article" button (with an `ArrowRight` or `ExternalLink` icon) next to each blog idea, calling `sendToGenerator(cluster, idea)`

### What stays unchanged
- Index.tsx (content generator) -- no changes needed, it already reads from localStorage on mount
- All other clustering functionality remains identical
- No database changes needed

