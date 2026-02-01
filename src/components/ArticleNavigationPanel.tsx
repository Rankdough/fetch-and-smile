import { useState } from "react";
import { ChevronDown, ExternalLink, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NavigationItem {
  number: number;
  title: string;
  description: string;
  detailedDescription?: string;
  slug: string;
  isHighlighted?: boolean;
}

interface ArticleNavigationPanelProps {
  items: NavigationItem[];
  onJumpToSection?: (slug: string) => void;
}

export const ArticleNavigationPanel = ({ 
  items, 
  onJumpToSection 
}: ArticleNavigationPanelProps) => {
  const [expandedItem, setExpandedItem] = useState<number | null>(null);

  if (!items || items.length === 0) return null;

  const handleJump = (slug: string) => {
    if (onJumpToSection) {
      onJumpToSection(slug);
    }
    const element = document.getElementById(slug);
    if (element) {
      // Find the scrollable container (CardContent with overflow-auto)
      const scrollContainer = element.closest('.overflow-auto');
      if (scrollContainer) {
        const containerRect = scrollContainer.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const offset = elementRect.top - containerRect.top + scrollContainer.scrollTop - 20;
        scrollContainer.scrollTo({ top: offset, behavior: 'smooth' });
      } else {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">
            #
          </span>
          In This Article
        </h4>
        <span className="text-xs text-muted-foreground">
          {items.length} sections
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        Quick navigation to each section of this article:
      </p>

      <div className="space-y-2">
        {items.map((item, index) => (
          <div
            key={index}
            className={cn(
              "rounded-md border bg-background transition-all overflow-hidden",
              item.isHighlighted 
                ? "border-primary bg-primary text-primary-foreground" 
                : "border-border hover:border-primary/30"
            )}
          >
            {/* Clickable header row */}
            <button 
              type="button"
              className={cn(
                "flex items-center gap-3 px-3 py-3 w-full text-left transition-colors",
                item.isHighlighted 
                  ? "hover:bg-primary/90" 
                  : "hover:bg-muted/50"
              )}
              onClick={() => setExpandedItem(expandedItem === index ? null : index)}
            >
              <div className={cn(
                "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                item.isHighlighted 
                  ? "bg-primary-foreground/20 text-primary-foreground" 
                  : "bg-primary/10 text-primary border border-primary/20"
              )}>
                {item.number}
              </div>
              <span className={cn(
                "flex-1 text-sm font-semibold",
                item.isHighlighted ? "text-primary-foreground" : "text-foreground"
              )}>
                {item.title}
                {item.isHighlighted && (
                  <Star className="inline-block ml-1.5 h-3 w-3 fill-current" />
                )}
              </span>
              <ChevronDown className={cn(
                "h-4 w-4 flex-shrink-0 transition-transform duration-200",
                item.isHighlighted ? "text-primary-foreground/70" : "text-primary",
                expandedItem === index && "rotate-180"
              )} />
            </button>
            
            {/* Expandable description with jump link */}
            <div className={cn(
              "overflow-hidden transition-all duration-200",
              expandedItem === index ? "max-h-48 opacity-100" : "max-h-0 opacity-0"
            )}>
              <div className={cn(
                "px-3 pb-3 pl-12 space-y-2",
                item.isHighlighted ? "text-primary-foreground/80" : ""
              )}>
                <p className={cn(
                  "text-sm leading-relaxed",
                  item.isHighlighted ? "text-primary-foreground/80" : "text-muted-foreground"
                )}>
                  {item.description.replace(/\.{3}$/, '')} {item.detailedDescription}
                </p>
                <Button
                  variant={item.isHighlighted ? "secondary" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleJump(item.slug);
                  }}
                >
                  <ExternalLink className="h-3 w-3 mr-1.5" />
                  Jump to section
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Helper function to extract navigation items from markdown content
export const extractNavigationFromContent = (content: string): NavigationItem[] => {
  const items: NavigationItem[] = [];
  
  // Find all H2 headings (## Heading)
  const h2Regex = /^## (.+)$/gm;
  let match;
  let number = 1;
  
  // Skip TL;DR and In This Article sections
  const skipSections = ["tl;dr", "tldr", "in this article", "references"];
  
  while ((match = h2Regex.exec(content)) !== null) {
    const title = match[1].trim();
    const titleLower = title.toLowerCase();
    
    if (skipSections.some(skip => titleLower.includes(skip))) {
      continue;
    }
    
    // Generate slug from title - MUST match the ReactMarkdown h2 id generation
    // ReactMarkdown uses: String(children).toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
    const slug = title
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]/g, "");
    
    // Try to extract description from the first paragraph after the heading
    const headingIndex = match.index;
    const afterHeading = content.slice(headingIndex + match[0].length);
    const firstParagraph = afterHeading.split(/\n\n/)[0]?.trim().replace(/^\n+/, "") || "";
    
    // Short description: first 100 chars (for 2 lines display)
    const shortDescription = firstParagraph.slice(0, 100) + (firstParagraph.length > 100 ? "..." : "");
    
    // Detailed description: next portion of text for expanded view
    const detailedDescription = firstParagraph.length > 100 
      ? firstParagraph.slice(100, 300) + (firstParagraph.length > 300 ? "..." : "")
      : "Click to jump to this section and learn more.";
    
    items.push({
      number,
      title,
      description: shortDescription || `Learn about ${title.toLowerCase()}`,
      detailedDescription,
      slug,
      isHighlighted: number === 1, // First item is highlighted
    });
    
    number++;
  }
  
  return items;
};
