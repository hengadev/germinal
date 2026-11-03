/**
 * The Admin navigation, shared by the desktop sidebar and the mobile bar
 * and ☰ menu: one list, in one order, grouped under small headings.
 */
import {
	LayoutDashboard,
	Calendar,
	Users,
	Ticket,
	BarChart3,
	ClipboardList,
	Settings2,
	ScrollText,
	AlertTriangle,
	Contact,
	Gift,
	Inbox
} from 'lucide-svelte';

export interface AdminNavItem {
	href: string;
	label: string;
	/** Shorter label for the mobile bottom bar. */
	shortLabel?: string;
	icon: typeof import('lucide-svelte').Icon;
	/** Which count from the layout data shows as a badge. */
	badge?: 'moneyAlertsTotal' | 'newDemandesCount';
}

export interface AdminNavGroup {
	label: string;
	items: AdminNavItem[];
}

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
	{
		label: 'Au quotidien',
		items: [
			{ href: '/admin', label: 'Tableau de bord', shortLabel: 'Accueil', icon: LayoutDashboard },
			{ href: '/admin/a-traiter', label: 'À traiter', icon: AlertTriangle, badge: 'moneyAlertsTotal' },
			{ href: '/admin/demandes', label: 'Demandes', icon: Inbox, badge: 'newDemandesCount' }
		]
	},
	{
		label: 'Activité',
		items: [
			{ href: '/admin/events', label: 'Événements', icon: Calendar },
			{ href: '/admin/reservations', label: 'Réservations', icon: Ticket },
			{ href: '/admin/clients', label: 'Clients', icon: Contact },
			{ href: '/admin/cartes-cadeaux', label: 'Cartes cadeaux', icon: Gift }
		]
	},
	{
		label: 'Résultats',
		items: [
			{ href: '/admin/bilan', label: 'Bilan', icon: ClipboardList },
			{ href: '/admin/analytics', label: 'Analytiques', icon: BarChart3 }
		]
	},
	{
		label: 'Administration',
		items: [
			{ href: '/admin/team', label: 'Équipe', icon: Users },
			{ href: '/admin/settings', label: 'Paramètres', icon: Settings2 },
			{ href: '/admin/audit-log', label: "Journal d'audit", icon: ScrollText }
		]
	}
];

/** The mobile bottom bar: the pages reached most often. Everything else
 * is in the ☰ menu, under the same headings as the sidebar. */
export const ADMIN_MOBILE_BAR = ['/admin', '/admin/events', '/admin/reservations', '/admin/clients', '/admin/demandes'];

export function isAdminNavActive(href: string, currentPath: string): boolean {
	if (href === '/admin') return currentPath === '/admin' || currentPath === '/admin/';
	return currentPath.startsWith(href);
}
