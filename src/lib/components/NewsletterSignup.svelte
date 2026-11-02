<script lang="ts">
	import { page } from '$app/state';
	import { t, locale } from 'svelte-i18n';
	import { ArrowRight } from 'lucide-svelte';

	let email = $state('');
	let consent = $state(false);
	let status = $state<'idle' | 'sending' | 'success' | 'error'>('idle');

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (status === 'sending') return;
		if (!consent) {
			status = 'error';
			return;
		}
		status = 'sending';
		try {
			const response = await fetch('/api/newsletter', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-CSRF-Token': page.data.csrfToken
				},
				body: JSON.stringify({
					email,
					locale: $locale === 'fr' ? 'fr' : 'en',
					consent: true
				})
			});
			if (!response.ok) throw new Error(String(response.status));
			status = 'success';
		} catch {
			status = 'error';
		}
	}
</script>

{#if status === 'success'}
	<p class="font-serif text-lg text-foreground">
		{$t('newsletterSignup.success')}
	</p>
{:else}
	<form onsubmit={submit} class="w-full max-w-xl mx-auto">
		<div class="flex flex-col sm:flex-row gap-px border border-foreground bg-foreground">
			<label class="sr-only" for="newsletter-email">{$t('newsletterSignup.emailLabel')}</label>
			<input
				id="newsletter-email"
				type="email"
				name="email"
				required
				autocomplete="email"
				placeholder="{$t('newsletterSignup.emailPlaceholder')}"
				bind:value={email}
				disabled={status === 'sending'}
				class="flex-1 px-4 py-3 bg-background text-foreground text-base placeholder:text-muted-foreground focus:outline-none"
			/>
			<button
				type="submit"
				disabled={status === 'sending'}
				class="px-6 py-3 bg-foreground text-background text-sm font-medium inline-flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
			>
				{#if status === 'sending'}
					{$t('newsletterSignup.sending')}
				{:else}
					{$t('newsletterSignup.submit')}
					<ArrowRight class="w-4 h-4" />
				{/if}
			</button>
		</div>
		<label for="newsletter-consent" class="flex items-start gap-3 mt-4 cursor-pointer text-left">
			<input
				id="newsletter-consent"
				type="checkbox"
				bind:checked={consent}
				class="mt-1 accent-foreground"
			/>
			<span class="text-sm text-muted-foreground leading-relaxed">
				{$t('newsletterSignup.consent')}
			</span>
		</label>
		{#if status === 'error'}
			<p class="mt-3 text-sm text-foreground-alt" role="alert">
				{$t('newsletterSignup.error')}
			</p>
		{/if}
	</form>
{/if}
