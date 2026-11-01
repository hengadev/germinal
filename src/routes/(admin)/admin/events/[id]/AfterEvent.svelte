<script lang="ts">
	// « Après l’événement » tab (issue 054): the Thank-you emailed the
	// morning after each Day to the Guests who came. Saved with
	// `updateEvent`, which only touches the fields posted here; the
	// preview and the test send read the same fields straight from the
	// form, saved or not.
	import { enhance } from '$app/forms';
	import { getToastContext } from '$lib/components/toast/state.svelte';
	import { handleTabResult, type EditorEvent } from './editor-forms';
	import EnglishVersion from '$lib/components/admin/EnglishVersion.svelte';

	let { event }: { event: EditorEvent } = $props();

	const toast = getToastContext();
	let saving = $state(false);
	let previewFr = $state<string | null>(null);
	let previewEn = $state<string | null>(null);
	let testing = $state(false);

	function saveEnhance() {
		saving = true;
		return async ({ result, formElement }: { result: import('@sveltejs/kit').ActionResult; formElement: HTMLFormElement }) => {
			saving = false;
			await handleTabResult(result, toast, 'Modifications enregistrées', formElement);
		};
	}

	// The preview and the test post the same fields; only their answer
	// differs, so they never reload the page data.
	function previewEnhance() {
		return async ({ result }: { result: import('@sveltejs/kit').ActionResult }) => {
			if (result.type === 'success') {
				const data = result.data as { previewFr?: string; previewEn?: string };
				previewFr = data.previewFr ?? null;
				previewEn = data.previewEn ?? null;
			} else if (result.type === 'failure') {
				toast.error('Erreur', (result.data as { error?: string } | undefined)?.error ?? 'Aperçu impossible.');
			}
		};
	}

	function testEnhance() {
		testing = true;
		return async ({ result }: { result: import('@sveltejs/kit').ActionResult }) => {
			testing = false;
			if (result.type === 'success') {
				toast.success('Test envoyé', (result.data as { success?: string } | undefined)?.success ?? 'E-mail de test mis en file d’attente.');
			} else if (result.type === 'failure') {
				toast.error('Erreur', (result.data as { error?: string } | undefined)?.error ?? 'Envoi impossible.');
			}
		};
	}

	let thankYouEnabled = $state(event?.thankYouEnabled ?? false);
	let thankYouMessageFr = $state(event?.thankYouMessageFr ?? '');
	let thankYouMessageEn = $state(event?.thankYouMessageEn ?? '');
	let thankYouLinkUrl = $state(event?.thankYouLinkUrl ?? '');
	let thankYouLinkLabelFr = $state(event?.thankYouLinkLabelFr ?? '');
	let thankYouLinkLabelEn = $state(event?.thankYouLinkLabelEn ?? '');

	/** Back to what is saved (a published Event's « Annuler », issue 020). */
	export function restore() {
		thankYouEnabled = event?.thankYouEnabled ?? false;
		thankYouMessageFr = event?.thankYouMessageFr ?? '';
		thankYouMessageEn = event?.thankYouMessageEn ?? '';
		thankYouLinkUrl = event?.thankYouLinkUrl ?? '';
		thankYouLinkLabelFr = event?.thankYouLinkLabelFr ?? '';
		thankYouLinkLabelEn = event?.thankYouLinkLabelEn ?? '';
	}
</script>

