import { register, init, getLocaleFromNavigator } from 'svelte-i18n';

register('en', () => import('./locales/en.json'));
register('fr', () => import('./locales/fr.json'));

/**
 * The site's language from the browser's: only `fr` or `en`, never a region
 * tag. Pages compare the locale to 'fr' or 'en' to pick an Event's texts, so a
 * `fr-FR` browser would otherwise get the English texts under French menus.
 */
export function siteLocale(navigatorLocale: string | null | undefined): 'fr' | 'en' {
	return navigatorLocale?.toLowerCase().startsWith('en') ? 'en' : 'fr';
}

export function setupI18n() {
	init({
		fallbackLocale: 'fr',
		initialLocale: siteLocale(getLocaleFromNavigator())
	});
}
