import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQAccordionProps {
  items: FAQItem[];
  brandColors?: {
    primary: string;
    secondary: string;
    accent: string;
  } | null;
}

export const FAQAccordion = ({ items, brandColors }: FAQAccordionProps) => {
  const [expandedItem, setExpandedItem] = useState<number | null>(null);

  if (!items || items.length === 0) return null;

  // Use brand colors or fall back to default purple theme
  const accentColor = brandColors?.accent || brandColors?.primary || "hsl(300 52% 36%)";
  const primaryColor = brandColors?.primary || "hsl(300 52% 36%)";

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3 my-6">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <span 
            className="flex items-center justify-center w-5 h-5 rounded-full text-white text-xs font-bold"
            style={{ backgroundColor: accentColor }}
          >
            ?
          </span>
          Frequently Asked Questions
        </h4>
        <span className="text-xs text-muted-foreground">
          {items.length} questions
        </span>
      </div>

      <div className="space-y-2">
        {items.map((item, index) => (
          <div
            key={index}
            className="rounded-md border bg-background transition-all overflow-hidden"
            style={{ borderColor: expandedItem === index ? accentColor : undefined }}
          >
            {/* Question row - clickable */}
            <button 
              type="button"
              className="flex items-center gap-3 px-3 py-3 w-full text-left hover:bg-muted/50 transition-colors"
              onClick={() => setExpandedItem(expandedItem === index ? null : index)}
            >
              <div 
                className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ 
                  backgroundColor: `${primaryColor}15`,
                  color: primaryColor,
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderColor: `${primaryColor}30`
                }}
              >
                {index + 1}
              </div>
              <span className="flex-1 text-sm font-semibold text-foreground">
                {item.question}
              </span>
              <ChevronDown 
                className={cn(
                  "h-4 w-4 flex-shrink-0 transition-transform duration-200",
                  expandedItem === index && "rotate-180"
                )} 
                style={{ color: accentColor }}
              />
            </button>
            
            {/* Answer - collapsible */}
            <div className={cn(
              "overflow-hidden transition-all duration-200",
              expandedItem === index ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
            )}>
              <div className="px-3 pb-3 pl-12">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.answer}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Helper function to extract FAQ items from markdown content
export const extractFAQFromContent = (content: string): FAQItem[] => {
  const items: FAQItem[] = [];
  
  // Find the FAQ section
  const faqMatch = content.match(/## .*(?:FAQ|Frequently Asked Questions)\s*\n([\s\S]*?)(?=\n## [A-Z]|$)/i);
  if (!faqMatch) return items;
  
  const faqContent = faqMatch[1];
  
  // Match Q&A pairs: **Question?**\nAnswer text
  const qaRegex = /\*\*([^*]+\??)\*\*\s*\n([^*\n][^\n]*(?:\n(?!\*\*)[^\n]+)*)/g;
  let match;
  
  while ((match = qaRegex.exec(faqContent)) !== null) {
    const question = match[1].trim();
    const answer = match[2].trim().replace(/\n+/g, ' ');
    
    if (question && answer) {
      items.push({ question, answer });
    }
  }
  
  return items;
};

// Helper to remove FAQ section from markdown for custom rendering
export const removeFAQSection = (content: string): string => {
  return content.replace(/## .*(?:FAQ|Frequently Asked Questions)\s*\n([\s\S]*?)(?=\n## [A-Z]|$)/i, "");
};
