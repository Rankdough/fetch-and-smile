import { useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { ColorPalette } from "@/components/ColorPaletteSelector";

interface TrustSignalBoxProps {
  title: string;
  content: string; // markdown
  brandColors?: ColorPalette | null;
  defaultOpen?: boolean;
}

export function TrustSignalBox({
  title,
  content,
  brandColors,
  defaultOpen = false,
}: TrustSignalBoxProps) {
  const [open, setOpen] = useState(defaultOpen);
  const isDark = brandColors?.id === "dark-transparent";
  const primary = brandColors?.primary || "#16a34a";
  const headerBg = isDark
    ? "rgba(255,255,255,0.06)"
    : `${primary}14`; // 8% tint via hex alpha
  const borderColor = isDark
    ? "rgba(255,255,255,0.18)"
    : `${primary}40`;
  const textColor = isDark ? "#e5e7eb" : "#1f2937";

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="my-6 rounded-xl border overflow-hidden"
      style={{ borderColor }}
    >
      <CollapsibleTrigger
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:brightness-95"
        style={{ background: headerBg, color: textColor }}
      >
        <span className="flex items-center gap-3">
          <span
            className="flex items-center justify-center w-7 h-7 rounded-full"
            style={{ background: primary, color: "#fff" }}
          >
            <ShieldCheck className="h-4 w-4" />
          </span>
          <span className="font-semibold text-base">{title}</span>
        </span>
        <ChevronDown
          className="h-5 w-5 shrink-0 transition-transform"
          style={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            color: primary,
          }}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div
          className="px-5 py-4 text-sm leading-relaxed prose prose-sm max-w-none"
          style={{ color: textColor }}
        >
          {/* Render author photo + name + bio as a flex block if content starts with ![...] */}
          {(() => {
            const imgMatch = content.match(/^!\[([^\]]*)\]\(([^)]+)\)

\*\*([^*]+)\*\*[^
]*

([^
]+(?:
[^
]+)*?)(?:

---|

\*\*)/s);
            if (imgMatch) {
              const [fullMatch, alt, src, name, bio] = imgMatch;
              const rest = content.slice(fullMatch.length).replace(/^---

/, '');
              return (
                <>
                  <div style={{ display: "flex", gap: "16px", alignItems: "flex-start", marginBottom: "16px" }}>
                    <img
                      src={src}
                      alt={alt || name}
                      style={{ width: "72px", height: "72px", borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "2px solid #99f6e4" }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    <div>
                      <div style={{ fontWeight: 700, marginBottom: "4px", color: textColor }}>{name}</div>
                      <div style={{ lineHeight: 1.6, color: textColor }}>{bio.trim()}</div>
                    </div>
                  </div>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{rest}</ReactMarkdown>
                </>
              );
            }
            return <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>;
          })()}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Build an inline-styled HTML <details> block for export pipelines.
 * Matches the visual language of TrustSignalBox but uses pure HTML/CSS.
 */
export function buildTrustSignalHtml(
  title: string,
  contentHtml: string,
  brandColors?: { id?: string; primary?: string } | null,
): string {
  const isDark = brandColors?.id === "dark-transparent";
  const primary = brandColors?.primary || "#16a34a";
  const headerBg = isDark ? "rgba(255,255,255,0.06)" : `${primary}14`;
  const borderColor = isDark ? "rgba(255,255,255,0.18)" : `${primary}40`;
  const textColor = isDark ? "#e5e7eb" : "#1f2937";

  return `<details style="margin:24px 0;border:1px solid ${borderColor};border-radius:12px;overflow:hidden;" data-trust-signal="true">
  <summary style="list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;background:${headerBg};color:${textColor};font-weight:600;">
    <span style="display:inline-flex;align-items:center;gap:12px;">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9999px;background:${primary};color:#ffffff;font-size:14px;">&#9873;</span>
      <span>${escapeHtml(title)}</span>
    </span>
    <span style="color:${primary};font-size:18px;line-height:1;">&#9662;</span>
  </summary>
  <div style="padding:16px 20px;color:${textColor};line-height:1.7;font-size:15px;">
    ${contentHtml}
  </div>
</details>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
