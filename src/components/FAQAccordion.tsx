import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQAccordionProps {
  items: FAQItem[];
}

export const FAQAccordion = ({ items }: FAQAccordionProps) => {
  const [expandedItem, setExpandedItem] = useState<number | null>(null);

  if (!items || items.length === 0) return null;

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3 my-6">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">
            ?
          </span>
          Frequently Asked Questions
        </h4>
        <span className="text-xs text-muted-foreground">
          {items.length} questions
        </span>
      </div>

      <div className="space-y-1">
        {items.map((item, index) => (
          <div
            key={index}
            className="rounded-md border bg-background transition-all border-border hover:border-muted-foreground/30"
          >
            {/* Question row */}
            <div 
              className="flex items-center gap-2 px-2 py-1.5 cursor-pointer"
              onClick={() => setExpandedItem(expandedItem === index ? null : index)}
            >
              <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center text-[10px] font-bold">
                {index + 1}
              </div>
              <span className="flex-1 text-xs font-semibold">
                {item.question}
              </span>
              <ChevronDown className={cn(
                "h-3 w-3 flex-shrink-0 text-muted-foreground transition-transform",
                expandedItem === index && "rotate-180"
              )} />
            </div>
            
            {/* Answer - only when expanded */}
            {expandedItem === index && (
              <div className="px-2 pb-2 pl-9">
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {item.answer}
                </p>
              </div>
            )}
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
