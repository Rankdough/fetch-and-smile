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

// High-contrast coral/salmon for buttons - works great against dark backgrounds
const BUTTON_COLOR = "#FF6B6B";
const BUTTON_HOVER = "#FF5252";

export const CTABanner = ({ headline, description, buttonText, url, brandColors }: CTABannerProps) => {
  // Use dark background from palette, or default dark navy
  const bgGradient = brandColors?.background 
    ? `linear-gradient(135deg, ${brandColors.background} 0%, ${brandColors.primary} 100%)`
    : "linear-gradient(135deg, #1E293B 0%, #334155 100%)";
  
  // Headline in accent color (coral/salmon for visibility)
  const headlineColor = brandColors?.accent || BUTTON_COLOR;

  return (
    <div 
      data-cta-banner="true"
      data-brand-primary={brandColors?.primary || ""}
      data-brand-accent={brandColors?.accent || ""}
      style={{
        background: bgGradient,
        borderRadius: "16px",
        padding: "40px 32px",
        textAlign: "center" as const,
        margin: "32px 0",
        fontFamily: "inherit"
      }}
    >
      <div 
        data-cta-headline="true"
        style={{
          fontSize: "1.35em",
          fontWeight: 700,
          letterSpacing: "0.05em",
          marginBottom: "12px",
          color: headlineColor,
          fontFamily: "inherit",
          textTransform: "uppercase" as const
        }}
      >
        {headline}
      </div>
      <div 
        data-cta-description="true"
        style={{
          fontSize: "1em",
          marginBottom: "24px",
          color: "white",
          opacity: 0.9,
          fontFamily: "inherit",
          maxWidth: "500px",
          marginLeft: "auto",
          marginRight: "auto",
          lineHeight: 1.6
        }}
      >
        {description}
      </div>
      <a 
        href={url} 
        target="_blank" 
        rel="noopener noreferrer"
        data-cta-button="true"
        style={{
          display: "inline-block",
          background: brandColors?.accent || BUTTON_COLOR,
          color: "#1a1a1a",
          fontWeight: 700,
          fontSize: "0.95em",
          padding: "14px 36px",
          borderRadius: "9999px",
          textDecoration: "none",
          fontFamily: "inherit",
          textTransform: "uppercase" as const,
          letterSpacing: "0.05em",
          boxShadow: "0 4px 14px rgba(255, 107, 107, 0.4)"
        }}
      >
        {buttonText} →
      </a>
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
  const bgGradient = brandColors?.background 
    ? `linear-gradient(135deg, ${brandColors.background} 0%, ${brandColors.primary} 100%)`
    : "linear-gradient(135deg, #1E293B 0%, #334155 100%)";
  
  const headlineColor = brandColors?.accent || BUTTON_COLOR;
  const buttonColor = brandColors?.accent || BUTTON_COLOR;

  return `
<div style="background: ${bgGradient}; border-radius: 16px; padding: 40px 32px; text-align: center; margin: 32px 0; font-family: inherit;">
  <div style="font-size: 1.35em; font-weight: 700; letter-spacing: 0.05em; margin-bottom: 12px; color: ${headlineColor}; font-family: inherit; text-transform: uppercase;">${headline}</div>
  <div style="font-size: 1em; margin-bottom: 24px; color: white; opacity: 0.9; font-family: inherit; max-width: 500px; margin-left: auto; margin-right: auto; line-height: 1.6;">${description}</div>
  <a href="${url}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background: ${buttonColor}; color: #1a1a1a; font-weight: 700; font-size: 0.95em; padding: 14px 36px; border-radius: 9999px; text-decoration: none; font-family: inherit; text-transform: uppercase; letter-spacing: 0.05em; box-shadow: 0 4px 14px rgba(255, 107, 107, 0.4);">${buttonText} →</a>
</div>`;
};
