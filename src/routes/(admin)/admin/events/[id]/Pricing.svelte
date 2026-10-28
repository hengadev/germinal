<script lang="ts">
	// « Menus & tarifs » tab: each meal's Menu and price as a programme type
	// with exceptions (two panels, on the Days picked in « Dates &
	// séances »), then the shared pricing editor (issues 022, 023, 027) for
	// the Menus, currency, Deposit and Refund Policy — in one form, saved
	// with the `savePricing` action. The programme is read from the
	// Services and writes into the same drafts: nothing of it is stored.
	// On a Draft the tab saves itself as a whole, once valid and after
	// « Dates & séances » (issue 019, ADR 0010); a save coming back takes
	// its ids and generated English into the drafts without undoing what
	// was typed meanwhile.
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { getToastContext } from '$lib/components/toast/state.svelte';
	import { reportSave } from '$lib/utils/editor-save-form';
	import { adoptSavedMenus, followSavedServices, keepEdits } from '$lib/utils/editor-refresh';
	import { AUTOSAVE_ATTRIBUTE, handleTabResult } from './editor-forms';
	import ProgrammeEditor from '$lib/components/admin/schedule/ProgrammeEditor.svelte';
	import {
		EMPTY_MEAL,
		Programme,
		type MealPlan,
		type ScheduleSource,
		type Wording,
	} from '$lib/components/admin/schedule/programme.svelte';
	import { formatCurrency } from '$lib/utils/currency';
	import PricingEditor, {
		toDraftCurrency,
		toDraftDeposit,
		toDraftMenus,
		toDraftPricingServices,
		toDraftRefund,
		type DraftDeposit,
		type DraftMenu,
		type DraftPricingService,
		type DraftRefund,
	} from '$lib/components/admin/PricingEditor.svelte';
	import type { PricingEditorData } from '$lib/types/pricing-editor';
	import type { PricingValues } from '$lib/utils/event-warnings-live';

	let { data }: { data: { pricing?: PricingEditorData } } = $props();

	const toast = getToastContext();

	let menus: DraftMenu[] = $state(toDraftMenus(data.pricing));
	let refund: DraftRefund = $state(toDraftRefund(data.pricing));
	let deposit: DraftDeposit = $state(toDraftDeposit(data.pricing));
	let services: DraftPricingService[] = $state(toDraftPricingServices(data.pricing));
	let currency: string = $state(toDraftCurrency(data.pricing));
	let saving = $state(false);
	let editor: ReturnType<typeof PricingEditor> | undefined = $state();

	const findService = (date: string, kind: string) => services.find((service) => service.date === date && service.kind === kind);

	const source: ScheduleSource = {
		get days() {
			return [...new Set(services.map((service) => service.date))].sort();
		},
		meal(date, kind): MealPlan {
			const service = findService(date, kind);
			if (!service) return { ...EMPTY_MEAL };
			return { ...EMPTY_MEAL, served: true, menu: service.menuKey, price: service.price };
		},
		write(date, kind, field, value) {
			const service = findService(date, kind);
			if (!service) return;
			if (field === 'menu') service.menuKey = value as string;
			else if (field === 'price') service.price = value as number | null;
		},
	};

	const programme = new Programme(source, 'tarifs');
	let schedule: ReturnType<typeof ProgrammeEditor> | undefined = $state();

	const menuOptions = $derived(
		menus.map((menu, index) => ({ key: menu.key, label: menu.nameFr.trim() || menu.nameEn.trim() || `Menu ${index + 1} (sans nom)` }))
	);
	const words: Wording = {
		menuName: (key) => menuOptions.find((menu) => menu.key === key)?.label ?? 'Aucun menu',
		price: (price) => (price === null ? 'prix non défini' : price === 0 ? 'gratuit' : formatCurrency(Math.round(price * 100), currency, 'fr-FR')),
	};

	// Only saved Services are priced: the list follows each save of
	// « Dates & séances » (issue 019), whose save goes first, so pricing
	// never refers to a Service that does not exist. A Service still
	// listed keeps its Menu and price as typed; a new one, with neither,
	// takes the programme's.
	$effect(() => {
		const saved = toDraftPricingServices(data.pricing);
		untrack(() => {
			const next = followSavedServices(services, saved);
			if (!next) return;
			const known = new Set(services.map((service) => service.serviceId));
			services = next;
			for (const service of services) {
				if (known.has(service.serviceId) || service.menuKey !== '' || service.price !== null) continue;
				const plan = programme.plan[service.kind];
				if (!plan.served) continue;
				service.menuKey = plan.menu;
				service.price = plan.price;
			}
		});
	});

	/** A blocking field of a Service's price is in the programme: show
	 * that Service's Day. */
	function focusField(id: string) {
		const service = services.find((s) => id === `service-${s.serviceId}-price`);
		if (service && !document.getElementById(id)) {
			schedule?.select([service.date], service.kind);
			requestAnimationFrame(() => document.getElementById(`pricing-programme-sel-${service.kind}-price`)?.focus());
			return;
		}
		document.getElementById(id)?.focus();
	}

	// A Draft's autosave refused (issue 019): what blocks it shows in the
	// tab, following what is typed, until fixed — without a toast or moving
	// the cursor while the Admin types. An explicit save says it with a
	// toast and goes to the field.
	let refused = $state(false);
	const shownBlocking = $derived(refused ? (editor?.firstBlockingField() ?? null) : null);

	function savePricingEnhance({ cancel, formElement }: { cancel: () => void; formElement: HTMLFormElement }) {
		const blocking = editor?.firstBlockingField() ?? null;
		if (blocking) {
			cancel();
			reportSave(formElement, { ok: false, reason: 'invalid', message: blocking.message });
			if (formElement.closest(`[${AUTOSAVE_ATTRIBUTE}]`)) {
				refused = true;
				return;
			}
			toast.error('Erreur', blocking.message);
			requestAnimationFrame(() => focusField(blocking.id));
			return;
		}
		refused = false;
		saving = true;
		const sent = {
			menus: $state.snapshot(menus),
			refundTextEn: refund.textEn,
			clearing: new Set(services.filter((service) => service.clearLegacyPrices).map((service) => service.serviceId)),
		};
		return async ({ result, formElement }: { result: import('@sveltejs/kit').ActionResult; formElement: HTMLFormElement }) => {
			saving = false;
			await handleTabResult(result, toast, 'Menus et tarifs enregistrés', formElement, () => {
				const menuIds = (result as { data?: { menuIds?: Record<string, string> } }).data?.menuIds;
				adoptSaved(sent, menuIds);
			});
		};
	}

	/**
	 * Take what a save made into the drafts, keeping what was typed since it
	 * started (issue 019): new Menus take their ids, and the English
	 * generated from the French is taken where not edited meanwhile.
	 */
	function adoptSaved(
		sent: { menus: DraftMenu[]; refundTextEn: string; clearing: Set<string> },
		menuIds: Record<string, string> | undefined
	) {
		adoptSavedMenus(menus, sent.menus, toDraftMenus(data.pricing), menuIds);
		({ textEn: refund.textEn } = keepEdits(
			{ textEn: sent.refundTextEn },
			{ textEn: refund.textEn },
			{ textEn: toDraftRefund(data.pricing).textEn }
		));
		// The legacy prices asked to be cleared are gone.
		for (const service of services) {
			if (service.clearLegacyPrices && sent.clearing.has(service.serviceId)) service.clearLegacyPrices = false;
		}
	}

	/** Back to the saved menus and prices — a published Event's
	 * « Annuler » (issue 020). A save keeps the drafts (`adoptSaved`). */
	export function restore() {
		refused = false;
		menus = toDraftMenus(data.pricing);
		services = toDraftPricingServices(data.pricing);
		deposit = toDraftDeposit(data.pricing);
		refund = toDraftRefund(data.pricing);
		currency = toDraftCurrency(data.pricing);
		programme.reinfer();
	}

	/** What this tab holds now, saved or not: « À vérifier » and the tab
	 * marks follow it as it is typed (issue 021). */
	export function warningValues(): PricingValues {
		return { services };
	}
