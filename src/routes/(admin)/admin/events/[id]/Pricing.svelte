<script lang="ts">
	// « Menus & tarifs » (issue 022): the Event's Menus, described once
	// (EN/FR), and for each Service (a Day's lunch or dinner) the Menu it
	// offers and its price per guest. The same Menu can be offered on several
	// Services at different prices; a price of zero is a free meal. A
	// Service without a price cannot be booked yet.
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { AlertTriangle, CalendarDays, Plus, Trash2, UtensilsCrossed } from 'lucide-svelte';
	import { getToastContext } from '$lib/components/toast/state.svelte';
	import { formatCurrency } from '$lib/utils/currency';
	import type { PricingEditorData, PricingPayload } from '$lib/types/pricing-editor';

	let { data }: { data: { pricing?: PricingEditorData } } = $props();

	const toast = getToastContext();

	const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF'] as const;

	interface DraftMenu {
		key: string;
		id: string | null;
		nameEn: string;
		nameFr: string;
		descriptionEn: string;
		descriptionFr: string;
	}

	interface DraftService {
		serviceId: string;
		date: string;
		kind: 'lunch' | 'dinner';
		menuKey: string;
		/** Price in major units as typed; null when left blank (not set). */
		price: number | null;
		currency: string;
		seatingCount: number;
		legacySeatings: PricingEditorData['services'][number]['legacySeatings'];
		clearLegacyPrices: boolean;
	}

	let nextKey = 0;

	function toDraftMenus(pricing: PricingEditorData | undefined): DraftMenu[] {
		return (pricing?.menus ?? []).map((menu) => ({
			key: menu.id,
			id: menu.id,
			nameEn: menu.nameEn,
			nameFr: menu.nameFr,
			descriptionEn: menu.descriptionEn ?? '',
			descriptionFr: menu.descriptionFr ?? '',
		}));
	}

	function toDraftServices(pricing: PricingEditorData | undefined): DraftService[] {
		return (pricing?.services ?? []).map((service) => ({
			serviceId: service.serviceId,
			date: service.date,
			kind: service.kind,
			menuKey: service.menuId ?? '',
			price: service.priceAmount === null ? null : service.priceAmount / 100,
			currency: service.currency,
			seatingCount: service.seatingCount,
			legacySeatings: service.legacySeatings,
			clearLegacyPrices: false,
		}));
	}

	let menus: DraftMenu[] = $state(toDraftMenus(data.pricing));
	let services: DraftService[] = $state(toDraftServices(data.pricing));
	let saving = $state(false);

	/** An empty price field: the price is not set yet. */
	function isBlank(price: number | null | undefined | ''): boolean {
		return price === null || price === undefined || price === '';
	}

	/** A typed price is valid when it is a non-negative amount to the cent. */
	function isValidPrice(price: number | null): boolean {
		return price !== null && Number.isFinite(price) && price >= 0 && Math.abs(Math.round(price * 100) - price * 100) < 1e-6;
	}

	const payload = $derived(
		JSON.stringify({
			menus: menus.map((menu) => ({
				key: menu.key,
				id: menu.id,
				nameEn: menu.nameEn.trim(),
				nameFr: menu.nameFr.trim(),
				descriptionEn: menu.descriptionEn.trim() || null,
				descriptionFr: menu.descriptionFr.trim() || null,
			})),
			services: services.map((service) => ({
				serviceId: service.serviceId,
				menuKey: service.menuKey === '' ? null : service.menuKey,
				priceAmount: isBlank(service.price) ? null : Math.round((service.price as number) * 100),
				currency: service.currency,
				clearLegacyPrices: service.clearLegacyPrices,
			})),
		} satisfies PricingPayload)
	);

	const MEAL_LABEL = { lunch: 'Déjeuner', dinner: 'Dîner' } as const;

	function dayLabel(date: string): string {
		return new Intl.DateTimeFormat('fr-FR', {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC',
		}).format(new Date(`${date}T12:00:00Z`));
	}

	function menuLabel(menu: DraftMenu, index: number): string {
		return menu.nameFr.trim() || menu.nameEn.trim() || `Menu ${index + 1} (sans nom)`;
	}

	function servicesOffering(menu: DraftMenu): number {
		return services.filter((service) => service.menuKey === menu.key).length;
	}

	function addMenu() {
		const key = `new-${nextKey++}`;
		menus.push({ key, id: null, nameEn: '', nameFr: '', descriptionEn: '', descriptionFr: '' });
		requestAnimationFrame(() => document.getElementById(`menu-${key}-nameFr`)?.focus());
	}

	function removeMenu(index: number) {
		menus.splice(index, 1);
	}

	/** First field that blocks the save, with the message to show. */
	function firstBlockingField(): { id: string; message: string } | null {
		for (const [index, menu] of menus.entries()) {
			if (!menu.nameFr.trim()) {
				return { id: `menu-${menu.key}-nameFr`, message: `Le menu ${index + 1} doit avoir un nom en français.` };
			}
			if (!menu.nameEn.trim()) {
				return { id: `menu-${menu.key}-nameEn`, message: `Le menu ${index + 1} doit avoir un nom en anglais.` };
			}
		}
		for (const service of services) {
			const label = `${MEAL_LABEL[service.kind].toLowerCase()} du ${dayLabel(service.date)}`;
			const blank = isBlank(service.price);
			if (!blank && !isValidPrice(service.price)) {
				return {
					id: `service-${service.serviceId}-price`,
					message: `Prix invalide pour le ${label} : saisissez un montant positif ou nul, au centime près.`,
				};
			}
			if (blank && service.clearLegacyPrices) {
				return {
					id: `service-${service.serviceId}-price`,
					message: `Renseignez le prix du ${label} avant d’y aligner les séances à l’ancien tarif.`,
				};
			}
		}
		return null;
	}

	function savePricingEnhance({ cancel }: { cancel: () => void }) {
		const blocking = firstBlockingField();
		if (blocking) {
			cancel();
			toast.error('Erreur', blocking.message);
			requestAnimationFrame(() => document.getElementById(blocking.id)?.focus());
			return;
		}
		saving = true;
		return async ({ result }: { result: import('@sveltejs/kit').ActionResult }) => {
			saving = false;
			if (result.type === 'success') {
				toast.success('Succès', (result.data as { success?: string })?.success ?? 'Menus et tarifs enregistrés');
				await invalidateAll();
				menus = toDraftMenus(data.pricing);
				services = toDraftServices(data.pricing);
			} else if (result.type === 'failure') {
				toast.error('Erreur', (result.data as { error?: string })?.error ?? 'Une erreur est survenue');
			} else if (result.type === 'error') {
				toast.error('Erreur', 'Une erreur est survenue');
			}
		};
	}

	const INPUT_CLASS =
		'w-full px-3 py-2 border border-border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm';
	const LABEL_CLASS = 'block text-xs font-medium text-foreground-alt mb-1';
