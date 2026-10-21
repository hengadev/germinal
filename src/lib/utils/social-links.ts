/**
 * Talent social links (instagram, linkedin, twitter, website) are absolute
 * http(s) URLs, nothing else: a `javascript:` or `data:` value must never be
 * stored, nor rendered as a link. The Talent schema and the public Talent
 * page share this check.
 */

export const SOCIAL_LINK_KEYS = ['instagram', 'linkedin', 'twitter', 'website'] as const;
export type SocialLinkKey = (typeof SOCIAL_LINK_KEYS)[number];
export type SocialLinks = Partial<Record<SocialLinkKey, string>>;

/** Whether a value is an absolute http:// or https:// URL. */
export function isHttpUrl(value: unknown): value is string {
	if (typeof value !== 'string') return false;
	try {
		const url = new URL(value);
		return url.protocol === 'http:' || url.protocol === 'https:';
	} catch {
		return false;
	}
}

/**
 * The renderable social links of a stored `socialLinks` JSON string: only
 * the known keys, only http(s) values. Anything else (legacy values,
 * unparseable JSON) is dropped rather than rendered.
 */
export function safeSocialLinks(stored: string | null | undefined): SocialLinks {
	if (!stored) return {};
	let parsed: unknown;
	try {
		parsed = JSON.parse(stored);
	} catch {
		return {};
	}
	if (!parsed || typeof parsed !== 'object') return {};

	const links: SocialLinks = {};
	for (const key of SOCIAL_LINK_KEYS) {
		const value = (parsed as Record<string, unknown>)[key];
		if (isHttpUrl(value)) links[key] = value;
	}
	return links;
}
