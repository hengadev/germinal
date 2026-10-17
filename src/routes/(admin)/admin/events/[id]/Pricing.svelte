<script lang="ts">
	// « Menus & tarifs » tab: the shared pricing editor (issues 022, 023,
	// 027) in its own form, saved with the `savePricing` action. Days and
	// meals are picked in « Dates & séances ».
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { getToastContext } from '$lib/components/toast/state.svelte';
	import { announceSaved } from '$lib/utils/leave-guard';
	import PricingEditor, {
		toDraftDeposit,
		toDraftMenus,
		toDraftPricingServices,
		toDraftRefund,
		newPricingService,
		type DraftDeposit,
		type DraftMenu,
		type DraftPricingService,
		type DraftRefund,
	} from '$lib/components/admin/PricingEditor.svelte';
	import type { PricingEditorData } from '$lib/types/pricing-editor';

	let {
		data,
		follow,
		seatingCountOf,
		extend,
	}: {
		data: { pricing?: PricingEditorData };
		/** A new Event (issue 036): its meals are the ones picked in « Dates
		 * & séances », not saved yet, which the prices follow live. */
		follow?: { serviceId: string; date: string; kind: 'lunch' | 'dinner' }[];
		seatingCountOf?: (serviceId: string) => number;
		/** Adds other tabs' fields to the posted form (new Event). */
		extend?: (formData: FormData) => void;
	} = $props();

	const toast = getToastContext();

	let menus: DraftMenu[] = $state(toDraftMenus(data.pricing));
	let refund: DraftRefund = $state(toDraftRefund(data.pricing));
	let deposit: DraftDeposit = $state(toDraftDeposit(data.pricing));
	let services: DraftPricingService[] = $state(toDraftPricingServices(data.pricing));
	let saving = $state(false);
	let editor: ReturnType<typeof PricingEditor> | undefined = $state();

	// A new Event's prices follow the meals picked: a newly picked meal gets
	// an empty price, a meal still picked keeps what was typed.
	$effect(() => {
		if (!follow) return;
		const picked = follow.map(({ serviceId, date, kind }) => ({ serviceId, date, kind }));
		untrack(() => {
			services = picked.map(({ serviceId, date, kind }) =>
				services.find((service) => service.serviceId === serviceId) ?? newPricingService(serviceId, date, kind)
			);
		});
	});

	function savePricingEnhance({ formData, cancel }: { formData: FormData; cancel: () => void }) {
		const blocking = editor?.firstBlockingField() ?? null;
		if (blocking) {
			cancel();
			toast.error('Erreur', blocking.message);
			requestAnimationFrame(() => document.getElementById(blocking.id)?.focus());
			return;
		}
		extend?.(formData);
		saving = true;
		return async ({ result, formElement }: { result: import('@sveltejs/kit').ActionResult; formElement: HTMLFormElement }) => {
			saving = false;
			if (result.type === 'redirect') {
				// First save of a new Event: on to the Draft's page.
				announceSaved(formElement, true);
				toast.success('Succès', 'Brouillon créé.');
				await goto(result.location, { invalidateAll: true });
			} else if (result.type === 'success') {
				toast.success('Succès', (result.data as { success?: string })?.success ?? 'Menus et tarifs enregistrés');
				await invalidateAll();
				menus = toDraftMenus(data.pricing);
				services = toDraftPricingServices(data.pricing);
				deposit = toDraftDeposit(data.pricing);
				refund = toDraftRefund(data.pricing);
				announceSaved(formElement);
			} else if (result.type === 'failure') {
				toast.error('Erreur', (result.data as { error?: string })?.error ?? 'Une erreur est survenue');
			} else if (result.type === 'error') {
				toast.error('Erreur', 'Une erreur est survenue');
			}
		};
	}
</script>

<form data-editor-form="pricing" method="POST" action="?/savePricing" use:enhance={savePricingEnhance} novalidate class="space-y-8">
	<PricingEditor bind:this={editor} bind:menus bind:deposit bind:refund bind:services daysTabName="Dates & séances" {seatingCountOf} />

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
