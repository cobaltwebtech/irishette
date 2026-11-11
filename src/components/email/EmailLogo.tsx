import { Img, Link } from 'react-email';

/** Logo props every email receives from src/lib/email/email-service.ts. */
export interface EmailBrandProps {
	/** Absolute URL of the logo image on the deployed host (src/lib/site.ts LOGO_PATH). */
	logoUrl: string;
	/** Public site URL the logo links to (src/lib/site.ts SITE_URL). */
	siteUrl: string;
}

interface EmailLogoProps extends EmailBrandProps {
	/** Display size in px (the file is larger, for sharp high-density screens). */
	size?: number;
}

/** The Irishette logo, centered and linked to the site. */
export function EmailLogo({ logoUrl, siteUrl, size = 96 }: EmailLogoProps) {
	return (
		<Link href={siteUrl}>
			<Img
				alt="Irishette"
				src={logoUrl}
				width={size}
				height={size}
				style={{ display: 'block', margin: '0 auto' }}
			/>
		</Link>
	);
}
