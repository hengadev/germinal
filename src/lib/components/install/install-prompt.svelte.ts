/**
 * État partagé de l'offre d'installation des apps internes (Staff, Admin ;
 * issue 062 puis 075).
 *
 * L'évènement beforeinstallprompt ne se déclenche qu'une fois, tôt :
 * le module l'attrape dès son import pour que la carte flottante et l'entrée
 * « Installer l'app » du menu ⋮ puissent toutes deux l'utiliser.
 */
import { browser } from '$app/environment';
import { detectInstallPlatform, type InstallPlatform } from './detect';

const DISMISSED_KEY = 'staff-install-dismissed';
const DISMISSED_MS = 14 * 24 * 60 * 60 * 1000; // 14 jours

export const installOffer = $state({
	platform: 'other' as InstallPlatform,
	deferredPrompt: null as (Event & {
		prompt(): void;
		userChoice: Promise<{ outcome: string }>;
	}) | null,
	showIOSSheet: false
});

// The browser fires beforeinstallprompt once, early, possibly before any
// component mounts: listen from the module's import.
if (browser) {
	window.addEventListener('beforeinstallprompt', (event) => {
		event.preventDefault();
		installOffer.deferredPrompt = event as typeof installOffer.deferredPrompt;
		if (installOffer.platform !== 'standalone') installOffer.platform = 'android';
	});
	window.addEventListener('appinstalled', () => {
		installOffer.deferredPrompt = null;
		installOffer.platform = 'standalone';
		installOffer.showIOSSheet = false;
	});
}

export function initInstall(): void {
	if (!browser) return;
	const standalone =
		window.matchMedia('(display-mode: standalone)').matches ||
		// iOS Safari signale le mode autonome via navigator.standalone.
		(navigator as unknown as { standalone?: boolean }).standalone === true;
	installOffer.platform = detectInstallPlatform(
		navigator.userAgent,
		standalone,
		installOffer.deferredPrompt !== null
	);
}

/** L'offre est-elle écartée depuis moins de 14 jours ? */
export function isInstallDismissed(now = Date.now()): boolean {
	if (!browser) return true;
	try {
		const dismissed = localStorage.getItem(DISMISSED_KEY);
		return !!dismissed && now - parseInt(dismissed, 10) < DISMISSED_MS;
	} catch {
		return false;
	}
}

/** Écarte l'offre pour 14 jours. */
export function dismissInstall(): void {
	if (!browser) return;
	try {
		localStorage.setItem(DISMISSED_KEY, Date.now().toString());
	} catch {
		/* stockage indisponible : ignoré */
	}
}

/** Lance l'invite du navigateur (Android/Chromium), si disponible. */
export async function promptInstall(): Promise<void> {
	const deferred = installOffer.deferredPrompt;
	if (!deferred) return;
	deferred.prompt();
	await deferred.userChoice;
	installOffer.deferredPrompt = null;
}

/** Ouvre la feuille d'instructions iOS, ou l'invite du navigateur. */
export function openInstall(): void {
	if (installOffer.platform === 'ios') {
		installOffer.showIOSSheet = true;
	} else {
		void promptInstall();
	}
}

/** L'offre est-elle possible ? Sur Android, seulement une fois que le
 * navigateur a fourni son invite (sinon le bouton ne ferait rien). */
export function canOfferInstall(): boolean {
	return (
		(installOffer.platform === 'android' && installOffer.deferredPrompt !== null) ||
		installOffer.platform === 'ios'
	);
}
