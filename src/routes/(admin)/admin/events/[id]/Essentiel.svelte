<script lang="ts">
	// « Essentiel » tab (issue 036): titles, subtitles and descriptions —
	// nothing required (ADR 0008) — and the Internal Notes (issue 039).
	// Saved with `updateEvent`, which only touches the fields posted here.
	// The Publication control (Visibility, Spotlight, Portfolio, ADR 0010)
	// lives in the editor's header (issue 077).
	import { enhance } from '$app/forms';
	import { getToastContext } from '$lib/components/toast/state.svelte';
	import { handleTabResult, type EditorEvent } from './editor-forms';
	import { keepEdits } from '$lib/utils/editor-refresh';
	import EnglishVersion from '$lib/components/admin/EnglishVersion.svelte';
	import { Type, FileText, Lock } from 'lucide-svelte';
	import type { EssentielValues } from '$lib/utils/event-warnings-live';

	let { event }: { event: EditorEvent } = $props();

	const toast = getToastContext();
	let saving = $state(false);

	// The English may have been generated from the French on save: it is
	// taken back, unless edited since the save started (issue 018).
	const english = () => ({ titleEn, subtitleEn, descriptionEn });
	function saveEnhance() {
		saving = true;
		const sent = english();
		return async ({ result, formElement }: { result: import('@sveltejs/kit').ActionResult; formElement: HTMLFormElement }) => {
			saving = false;
			await handleTabResult(result, toast, 'Modifications enregistrées', formElement, () => {
				({ titleEn, subtitleEn, descriptionEn } = keepEdits(sent, english(), {
					titleEn: event?.titleEn ?? '',
					subtitleEn: event?.subtitleEn ?? '',
					descriptionEn: event?.descriptionEn ?? '',
				}));
			});
		};
	}

	let titleEn = $state(event?.titleEn ?? "");
	let titleFr = $state(event?.titleFr ?? "");
	let descriptionEn = $state(event?.descriptionEn ?? "");
	let descriptionFr = $state(event?.descriptionFr ?? "");
	let subtitleEn = $state(event?.subtitleEn ?? "");
	let subtitleFr = $state(event?.subtitleFr ?? "");
	let internalNotes = $state(event?.internalNotes ?? "");

	/** Back to the saved text (a published Event's « Annuler », issue
	 * 020). The Publication control saves at once: nothing to restore. */
	export function restore() {
		titleFr = event?.titleFr ?? '';
		titleEn = event?.titleEn ?? '';
		subtitleFr = event?.subtitleFr ?? '';
		subtitleEn = event?.subtitleEn ?? '';
		descriptionFr = event?.descriptionFr ?? '';
		descriptionEn = event?.descriptionEn ?? '';
		internalNotes = event?.internalNotes ?? '';
	}

	/** What this tab holds now, saved or not: « À vérifier » and the tab
	 * marks follow it as it is typed (issue 021). */
	export function warningValues(): EssentielValues {
		return { titleEn, titleFr, descriptionEn, descriptionFr };
	}
</script>

<div class="space-y-6">
	<div class="bg-background rounded-lg border border-border-card p-6 lg:p-8">
		<form method="POST" action="?/updateEvent" use:enhance={saveEnhance} class="space-y-6">
			<div>
				<label for="titleFr" class="block text-sm font-medium text-foreground-alt mb-2">Titre</label>
				<div class="relative">
					<Type size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
					<input id="titleFr" name="titleFr" type="text" bind:value={titleFr} placeholder="Festival de musique d'été 2026" class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent" />
				</div>
			</div>
			<div>
				<label for="subtitleFr" class="block text-sm font-medium text-foreground-alt mb-2">Sous-titre (Optionnel)</label>
				<div class="relative">
					<FileText size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
					<input id="subtitleFr" name="subtitleFr" type="text" bind:value={subtitleFr} placeholder="Une courte phrase accrocheuse pour l'événement..." class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent" />
				</div>
			</div>
			<div>
				<label for="descriptionFr" class="block text-sm font-medium text-foreground-alt mb-2">Description</label>
				<div class="relative">
					<FileText size={18} class="absolute left-3 top-3 text-muted-foreground" />
					<textarea id="descriptionFr" name="descriptionFr" bind:value={descriptionFr} rows="5" placeholder="Décrivez votre événement..." class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent resize-none"></textarea>
				</div>
			</div>

			<EnglishVersion>
				<div>
					<label for="titleEn" class="block text-sm font-medium text-foreground-alt mb-2">Titre (Anglais)</label>
					<div class="relative">
						<Type size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
						<input id="titleEn" name="titleEn" type="text" bind:value={titleEn} placeholder="Summer Music Festival 2026" class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent" />
					</div>
				</div>
				<div>
					<label for="subtitleEn" class="block text-sm font-medium text-foreground-alt mb-2">Sous-titre (Anglais)</label>
					<div class="relative">
						<FileText size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
						<input id="subtitleEn" name="subtitleEn" type="text" bind:value={subtitleEn} placeholder="A short tagline for the event..." class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent" />
					</div>
				</div>
				<div>
					<label for="descriptionEn" class="block text-sm font-medium text-foreground-alt mb-2">Description (Anglais)</label>
					<div class="relative">
						<FileText size={18} class="absolute left-3 top-3 text-muted-foreground" />
						<textarea id="descriptionEn" name="descriptionEn" bind:value={descriptionEn} rows="5" placeholder="Describe your event..." class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent resize-none"></textarea>
					</div>
				</div>
			</EnglishVersion>

			<!-- Notes internes (issue 039): only Admins ever see them -->
			<div>
				<label for="internalNotes" class="block text-sm font-medium text-foreground-alt mb-2">
					Notes internes (Optionnel)
				</label>
				<div class="relative">
					<Lock
						size={18}
						class="absolute left-3 top-3 text-muted-foreground"
					/>
					<textarea
						id="internalNotes"
						name="internalNotes"
						bind:value={internalNotes}
						rows="4"
						aria-describedby="internalNotesHint"
						placeholder="Contact du lieu, client, budget…"
						class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent resize-y"
					></textarea>
				</div>
				<p id="internalNotesHint" class="mt-1 text-xs text-muted-foreground">
					Visibles des seuls administrateurs : jamais montrées aux invités ni à l’équipe.
				</p>
			</div>

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
</div>
