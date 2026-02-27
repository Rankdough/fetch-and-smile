interface CTABannerProps {
  headline: string;
  description: string;
  buttonText: string;
  url: string;
  tagline?: string;
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

export const CTABanner = ({ headline, description, buttonText, url, tagline, brandColors }: CTABannerProps) => {
  // Dark navy gradient background matching reference
  const bgGradient = "linear-gradient(135deg, #1a2744 0%, #2d3a52 50%, #1a2744 100%)";
  
  // Headline in coral/salmon
  const headlineColor = brandColors?.accent || BUTTON_COLOR;
  const buttonBg = brandColors?.accent || BUTTON_COLOR;

  const displayTagline = tagline || "";

  return (
    <div 
      data-cta-banner="true"
      data-brand-primary={brandColors?.primary || ""}
      data-brand-accent={brandColors?.accent || ""}
      style={{
        background: bgGradient,
        borderRadius: "16px",
        padding: "36px 32px 28px",
        textAlign: "center" as const,
        margin: "32px 0",
        fontFamily: "inherit"
      }}
    >
      {/* Headline */}
      <div 
        data-cta-headline="true"
        style={{
          fontSize: "1.1em",
          fontWeight: 700,
          letterSpacing: "0.08em",
          marginBottom: "12px",
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
          fontSize: "0.95em",
          marginBottom: "20px",
          color: "white",
          fontFamily: "inherit",
          maxWidth: "480px",
          marginLeft: "auto",
          marginRight: "auto",
          lineHeight: 1.5,
          opacity: 0.9
        }}
        dangerouslySetInnerHTML={{ __html: description }}
      />
      
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
          fontSize: "0.85em",
          padding: "14px 40px",
          borderRadius: "9999px",
          textDecoration: "none",
          fontFamily: "inherit",
          textTransform: "uppercase" as const,
          letterSpacing: "0.06em",
          boxShadow: `0 8px 24px rgba(255, 107, 107, 0.35), 0 4px 8px rgba(0, 0, 0, 0.2)`,
          border: "none"
        }}
      >
        {buttonText}
      </a>
      
      {/* Tagline below button - only show if provided */}
      {displayTagline && (
        <div 
          data-cta-tagline="true"
          style={{
            marginTop: "14px",
            fontSize: "0.8em",
            color: "rgba(255, 255, 255, 0.6)",
            fontFamily: "inherit",
            letterSpacing: "0.02em"
          }}
        >
          {displayTagline}
        </div>
      )}
    </div>
  );
};

export const generateCTAHtml = (
  headline: string, 
  description: string, 
  buttonText: string, 
  url: string,
  brandColors?: { primary: string; secondary: string; accent: string; background?: string } | null,
  tagline?: string
): string => {
  const bgGradient = "linear-gradient(135deg, #1a2744 0%, #2d3a52 50%, #1a2744 100%)";
  const headlineColor = brandColors?.accent || BUTTON_COLOR;
  const buttonColor = brandColors?.accent || BUTTON_COLOR;
  const displayTagline = tagline || "";

  // Note: data-cta-banner attribute is added for identification during export
  // The anchor has data-cta-button to prevent link styling from overwriting button styles
  return `
<div data-cta-banner="true" style="background: ${bgGradient}; border-radius: 16px; padding: 36px 32px 28px; text-align: center; margin: 32px 0; font-family: inherit;">
  <div data-cta-headline="true" style="font-size: 1.1em; font-weight: 700; letter-spacing: 0.08em; margin-bottom: 12px; color: ${headlineColor}; font-family: inherit; text-transform: uppercase;">${headline}</div>
  <div data-cta-description="true" style="font-size: 0.95em; margin-bottom: 20px; color: white; font-family: inherit; max-width: 480px; margin-left: auto; margin-right: auto; line-height: 1.5; opacity: 0.9;">${description}</div>
  <a href="${url}" target="_blank" rel="noopener noreferrer" data-cta-button="true" style="display: inline-block; background: ${buttonColor}; color: #1a1a1a; font-weight: 700; font-size: 0.85em; padding: 14px 40px; border-radius: 9999px; text-decoration: none; font-family: inherit; text-transform: uppercase; letter-spacing: 0.06em; box-shadow: 0 8px 24px rgba(255, 107, 107, 0.35), 0 4px 8px rgba(0, 0, 0, 0.2);">${buttonText}</a>
  <div data-cta-tagline="true" style="margin-top: 14px; font-size: 0.8em; color: rgba(255, 255, 255, 0.6); font-family: inherit; letter-spacing: 0.02em;">${displayTagline}</div>
</div>`;
};
