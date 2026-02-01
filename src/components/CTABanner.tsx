interface CTABannerProps {
  headline: string;
  description: string;
  buttonText: string;
  url: string;
  brandColors?: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  } | null;
}

// High-contrast coral for buttons - pops against dark backgrounds
const BUTTON_COLOR = "#FF6B6B";

export const CTABanner = ({ headline, description, buttonText, url, brandColors }: CTABannerProps) => {
  // Dark navy gradient background matching reference
  const bgGradient = "linear-gradient(135deg, #1a2744 0%, #2d3a52 50%, #1a2744 100%)";
  
  // Headline in coral/salmon
  const headlineColor = brandColors?.accent || BUTTON_COLOR;
  const buttonBg = brandColors?.accent || BUTTON_COLOR;

  return (
    <div 
      data-cta-banner="true"
      data-brand-primary={brandColors?.primary || ""}
      data-brand-accent={brandColors?.accent || ""}
      style={{
        background: bgGradient,
        borderRadius: "16px",
        padding: "48px 32px 40px",
        textAlign: "center" as const,
        margin: "32px 0",
        fontFamily: "inherit"
      }}
    >
      {/* Headline */}
      <div 
        data-cta-headline="true"
        style={{
          fontSize: "1.25em",
          fontWeight: 700,
          letterSpacing: "0.08em",
          marginBottom: "16px",
          color: headlineColor,
          fontFamily: "inherit",
          textTransform: "uppercase" as const
        }}
      >
        {headline}
      </div>
      
      {/* Description */}
      <div 
        data-cta-description="true"
        style={{
          fontSize: "1em",
          marginBottom: "28px",
          color: "white",
          fontFamily: "inherit",
          maxWidth: "480px",
          marginLeft: "auto",
          marginRight: "auto",
          lineHeight: 1.7,
          opacity: 0.95
        }}
      >
        {description}
      </div>
      
      {/* Button - high contrast */}
      <a 
        href={url} 
        target="_blank" 
        rel="noopener noreferrer"
        data-cta-button="true"
        style={{
          display: "inline-block",
          background: buttonBg,
          color: "#1a1a1a",
          fontWeight: 700,
          fontSize: "0.9em",
          padding: "16px 48px",
          borderRadius: "9999px",
          textDecoration: "none",
          fontFamily: "inherit",
          textTransform: "uppercase" as const,
          letterSpacing: "0.06em",
          boxShadow: `0 8px 24px rgba(255, 107, 107, 0.35), 0 4px 8px rgba(0, 0, 0, 0.2)`,
          border: "none"
        }}
      >
        {buttonText} →
      </a>
      
      {/* Tagline below button */}
      <div 
        data-cta-tagline="true"
        style={{
          marginTop: "20px",
          fontSize: "0.85em",
          color: "rgba(255, 255, 255, 0.6)",
          fontFamily: "inherit",
          letterSpacing: "0.02em"
        }}
      >
        Free design assistance • Fast turnaround • Team discounts
      </div>
    </div>
  );
};

export const generateCTAHtml = (
  headline: string, 
  description: string, 
  buttonText: string, 
  url: string,
  brandColors?: { primary: string; secondary: string; accent: string; background?: string } | null
): string => {
  const bgGradient = "linear-gradient(135deg, #1a2744 0%, #2d3a52 50%, #1a2744 100%)";
  const headlineColor = brandColors?.accent || BUTTON_COLOR;
  const buttonColor = brandColors?.accent || BUTTON_COLOR;

  return `
<div style="background: ${bgGradient}; border-radius: 16px; padding: 48px 32px 40px; text-align: center; margin: 32px 0; font-family: inherit;">
  <div style="font-size: 1.25em; font-weight: 700; letter-spacing: 0.08em; margin-bottom: 16px; color: ${headlineColor}; font-family: inherit; text-transform: uppercase;">${headline}</div>
  <div style="font-size: 1em; margin-bottom: 28px; color: white; font-family: inherit; max-width: 480px; margin-left: auto; margin-right: auto; line-height: 1.7; opacity: 0.95;">${description}</div>
  <a href="${url}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background: ${buttonColor}; color: #1a1a1a; font-weight: 700; font-size: 0.9em; padding: 16px 48px; border-radius: 9999px; text-decoration: none; font-family: inherit; text-transform: uppercase; letter-spacing: 0.06em; box-shadow: 0 8px 24px rgba(255, 107, 107, 0.35), 0 4px 8px rgba(0, 0, 0, 0.2);">${buttonText} →</a>
  <div style="margin-top: 20px; font-size: 0.85em; color: rgba(255, 255, 255, 0.6); font-family: inherit; letter-spacing: 0.02em;">Free design assistance • Fast turnaround • Team discounts</div>
</div>`;
};
