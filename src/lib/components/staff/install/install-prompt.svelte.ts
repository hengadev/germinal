/**
 * État partagé de l'offre d'installation Staff (issue 062).
 *
 * L'évènement beforeinstallprompt ne se déclenche qu'une fois, tôt :
 * le module l'attrape dès son import pour que la bannière et l'entrée
 * « Installer l'app » du menu ⋮ puissent toutes deux l'utiliser.
 */
import { browser } from '$app/environment';
import { detectInstallPlatform, type InstallPlatform } from './detect';

const DISMISSED_KEY = 'staff-install-dismissed';
const DISMISSED_MS = 14 * 24 * 60 * 60 * 1000; // 14 jours

export const staffInstall = $state({
	platform: 'other' as InstallPlatform,
	deferredPrompt: null as (Event & {
		prompt(): void;
		userChoice: Promise<{ outcome: string }>;
	}) | null,
	showIOSSheet: false
});

export function initStaffInstall(): void {
	if (!browser) return;
	const standalone =
		window.matchMedia('(display-mode: standalone)').matches ||
		// iOS Safari signale le mode autonome via navigator.standalone.
		(navigator as unknown as { standalone?: boolean }).standalone === true;
	staffInstall.platform = detectInstallPlatform(
		navigator.userAgent,
		standalone,
		staffInstall.deferredPrompt !== null
	);
	window.addEventListener('beforeinstallprompt', (event) => {
		event.preventDefault();
		staffInstall.deferredPrompt = event as typeof staffInstall.deferredPrompt;
		if (staffInstall.platform !== 'standalone') staffInstall.platform = 'android';
	});
	window.addEventListener('appinstalled', () => {
		staffInstall.deferredPrompt = null;
		staffInstall.platform = 'standalone';
		staffInstall.showIOSSheet = false;
	});
}

/** L'offre est-elle écartée depuis moins de 14 jours ? */
export function isStaffInstallDismissed(now = Date.now()): boolean {
	if (!browser) return true;
	try {
		const dismissed = localStorage.getItem(DISMISSED_KEY);
		return !!dismissed && now - parseInt(dismissed, 10) < DISMISSED_MS;
	} catch {
		return false;
	}
}

/** Écarte la bannière pour 14 jours. */
export function dismissStaffInstall(): void {
	if (!browser) return;
	try {
		localStorage.setItem(DISMISSED_KEY, Date.now().toString());
	} catch {
		/* stockage indisponible : ignoré */
	}
}

/** Lance l'invite du navigateur (Android/Chromium), si disponible. */
export async function promptStaffInstall(): Promise<void> {
	const deferred = staffInstall.deferredPrompt;
	if (!deferred) return;
	deferred.prompt();
	await deferred.userChoice;
	staffInstall.deferredPrompt = null;
}

/** Ouvre la feuille d'instructions iOS, ou l'invite du navigateur. */
export function openStaffInstall(): void {
	if (staffInstall.platform === 'ios') {
		staffInstall.showIOSSheet = true;
	} else {
		void promptStaffInstall();
	}
}

/** L'entrée « Installer l'app » du menu ⋮ est-elle pertinente ? */
export function canOfferStaffInstall(): boolean {
	return staffInstall.platform === 'android' || staffInstall.platform === 'ios';
}
