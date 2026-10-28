<script lang="ts">
	// The Event's Menus, edited on the card (« Menus & tarifs »): the Menus
	// as tabs, and the chosen one laid out as guests read it — name, then
	// its Courses (label, then what is served), then a note — each line
	// typed in place. FR/EN shows the card in either language; with
	// translation on, the English is generated from the French on save and
	// a correction typed here is kept.
	import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-svelte';
	import { MAX_COURSE_DISH, MAX_COURSE_LABEL, MAX_MENU_COURSES } from '$lib/types/pricing-editor';
	import { COURSE_LABELS, newCourse, type DraftMenu } from './PricingEditor.svelte';

	let {
		menus,
		selected = $bindable(),
		english = $bindable(false),
		englishAuto,
		menuLabel,
		offering,
		mealsOffering,
		onadd,
		onremove,
	}: {
		menus: DraftMenu[];
		/** Key of the Menu shown. */
		selected: string | null;
		english?: boolean;
		englishAuto: boolean;
		menuLabel: (menu: DraftMenu, index: number) => string;
		/** How many meals offer this Menu. */
		offering: (menu: DraftMenu) => number;
		/** Those meals, named (« dîner du samedi 20 mars… »). */
		mealsOffering: (menu: DraftMenu) => string;
		onadd: () => void;
		onremove: (index: number) => void;
	} = $props();

	let confirming = $state(false);
	const index = $derived(menus.findIndex((m) => m.key === selected));
	const menu = $derived(index === -1 ? undefined : menus[index]);

	function choose(key: string) {
		selected = key;
		confirming = false;
	}

	function move(from: number, to: number) {
		if (!menu || to < 0 || to >= menu.courses.length) return;
		const [course] = menu.courses.splice(from, 1);
		menu.courses.splice(to, 0, course);
	}

	function insert(after: number) {
		if (!menu || menu.courses.length >= MAX_MENU_COURSES) return;
		const course = newCourse(menu.courses[after]);
		menu.courses.splice(after + 1, 0, course);
		requestAnimationFrame(() =>
			document.getElementById(`menu-${menu.key}-course-${course.key}-dish${english ? 'En' : 'Fr'}`)?.focus()
		);
	}

	// Inputs that read as the printed card until touched.
	const BARE =
		'w-full bg-transparent text-center rounded-sm border border-transparent hover:border-border-input focus:border-foreground focus:outline-none placeholder:text-muted-foreground/60';
	const TOOL = 'p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 cursor-pointer';
</script>

