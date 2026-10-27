<script lang="ts">
	// « Menus & tarifs » tab: the shared pricing editor (issues 022, 023,
	// 027) in its own form, saved with the `savePricing` action. Days and
	// meals are picked in « Dates & séances ».
	import { enhance } from '$app/forms';
	import { getToastContext } from '$lib/components/toast/state.svelte';
	import { reportSave } from '$lib/utils/editor-save-form';
	import { refreshAfterSave, saveOutcomeOf } from './editor-forms';
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

	function savePricingEnhance({ cancel, formElement }: { cancel: () => void; formElement: HTMLFormElement }) {
		const blocking = editor?.firstBlockingField() ?? null;
		if (blocking) {
			cancel();
			toast.error('Erreur', blocking.message);
			reportSave(formElement, { ok: false, reason: 'invalid', message: blocking.message });
			requestAnimationFrame(() => document.getElementById(blocking.id)?.focus());
			return;
		}
		saving = true;
		return async ({ result, formElement }: { result: import('@sveltejs/kit').ActionResult; formElement: HTMLFormElement }) => {
			saving = false;
			if (result.type === 'success') {
				toast.success('Succès', (result.data as { success?: string })?.success ?? 'Menus et tarifs enregistrés');
				await refreshAfterSave(formElement, restore);
				reportSave(formElement, { ok: true });
			} else if (result.type === 'failure') {
				toast.error('Erreur', (result.data as { error?: string })?.error ?? 'Une erreur est survenue');
			} else if (result.type === 'error') {
				toast.error('Erreur', 'Une erreur est survenue');
			}
			if (result.type !== 'success') reportSave(formElement, saveOutcomeOf(result));
		};
	}

	/** Back to the saved menus and prices — after a save, or a published
	 * Event's « Annuler » (issue 020). */
	export function restore() {
		menus = toDraftMenus(data.pricing);
		services = toDraftPricingServices(data.pricing);
		deposit = toDraftDeposit(data.pricing);
		refund = toDraftRefund(data.pricing);
		currency = toDraftCurrency(data.pricing);
	}

	/** What this tab holds now, saved or not: « À vérifier » and the tab
	 * marks follow it as it is typed (issue 021). */
	export function warningValues(): PricingValues {
		return { services };
	}
</script>

<form data-editor-form="pricing" method="POST" action="?/savePricing" use:enhance={savePricingEnhance} novalidate class="space-y-8">
	<PricingEditor
		bind:this={editor}
		bind:menus
		bind:deposit
		bind:refund
		bind:services
		bind:currency
		currencyLocked={data.pricing?.currencyLocked ?? false}
		daysTabName="Dates & séances"
	/>

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
