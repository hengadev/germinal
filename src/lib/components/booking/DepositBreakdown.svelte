<script lang="ts">
	// How a booking's total splits between the Deposit paid online now and
	// the Balance paid at the venue (issue 023), shown under the total
	// before the Guest pays. Nothing extra is shown when the whole total is
	// paid online (a 100 % Deposit): the total already says it.
	import { t, locale } from 'svelte-i18n';
	import { formatCurrency } from '$lib/utils/currency';
	import type { PriceBreakdown } from '$lib/utils/pricing';

	let { price, currency }: { price: PriceBreakdown; currency: string } = $props();

	const amount = (value: number) => formatCurrency(value, currency, $locale ?? undefined);
</script>

{#if price.balance > 0}
	<dl class="mt-3 border-t border-border-card pt-3 grid gap-2 text-sm">
		{#if price.deposit > 0}
			<div class="flex items-baseline justify-between gap-4">
				<dt class="font-serif text-foreground">{$t('booking.deposit.payNow')}</dt>
				<dd class="font-mono text-lg text-foreground">{amount(price.deposit)}</dd>
			</div>
		{/if}
		<div class="flex items-baseline justify-between gap-4">
			<dt class="text-muted-foreground">{$t('booking.deposit.balanceAtVenue')}</dt>
			<dd class="font-mono text-muted-foreground">{amount(price.balance)}</dd>
		</div>
		<p class="text-xs text-muted-foreground leading-relaxed">
			{price.deposit > 0 ? $t('booking.deposit.note') : $t('booking.deposit.noDeposit')}
		</p>
	</dl>
{/if}
