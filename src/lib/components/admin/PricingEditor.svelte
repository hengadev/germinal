<script module lang="ts">
	// « Menus & tarifs » editor (issue 022): the Event's Menus, described
	// once (EN/FR), and for each Service (a Day's lunch or dinner) the Menu it
	// offers and its price per guest. The same Menu can be offered on several
	// Services at different prices; a price of zero is a free meal. A
	// Service without a price cannot be booked yet.
	// The Event's Deposit rule (issue 023) lives here too, with the Deposit
	// each price gives shown live next to it — worked out by the same
	// Pricing module the booking uses.
	// And its Refund Policy (issue 027): a manual statement (EN/FR) or tiers
	// in hours before the Seating, entered in hours or days, with the policy
	// shown live as guests will read it.
	// And its currency (issue 042): one per Event, which every price, the
	// fixed Deposit and the live amounts are in; locked once the Event has a
	// Reservation.
	//
	// Fields only: the host page owns the drafts and the <form>. The editor
	// posts its payload as `pricing`; call `firstBlockingField()` before
	// submitting. Used by the event page's « Menus & tarifs » tab and the
	// new-event form, where the Services are the ones just picked (not saved
	// yet) and `serviceId` is a placeholder the server swaps for the real id.
	import type { PricingEditorData } from '$lib/types/pricing-editor';
	import { FULL_PAYMENT_DEPOSIT, type DepositType } from '$lib/utils/pricing';
	import {
		DEFAULT_REFUND_POLICY,
		EMPTY_MANUAL_REFUND_POLICY,
		refundableUntilTiers,
		type RefundPolicyType,
		type RefundTier,
	} from '$lib/utils/refund-policy';
	import type { ServiceKind } from '$lib/utils/seating-times';
	import { DEFAULT_EVENT_CURRENCY } from '$lib/utils/currency';

	export interface DraftMenu {
		key: string;
		id: string | null;
		nameEn: string;
		nameFr: string;
		descriptionEn: string;
		descriptionFr: string;
	}

	export interface DraftPricingService {
		serviceId: string;
		date: string;
		kind: ServiceKind;
		menuKey: string;
		/** Price in major units as typed; null when left blank (not set). */
		price: number | null;
		seatingCount: number;
		legacySeatings: PricingEditorData['services'][number]['legacySeatings'];
		clearLegacyPrices: boolean;
	}

	/** The Deposit rule as edited: percentage as typed, fixed amount in
	 * major units as typed. */
	export interface DraftDeposit {
		type: DepositType;
		percent: number | null;
		fixed: number | null;
	}

	/** A tier as edited: its window in the chosen unit, as typed. */
	export interface DraftTier {
		key: number;
		amount: number | null;
		unit: 'hours' | 'days';
		percent: number | null;
	}

	export interface DraftRefund {
		type: RefundPolicyType;
		textEn: string;
		textFr: string;
		tiers: DraftTier[];
	}

	let nextKey = 0;

	export function toDraftMenus(pricing: PricingEditorData | undefined): DraftMenu[] {
		return (pricing?.menus ?? []).map((menu) => ({
			key: menu.id,
			id: menu.id,
			nameEn: menu.nameEn,
			nameFr: menu.nameFr,
			descriptionEn: menu.descriptionEn ?? '',
			descriptionFr: menu.descriptionFr ?? '',
		}));
	}

	export function toDraftPricingServices(pricing: PricingEditorData | undefined): DraftPricingService[] {
		return (pricing?.services ?? []).map((service) => ({
			serviceId: service.serviceId,
			date: service.date,
			kind: service.kind,
			menuKey: service.menuId ?? '',
			price: service.priceAmount === null ? null : service.priceAmount / 100,
			seatingCount: service.seatingCount,
			legacySeatings: service.legacySeatings,
			clearLegacyPrices: false,
		}));
	}

	/** A Service just picked on the Days picker: no Menu, no price yet. */
	export function newPricingService(serviceId: string, date: string, kind: ServiceKind): DraftPricingService {
		return {
			serviceId,
			date,
			kind,
			menuKey: '',
			price: null,
			seatingCount: 0,
			legacySeatings: [],
			clearLegacyPrices: false,
		};
	}

	/** The Event's Deposit rule; a new Event gets full payment online. */
	export function toDraftDeposit(pricing: PricingEditorData | undefined): DraftDeposit {
		const rule = pricing?.deposit ?? FULL_PAYMENT_DEPOSIT;
		return {
			type: rule.type,
			percent: rule.type === 'percent' ? rule.value : 30,
			fixed: rule.type === 'fixed' ? rule.value / 100 : null,
		};
	}

	export function toDraftTiers(tiers: readonly RefundTier[]): DraftTier[] {
		return tiers.map((tier) => {
			const inDays = tier.hoursBefore > 0 && tier.hoursBefore % 24 === 0;
			return {
				key: nextKey++,
				amount: inDays ? tier.hoursBefore / 24 : tier.hoursBefore,
				unit: inDays ? 'days' : 'hours',
				percent: tier.percent,
			};
		});
	}

	/** The Event's Refund Policy as edited. `pricing` absent means a new
	 * Event, which gets the default policy (the column default). */
	export function toDraftRefund(pricing: PricingEditorData | undefined, isNew = false): DraftRefund {
		const policy = pricing?.refundPolicy ?? (isNew ? DEFAULT_REFUND_POLICY : EMPTY_MANUAL_REFUND_POLICY);
		return {
			type: policy.type,
			textEn: policy.textEn ?? '',
			textFr: policy.textFr ?? '',
			tiers: toDraftTiers(policy.tiers.length > 0 ? policy.tiers : refundableUntilTiers(24)),
		};
	}

	/** The Event's currency; a new Event is priced in euros. */
	export function toDraftCurrency(pricing: PricingEditorData | undefined): string {
		return pricing?.currency ?? DEFAULT_EVENT_CURRENCY;
	}

	export function newMenuKey(): string {
		return `new-${nextKey++}`;
	}

	export function newTierKey(): number {
		return nextKey++;
	}
