import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NavigationItem {
  number: number;
  title: string;
  description: string;
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
      element.scrollIntoView({ behavior: "smooth" });
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

      <div className="space-y-1">
        {items.map((item, index) => (
          <div
            key={index}
            className={cn(
              "rounded-lg border transition-all",
              item.isHighlighted 
                ? "border-primary/50 bg-primary/5" 
                : "hover:border-muted-foreground/30"
            )}
          >
            <div 
              className="flex items-center gap-2 p-2 cursor-pointer"
              onClick={() => setExpandedItem(expandedItem === index ? null : index)}
            >
              <div className={cn(
                "flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                item.isHighlighted 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-primary/10 text-primary border border-primary/20"
              )}>
                {item.number}
              </div>
              <p className={cn(
                "text-sm font-medium flex-1",
                item.isHighlighted && "text-primary"
              )}>
                {item.title}
                {item.isHighlighted && (
                  <Star className="inline-block ml-1 h-3 w-3 text-primary fill-primary" />
                )}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 flex-shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedItem(expandedItem === index ? null : index);
                }}
              >
                {expandedItem === index ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </Button>
            </div>
            
            {/* Expanded: description + jump link */}
            {expandedItem === index && (
              <div className="px-2 pb-2 pl-9 space-y-2">
                <p className="text-xs text-muted-foreground">
                  {item.description}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => handleJump(item.slug)}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Jump to section
                </Button>
              </div>
            )}
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
    
    // Generate slug from title
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
    
    // Try to extract description from the first paragraph after the heading
    const headingIndex = match.index;
    const afterHeading = content.slice(headingIndex + match[0].length);
    const firstParagraph = afterHeading.split(/\n\n/)[0]?.trim() || "";
    const description = firstParagraph.replace(/^\n+/, "").slice(0, 150) + (firstParagraph.length > 150 ? "..." : "");
    
    items.push({
      number,
      title,
      description: description || `Learn about ${title.toLowerCase()}`,
      slug,
      isHighlighted: number === 1, // First item is highlighted
    });
    
    number++;
  }
  
  return items;
};
