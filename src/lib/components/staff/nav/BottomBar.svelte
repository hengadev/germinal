<script lang="ts">
	/**
	 * The Staff portal's bottom bar (issue 031, dark after bancpublic's admin
	 * in issue 037): Événements | Tâches | Compte over an ink bar, and a round
	 * black Scan button floating above the bar's right side during a Day
	 * (hidden when there is no Event to scan). It opens the scan overlay over
	 * the current page (issue 034).
	 */
	import { page } from "$app/state";
	import { CalendarDays, KeyRound, ListChecks, ScanLine } from "lucide-svelte";
	import { openScanOverlay } from "$lib/components/staff/scanner/scan-overlay.svelte";

	let { scanTargets }: { scanTargets: { eventId: string; title: string }[] } = $props();

	function tabClass(active: boolean): string {
		return active
			? "flex-1 flex flex-col items-center justify-center gap-1 min-h-14 text-xs text-background dark:text-foreground"
			: "flex-1 flex flex-col items-center justify-center gap-1 min-h-14 text-xs text-zinc-500 hover:text-zinc-300";
	}
</script>

<div class="flex-shrink-0 relative z-50">
	{#if scanTargets.length > 0}
		<button
			type="button"
			onclick={() => openScanOverlay(scanTargets)}
			class="absolute right-4 bottom-full mb-4 w-14 h-14 rounded-full bg-foreground text-background ring-2 ring-background shadow-lg flex items-center justify-center transition-transform duration-200 ease-out motion-reduce:transition-none active:scale-95"
			aria-label="Scanner un billet"
		>
			<ScanLine size={24} />
		</button>
	{/if}

	<nav class="bg-foreground dark:bg-black dark:border-t dark:border-border-card pb-1 [@media(display-mode:standalone)]:pb-6" aria-label="Navigation mobile">
		<div class="flex items-stretch">
			<a
				href="/staff?liste"
				class={tabClass(page.url.pathname === '/staff' || page.url.pathname.startsWith('/staff/events'))}
			>
				<CalendarDays size={20} />
				<span class="font-medium">Événements</span>
			</a>
			<a href="/staff/taches" class={tabClass(page.url.pathname === '/staff/taches')}>
				<ListChecks size={20} />
				<span class="font-medium">Tâches</span>
			</a>
			<a
				href="/staff/change-password"
				class={tabClass(page.url.pathname === '/staff/change-password')}
			>
				<KeyRound size={20} />
				<span class="font-medium">Compte</span>
			</a>
		</div>
	</nav>
</div>