</script>

<!-- Why a Draft's autosave is held back (issue 019). -->
<div aria-live="polite">
	{#if shownBlocking}
		{@const field = shownBlocking}
		<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-6 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
			<p><span class="font-medium">Non enregistré :</span> {field.message}</p>
			<button type="button" onclick={() => focusField(field.id)} class="underline underline-offset-2 hover:text-red-900 transition-colors cursor-pointer">
				Corriger
			</button>
		</div>
	{/if}
</div>

<form data-editor-form="pricing" method="POST" action="?/savePricing" use:enhance={savePricingEnhance} novalidate class="space-y-8">
	{#if services.length === 0}
		<p class="bg-background rounded-lg border border-border-card px-4 lg:px-6 py-6 text-sm text-muted-foreground">
			Aucun repas pour le moment : choisissez d’abord les jours et les repas dans l’onglet « Dates &amp; séances ».
		</p>
	{:else}
		<ProgrammeEditor bind:this={schedule} {programme} {words} menus={menuOptions} {currency} idPrefix="pricing-programme" />
	{/if}

	<PricingEditor
		bind:this={editor}
		bind:menus
		bind:deposit
		bind:refund
		bind:services
		bind:currency
		currencyLocked={data.pricing?.currencyLocked ?? false}
		daysTabName="Dates & séances"
		servicesList={services.some((service) => service.legacySeatings.length > 0)}
	/>

	<!-- Hidden on a Draft, which saves itself (issue 019), and on a published
	     Event, which saves through its bar (issue 020). -->
	<div data-editor-save class="flex flex-col sm:flex-row sm:items-center gap-3 pt-4 border-t border-border-card">
		<button
			type="submit"
			disabled={saving}
			class="sm:ml-auto px-6 py-3 bg-foreground text-background rounded-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-foreground focus:ring-offset-2 transition-colors font-medium disabled:opacity-60"
		>
			{saving ? 'Enregistrement…' : 'Enregistrer les menus et tarifs'}
		</button>
	</div>
</form>
