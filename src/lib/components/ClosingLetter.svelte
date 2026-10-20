<script lang="ts">
	// « Écrivez-nous. », the ending of the Manifesto and the home page:
	// the old « Un lieu, une idée, une date ? », spelled out. It says what
	// we need to begin — three things, none of them certain — and then how
	// to send them.
	import { ArrowRight } from 'lucide-svelte';
	import { t } from 'svelte-i18n';

	const ITEMS = ['place', 'date', 'idea'] as const;
</script>

<section class="container mx-auto max-w-8xl px-4 py-32 lg:py-48" aria-labelledby="closing-title">
	<div class="grid gap-10 lg:grid-cols-12 lg:gap-12">
		<div class="lg:col-span-5">
			<h2 id="closing-title" class="font-serif text-4xl leading-tight lg:text-6xl">{$t('manifesto.closingLetter.title')}</h2>
			<p class="mt-6 max-w-sm text-lg leading-relaxed text-foreground-alt">{$t('manifesto.closingLetter.body')}</p>
		</div>
		<div class="lg:col-span-6 lg:col-start-7">
			<ul class="border-b border-border-card">
				{#each ITEMS as item (item)}
					<li class="border-t border-border-card py-5 font-serif text-2xl first:border-t-0 first:pt-0 lg:py-6 lg:text-3xl">
						{$t(`manifesto.closingLetter.${item}`)}
					</li>
				{/each}
			</ul>
			<div class="mt-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
				<a
					href="/contact?subject=new_project"
					class="group inline-flex items-center gap-3 self-start bg-foreground px-6 py-3.5 text-white transition-colors hover:bg-foreground-alt"
				>
					{$t('manifesto.newProjectCta')}
					<ArrowRight size={18} aria-hidden="true" class="transition-transform group-hover:translate-x-1 motion-reduce:transition-none" />
				</a>
				<p class="text-foreground-alt">
					{$t('manifesto.closingLetter.orWrite')}
					<a href="mailto:contact@germinalstudio.co" class="text-foreground underline decoration-border-input-hover underline-offset-4 hover:decoration-foreground"
						>contact@germinalstudio.co</a
					>
				</p>
			</div>
			<p class="mt-16 font-serif text-lg text-foreground-alt italic">{$t('manifesto.signature')}</p>
		</div>
	</div>
</section>
