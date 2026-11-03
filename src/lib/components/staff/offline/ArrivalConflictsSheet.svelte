<script lang="ts">
	/**
	 * Issue 061 — la feuille des arrivées refusées par le serveur après un
	 * envoi hors ligne : le groupe, combien de personnes, à quelle heure la
	 * porte les a faites entrer, et le message du serveur. « Vu » retire la
	 * ligne du téléphone. Le motif de la feuille vient de PartySizeSheet.
	 */
	import { fade, fly } from 'svelte/transition';
	import { AlertTriangle, Check, UserCheck } from 'lucide-svelte';
	import { motion, cubicOut } from '$lib/components/staff/motion';
	import { queueState, dismissConflict } from '$lib/staff/offline/arrival-queue.svelte';

	let {
		open = false,
		onClose
	}: {
		open: boolean;
		onClose: () => void;
	} = $props();

	let sheetEl = $state<HTMLElement | null>(null);

	$effect(() => {
		if (open) sheetEl?.focus();
	});

	function timeLabel(queuedAt: string): string {
		return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(
			new Date(queuedAt)
		);
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-[69] bg-black/50"
		transition:fade={{ duration: motion(150) }}
		onclick={onClose}
		aria-hidden="true"
		data-no-swipe
	></div>
	<div
		bind:this={sheetEl}
		role="dialog"
		aria-modal="true"
		aria-label="Arrivées à vérifier"
		tabindex="-1"
		class="back-office fixed inset-x-0 bottom-0 z-[70] mx-auto max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border-t border-border-card bg-background p-4 pb-8 shadow-lg"
		transition:fly={{ y: 320, duration: motion(250), easing: cubicOut }}
		onkeydown={(event) => event.key === 'Escape' && onClose()}
		data-no-swipe
	>
		<div class="mx-auto mb-3 h-1 w-10 rounded-full bg-border-card" aria-hidden="true"></div>
		<div class="mb-3 flex items-start justify-between gap-4">
			<h2 class="text-xl font-semibold text-foreground">Arrivées à vérifier</h2>
			<button
				type="button"
				onclick={onClose}
				aria-label="Fermer"
				class="min-h-11 rounded-lg px-3 text-base font-medium text-muted-foreground hover:text-foreground"
			>Fermer</button
			>
		</div>
		<p class="mb-4 text-sm text-muted-foreground">
			Le serveur a refusé ces entrées enregistrées hors ligne.
		</p>
		<ul class="space-y-3">
			{#each queueState.conflicts as conflict (conflict.clientId)}
				<li class="rounded-lg border border-border-card p-3">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<p class="font-semibold break-words text-foreground">
								{conflict.guestName ?? 'Groupe'}
							</p>
							<p class="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground tabular-nums">
								<UserCheck size={14} aria-hidden="true" />
								{conflict.guests}
								{conflict.guests === 1 ? 'personne' : 'personnes'}
								à {timeLabel(conflict.queuedAt)} par {conflict.method === 'scan' ? 'scan' : 'la main'}
							</p>
						</div>
						<button
							type="button"
							onclick={() => dismissConflict(conflict.clientId)}
							class="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border border-border-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
						>
							<Check size={14} aria-hidden="true" />
							Vu
						</button>
					</div>
					<p class="mt-2 flex gap-2 rounded-md border border-foreground/80 px-3 py-2 text-sm text-foreground">
						<AlertTriangle size={16} class="mt-0.5 shrink-0" aria-hidden="true" />
						{conflict.error}
					</p>
				</li>
			{/each}
		</ul>
	</div>
{/if}
