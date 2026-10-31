<script lang="ts">
	/**
	 * The Staff portal's bottom bar (issue 031, variant B picked by the
	 * user): Événements | Tâches | Compte, and a round black Scan button
	 * floating above the bar's right side during a Day (hidden when there is no scan target, and on
	 * the Scanner tab itself).
	 */
	import { page } from "$app/state";
	import { CalendarDays, KeyRound, ListChecks, ScanLine } from "lucide-svelte";

	let { scanHref }: { scanHref: string | null } = $props();

	const onScannerTab = $derived(
		page.url.searchParams.get("onglet") === "scanner" &&
			page.url.pathname.startsWith("/staff/events")
	);

	// The active entry's marker (issue 033): a 2 px bar above the entry,
	// which slides to the newly active one (CSS only, disabled by Tailwind's
	// motion-reduce under `prefers-reduced-motion: reduce`).
	const activeIndex = $derived(
		page.url.pathname === '/staff' || page.url.pathname.startsWith('/staff/events')
			? 0
			: page.url.pathname === '/staff/taches'
				? 1
				: page.url.pathname.startsWith('/staff/change-password')
					? 2
					: 0
	);
	let row = $state<HTMLElement | null>(null);
	let markerLeft = $state(0);
	let markerWidth = $state(0);
	let markerShown = $state(false);
	$effect(() => {
		activeIndex;
		requestAnimationFrame(() => {
			// The links only: the marker span is the row's first child.
			const link = row?.querySelectorAll<HTMLElement>(':scope > a')[activeIndex];
			if (!link) return;
			markerLeft = link.offsetLeft;
			markerWidth = link.offsetWidth;
			markerShown = true;
		});
	});

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
			class="absolute right-4 bottom-full mb-4 w-14 h-14 rounded-full bg-foreground text-background shadow-lg flex items-center justify-center transition-transform duration-200 ease-out motion-reduce:transition-none active:scale-95"
			aria-label="Scanner un billet"
		>
			<ScanLine size={24} />
		</a>
	{/if}

	<nav
		class="bg-background border-t border-border-card pb-[env(safe-area-inset-bottom)]"
		aria-label="Navigation mobile"
	>
		<div class="relative flex items-stretch" bind:this={row}>
			<span
				aria-hidden="true"
				class="absolute top-0 h-0.5 bg-foreground transition-[left,width] duration-200 ease-out motion-reduce:transition-none {markerShown
					? ''
					: 'hidden'}"
				style="left:{markerLeft}px;width:{markerWidth}px"
			></span>
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
