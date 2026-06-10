<script lang="ts">
	import Navigation from "$lib/components/Navigation.svelte";
	import { page } from '$app/state';
	import type { LayoutData } from './$types';
	import { Instagram } from "lucide-svelte";
	import { t } from 'svelte-i18n';

	let { data, children }: { data: LayoutData; children: any } = $props();

	// Check if this is a success page - hide nav/footer for cleaner UX
	const showSuccess = $derived(page.url.searchParams.get('success') === 'true');
</script>

{#if showSuccess}
	<!-- Minimal layout for success page - no nav/footer -->
	<div class="min-h-screen flex flex-col bg-surface/30">
		<main class="flex-1">
			{@render children()}
		</main>
	</div>
{:else}
	<!-- Full layout for normal ticket view -->
	<div class="min-h-screen flex flex-col">
		<Navigation hasSpotlightEvent={data.hasSpotlightEvent} />

		<main class="flex-1">
			{@render children()}
		</main>

		<footer class="bg-foreground text-white/80 py-6 mt-12">
			<div class="container mx-auto px-4 flex items-center justify-between text-xs sm:text-sm">
				<p>
					&copy; {new Date().getFullYear()} Germinal. {$t('footer.allRightsReserved')}
				</p>
				<div class="flex gap-8">
					<a
						class="text-white/80 hover:text-white flex items-center gap-2"
						target="_blank"
						href="https://www.instagram.com/Germinal.studio/"
						rel="noopener noreferrer"
					>
						<Instagram class="w-3 h-3 sm:w-[14px] sm:h-[14px]" />
						<p>{$t('footer.instagram')}</p>
					</a>
				</div>
			</div>
		</footer>
	</div>
{/if}
