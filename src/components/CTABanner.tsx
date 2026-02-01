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

// Helper to darken/lighten a hex color for gradients
const adjustColor = (hex: string, amount: number): string => {
  // If it's an HSL color, just return the original
  if (hex.startsWith('hsl')) return hex;
  
  // Ensure hex format
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  
  const num = parseInt(hex, 16);
  let r = (num >> 16) + amount;
  let g = ((num >> 8) & 0x00FF) + amount;
  let b = (num & 0x0000FF) + amount;
  
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  
  return '#' + (b | (g << 8) | (r << 16)).toString(16).padStart(6, '0');
};

// Helper to get a lighter version for headline text
const getLighterColor = (hex: string): string => {
  if (hex.startsWith('hsl')) return '#e0e0e0';
  return adjustColor(hex, 100);
};

export const CTABanner = ({ headline, description, buttonText, url, brandColors }: CTABannerProps) => {
  // Default purple theme, or use brand colors if provided
  const bgGradient = brandColors?.primary 
    ? `linear-gradient(135deg, ${brandColors.primary} 0%, ${brandColors.secondary || adjustColor(brandColors.primary, -20)} 100%)`
    : "linear-gradient(135deg, #4a2875 0%, #5a2070 100%)";
  
  const buttonGradient = brandColors?.accent 
    ? `linear-gradient(135deg, ${brandColors.accent} 0%, ${adjustColor(brandColors.accent, -30)} 100%)`
    : "linear-gradient(135deg, #e04060 0%, #c04080 100%)";
  
  const headlineColor = brandColors?.primary 
    ? getLighterColor(brandColors.primary)
    : "#d8a8e8";

  return (
    <div 
      data-cta-banner="true"
      data-brand-primary={brandColors?.primary || ""}
      data-brand-accent={brandColors?.accent || ""}
      style={{
        background: bgGradient,
        borderRadius: "12px",
        padding: "32px",
        textAlign: "center" as const,
        margin: "32px 0",
        fontFamily: "inherit"
      }}
    >
      <div 
        data-cta-headline="true"
        style={{
          fontSize: "1.25em",
          fontWeight: 700,
          letterSpacing: "0.025em",
          marginBottom: "8px",
          color: headlineColor,
          fontFamily: "inherit"
        }}
      >
        {headline}
      </div>
      <div 
        data-cta-description="true"
        style={{
          fontSize: "0.95em",
          marginBottom: "20px",
          color: "white",
          opacity: 0.95,
          fontFamily: "inherit"
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
          background: buttonGradient,
          color: "white",
          fontWeight: 600,
          padding: "12px 32px",
          borderRadius: "9999px",
          textDecoration: "none",
          fontFamily: "inherit"
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
  brandColors?: { primary: string; secondary: string; accent: string } | null
): string => {
  const bgGradient = brandColors?.primary 
    ? `linear-gradient(135deg, ${brandColors.primary} 0%, ${brandColors.secondary || brandColors.primary} 100%)`
    : "linear-gradient(135deg, #4a2875 0%, #5a2070 100%)";
  
  const buttonGradient = brandColors?.accent 
    ? `linear-gradient(135deg, ${brandColors.accent} 0%, ${brandColors.accent} 100%)`
    : "linear-gradient(135deg, #e04060 0%, #c04080 100%)";
  
  const headlineColor = brandColors?.primary 
    ? "#e0e0e0"
    : "#d8a8e8";

  return `
<div style="background: ${bgGradient}; border-radius: 12px; padding: 32px; text-align: center; margin: 32px 0; font-family: inherit;">
  <div style="font-size: 1.25em; font-weight: 700; letter-spacing: 0.025em; margin-bottom: 8px; color: ${headlineColor}; font-family: inherit;">${headline}</div>
  <div style="font-size: 0.95em; margin-bottom: 20px; color: white; opacity: 0.95; font-family: inherit;">${description}</div>
  <a href="${url}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background: ${buttonGradient}; color: white; font-weight: 600; padding: 12px 32px; border-radius: 9999px; text-decoration: none; font-family: inherit;">${buttonText} →</a>
</div>`;
};
