<script lang="ts">
	import { t } from 'svelte-i18n';
	import { cookieConsent } from '$lib/cookie-consent.svelte';

	let visible = $derived(!cookieConsent.hasChosen);
</script>

{#if visible}
	<div
		class="fixed inset-x-0 bottom-0 z-50 border-t border-border-card bg-background px-4 py-4 shadow-popover pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4"
		role="region"
		aria-label={$t('cookieConsent.title')}
	>
		<div
			class="container mx-auto flex max-w-5xl flex-col items-start gap-4 md:flex-row md:items-center md:justify-center md:gap-10"
		>
			<div class="md:max-w-xl">
				<p class="text-sm font-semibold text-foreground">{$t('cookieConsent.title')}</p>
				<p class="mt-1 text-xs text-muted-foreground leading-relaxed">
					{$t('cookieConsent.description')}
					<a
						href="/legal/privacy"
						class="underline underline-offset-2 hover:text-foreground-alt transition-colors"
					>
						{$t('cookieConsent.privacyLink')}
					</a>
				</p>
			</div>
			<div class="flex items-center gap-2 flex-shrink-0">
				<button
					type="button"
					onclick={() => cookieConsent.set('essential-only')}
					class="rounded-lg border border-border-input px-4 py-2 text-xs font-medium text-foreground hover:bg-surface transition-colors"
				>
					{$t('cookieConsent.essentialOnly')}
				</button>
				<button
					type="button"
					onclick={() => cookieConsent.set('accepted')}
					class="rounded-lg bg-foreground px-4 py-2 text-xs font-medium text-background hover:bg-foreground/80 transition-colors"
				>
					{$t('cookieConsent.acceptAll')}
				</button>
			</div>
		</div>
	</div>
{/if}
