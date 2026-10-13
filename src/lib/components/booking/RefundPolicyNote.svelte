<script lang="ts">
	// The Event's Refund Policy in plain words (issue 027), in the guest's
	// language: shown before paying and on the Ticket. A manual policy shows
	// its statement (the other language's when theirs is empty); nothing is
	// rendered when there is nothing to say.
	import { t, locale } from 'svelte-i18n';
	import { describeRefundPolicy, type RefundPolicy } from '$lib/utils/refund-policy';

	let { policy, fullPayment = false, class: className = '' }: {
		policy: RefundPolicy;
		/** The whole price is paid online: speak of the payment, not a deposit. */
		fullPayment?: boolean;
		class?: string;
	} = $props();

	const text = $derived(describeRefundPolicy(policy, $locale?.startsWith('fr') ? 'fr' : 'en', { fullPayment }));
</script>

{#if text}
	<div class={className}>
		<p class="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
			{$t('booking.refundPolicy.title')}
		</p>
		<p class="font-serif text-sm text-foreground-alt leading-relaxed whitespace-pre-line">{text}</p>
	</div>
{/if}
