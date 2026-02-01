interface CTABannerProps {
  headline: string;
  description: string;
  buttonText: string;
  url: string;
}

export const CTABanner = ({ headline, description, buttonText, url }: CTABannerProps) => {
  return (
    <div 
      data-cta-banner="true"
      style={{
        background: "linear-gradient(135deg, #4a2875 0%, #5a2070 100%)",
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
          color: "#d8a8e8",
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
          background: "linear-gradient(135deg, #e04060 0%, #c04080 100%)",
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

export const generateCTAHtml = (headline: string, description: string, buttonText: string, url: string): string => {
  return `
<div style="background: linear-gradient(135deg, #4a2875 0%, #5a2070 100%); border-radius: 12px; padding: 32px; text-align: center; margin: 32px 0; font-family: inherit;">
  <div style="font-size: 1.25em; font-weight: 700; letter-spacing: 0.025em; margin-bottom: 8px; color: #d8a8e8; font-family: inherit;">${headline}</div>
  <div style="font-size: 0.95em; margin-bottom: 20px; color: white; opacity: 0.95; font-family: inherit;">${description}</div>
  <a href="${url}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background: linear-gradient(135deg, #e04060 0%, #c04080 100%); color: white; font-weight: 600; padding: 12px 32px; border-radius: 9999px; text-decoration: none; font-family: inherit;">${buttonText} →</a>
</div>`;
};
