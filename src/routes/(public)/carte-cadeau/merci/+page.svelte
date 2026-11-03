<script lang="ts">
	import { t } from "svelte-i18n";
	import type { PageData } from "./$types";

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{$t("giftCard.thanks.pageTitle")}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="container mx-auto px-4 py-32 max-w-2xl grid gap-6">
	<h1 class="text-3xl lg:text-4xl font-serif">{$t("giftCard.thanks.title")}</h1>
	{#if data.delivery === "recipient"}
		<p class="text-base">
			{$t("giftCard.thanks.sentToRecipient")}
			{#if data.recipientEmail}
				<strong>{data.recipientEmail}</strong>.
			{/if}
		</p>
	{:else if data.delivery === "buyer"}
		<p class="text-base">
			{$t("giftCard.thanks.sentToBuyer")}
			{#if data.buyerEmail}
				<strong>{data.buyerEmail}</strong>.
			{/if}
		</p>
	{:else}
		<p class="text-base">{$t("giftCard.thanks.pending")}</p>
	{/if}
	<p class="text-muted-foreground text-sm">{$t("giftCard.thanks.receiptNote")}</p>
	<a href="/carte-cadeau" class="text-sm underline w-fit">{$t("giftCard.thanks.back")}</a>
</div>
