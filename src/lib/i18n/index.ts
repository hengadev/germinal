import { register, init, getLocaleFromNavigator } from 'svelte-i18n';

register('en', () => import('./locales/en.json'));
register('fr', () => import('./locales/fr.json'));

export function setupI18n() {
	init({
		fallbackLocale: 'fr',
		initialLocale: getLocaleFromNavigator() || 'fr'
	});
}