<datalist id="menu-course-labels">
	{#each COURSE_LABELS as label (label.fr)}<option value={english ? label.en : label.fr}></option>{/each}
</datalist>

<div class="flex flex-wrap items-center gap-2 border-b border-border-card pb-3">
	<div class="flex flex-wrap gap-1" role="tablist" aria-label="Menus">
		{#each menus as m, i (m.key)}
			<button
				type="button"
				role="tab"
				aria-selected={m.key === selected}
				onclick={() => choose(m.key)}
				class="max-w-[14rem] truncate px-3 py-1.5 text-sm rounded-md text-foreground-alt hover:bg-muted aria-selected:bg-foreground aria-selected:text-background cursor-pointer"
			>
				{menuLabel(m, i)}
			</button>
		{/each}
		<button
			type="button"
			onclick={onadd}
			class="inline-flex items-center gap-1 px-2.5 py-1.5 text-sm rounded-md text-foreground-alt hover:bg-muted cursor-pointer"
		>
			<Plus size={14} aria-hidden="true" />
			{menus.length === 0 ? 'Créer un menu' : 'Nouveau'}
		</button>
	</div>
	<div class="ml-auto inline-flex rounded-md bg-muted p-0.5 text-xs" role="group" aria-label="Langue du menu">
		<button type="button" onclick={() => (english = false)} aria-pressed={!english} class="px-2.5 py-1 rounded aria-pressed:bg-background aria-pressed:shadow-sm cursor-pointer">FR</button>
		<button type="button" onclick={() => (english = true)} aria-pressed={english} class="px-2.5 py-1 rounded aria-pressed:bg-background aria-pressed:shadow-sm cursor-pointer">EN</button>
	</div>
</div>

{#if english}
	<p class="mt-3 text-xs text-muted-foreground">
		{englishAuto
			? 'L’anglais est traduit du français à chaque enregistrement ; une correction faite ici est gardée tant que le français ne change pas.'
			: 'La traduction automatique n’est pas configurée : saisissez l’anglais vous-même.'}
	</p>
{/if}

{#if menu}
	{@const m = menu}
	<div class="mx-auto max-w-md px-10 py-8 text-foreground" style="font-family: 'Newsreader Variable', serif">
		{#if english}
			<input
				id="menu-{m.key}-nameEn"
				aria-label="Nom du menu (anglais)"
				maxlength="255"
				bind:value={m.nameEn}
				placeholder={m.nameFr || 'Menu name'}
				class="{BARE} text-3xl"
				style="font-family: 'Gilda Display', serif"
			/>
		{:else}
			<input
				id="menu-{m.key}-nameFr"
				aria-label="Nom du menu"
				maxlength="255"
				required
				bind:value={m.nameFr}
				placeholder="Nom du menu"
				class="{BARE} text-3xl"
				style="font-family: 'Gilda Display', serif"
			/>
		{/if}
		<span class="mx-auto my-5 block h-px w-10 bg-foreground/40" aria-hidden="true"></span>

		<ol aria-label="Étapes">
			{#each m.courses as course, i (course.key)}
				<li class="group relative py-2">
					{#if english}
						<input list="menu-course-labels" maxlength={MAX_COURSE_LABEL} bind:value={course.labelEn} placeholder={course.labelFr || 'Course'} aria-label="Étape {i + 1} (anglais)" class="{BARE} text-[11px] uppercase tracking-[0.2em] text-muted-foreground" />
						<input id="menu-{m.key}-course-{course.key}-dishEn" maxlength={MAX_COURSE_DISH} bind:value={course.dishEn} placeholder={course.dishFr || 'What is served'} aria-label="Plat de l’étape {i + 1} (anglais)" class="{BARE} text-lg italic" />
					{:else}
						<input list="menu-course-labels" maxlength={MAX_COURSE_LABEL} bind:value={course.labelFr} placeholder="Étape" aria-label="Étape {i + 1}" class="{BARE} text-[11px] uppercase tracking-[0.2em] text-muted-foreground" />
						<input id="menu-{m.key}-course-{course.key}-dishFr" maxlength={MAX_COURSE_DISH} bind:value={course.dishFr} placeholder="Ce qui est servi" aria-label="Plat de l’étape {i + 1}" class="{BARE} text-lg italic" />
					{/if}
					<span
						class="absolute -right-9 top-1/2 -translate-y-1/2 flex flex-col opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
						style="font-family: var(--font-sans)"
					>
						<button type="button" onclick={() => move(i, i - 1)} disabled={i === 0} aria-label="Monter l’étape {i + 1}" class={TOOL}><ArrowUp size={13} /></button>
						<button type="button" onclick={() => m.courses.splice(i, 1)} aria-label="Retirer l’étape {i + 1}" class="{TOOL} hover:text-red-600"><X size={13} /></button>
						<button type="button" onclick={() => move(i, i + 1)} disabled={i === m.courses.length - 1} aria-label="Descendre l’étape {i + 1}" class={TOOL}><ArrowDown size={13} /></button>
					</span>
					{#if m.courses.length < MAX_MENU_COURSES}
						<button
							type="button"
							onclick={() => insert(i)}
							aria-label="Insérer une étape après l’étape {i + 1}"
							class="absolute left-1/2 -bottom-2.5 -translate-x-1/2 z-10 size-5 rounded-full border border-border-input bg-background text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-foreground inline-flex items-center justify-center cursor-pointer"
						>
							<Plus size={12} />
						</button>
					{/if}
				</li>
			{/each}
		</ol>
		{#if m.courses.length === 0}
			<button type="button" onclick={() => insert(-1)} class="mx-auto block text-sm text-muted-foreground hover:text-foreground cursor-pointer" style="font-family: var(--font-sans)">
				+ Ajouter une étape
			</button>
		{/if}

		{#if english}
			<input id="menu-{m.key}-descriptionEn" maxlength="10000" bind:value={m.descriptionEn} placeholder={m.descriptionFr || 'Note (optional)'} aria-label="Note (anglais)" class="{BARE} mt-6 text-xs text-muted-foreground" />
		{:else}
			<input id="menu-{m.key}-descriptionFr" maxlength="10000" bind:value={m.descriptionFr} placeholder="Une note ? Accord mets et vins, allergènes…" aria-label="Note" class="{BARE} mt-6 text-xs text-muted-foreground" />
		{/if}
	</div>

	{@const used = offering(m)}
	<div class="flex flex-wrap items-center justify-between gap-2 border-t border-border-card pt-3 text-sm">
		<span class="text-muted-foreground">{used === 0 ? 'Proposé sur aucun repas' : `Proposé sur ${used} repas`}</span>
		{#if !confirming}
			<button
				type="button"
				onclick={() => (used > 0 ? (confirming = true) : onremove(index))}
				class="inline-flex items-center gap-1.5 text-red-600 hover:underline cursor-pointer"
			>
				<Trash2 size={14} aria-hidden="true" /> Supprimer ce menu
			</button>
		{/if}
	</div>
	{#if confirming}
		<div class="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 space-y-2" role="alert">
			<p class="text-sm text-red-800">Ce menu est proposé sur {used} repas : {mealsOffering(m)}. Le supprimer laisse ces repas sans menu.</p>
			<div class="flex gap-2">
				<button type="button" onclick={() => { confirming = false; onremove(index); }} class="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 cursor-pointer">Supprimer quand même</button>
				<button type="button" onclick={() => (confirming = false)} class="px-3 py-1.5 text-sm rounded-lg text-foreground-alt hover:bg-muted cursor-pointer">Garder</button>
			</div>
		</div>
	{/if}
{:else}
	<p class="py-10 text-center text-sm text-muted-foreground">Aucun menu. Créez-en un pour le proposer sur les repas.</p>
{/if}
