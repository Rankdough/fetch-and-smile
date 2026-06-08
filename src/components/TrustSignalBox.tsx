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
    <div data-trust-signal-preview="true">
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
          className="px-5 py-4 text-sm leading-relaxed"
          style={{ color: textColor }}
        >
          {(() => {
            // Detect author block: content starts with ![name](url)
            // Structure: ![alt](src)\n\n**Name** · Title\n\nBio\n\n---\n\nrest
            const lines = content.split("\n");
            const firstLine = lines[0] || "";
            const imgSrcMatch = firstLine.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
            if (imgSrcMatch) {
              const alt = imgSrcMatch[1];
              const src = imgSrcMatch[2];
              // Find separator line "---"
              const sepIdx = lines.findIndex((l) => l.trim() === "---");
              const authorLines = lines.slice(1, sepIdx > 0 ? sepIdx : 6).filter((l) => l.trim());
              const nameLine = authorLines[0]?.replace(/\*\*/g, "").trim() || alt;
              const bioLines = authorLines.slice(1).join(" ").trim();
              const rest = sepIdx > 0 ? lines.slice(sepIdx + 1).join("\n").trim() : "";
              return (
                <>
                  <div style={{ display: "flex", gap: "16px", alignItems: "flex-start", marginBottom: "8px" }}>
                    <img
                      src={src}
                      alt={alt}
                      style={{ width: "64px", height: "64px", borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "2px solid #99f6e4" }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: "0.9em", marginBottom: "4px", color: textColor }}>{nameLine}</div>
                      {bioLines && <div style={{ fontSize: "0.85em", lineHeight: 1.6, color: textColor, opacity: 0.9 }}>{bioLines}</div>}
                    </div>
                  </div>
                  {rest && <ReactMarkdown remarkPlugins={[remarkGfm]}>{rest}</ReactMarkdown>}
                </>
              );
            }
            return <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>;
          })()}
        </div>
      </CollapsibleContent>
    </Collapsible>
    </div>
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

  // Match the PREVIEW layout: 64px circular author photo with name + bio
  // flowing beside it, instead of a full-width image above stacked text.
  // marked output shape: <p><img ...></p> <p><strong>Name</strong> · Title</p> <p>bio</p>
  // Strip <hr> elements — the --- separator in the markdown creates large-margin
  // horizontal rules that add visible gaps between bio and sources sections.
  let styledContent = contentHtml.replace(/<hr\s*\/?>/gi, "");
  const authorBlockRe = /^\s*<p>\s*(<img[^>]*>)\s*<\/p>\s*<p>([\s\S]*?)<\/p>\s*<p>([\s\S]*?)<\/p>/i;
  const authorMatch = styledContent.match(authorBlockRe);
  if (authorMatch) {
    const imgTag = authorMatch[1].replace(
      /\/?>$/,
      ` style="width:64px;height:64px;border-radius:9999px;object-fit:cover;flex-shrink:0;border:2px solid ${primary}40;" />`
    );
    const flexHeader =
      `<div style="display:flex;gap:16px;align-items:flex-start;margin-bottom:16px;">` +
      imgTag +
      `<div style="flex:1;min-width:0;">` +
      `<p style="margin:0 0 4px 0;font-weight:600;">${authorMatch[2]}</p>` +
      `<p style="margin:0;">${authorMatch[3]}</p>` +
      `</div></div>`;
    styledContent = styledContent.replace(authorBlockRe, flexHeader);
  } else {
    // Fallback: at least make any leading image circular rather than full-width.
    styledContent = styledContent.replace(
      /^(\s*<p>\s*)<img([^>]*?)\/?>/i,
      `$1<img$2 style="width:64px;height:64px;border-radius:9999px;object-fit:cover;" />`
    );
  }

  return `<details style="margin:24px 0;border:1px solid ${borderColor};border-radius:12px;overflow:hidden;" data-trust-signal="true">
  <summary style="list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;background:${headerBg};color:${textColor};font-weight:600;">
    <span style="display:inline-flex;align-items:center;gap:12px;">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9999px;background:${primary};color:#ffffff;font-size:14px;">&#9873;</span>
      <span>${escapeHtml(title)}</span>
    </span>
    <span style="color:${primary};font-size:18px;line-height:1;">&#9662;</span>
  </summary>
  <div style="padding:16px 20px;color:${textColor};line-height:1.7;font-size:15px;">
    ${styledContent}
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