</script>

<script lang="ts">
	import { AlertTriangle, CalendarDays, Plus, Trash2, UtensilsCrossed } from 'lucide-svelte';
	import EnglishVersion, { getEnglishAuto } from '$lib/components/admin/EnglishVersion.svelte';
	import { EVENT_CURRENCIES, formatCurrency } from '$lib/utils/currency';
	import { formatDayKey } from '$lib/utils/event-time';
	import type { PricingPayload } from '$lib/types/pricing-editor';
	import {
		MAX_FIXED_DEPOSIT,
		isFullPayment,
		isValidDepositRule,
		priceReservation,
		type DepositRule,
	} from '$lib/utils/pricing';
	import {
		ALWAYS_REFUNDABLE_TIERS,
		MAX_HOURS_BEFORE,
		MAX_REFUND_POLICY_TEXT,
		MAX_TIERS,
		NEVER_REFUNDABLE_TIERS,
		describeRefundPolicy,
		validateTiers,
		type RefundPolicy,
	} from '$lib/utils/refund-policy';

	let {
		menus = $bindable(),
		deposit = $bindable(),
		refund = $bindable(),
		services = $bindable(),
		currency = $bindable(),
		currencyLocked = false,
		daysTabName,
		seatingCountOf,
	}: {
		menus: DraftMenu[];
		deposit: DraftDeposit;
		refund: DraftRefund;
		services: DraftPricingService[];
		/** The Event's currency (issue 042). */
		currency: string;
		/** The Event has a Reservation: the currency can no longer change. */
		currencyLocked?: boolean;
		/** The tab where Days and meals are picked, named in the empty state. */
		daysTabName: string;
		/** Live Seating count per Service, when the host edits Seatings
		 * alongside (new-event form); else the saved count is shown. */
		seatingCountOf?: (serviceId: string) => number;
	} = $props();

	const englishAuto = getEnglishAuto();

	/** An empty price field: the price is not set yet. */
	function isBlank(price: number | null | undefined | ''): boolean {
		return price === null || price === undefined || price === '';
	}

	/** A typed price is valid when it is a non-negative amount to the cent. */
	function isValidPrice(price: number | null): boolean {
		return price !== null && Number.isFinite(price) && price >= 0 && Math.abs(Math.round(price * 100) - price * 100) < 1e-6;
	}

	/** The rule as posted, or null while what is typed is not valid. */
	const depositRule: DepositRule | null = $derived.by(() => {
		let rule: DepositRule;
		if (deposit.type === 'none') {
			rule = { type: 'none', value: 0 };
		} else if (deposit.type === 'percent') {
			if (isBlank(deposit.percent)) return null;
			rule = { type: 'percent', value: Number(deposit.percent) };
		} else {
			if (isBlank(deposit.fixed) || !isValidPrice(deposit.fixed)) return null;
			rule = { type: 'fixed', value: Math.round((deposit.fixed as number) * 100) };
		}
		return isValidDepositRule(rule) ? rule : null;
	});

	/** What one guest pays online and at the venue for a Service's price,
	 * per the rule being edited (same Pricing module as the booking). */
	function depositPreview(service: DraftPricingService): string | null {
		if (isBlank(service.price) || !isValidPrice(service.price) || !depositRule) return null;
		const unitPrice = Math.round((service.price as number) * 100);
		if (unitPrice === 0) return 'Repas gratuit : rien à régler.';
		const price = priceReservation({ unitPrice, seats: 1, deposit: depositRule });
		const amount = (value: number) => formatCurrency(value, currency, 'fr-FR');
		if (price.balance === 0) {
			return isFullPayment(depositRule)
				? `Paiement intégral en ligne : ${amount(price.deposit)} par convive.`
				: `Acompte : ${amount(price.deposit)} par convive (le prix entier) — rien à régler sur place.`;
		}
		if (price.deposit === 0) {
			return `Pas d’acompte : ${amount(price.balance)} par convive à régler sur place.`;
		}
		return `Acompte : ${amount(price.deposit)} par convive — reste ${amount(price.balance)} à régler sur place.`;
	}

	/** The tiers as posted (hours, largest window first), or null while what
	 * is typed is not valid. */
	const refundTiers: RefundTier[] | null = $derived.by(() => {
		const tiers: RefundTier[] = [];
		for (const tier of refund.tiers) {
			if (isBlank(tier.amount) || isBlank(tier.percent)) return null;
			const amount = Number(tier.amount);
			tiers.push({ hoursBefore: tier.unit === 'days' ? amount * 24 : amount, percent: Number(tier.percent) });
		}
		return validateTiers(tiers);
	});

	/** The policy as posted, or null while invalid. A manual policy keeps
	 * the tiers typed so far when they are valid. */
	const refundPolicy: RefundPolicy | null = $derived.by(() => {
		const textEn = refund.textEn.trim();
		const textFr = refund.textFr.trim();
		if (textEn.length > MAX_REFUND_POLICY_TEXT || textFr.length > MAX_REFUND_POLICY_TEXT) return null;
		if (refund.type === 'rules' && !refundTiers) return null;
		return { type: refund.type, textEn: textEn || null, textFr: textFr || null, tiers: refundTiers ?? [] };
	});

	/** The policy as guests will read it, in French and English. */
	const refundPreview = $derived.by(() => {
		if (!refundPolicy) return null;
		const options = { fullPayment: depositRule ? isFullPayment(depositRule) : false };
		return {
			fr: describeRefundPolicy(refundPolicy, 'fr', options),
			en: describeRefundPolicy(refundPolicy, 'en', options),
		};
	});

	function applyRefundPreset(tiers: readonly RefundTier[]) {
		refund.tiers = toDraftTiers(tiers);
	}

	/** Whether the typed tiers are exactly these (to mark the preset). */
	function isPreset(tiers: readonly RefundTier[]): boolean {
		return refundTiers !== null && JSON.stringify(refundTiers) === JSON.stringify(tiers);
	}

	const REFUND_PRESETS: { label: string; tiers: readonly RefundTier[] }[] = [
		{ label: 'Remboursable jusqu’à 24 h avant', tiers: refundableUntilTiers(24) },
		{ label: 'Remboursable jusqu’à 48 h avant', tiers: refundableUntilTiers(48) },
		{ label: 'Remboursable jusqu’à 7 jours avant', tiers: refundableUntilTiers(168) },
		{ label: 'Toujours remboursable', tiers: ALWAYS_REFUNDABLE_TIERS },
		{ label: 'Jamais remboursable', tiers: NEVER_REFUNDABLE_TIERS },
	];

	function addRefundTier() {
		const last = refund.tiers[refund.tiers.length - 1];
		refund.tiers.push({ key: newTierKey(), amount: 0, unit: last?.unit ?? 'hours', percent: 0 });
	}

	function removeRefundTier(index: number) {
		refund.tiers.splice(index, 1);
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
				clearLegacyPrices: service.clearLegacyPrices,
			})),
			currency,
			// An invalid rule is caught before posting (firstBlockingField).
			deposit: depositRule ?? undefined,
			refundPolicy: refundPolicy ?? undefined,
		} satisfies PricingPayload)
	);

	const MEAL_LABEL = { lunch: 'Déjeuner', dinner: 'Dîner' } as const;

	function dayLabel(date: string): string {
		return formatDayKey(date, 'fr');
	}

	function menuLabel(menu: DraftMenu, index: number): string {
		return menu.nameFr.trim() || menu.nameEn.trim() || `Menu ${index + 1} (sans nom)`;
	}

	function servicesOffering(menu: DraftMenu): number {
		return services.filter((service) => service.menuKey === menu.key).length;
	}

	function addMenu() {
		const key = newMenuKey();
		menus.push({ key, id: null, nameEn: '', nameFr: '', descriptionEn: '', descriptionFr: '' });
		requestAnimationFrame(() => document.getElementById(`menu-${key}-nameFr`)?.focus());
	}

	function removeMenu(index: number) {
		menus.splice(index, 1);
	}

	/** First field that blocks the save, with the message to show. */
	export function firstBlockingField(): { id: string; message: string } | null {
		for (const [index, menu] of menus.entries()) {
			if (!menu.nameFr.trim()) {
				return { id: `menu-${menu.key}-nameFr`, message: `Le menu ${index + 1} doit avoir un nom en français.` };
			}
			// Generated from the French when translation is on.
			if (!englishAuto && !menu.nameEn.trim()) {
				return { id: `menu-${menu.key}-nameEn`, message: `Le menu ${index + 1} doit avoir un nom en anglais.` };
			}
		}
		if (!depositRule) {
			return deposit.type === 'percent'
				? { id: 'deposit-percent', message: 'Pourcentage d’acompte invalide : saisissez un nombre entier entre 1 et 100.' }
				: {
					id: 'deposit-fixed',
					message: `Acompte fixe invalide : saisissez un montant par convive supérieur à zéro, au centime près (${MAX_FIXED_DEPOSIT / 100} au plus).`,
				};
		}
		if (!refundPolicy) {
			if (refund.textEn.trim().length > MAX_REFUND_POLICY_TEXT || refund.textFr.trim().length > MAX_REFUND_POLICY_TEXT) {
				return { id: 'refund-textFr', message: `Le texte de la politique de remboursement dépasse ${MAX_REFUND_POLICY_TEXT} caractères.` };
			}
			return {
				id: refund.tiers.length > 0 ? `refund-tier-${refund.tiers[0].key}-amount` : 'refund-add-tier',
				message:
					`Paliers de remboursement invalides : de 1 à ${MAX_TIERS} paliers, chacun avec un délai différent ` +
					`(nombre entier, ${MAX_HOURS_BEFORE / 24} jours au plus) et un pourcentage entier de 0 à 100 qui ` +
					'diminue à mesure que la séance approche.',
			};
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

	const INPUT_CLASS =
		'w-full px-3 py-2 border border-border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm';
	const LABEL_CLASS = 'block text-xs font-medium text-foreground-alt mb-1';
</script>

<div class="space-y-8">
	<input type="hidden" name="pricing" value={payload} />

	<section class="bg-background rounded-lg border border-border-card" aria-labelledby="currency-title">
		<header class="p-4 lg:p-6 border-b border-border-card">
			<h3 id="currency-title" class="text-lg font-semibold text-foreground">Devise</h3>
			<p class="text-sm text-muted-foreground">
				Une seule devise pour tout l’événement : les prix des repas, l’acompte fixe, les codes promo à montant
				fixe et le paiement en ligne.
			</p>
		</header>
		<div class="px-4 lg:px-6 py-4 max-w-[12rem]">
			<label for="event-currency" class={LABEL_CLASS}>Devise de l’événement</label>
			<select
				id="event-currency"
				bind:value={currency}
				disabled={currencyLocked}
				aria-describedby={currencyLocked ? 'event-currency-locked' : undefined}
				class="{INPUT_CLASS} disabled:opacity-60"
			>
				{#each EVENT_CURRENCIES as code (code)}
					<option value={code}>{code}</option>
				{/each}
			</select>
		</div>
		{#if currencyLocked}
			<p id="event-currency-locked" class="px-4 lg:px-6 pb-4 -mt-1 text-xs text-muted-foreground">
				L’événement a déjà des réservations : la devise ne peut plus changer, pour que les montants déjà
				réglés restent cohérents.
			</p>
		{/if}
	</section>

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
							<label for="menu-{menu.key}-nameFr" class={LABEL_CLASS}>Nom</label>
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
						<div class="lg:col-span-2">
							<label for="menu-{menu.key}-descriptionFr" class={LABEL_CLASS}>Description (facultative)</label>
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
					<EnglishVersion>
						<div class="grid gap-3 lg:grid-cols-2">
							<div>
								<label for="menu-{menu.key}-nameEn" class={LABEL_CLASS}>Nom (anglais)</label>
								<input
									id="menu-{menu.key}-nameEn"
									type="text"
									maxlength="255"
									bind:value={menu.nameEn}
									placeholder="Tasting menu"
									class={INPUT_CLASS}
								/>
							</div>
							<div class="lg:col-span-2">
								<label for="menu-{menu.key}-descriptionEn" class={LABEL_CLASS}>Description (anglais, facultative)</label>
								<textarea
									id="menu-{menu.key}-descriptionEn"
									rows="3"
									maxlength="10000"
									bind:value={menu.descriptionEn}
									class="{INPUT_CLASS} resize-y"
								></textarea>
							</div>
						</div>
					</EnglishVersion>
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

	<section class="bg-background rounded-lg border border-border-card" aria-labelledby="deposit-title">
		<header class="p-4 lg:p-6 border-b border-border-card">
			<h3 id="deposit-title" class="text-lg font-semibold text-foreground">Acompte</h3>
			<p class="text-sm text-muted-foreground">
				Ce que le convive règle en ligne à la réservation ; le reste est à régler sur place. L’acompte est
				calculé sur le prix après code promo et ne dépasse jamais ce prix. Le montant obtenu s’affiche à
				côté de chaque prix ci-dessous.
			</p>
		</header>
		<fieldset class="px-4 lg:px-6 py-4 space-y-3">
			<legend class="sr-only">Règle d’acompte</legend>
			<label class="flex items-start gap-3 text-sm text-foreground">
				<input type="radio" name="deposit-type" value="percent" bind:group={deposit.type} class="mt-0.5 size-4" />
				<span>
					Acompte en pourcentage
					<span class="block text-xs text-muted-foreground">À 100 %, le convive paie tout en ligne (paiement intégral).</span>
				</span>
			</label>
			{#if deposit.type === 'percent'}
				<div class="pl-7 max-w-[12rem]">
					<label for="deposit-percent" class={LABEL_CLASS}>Pourcentage du prix (1 à 100)</label>
					<div class="flex items-center gap-2">
						<input
							id="deposit-percent"
							type="number"
							inputmode="numeric"
							min="1"
							max="100"
							step="1"
							bind:value={deposit.percent}
							aria-invalid={!depositRule ? 'true' : undefined}
							class={INPUT_CLASS}
						/>
						<span class="text-sm text-muted-foreground">%</span>
					</div>
				</div>
			{/if}
			<label class="flex items-start gap-3 text-sm text-foreground">
				<input type="radio" name="deposit-type" value="fixed" bind:group={deposit.type} class="mt-0.5 size-4" />
				<span>Acompte fixe par convive</span>
			</label>
			{#if deposit.type === 'fixed'}
				<div class="pl-7 max-w-[12rem]">
					<label for="deposit-fixed" class={LABEL_CLASS}>Montant par convive ({currency})</label>
					<input
						id="deposit-fixed"
						type="number"
						inputmode="decimal"
						min="0.01"
						step="0.01"
						bind:value={deposit.fixed}
						aria-invalid={!depositRule ? 'true' : undefined}
						class={INPUT_CLASS}
					/>
					<p class="mt-1 text-xs text-muted-foreground">Jamais plus que le prix du repas.</p>
				</div>
			{/if}
			<label class="flex items-start gap-3 text-sm text-foreground">
				<input type="radio" name="deposit-type" value="none" bind:group={deposit.type} class="mt-0.5 size-4" />
				<span>Pas d’acompte (tout est réglé sur place)</span>
			</label>
		</fieldset>
	</section>

	<section class="bg-background rounded-lg border border-border-card" aria-labelledby="refund-title">
		<header class="p-4 lg:p-6 border-b border-border-card">
			<h3 id="refund-title" class="text-lg font-semibold text-foreground">Politique de remboursement</h3>
			<p class="text-sm text-muted-foreground">
				Ce que le convive récupère de son acompte s’il annule. Elle lui est présentée avant le paiement et sur
				son billet. Quelle que soit la politique, si Germinal annule une séance ou l’événement, l’acompte est
				intégralement remboursé.
			</p>
		</header>
		<div class="px-4 lg:px-6 py-4 space-y-4">
			<fieldset class="space-y-3">
				<legend class="sr-only">Type de politique</legend>
				<label class="flex items-start gap-3 text-sm text-foreground">
					<input type="radio" name="refund-type" value="rules" bind:group={refund.type} class="mt-0.5 size-4" />
					<span>
						Selon des paliers
						<span class="block text-xs text-muted-foreground">
							Le remboursement dépend du délai restant avant la séance ; il sera proposé automatiquement à
							l’annulation.
						</span>
					</span>
				</label>
				<label class="flex items-start gap-3 text-sm text-foreground">
					<input type="radio" name="refund-type" value="manual" bind:group={refund.type} class="mt-0.5 size-4" />
					<span>
						Texte libre
						<span class="block text-xs text-muted-foreground">
							Vous rédigez les conditions ; chaque remboursement est décidé au cas par cas.
						</span>
					</span>
				</label>
			</fieldset>

			{#if refund.type === 'rules'}
				<div class="space-y-3">
					<div class="flex flex-wrap gap-2" role="group" aria-label="Préréglages">
						{#each REFUND_PRESETS as preset (preset.label)}
							<button
								type="button"
								onclick={() => applyRefundPreset(preset.tiers)}
								aria-pressed={isPreset(preset.tiers)}
								class="px-3 py-1.5 text-xs rounded-lg border border-border-input text-foreground-alt hover:bg-muted aria-pressed:bg-foreground aria-pressed:text-background aria-pressed:border-foreground"
							>
								{preset.label}
							</button>
						{/each}
					</div>

					<div class="space-y-2">
						<p class="text-xs text-muted-foreground">
							Chaque palier s’applique si le convive annule au moins ce délai avant la séance (délai exact
							inclus). Plus près de la séance que le dernier palier, rien n’est remboursé.
						</p>
						{#each refund.tiers as tier, index (tier.key)}
							<div class="flex flex-wrap items-end gap-2">
								<div class="w-24">
									<label for="refund-tier-{tier.key}-amount" class={LABEL_CLASS}>Jusqu’à</label>
									<input
										id="refund-tier-{tier.key}-amount"
										type="number"
										inputmode="numeric"
										min="0"
										step="1"
										bind:value={tier.amount}
										aria-invalid={!refundTiers ? 'true' : undefined}
										class={INPUT_CLASS}
									/>
								</div>
								<div class="w-28">
									<label for="refund-tier-{tier.key}-unit" class={LABEL_CLASS}>Unité</label>
									<select id="refund-tier-{tier.key}-unit" bind:value={tier.unit} class={INPUT_CLASS}>
										<option value="hours">heures</option>
										<option value="days">jours</option>
									</select>
								</div>
								<span class="pb-2 text-sm text-muted-foreground">avant la séance :</span>
								<div class="w-24">
									<label for="refund-tier-{tier.key}-percent" class={LABEL_CLASS}>Remboursé</label>
									<div class="flex items-center gap-1">
										<input
											id="refund-tier-{tier.key}-percent"
											type="number"
											inputmode="numeric"
											min="0"
											max="100"
											step="1"
											bind:value={tier.percent}
											aria-invalid={!refundTiers ? 'true' : undefined}
											class={INPUT_CLASS}
										/>
										<span class="text-sm text-muted-foreground">%</span>
									</div>
								</div>
								<button
									type="button"
									onclick={() => removeRefundTier(index)}
									disabled={refund.tiers.length === 1}
									aria-label="Supprimer ce palier"
									title={refund.tiers.length === 1 ? 'Il faut au moins un palier.' : 'Supprimer ce palier'}
									class="mb-0.5 inline-flex items-center justify-center size-8 rounded-md text-red-600 hover:bg-red-50 disabled:text-muted-foreground disabled:hover:bg-transparent disabled:cursor-not-allowed"
								>
									<Trash2 size={16} />
								</button>
							</div>
						{/each}
						<button
							id="refund-add-tier"
							type="button"
							onclick={addRefundTier}
							disabled={refund.tiers.length >= MAX_TIERS}
							class="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-border-input text-foreground-alt hover:bg-muted disabled:opacity-50"
						>
							<Plus size={16} />
							Ajouter un palier
						</button>
					</div>
				</div>
			{:else}
				<div class="space-y-3">
					<div>
						<label for="refund-textFr" class={LABEL_CLASS}>Conditions</label>
						<textarea
							id="refund-textFr"
							rows="3"
							maxlength={MAX_REFUND_POLICY_TEXT}
							bind:value={refund.textFr}
							placeholder="Les remboursements sont étudiés au cas par cas — contactez-nous."
							class="{INPUT_CLASS} resize-y"
						></textarea>
					</div>
					<EnglishVersion>
						<div>
							<label for="refund-textEn" class={LABEL_CLASS}>Conditions (anglais)</label>
							<textarea
								id="refund-textEn"
								rows="3"
								maxlength={MAX_REFUND_POLICY_TEXT}
								bind:value={refund.textEn}
								placeholder="Refunds are handled case by case — contact us."
								class="{INPUT_CLASS} resize-y"
							></textarea>
						</div>
					</EnglishVersion>
					<p class="text-xs text-muted-foreground">
						Si une langue est vide, l’autre est affichée ; si les deux sont vides, rien n’est affiché aux convives.
					</p>
				</div>
			{/if}

			<div class="border-t border-border-card pt-3" aria-live="polite">
				<p class="text-xs font-medium text-foreground-alt mb-1">Ce que verront les convives</p>
				{#if !refundPreview}
					<p class="text-sm text-amber-700">Complétez les paliers pour voir l’aperçu.</p>
				{:else if !refundPreview.fr && !refundPreview.en}
					<p class="text-sm text-muted-foreground">Rien ne sera affiché.</p>
				{:else}
					<p class="text-sm text-foreground">{refundPreview.fr}</p>
					<p class="text-sm text-muted-foreground mt-1"><span class="text-xs">EN · </span>{refundPreview.en}</p>
				{/if}
			</div>
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
					Aucun repas pour le moment : choisissez d’abord les jours et les repas dans l’onglet
					« {daysTabName} ».
				</p>
			</div>
		{:else}
			<div class="divide-y divide-border-card">
				{#each services as service (service.serviceId)}
					{@const blank = isBlank(service.price)}
					{@const seatingCount = seatingCountOf?.(service.serviceId) ?? service.seatingCount}
					<div class="px-4 lg:px-6 py-4 space-y-3">
						<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_10rem] lg:items-end">
							<div class="sm:col-span-2 lg:col-span-1 lg:pb-2">
								<p class="text-sm font-medium text-foreground">{MEAL_LABEL[service.kind]}</p>
								<p class="text-xs text-muted-foreground first-letter:uppercase">
									{dayLabel(service.date)} · {seatingCount} séance{seatingCount > 1 ? 's' : ''}
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
									Prix par convive, {currency} {blank ? '(non défini)' : service.price === 0 ? '(gratuit)' : ''}
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
						</div>

						{#if depositPreview(service)}
							<p class="text-xs text-muted-foreground" aria-live="polite">{depositPreview(service)}</p>
						{/if}

						{#if blank && seatingCount > 0}
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
</div>
