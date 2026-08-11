import { browser } from '$app/environment';

/**
 * Cookie consent for the public site (RGPD/GDPR, ePrivacy).
 *
 * Today Germinal only sets "strictly necessary" cookies (session auth cookie,
 * CSRF token cookie — see src/hooks.server.ts) which are exempt from consent
 * under Article 5(3) of the ePrivacy Directive. This module exists so that any
 * FUTURE non-essential cookie or tracking script (analytics, marketing, etc.)
 * has a single, consistent gate to check before it sets anything — see
 * `canUseNonEssentialCookies()` below.
 */

export type CookieConsentChoice = 'accepted' | 'essential-only';

const STORAGE_KEY = 'germinal-cookie-consent';

function readStoredChoice(): CookieConsentChoice | null {
	if (!browser) return null;
	try {
		const value = localStorage.getItem(STORAGE_KEY);
		return value === 'accepted' || value === 'essential-only' ? value : null;
	} catch {
		// localStorage can throw in some privacy modes / disabled-storage contexts.
		// Fail safe: treat as "no choice recorded" (banner will show, nothing non-essential is set).
		return null;
	}
}

class CookieConsentState {
	choice = $state<CookieConsentChoice | null>(readStoredChoice());

	/** Has the visitor made (and had persisted) a consent choice yet? */
	get hasChosen() {
		return this.choice !== null;
	}

	/** True only if the visitor explicitly accepted non-essential cookies. */
	get hasNonEssentialConsent() {
		return this.choice === 'accepted';
	}

	set(choice: CookieConsentChoice) {
		this.choice = choice;
		if (browser) {
			try {
				localStorage.setItem(STORAGE_KEY, choice);
			} catch {
				// Storage unavailable — the choice still applies for this page load via in-memory state,
				// it just won't persist across visits.
			}
		}
	}

	/** Test-only: reset in-memory state without touching localStorage. */
	_resetForTests() {
		this.choice = null;
	}
}

export const cookieConsent = new CookieConsentState();

/**
 * Gate to call before setting any NON-ESSENTIAL cookie or loading any tracking/analytics
 * script on the public site. Strictly-necessary cookies (session, CSRF) must never be
 * gated by this — they are exempt from consent requirements.
 */
export function canUseNonEssentialCookies(): boolean {
	return cookieConsent.hasNonEssentialConsent;
}
