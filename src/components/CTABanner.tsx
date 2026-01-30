interface CTABannerProps {
  headline: string;
  description: string;
  buttonText: string;
  url: string;
}

export const CTABanner = ({ headline, description, buttonText, url }: CTABannerProps) => {
  return (
    <div className="cta-banner">
      <div className="cta-headline">{headline}</div>
      <div className="cta-description">{description}</div>
      <a href={url} target="_blank" rel="noopener noreferrer" className="cta-button">
        {buttonText} →
      </a>
    </div>
  );
};

export const generateCTAHtml = (headline: string, description: string, buttonText: string, url: string): string => {
  return `
<div style="background: linear-gradient(135deg, #4a2875 0%, #5a2070 100%); border-radius: 12px; padding: 32px; text-align: center; margin: 32px 0;">
  <div style="font-size: 1.25rem; font-weight: 700; letter-spacing: 0.025em; margin-bottom: 8px; color: #d8a8e8;">${headline}</div>
  <div style="font-size: 0.95rem; margin-bottom: 20px; color: white; opacity: 0.95;">${description}</div>
  <a href="${url}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background: linear-gradient(135deg, #e04060 0%, #c04080 100%); color: white; font-weight: 600; padding: 12px 32px; border-radius: 9999px; text-decoration: none;">${buttonText} →</a>
</div>`;
};
