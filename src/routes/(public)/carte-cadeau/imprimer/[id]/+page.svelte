<script lang="ts">
	import type { PageData } from "./$types";

	let { data }: { data: PageData } = $props();

	function formatEuro(cents: number): string {
		return new Intl.NumberFormat("fr-FR", {
			style: "currency",
			currency: "EUR",
		}).format(cents / 100);
	}

	function formatDate(date: Date): string {
		return new Date(date).toLocaleDateString("fr-FR", {
			day: "numeric",
			month: "long",
			year: "numeric",
		});
	}
</script>

<svelte:head>
	<title>Carte cadeau Germinal</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<!-- Print: the site chrome disappears, only the card remains. -->
<style global>
	@media print {
		nav,
		footer,
		header {
			display: none !important;
		}
		.print-card {
			border: 1px solid #000 !important;
			box-shadow: none !important;
		}
	}
</style>

<div class="container mx-auto px-4 py-24 max-w-2xl">
	{#if data.card}
		<div class="print-card border border-border p-8 md:p-12 grid gap-6 font-serif">
			<p class="uppercase text-xs tracking-widest text-muted-foreground">Germinal</p>
			<h1 class="text-2xl md:text-3xl">Carte cadeau</h1>
			{#if data.card.recipientName}
				<p>Pour {data.card.recipientName}</p>
			{/if}
			<p class="text-4xl md:text-5xl py-4">{formatEuro(data.card.amount)}</p>
			<p class="text-lg tracking-widest">{data.card.code}</p>
			<p class="text-sm text-muted-foreground">
				Valable jusqu'au {formatDate(data.card.expiresAt)}.
			</p>
			{#if data.card.message}
				<p class="whitespace-pre-wrap border-t border-border pt-4 text-sm">
					{data.card.message}
				</p>
			{/if}
			<p class="text-xs text-muted-foreground border-t border-border pt-4">
				Présentez ce code lors de vos réservations pour l'utiliser.
				germinalstudio.co
			</p>
		</div>
	{:else}
		<div class="border border-border p-8 grid gap-4">
			<h1 class="text-xl font-serif">Carte cadeau Germinal</h1>
			<p class="text-sm text-muted-foreground">
				Cette carte n'est plus disponible.
			</p>
		</div>
	{/if}
</div>
