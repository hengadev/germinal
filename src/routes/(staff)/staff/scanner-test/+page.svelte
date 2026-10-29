<script lang="ts">
	import QrScanner from '$lib/components/staff/QrScanner.svelte';

	let tokens = $state<string[]>([]);

	function handleScan(token: string) {
		if (tokens[0] === token) return;
		tokens = [token, ...tokens].slice(0, 10);
	}
</script>

<svelte:head>
	<title>Test scanner QR — Germinal Staff</title>
</svelte:head>

<div class="mx-auto max-w-md space-y-4 p-4">
	<h1 class="text-xl font-semibold">Test scanner QR</h1>
	<p class="text-sm text-neutral-600">
		Page temporaire de test du scanner de billets. Présentez un QR de billet devant la caméra.
	</p>

	<QrScanner onScan={handleScan} />

	{#if tokens.length > 0}
		<ul class="space-y-2">
			{#each tokens as token (token)}
				<li class="rounded-lg bg-neutral-100 p-3 font-mono text-sm break-all">{token}</li>
			{/each}
		</ul>
	{/if}
</div>