<div class="bg-background rounded-lg border border-border-card p-6 lg:p-8">
	<form method="POST" action="?/updateEvent" use:enhance={saveEnhance} class="space-y-6">
		<div>
			<h2 class="text-lg font-semibold text-foreground mb-1">Après l'événement</h2>
			<p class="text-xs text-muted-foreground">
				Le lendemain de chaque journée, dès 10 h 00 (heure de l'événement), un e-mail de
				remerciement est envoyé aux invités confirmés qui sont venus (au moins un enregistrement
				d'arrivée) — une seule fois par réservation, et jusqu'à 3 jours après la fin de la journée.
			</p>
		</div>

		<!-- Remerciement on/off -->
		<div class="flex items-start gap-3 p-4 border border-border-card rounded-lg">
			<!-- Posted even when unchecked, so turning the switch off is saved. -->
			<input type="hidden" name="thankYouEnabled" value="false" />
			<input
				id="thankYouEnabled"
				name="thankYouEnabled"
				type="checkbox"
				role="switch"
				value="true"
				bind:checked={thankYouEnabled}
				class="mt-0.5 w-5 h-5 border-border-input rounded focus:ring-foreground"
			/>
			<div>
				<label for="thankYouEnabled" class="block text-sm font-medium text-foreground cursor-pointer">
					Envoyer le remerciement après l'événement
				</label>
				<p class="text-xs text-muted-foreground">
					L'activation exige un message dans au moins une langue. C'est un message de service :
					pas de désabonnement.
				</p>
			</div>
		</div>

		<!-- Message (Français) -->
		<div>
			<label for="thankYouMessageFr" class="block text-sm font-medium text-foreground-alt mb-2">
				Message
			</label>
			<textarea
				id="thankYouMessageFr"
				name="thankYouMessageFr"
				bind:value={thankYouMessageFr}
				rows="5"
				placeholder="Merci d'avoir partagé cette soirée avec nous. Vos photos sont ici…"
				class="w-full px-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent resize-y"
			></textarea>
		</div>

		<EnglishVersion>
			<div>
				<label for="thankYouMessageEn" class="block text-sm font-medium text-foreground-alt mb-2">
					Message (Anglais)
				</label>
				<textarea
					id="thankYouMessageEn"
					name="thankYouMessageEn"
					bind:value={thankYouMessageEn}
					rows="5"
					placeholder="Thank you for sharing this evening with us. Your photos are here…"
					class="w-full px-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent resize-y"
				></textarea>
				<p class="text-xs text-muted-foreground mt-2">
					Une langue vide retombe sur l'autre ; l'e-mail part dans la langue de réservation de l'invité.
				</p>
			</div>
		</EnglishVersion>

		<!-- Lien facultatif -->
		<div class="grid gap-4 sm:grid-cols-2">
			<div>
				<label for="thankYouLinkUrl" class="block text-sm font-medium text-foreground-alt mb-2">
					Lien (URL, facultatif)
				</label>
				<input
					id="thankYouLinkUrl"
					name="thankYouLinkUrl"
					type="url"
					bind:value={thankYouLinkUrl}
					placeholder="https://…"
					class="w-full px-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent"
				/>
			</div>
			<div>
				<label for="thankYouLinkLabelFr" class="block text-sm font-medium text-foreground-alt mb-2">
					Libellé du lien
				</label>
				<input
					id="thankYouLinkLabelFr"
					name="thankYouLinkLabelFr"
					type="text"
					bind:value={thankYouLinkLabelFr}
					placeholder="Voir les photos"
					class="w-full px-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent"
				/>
			</div>
		</div>
		<EnglishVersion>
			<div>
				<label for="thankYouLinkLabelEn" class="block text-sm font-medium text-foreground-alt mb-2">
					Libellé du lien (Anglais)
				</label>
				<input
					id="thankYouLinkLabelEn"
					name="thankYouLinkLabelEn"
					type="text"
					bind:value={thankYouLinkLabelEn}
					placeholder="See the photos"
					class="w-full px-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent"
				/>
			</div>
		</EnglishVersion>

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

	<!-- Aperçu et test : mêmes champs, actions propres. `data-editor-skip`:
	     never an editor save unit, so « Enregistrer » never sends a test. -->
	<div class="flex flex-wrap gap-3 pt-6">
		<form method="POST" action="?/previewThankYou" use:enhance={previewEnhance} data-editor-skip>
			<input type="hidden" name="thankYouEnabled" value={thankYouEnabled ? 'true' : 'false'} />
			<input type="hidden" name="thankYouMessageFr" value={thankYouMessageFr} />
			<input type="hidden" name="thankYouMessageEn" value={thankYouMessageEn} />
			<input type="hidden" name="thankYouLinkUrl" value={thankYouLinkUrl} />
			<input type="hidden" name="thankYouLinkLabelFr" value={thankYouLinkLabelFr} />
			<input type="hidden" name="thankYouLinkLabelEn" value={thankYouLinkLabelEn} />
			<button
				type="submit"
				class="px-4 py-2 border border-border-input rounded-lg hover:bg-muted focus:outline-none focus:ring-2 focus:ring-foreground transition-colors text-sm font-medium"
			>
				Aperçu de l'e-mail
			</button>
		</form>
		<form method="POST" action="?/testThankYou" use:enhance={testEnhance} data-editor-skip>
			<input type="hidden" name="thankYouEnabled" value={thankYouEnabled ? 'true' : 'false'} />
			<input type="hidden" name="thankYouMessageFr" value={thankYouMessageFr} />
			<input type="hidden" name="thankYouMessageEn" value={thankYouMessageEn} />
			<input type="hidden" name="thankYouLinkUrl" value={thankYouLinkUrl} />
			<input type="hidden" name="thankYouLinkLabelFr" value={thankYouLinkLabelFr} />
			<input type="hidden" name="thankYouLinkLabelEn" value={thankYouLinkLabelEn} />
			<button
				type="submit"
				disabled={testing}
				class="px-4 py-2 border border-border-input rounded-lg hover:bg-muted focus:outline-none focus:ring-2 focus:ring-foreground transition-colors text-sm font-medium disabled:opacity-60"
			>
				{testing ? 'Envoi…' : "M'envoyer un test"}
			</button>
		</form>
	</div>

	{#if previewFr !== null || previewEn !== null}
		<div class="mt-6 grid gap-4 lg:grid-cols-2">
			{#if previewFr !== null}
				<div>
					<h3 class="text-sm font-semibold text-foreground-alt mb-2">Aperçu (Français)</h3>
					<pre class="whitespace-pre-wrap text-xs text-foreground bg-muted rounded-lg border border-border-card p-4">{previewFr}</pre>
				</div>
			{/if}
			{#if previewEn !== null}
				<div>
					<h3 class="text-sm font-semibold text-foreground-alt mb-2">Aperçu (Anglais)</h3>
					<pre class="whitespace-pre-wrap text-xs text-foreground bg-muted rounded-lg border border-border-card p-4">{previewEn}</pre>
				</div>
			{/if}
		</div>
	{/if}
</div>
