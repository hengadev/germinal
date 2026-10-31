<script lang="ts">
	/**
	 * Variant A — Scan au centre (issue 031): Événements | ◉ Scan | Tâches,
	 * the Scan button a raised round black button overlapping the bar's top.
	 * Compte moves to the header (rendered by the layout).
	 */
	import { page } from "$app/state";
	import { CalendarDays, ListChecks, ScanLine } from "lucide-svelte";

	let { scanHref }: { scanHref: string | null } = $props();

	function tabClass(active: boolean): string {
		return active
			? "flex-1 flex flex-col items-center justify-center gap-1 pt-3 pb-6 min-h-[44px] text-foreground"
			: "flex-1 flex flex-col items-center justify-center gap-1 pt-3 pb-6 min-h-[44px] text-muted-foreground hover:text-foreground-alt";
	}
</script>

<nav
	class="flex-shrink-0 bg-background border-t border-border-card z-50 pb-[env(safe-area-inset-bottom)]"
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

		<div class="flex-1 flex justify-center">
			{#if scanHref}
				<a
					href={scanHref}
					class="relative -top-8 w-16 h-16 rounded-full bg-foreground text-background border-4 border-background shadow-lg flex items-center justify-center"
					aria-label="Scanner un billet"
				>
					<ScanLine size={26} />
				</a>
			{:else}
				<span
					class="relative -top-8 w-16 h-16 rounded-full bg-muted border-4 border-background text-muted-foreground/40 flex items-center justify-center cursor-not-allowed"
					role="img"
					aria-label="Pas de scan aujourd'hui"
				>
					<ScanLine size={26} />
				</span>
			{/if}
		</div>

		<a href="/staff/taches" class={tabClass(page.url.pathname === '/staff/taches')}>
			<ListChecks size={20} />
			<span class="text-[10px] font-medium">Tâches</span>
		</a>
	</div>
</nav>
