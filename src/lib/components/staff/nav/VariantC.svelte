<script lang="ts">
	/**
	 * Variant C — Bandeau scan (issue 031): Événements | Tâches | Compte in
	 * the bar, and a full-width black « Scanner un billet » strip just above
	 * it during a Day.
	 */
	import { page } from "$app/state";
	import { CalendarDays, KeyRound, ListChecks, ScanLine } from "lucide-svelte";

	let { scanHref }: { scanHref: string | null } = $props();

	function tabClass(active: boolean): string {
		return active
			? "flex-1 flex flex-col items-center justify-center gap-1 pt-3 pb-6 min-h-[44px] text-foreground"
			: "flex-1 flex flex-col items-center justify-center gap-1 pt-3 pb-6 min-h-[44px] text-muted-foreground hover:text-foreground-alt";
	}
</script>

<div class="flex-shrink-0 z-50">
	{#if scanHref}
		<a
			href={scanHref}
			class="flex items-center justify-center gap-2 w-full min-h-[44px] py-3 bg-foreground text-background text-sm font-medium"
		>
			<ScanLine size={20} />
			<span>Scanner un billet</span>
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
