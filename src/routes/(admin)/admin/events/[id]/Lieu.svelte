<script lang="ts">
	// « Lieu » tab (issue 036): locations, the detailed address and the
	// Time Zone of the venue (ADR 0006). Saved with `updateEvent`, which only
	// touches the fields posted here.
	import { enhance } from '$app/forms';
	import { getToastContext } from '$lib/components/toast/state.svelte';
	import { handleTabResult, type EditorEvent } from './editor-forms';
	import { keepEdits } from '$lib/utils/editor-refresh';
	import { MapPin } from 'lucide-svelte';
	import TimeZoneField from '$lib/components/admin/TimeZoneField.svelte';
	import EnglishVersion from '$lib/components/admin/EnglishVersion.svelte';

	let {
		event,
		zones,
		locked = false,
		timeZone = $bindable(),
	}: {
		event: EditorEvent;
		zones: string[];
		locked?: boolean;
		/** The Time Zone picked. */
		timeZone: string;
	} = $props();

	const toast = getToastContext();
	let saving = $state(false);

	// The English may have been generated from the French on save: it is
	// taken back, unless edited since the save started (issue 018).
	const english = () => ({ locationEn, venueNameEn, streetAddressEn, districtEn, cityEn, countryEn });
	function saveEnhance() {
		saving = true;
		const sent = english();
		return async ({ result, formElement }: { result: import('@sveltejs/kit').ActionResult; formElement: HTMLFormElement }) => {
			saving = false;
			await handleTabResult(result, toast, 'Modifications enregistrées', formElement, () => {
				({ locationEn, venueNameEn, streetAddressEn, districtEn, cityEn, countryEn } = keepEdits(sent, english(), {
					locationEn: event?.locationEn ?? '',
					venueNameEn: event?.venueNameEn ?? '',
					streetAddressEn: event?.streetAddressEn ?? '',
					districtEn: event?.districtEn ?? '',
					cityEn: event?.cityEn ?? '',
					countryEn: event?.countryEn ?? '',
				}));
			});
		};
	}

	let locationEn = $state(event?.locationEn ?? "");
	let locationFr = $state(event?.locationFr ?? "");
	let venueNameEn = $state(event?.venueNameEn ?? "");
	let venueNameFr = $state(event?.venueNameFr ?? "");
	let streetAddressEn = $state(event?.streetAddressEn ?? "");
	let streetAddressFr = $state(event?.streetAddressFr ?? "");
	let districtEn = $state(event?.districtEn ?? "");
	let districtFr = $state(event?.districtFr ?? "");
	let cityEn = $state(event?.cityEn ?? "");
	let cityFr = $state(event?.cityFr ?? "");
	let postalCode = $state(event?.postalCode ?? "");
	let countryEn = $state(event?.countryEn ?? "");
	let countryFr = $state(event?.countryFr ?? "");
</script>

<div class="bg-background rounded-lg border border-border-card p-6 lg:p-8">
    <form method="POST" action="?/updateEvent" use:enhance={saveEnhance} class="space-y-6">
        <div>
            <label for="locationFr" class="block text-sm font-medium text-foreground-alt mb-2">Lieu</label>
            <div class="relative">
                <MapPin size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input id="locationFr" name="locationFr" type="text" bind:value={locationFr} placeholder="ex: Jardin du Palais-Royal, Paris" class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent" />
            </div>
        </div>

        <!-- Venue Details -->
        <div class="space-y-4">
            <h3 class="text-sm font-medium text-foreground-alt">Détails du lieu (Optionnel)</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label for="venueNameFr" class="block text-sm font-medium text-foreground-alt mb-2">Nom du lieu</label>
                    <input id="venueNameFr" name="venueNameFr" type="text" bind:value={venueNameFr} placeholder="ex: Maison Lenoir" class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm" />
                </div>
                <div>
                    <label for="streetAddressFr" class="block text-sm font-medium text-foreground-alt mb-2">Adresse</label>
                    <input id="streetAddressFr" name="streetAddressFr" type="text" bind:value={streetAddressFr} placeholder="ex: 12 rue de Rivoli" class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm" />
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label for="districtFr" class="block text-sm font-medium text-foreground-alt mb-2">Quartier</label>
                    <input id="districtFr" name="districtFr" type="text" bind:value={districtFr} placeholder="ex: Le Marais" class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm" />
                </div>
                <div>
                    <label for="postalCode" class="block text-sm font-medium text-foreground-alt mb-2">Code postal</label>
                    <input id="postalCode" name="postalCode" type="text" bind:value={postalCode} placeholder="ex: 75004" class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm" />
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label for="cityFr" class="block text-sm font-medium text-foreground-alt mb-2">Ville</label>
                    <input id="cityFr" name="cityFr" type="text" bind:value={cityFr} placeholder="ex: Paris" class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm" />
                </div>
                <div>
                    <label for="countryFr" class="block text-sm font-medium text-foreground-alt mb-2">Pays</label>
                    <input id="countryFr" name="countryFr" type="text" bind:value={countryFr} placeholder="ex: France" class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm" />
                </div>
            </div>
        </div>

        <EnglishVersion>
            <div>
                <label for="locationEn" class="block text-sm font-medium text-foreground-alt mb-2">Lieu (Anglais)</label>
                <div class="relative">
                    <MapPin size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input id="locationEn" name="locationEn" type="text" bind:value={locationEn} placeholder="ex: Palais-Royal Garden, Paris" class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent" />
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label for="venueNameEn" class="block text-sm font-medium text-foreground-alt mb-2">Nom du lieu (Anglais)</label>
                    <input id="venueNameEn" name="venueNameEn" type="text" bind:value={venueNameEn} placeholder="ex: Maison Lenoir" class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm" />
                </div>
                <div>
                    <label for="streetAddressEn" class="block text-sm font-medium text-foreground-alt mb-2">Adresse (Anglais)</label>
                    <input id="streetAddressEn" name="streetAddressEn" type="text" bind:value={streetAddressEn} placeholder="ex: 12 rue de Rivoli" class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm" />
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label for="districtEn" class="block text-sm font-medium text-foreground-alt mb-2">Quartier (Anglais)</label>
                    <input id="districtEn" name="districtEn" type="text" bind:value={districtEn} placeholder="ex: Le Marais" class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm" />
                </div>
                <div>
                    <label for="cityEn" class="block text-sm font-medium text-foreground-alt mb-2">Ville (Anglais)</label>
                    <input id="cityEn" name="cityEn" type="text" bind:value={cityEn} placeholder="ex: Paris" class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm" />
                </div>
                <div>
                    <label for="countryEn" class="block text-sm font-medium text-foreground-alt mb-2">Pays (Anglais)</label>
                    <input id="countryEn" name="countryEn" type="text" bind:value={countryEn} placeholder="ex: France" class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm" />
                </div>
            </div>
        </EnglishVersion>

        <!-- Time Zone of the venue (ADR 0006) -->
        <TimeZoneField bind:value={timeZone} {zones} {locked} />

        <!-- Hidden on a Draft, which saves itself (issue 018). -->
        <div data-editor-save class="flex flex-col sm:flex-row sm:items-center gap-3 pt-4 border-t border-border-card">
            <button
                type="submit"
                disabled={saving}
                class="sm:ml-auto px-6 py-3 bg-foreground text-background rounded-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-foreground focus:ring-offset-2 transition-colors font-medium disabled:opacity-60"
            >
                {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
        </div>
    </form>
</div>
