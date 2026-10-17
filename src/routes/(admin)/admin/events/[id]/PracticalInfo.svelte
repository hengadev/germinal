<script lang="ts">
	// « Infos pratiques » tab (issue 040): what a Guest needs on the day —
	// arrival instructions, door code, dress code, a contact to call —
	// written in French and English. Given only to Guests holding a Ticket
	// (Ticket page, confirmation and reminder emails), never on the public
	// Event page. Saved with `updateEvent`, which only touches the fields
	// posted here.
	import { enhance } from '$app/forms';
	import { getToastContext } from '$lib/components/toast/state.svelte';
	import { handleTabResult, type EditorEvent } from './editor-forms';

	let { event }: { event: EditorEvent | null } = $props();

	const toast = getToastContext();
	let saving = $state(false);

	function saveEnhance() {
		saving = true;
		return async ({ result }: { result: import('@sveltejs/kit').ActionResult }) => {
			saving = false;
			await handleTabResult(result, toast, 'Modifications enregistrées');
		};
	}

	let practicalInfoFr = $state(event?.practicalInfoFr ?? '');
	let practicalInfoEn = $state(event?.practicalInfoEn ?? '');
</script>

<div class="bg-background rounded-lg border border-border-card p-6 lg:p-8">
	<form method="POST" action="?/updateEvent" use:enhance={saveEnhance} class="space-y-6">
		<div>
			<h2 class="text-lg font-semibold text-foreground mb-1">Infos pratiques</h2>
			<p class="text-xs text-muted-foreground">
				Consignes d'arrivée, code d'entrée, dress code, contact le jour J — communiquées
				uniquement aux détenteurs d'un billet (sur leur billet et dans leurs e-mails),
				jamais sur la page publique de l'événement.
			</p>
		</div>

		<!-- Infos pratiques (Français) -->
		<div>
			<label for="practicalInfoFr" class="block text-sm font-medium text-foreground-alt mb-2">
				Infos pratiques (Français)
			</label>
			<textarea
				id="practicalInfoFr"
				name="practicalInfoFr"
				bind:value={practicalInfoFr}
				rows="5"
				placeholder="Arrivée par la cour intérieure, code 4512#, tenue élégante exigée. Contact le jour J : +33 6 12 34 56 78."
				class="w-full px-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent resize-y"
			></textarea>
		</div>

		<!-- Infos pratiques (Anglais) -->
		<div>
			<label for="practicalInfoEn" class="block text-sm font-medium text-foreground-alt mb-2">
				Infos pratiques (Anglais)
			</label>
			<textarea
				id="practicalInfoEn"
				name="practicalInfoEn"
				bind:value={practicalInfoEn}
				rows="5"
				placeholder="Enter through the courtyard, door code 4512#, elegant dress required. On the day, call +33 6 12 34 56 78."
				class="w-full px-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent resize-y"
			></textarea>
			<p class="text-xs text-muted-foreground mt-2">
				Chaque langue manquante retombe sur l'autre ; laissées vides, aucune section ne s'affiche.
			</p>
		</div>

		<div class="flex flex-col sm:flex-row sm:items-center gap-3 pt-4 border-t border-border-card">
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