</script>

<form method="POST" action="?/savePricing" use:enhance={savePricingEnhance} novalidate class="space-y-8">
	<input type="hidden" name="pricing" value={payload} />

	<section class="bg-background rounded-lg border border-border-card" aria-labelledby="menus-title">
		<header class="p-4 lg:p-6 border-b border-border-card">
			<h3 id="menus-title" class="text-lg font-semibold text-foreground">Menus</h3>
			<p class="text-sm text-muted-foreground">
				Décrivez chaque menu une seule fois, puis proposez-le sur un ou plusieurs repas ci-dessous — avec un
				prix propre à chaque repas.
			</p>
		</header>

		<div class="divide-y divide-border-card">
			{#if menus.length === 0}
				<div class="px-4 lg:px-6 py-8 text-center">
					<UtensilsCrossed size={32} class="mx-auto mb-3 text-muted-foreground" />
					<p class="text-sm text-muted-foreground">Aucun menu pour le moment.</p>
				</div>
			{/if}

			{#each menus as menu, index (menu.key)}
				{@const offering = servicesOffering(menu)}
				<div class="px-4 lg:px-6 py-4 space-y-3">
					<div class="flex items-center justify-between gap-3">
						<p class="text-sm font-medium text-foreground">{menuLabel(menu, index)}</p>
						<div class="flex items-center gap-2">
							<span class="text-xs text-muted-foreground">
								{offering === 0 ? 'Proposé sur aucun repas' : `Proposé sur ${offering} repas`}
							</span>
							<button
								type="button"
								onclick={() => removeMenu(index)}
								disabled={offering > 0}
								aria-label="Supprimer ce menu"
								title={offering > 0
									? 'Ce menu est proposé sur des repas : retirez-le d’abord de ces repas.'
									: 'Supprimer ce menu'}
								class="inline-flex items-center justify-center size-8 rounded-md text-red-600 hover:bg-red-50 disabled:text-muted-foreground disabled:hover:bg-transparent disabled:cursor-not-allowed"
							>
								<Trash2 size={16} />
							</button>
						</div>
					</div>
					<div class="grid gap-3 lg:grid-cols-2">
						<div>
							<label for="menu-{menu.key}-nameEn" class={LABEL_CLASS}>Nom (anglais)</label>
							<input
								id="menu-{menu.key}-nameEn"
								type="text"
								maxlength="255"
								required
								bind:value={menu.nameEn}
								placeholder="Tasting menu"
								class={INPUT_CLASS}
							/>
						</div>
						<div>
							<label for="menu-{menu.key}-nameFr" class={LABEL_CLASS}>Nom (français)</label>
							<input
								id="menu-{menu.key}-nameFr"
								type="text"
								maxlength="255"
								required
								bind:value={menu.nameFr}
								placeholder="Menu dégustation"
								class={INPUT_CLASS}
							/>
						</div>
						<div>
							<label for="menu-{menu.key}-descriptionEn" class={LABEL_CLASS}>Description (anglais, facultative)</label>
							<textarea
								id="menu-{menu.key}-descriptionEn"
								rows="3"
								maxlength="10000"
								bind:value={menu.descriptionEn}
								class="{INPUT_CLASS} resize-y"
							></textarea>
						</div>
						<div>
							<label for="menu-{menu.key}-descriptionFr" class={LABEL_CLASS}>Description (français, facultative)</label>
							<textarea
								id="menu-{menu.key}-descriptionFr"
								rows="3"
								maxlength="10000"
								bind:value={menu.descriptionFr}
								placeholder="Entrée, plat, dessert…"
								class="{INPUT_CLASS} resize-y"
							></textarea>
						</div>
					</div>
				</div>
			{/each}
		</div>

		<div class="px-4 lg:px-6 py-3 border-t border-border-card">
			<button
				type="button"
				onclick={addMenu}
				class="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-border-input text-foreground-alt hover:bg-muted"
			>
				<Plus size={16} />
				Ajouter un menu
			</button>
		</div>
	</section>

	<section class="bg-background rounded-lg border border-border-card" aria-labelledby="service-prices-title">
		<header class="p-4 lg:p-6 border-b border-border-card">
			<h3 id="service-prices-title" class="text-lg font-semibold text-foreground">Menu et prix par repas</h3>
			<p class="text-sm text-muted-foreground">
				Toutes les séances d’un repas sont réservées à son prix, par convive. Saisissez 0 pour un repas
				gratuit ; tant que le prix est vide, ses séances ne peuvent pas être réservées.
			</p>
		</header>

		{#if services.length === 0}
			<div class="px-4 lg:px-6 py-8 text-center">
				<CalendarDays size={32} class="mx-auto mb-3 text-muted-foreground" />
				<p class="text-sm text-muted-foreground">
					Aucun repas pour le moment : choisissez d’abord les jours et les repas dans l’onglet « Vue
					d’ensemble ».
				</p>
			</div>
		{:else}
			<div class="divide-y divide-border-card">
				{#each services as service (service.serviceId)}
					{@const blank = isBlank(service.price)}
					<div class="px-4 lg:px-6 py-4 space-y-3">
						<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_9rem_7rem] lg:items-end">
							<div class="sm:col-span-2 lg:col-span-1 lg:pb-2">
								<p class="text-sm font-medium text-foreground">{MEAL_LABEL[service.kind]}</p>
								<p class="text-xs text-muted-foreground first-letter:uppercase">
									{dayLabel(service.date)} · {service.seatingCount} séance{service.seatingCount > 1 ? 's' : ''}
								</p>
							</div>
							<div>
								<label for="service-{service.serviceId}-menu" class={LABEL_CLASS}>Menu</label>
								<select id="service-{service.serviceId}-menu" bind:value={service.menuKey} class={INPUT_CLASS}>
									<option value="">Aucun menu</option>
									{#each menus as menu, index (menu.key)}
										<option value={menu.key}>{menuLabel(menu, index)}</option>
									{/each}
								</select>
							</div>
							<div>
								<label for="service-{service.serviceId}-price" class={LABEL_CLASS}>
									Prix par convive {blank ? '(non défini)' : service.price === 0 ? '(gratuit)' : ''}
								</label>
								<input
									id="service-{service.serviceId}-price"
									type="number"
									inputmode="decimal"
									min="0"
									step="0.01"
									bind:value={service.price}
									aria-invalid={!blank && !isValidPrice(service.price) ? 'true' : undefined}
									class={INPUT_CLASS}
								/>
							</div>
							<div>
								<label for="service-{service.serviceId}-currency" class={LABEL_CLASS}>Devise</label>
								<select id="service-{service.serviceId}-currency" bind:value={service.currency} class={INPUT_CLASS}>
									{#each CURRENCIES as currency (currency)}
										<option value={currency}>{currency}</option>
									{/each}
								</select>
							</div>
						</div>

						{#if blank && service.seatingCount > 0}
							<p class="flex items-center gap-1.5 text-xs text-amber-700">
								<AlertTriangle size={14} class="shrink-0" />
								Prix non défini : les séances de ce repas ne peuvent pas être réservées.
							</p>
						{/if}

						{#if service.legacySeatings.length > 0}
							<div class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 space-y-2">
								<p class="text-xs text-amber-800">
									{service.legacySeatings.length > 1 ? 'Ces séances ont gardé' : 'Cette séance a gardé'} le tarif
									qu’elle{service.legacySeatings.length > 1 ? 's avaient' : ' avait'} avant la mise en place des
									prix par repas :
									{service.legacySeatings
										.map((seating) => `${seating.start.replace(':', 'h')} (${formatCurrency(seating.priceAmount, seating.currency, 'fr-FR')})`)
										.join(', ')}.
								</p>
								<label class="flex items-center gap-2 text-xs text-amber-900">
									<input type="checkbox" bind:checked={service.clearLegacyPrices} class="size-4" />
									Appliquer le prix du repas à {service.legacySeatings.length > 1 ? 'ces séances' : 'cette séance'}
								</label>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<div class="flex flex-col sm:flex-row sm:items-center gap-3 pt-4 border-t border-border-card">
		<button
			type="submit"
			disabled={saving}
			class="sm:ml-auto px-6 py-3 bg-foreground text-background rounded-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-foreground focus:ring-offset-2 transition-colors font-medium disabled:opacity-60"
		>
			{saving ? 'Enregistrement…' : 'Enregistrer les menus et tarifs'}
		</button>
	</div>
</form>
