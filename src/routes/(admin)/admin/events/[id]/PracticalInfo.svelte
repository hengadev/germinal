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
	import EnglishVersion from '$lib/components/admin/EnglishVersion.svelte';

	let { event }: { event: EditorEvent } = $props();

	const toast = getToastContext();
	let saving = $state(false);

	function saveEnhance() {
		saving = true;
		return async ({ result }: { result: import('@sveltejs/kit').ActionResult }) => {
			saving = false;
			if (await handleTabResult(result, toast, 'Modifications enregistrées')) {
				// The English may have been generated from the French on save.
				practicalInfoEn = event?.practicalInfoEn ?? '';
			}
		};
	}

	let practicalInfoFr = $state(event?.practicalInfoFr ?? '');
	let practicalInfoEn = $state(event?.practicalInfoEn ?? '');
	// Dietary Requirements (issue 041): whether the booking form asks.
	let askDietaryRequirements = $state(event?.askDietaryRequirements ?? false);
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
				Infos pratiques
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

		<EnglishVersion>
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
		</EnglishVersion>

		<!-- Allergies et régimes (Dietary Requirements, issue 041) -->
		<div class="flex items-start gap-3 p-4 border border-border-card rounded-lg">
			<!-- Posted even when unchecked, so turning the switch off is saved. -->
			<input type="hidden" name="askDietaryRequirements" value="false" />
			<input
				id="askDietaryRequirements"
				name="askDietaryRequirements"
				type="checkbox"
				role="switch"
				value="true"
				bind:checked={askDietaryRequirements}
				class="mt-0.5 w-5 h-5 border-border-input rounded focus:ring-foreground"
			/>
			<div>
				<label for="askDietaryRequirements" class="block text-sm font-medium text-foreground cursor-pointer">
					Demander les allergies et régimes alimentaires
				</label>
				<p class="text-xs text-muted-foreground">
					Le formulaire de réservation propose un champ facultatif « Allergies ou régime alimentaire »
					pour toute la réservation, rempli uniquement avec le consentement explicite de l'invité.
					Les réponses ne sont visibles que des administrateurs et sont effacées 30 jours après la séance.
				</p>
			</div>
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
