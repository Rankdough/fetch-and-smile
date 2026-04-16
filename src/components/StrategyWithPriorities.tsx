import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Star } from "lucide-react";

interface Props {
  content: string;
  prioritizedPoints: string[];
  onTogglePriority: (bulletText: string) => void;
}

/** Extract a normalized key from a bullet line for matching */
function normalizeBullet(line: string): string {
  return line.replace(/^[\s*\-•]+/, "").trim();
}

export function StrategyWithPriorities({ content, prioritizedPoints, onTogglePriority }: Props) {
  // Parse content into segments: headings/paragraphs vs bullet lines
  const lines = content.split("\n");
  const segments: { type: "markdown" | "bullet"; text: string; raw: string }[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      segments.push({ type: "bullet", text: normalizeBullet(trimmed), raw: trimmed });
    } else {
      segments.push({ type: "markdown", text: trimmed, raw: line });
    }
  }

  // Group consecutive markdown lines
  const groups: { type: "markdown" | "bullet"; lines: typeof segments }[] = [];
  for (const seg of segments) {
    if (seg.type === "bullet") {
      groups.push({ type: "bullet", lines: [seg] });
    } else {
      const last = groups[groups.length - 1];
      if (last?.type === "markdown") {
        last.lines.push(seg);
      } else {
        groups.push({ type: "markdown", lines: [seg] });
      }
    }
  }

  return (
    <div className="space-y-0">
      {groups.map((group, gi) => {
        if (group.type === "markdown") {
          const md = group.lines.map(l => l.raw).join("\n");
          if (!md.trim()) return null;
          return (
            <div key={gi} className="prose prose-sm max-w-none dark:prose-invert [&_strong]:text-foreground">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
            </div>
          );
        }

        // Bullet point - render with star toggle
        const bullet = group.lines[0];
        const isPrioritized = prioritizedPoints.some(p => normalizeBullet(p) === bullet.text || p === bullet.text);

        return (
          <div
            key={gi}
            className={`group flex items-start gap-2 py-1.5 px-2 rounded-md transition-colors cursor-pointer hover:bg-accent/50 ${
              isPrioritized ? "bg-amber-50 dark:bg-amber-950/20 border-l-2 border-amber-400" : ""
            }`}
            onClick={() => onTogglePriority(bullet.text)}
          >
            <Star
              className={`h-4 w-4 mt-0.5 shrink-0 transition-colors ${
                isPrioritized
                  ? "fill-amber-400 text-amber-400"
                  : "text-muted-foreground/30 group-hover:text-muted-foreground/60"
              }`}
            />
            <div className="prose prose-sm max-w-none dark:prose-invert [&_strong]:text-foreground [&_p]:m-0">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{bullet.raw.replace(/^[\s*\-]+/, "")}</ReactMarkdown>
            </div>
          </div>
        );
      })}
    </div>
  );
}
