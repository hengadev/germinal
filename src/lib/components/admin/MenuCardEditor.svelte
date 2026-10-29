<script lang="ts">
	// The Event's Menus, edited on the card (« Menus & tarifs »): the Menus
	// as tabs, and the chosen one laid out as guests read it — name, then
	// its Courses (label, then what is served: one dish, or several to
	// choose from), then a note — each line typed in place. Typing in a
	// Course selects it; the bar under the card acts on it, with buttons
	// large enough for a finger. FR/EN shows the card in either language;
	// with translation on, the English is generated from the French on save
	// and a correction typed here is kept.
	import { ArrowDown, ArrowUp, Plus, Split, Trash2, X } from 'lucide-svelte';
	import { MAX_COURSE_DISH, MAX_COURSE_DISHES, MAX_COURSE_LABEL, MAX_MENU_COURSES } from '$lib/types/pricing-editor';
	import { COURSE_LABELS, newCourse, newDish, type DraftMenu } from './PricingEditor.svelte';

	let {
		menus,
		selected = $bindable(),
		english = $bindable(false),
		englishAuto,
		menuLabel,
		offering,
		onadd,
	}: {
		menus: DraftMenu[];
		/** Key of the Menu shown. */
		selected: string | null;
		english?: boolean;
		englishAuto: boolean;
		menuLabel: (menu: DraftMenu, index: number) => string;
		/** How many meals offer this Menu. */
		offering: (menu: DraftMenu) => number;
		onadd: () => void;
	} = $props();

	const index = $derived(menus.findIndex((m) => m.key === selected));
	const menu = $derived(index === -1 ? undefined : menus[index]);

	/** Key of the Course the bar acts on. */
	let current: number | null = $state(null);
	const at = $derived(menu ? menu.courses.findIndex((c) => c.key === current) : -1);

	const dishId = (courseKey: number, dishKey: number) =>
		`menu-${menu?.key}-course-${courseKey}-dish-${dishKey}${english ? 'En' : 'Fr'}`;

	function focusLater(id: string) {
		requestAnimationFrame(() => document.getElementById(id)?.focus());
	}

	function move(to: number) {
		if (!menu || at === -1 || to < 0 || to >= menu.courses.length) return;
		const [course] = menu.courses.splice(at, 1);
		menu.courses.splice(to, 0, course);
	}

	/** A new Course after the current one, or at the end. */
	function insert() {
		if (!menu || menu.courses.length >= MAX_MENU_COURSES) return;
		const after = at === -1 ? menu.courses.length - 1 : at;
		const course = newCourse(menu.courses[after]);
		menu.courses.splice(after + 1, 0, course);
		current = course.key;
		focusLater(dishId(course.key, course.dishes[0].key));
	}

	function addChoice() {
		const course = menu?.courses[at];
		if (!course || course.dishes.length >= MAX_COURSE_DISHES) return;
		const dish = newDish();
		course.dishes.push(dish);
		focusLater(dishId(course.key, dish.key));
	}

	function remove() {
		if (!menu || at === -1) return;
		menu.courses.splice(at, 1);
		current = menu.courses[Math.max(0, at - 1)]?.key ?? null;
	}

	// Inputs that read as the printed card until touched.
	const BARE =
		'w-full bg-transparent text-center rounded-sm border border-transparent hover:border-border-input focus:border-foreground focus:outline-none placeholder:text-muted-foreground/60';
	const LABEL = `${BARE} text-[11px] uppercase tracking-[0.2em] text-muted-foreground`;
	const TOOL =
		'flex-1 min-h-11 inline-flex flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] text-foreground-alt hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-default';
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
				onclick={() => (selected = m.key)}
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
	<div class="mx-auto max-w-md px-2 py-8 text-foreground" style="font-family: 'Newsreader Variable', serif">
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
				{@const choice = course.dishes.length > 1}
				<li
					class="my-1 rounded-lg border px-2 py-3 transition-colors {course.key === current ? 'border-foreground/30 bg-background' : 'border-transparent'}"
					onfocusin={() => (current = course.key)}
					onpointerdown={() => (current = course.key)}
				>
					{#if english}
						<input list="menu-course-labels" maxlength={MAX_COURSE_LABEL} bind:value={course.labelEn} placeholder={course.labelFr || 'Course'} aria-label="Étape {i + 1} (anglais)" class={LABEL} />
					{:else}
						<input list="menu-course-labels" maxlength={MAX_COURSE_LABEL} bind:value={course.labelFr} placeholder="Étape" aria-label="Étape {i + 1}" class={LABEL} />
					{/if}
					{#each course.dishes as dish, d (dish.key)}
						{#if d > 0}<p class="text-center text-xs italic text-muted-foreground" aria-hidden="true">{english ? 'or' : 'ou'}</p>{/if}
						<div class="relative">
							{#if english}
								<input
									id={dishId(course.key, dish.key)}
									maxlength={MAX_COURSE_DISH}
									bind:value={dish.en}
									placeholder={dish.fr || 'What is served'}
									aria-label="{choice ? `Choix ${d + 1}` : 'Plat'} de l’étape {i + 1} (anglais)"
									class="{BARE} text-lg italic {choice ? 'px-9' : ''}"
								/>
							{:else}
								<input
									id={dishId(course.key, dish.key)}
									maxlength={MAX_COURSE_DISH}
									bind:value={dish.fr}
									placeholder={d === 0 ? 'Ce qui est servi' : 'Autre choix'}
									aria-label="{choice ? `Choix ${d + 1}` : 'Plat'} de l’étape {i + 1}"
									class="{BARE} text-lg italic {choice ? 'px-9' : ''}"
								/>
							{/if}
							{#if choice}
								<button
									type="button"
									onclick={() => course.dishes.splice(d, 1)}
									aria-label="Retirer le choix {d + 1} de l’étape {i + 1}"
									class="absolute right-0 top-1/2 -translate-y-1/2 size-9 inline-flex items-center justify-center rounded-full text-muted-foreground/70 hover:text-red-600 hover:bg-muted cursor-pointer"
								>
									<X size={14} />
								</button>
							{/if}
						</div>
					{/each}
					{#if choice}
						<p class="mt-0.5 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{english ? 'your choice' : 'au choix'}</p>
					{/if}
				</li>
			{/each}
		</ol>
		{#if m.courses.length === 0}
			<button type="button" onclick={insert} class="mx-auto block min-h-11 px-4 text-sm text-muted-foreground hover:text-foreground cursor-pointer" style="font-family: var(--font-sans)">
				+ Ajouter une étape
			</button>
		{/if}

		{#if english}
			<input id="menu-{m.key}-descriptionEn" maxlength="10000" bind:value={m.descriptionEn} placeholder={m.descriptionFr || 'Note (optional)'} aria-label="Note (anglais)" class="{BARE} mt-6 text-xs text-muted-foreground" />
		{:else}
			<input id="menu-{m.key}-descriptionFr" maxlength="10000" bind:value={m.descriptionFr} placeholder="Une note ? Accord mets et vins, allergènes…" aria-label="Note" class="{BARE} mt-6 text-xs text-muted-foreground" />
		{/if}
	</div>

	<div
		class="sticky bottom-0 z-10 mb-3 flex gap-1 rounded-xl border border-border-card bg-background-alt/95 p-1 backdrop-blur"
		role="toolbar"
		aria-label={at === -1 ? 'Étapes' : `Étape ${at + 1}`}
	>
		<button type="button" class={TOOL} disabled={at <= 0} onclick={() => move(at - 1)}><ArrowUp size={18} aria-hidden="true" />Monter</button>
		<button type="button" class={TOOL} disabled={at === -1 || at === m.courses.length - 1} onclick={() => move(at + 1)}><ArrowDown size={18} aria-hidden="true" />Descendre</button>
		<button type="button" class={TOOL} disabled={at === -1 || m.courses[at].dishes.length >= MAX_COURSE_DISHES} onclick={addChoice}><Split size={18} aria-hidden="true" />Choix</button>
		<button type="button" class={TOOL} disabled={m.courses.length >= MAX_MENU_COURSES} onclick={insert}><Plus size={18} aria-hidden="true" />Étape</button>
		<button type="button" class="{TOOL} text-red-600" disabled={at === -1} onclick={remove}><Trash2 size={18} aria-hidden="true" />Retirer</button>
	</div>

	<p class="border-t border-border-card pt-3 text-sm text-muted-foreground">
		{offering(m) === 0 ? 'Proposé sur aucun repas' : `Proposé sur ${offering(m)} repas`}
	</p>
{:else}
	<p class="py-10 text-center text-sm text-muted-foreground">Aucun menu. Créez-en un pour le proposer sur les repas.</p>
{/if}
