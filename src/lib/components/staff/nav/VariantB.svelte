<script lang="ts">
	/**
	 * Variant B — Bouton flottant (issue 031): Événements | Tâches | Compte
	 * in the bar, and a round black Scan button floating above the bar's
	 * right side during a Day (hidden when there is no scan target, and on
	 * the Scanner tab itself).
	 */
	import { page } from "$app/state";
	import { CalendarDays, KeyRound, ListChecks, ScanLine } from "lucide-svelte";

	let { scanHref }: { scanHref: string | null } = $props();

	const onScannerTab = $derived(
		page.url.searchParams.get("onglet") === "scanner" &&
			page.url.pathname.startsWith("/staff/events")
	);

	function tabClass(active: boolean): string {
		return active
			? "flex-1 flex flex-col items-center justify-center gap-1 pt-3 pb-6 min-h-[44px] text-foreground"
			: "flex-1 flex flex-col items-center justify-center gap-1 pt-3 pb-6 min-h-[44px] text-muted-foreground hover:text-foreground-alt";
	}
</script>

<div class="flex-shrink-0 relative z-50">
	{#if scanHref && !onScannerTab}
		<a
			href={scanHref}
			class="absolute right-4 -top-7 w-14 h-14 rounded-full bg-foreground text-background shadow-lg flex items-center justify-center"
			aria-label="Scanner un billet"
		>
			<ScanLine size={24} />
		</a>
	{/if}

	<nav
		class="bg-background border-t border-border-card pb-[env(safe-area-inset-bottom)]"
		aria-label="Navigation mobile"
	>
		<div class="flex items-stretch">
			<a
				href="/staff?liste"
				class={tabClass(page.url.pathname === '/staff' || page.url.pathname.startsWith('/staff/events'))}
			>
				<CalendarDays size={20} />
				<span class="text-[10px] font-medium">Événements</span>
			</a>
			<a href="/staff/taches" class={tabClass(page.url.pathname === '/staff/taches')}>
				<ListChecks size={20} />
				<span class="text-[10px] font-medium">Tâches</span>
			</a>
			<a
				href="/staff/change-password"
				class={tabClass(page.url.pathname === '/staff/change-password')}
			>
				<KeyRound size={20} />
				<span class="text-[10px] font-medium">Compte</span>
			</a>
		</div>
	</nav>
</div>
