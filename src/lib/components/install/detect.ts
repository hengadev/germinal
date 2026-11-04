/**
 * Détection pure de la plateforme d'installation (issue 062).
 *
 * - « standalone » : l'app est déjà installée (affichage autonome).
 * - « android » : navigateur Chromium sous Android ( évènement
 *   beforeinstallprompt, bannière « Installer »).
 * - « ios » : Safari iOS, qui n'a pas d'évènement : feuille
 *   « Partager → Sur l'écran d'accueil ».
 * - « other » : ni l'un ni l'autre.
 */
export type InstallPlatform = 'standalone' | 'android' | 'ios' | 'other';

export function detectInstallPlatform(
	userAgent: string,
	standalone: boolean,
	hasPrompt: boolean
): InstallPlatform {
	if (standalone) return 'standalone';
	if (hasPrompt) return 'android';
	const ua = userAgent.toLowerCase();
	const isIOS = /iphone|ipad|ipod/.test(ua) || (ua.includes('macintosh') && ua.includes('touch'));
	const isChromium = /android|chrome|chromium|edg\//.test(ua);
	if (isIOS) return 'ios';
	if (isChromium) return 'android';
	return 'other';
}
