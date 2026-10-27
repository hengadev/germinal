<script lang="ts">
	// « Programme » tab (issue 036): Collaborators, timings, Curator and
	// Admission Info. Saved with `updateEvent`, which only touches the
	// fields posted here.
	import { enhance } from '$app/forms';
	import { getToastContext } from '$lib/components/toast/state.svelte';
	import { handleTabResult, type EditorEvent } from './editor-forms';
	import EnglishVersion from '$lib/components/admin/EnglishVersion.svelte';

	let {
		event,
		talents,
	}: {
		event: EditorEvent;
		talents: { id: string; firstName: string; lastName: string }[];
	} = $props();

	const toast = getToastContext();
	let saving = $state(false);

	function saveEnhance() {
		saving = true;
		return async ({ result, formElement }: { result: import('@sveltejs/kit').ActionResult; formElement: HTMLFormElement }) => {
			saving = false;
			if (await handleTabResult(result, toast, 'Modifications enregistrées', formElement)) {
				// The English may have been generated from the French on save.
				curatorEn = event?.curatorEn ?? '';
				admissionInfoEn = event?.admissionInfoEn ?? '';
			}
		};
	}

	let collaborators = $state<Array<{talentId: string, name: string, role: string}>>(
		event?.collaborators ? JSON.parse(event.collaborators) : []
	);
	let timings = $state<Array<{label: string, time: string}>>(
		event?.timings ? JSON.parse(event.timings) : []
	);
	let curatorEn = $state(event?.curatorEn ?? "");
	let curatorFr = $state(event?.curatorFr ?? "");
	let admissionInfoEn = $state(event?.admissionInfoEn ?? "");
	let admissionInfoFr = $state(event?.admissionInfoFr ?? "");
</script>

<div class="bg-background rounded-lg border border-border-card p-6 lg:p-8">
    <form method="POST" action="?/updateEvent" use:enhance={saveEnhance} class="space-y-6">
 <!-- Collaborators -->
 <div>
 <label class="block text-sm font-medium text-foreground-alt mb-2">
 Collaborateurs (Optionnel)
 </label>
 <p class="text-xs text-muted-foreground mb-3">Ajouter des talents ou partenaires collaborants</p>

 <div class="space-y-2">
 {#each collaborators as collab, i}
 <div class="flex gap-2 items-center">
 <select
 bind:value={collaborators[i].talentId}
 onchange={() => {
 const talent = talents.find(t => t.id === collaborators[i].talentId);
 if (talent) collaborators[i].name = talent.firstName + ' ' + talent.lastName;
 }}
 class="flex-1 px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm bg-background"
 >
 <option value="">Sélectionner un talent...</option>
 {#each talents as talent}
 <option value={talent.id}>{talent.firstName} {talent.lastName}</option>
 {/each}
 </select>
 <input
 type="text"
 bind:value={collaborators[i].role}
 placeholder="Rôle"
 class="flex-1 px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
 />
 <button
 type="button"
 onclick={() => collaborators = collaborators.filter((_, idx) => idx !== i)}
 class="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
 >
 Supprimer
 </button>
 </div>
 {/each}

 <button
 type="button"
 onclick={() => collaborators = [...collaborators, {talentId: "", name: "", role: ""}]}
 class="text-sm text-foreground-alt hover:text-foreground font-medium"
 >
 + Ajouter un Collaborateur
 </button>
 </div>

 <input type="hidden" name="collaborators" value={JSON.stringify(collaborators.filter(c => c.name.trim() && c.role.trim()))} />
 </div>

 <!-- Timings -->
 <div>
 <label class="block text-sm font-medium text-foreground-alt mb-2">
 Horaires de l'Événement (Optionnel)
            </label>
            <p class="text-xs text-muted-foreground mb-3">Ajouter des informations de planning pour différentes sessions</p>

            <div class="space-y-2">
                {#each timings as timing, i}
                    <div class="flex gap-2">
                        <input
                            type="text"
                            bind:value={timings[i].label}
                            placeholder="ex: Soirée d'ouverture"
                            class="flex-1 px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
                        />
                        <input
                            type="text"
                            bind:value={timings[i].time}
                            placeholder="ex: 18:00 - 22:00"
                            class="flex-1 px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
                        />
                        <button
                            type="button"
                            onclick={() => timings = timings.filter((_, idx) => idx !== i)}
                            class="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                            Supprimer
                        </button>
                    </div>
                {/each}

                <button
                    type="button"
                    onclick={() => timings = [...timings, {label: "", time: ""}]}
                    class="text-sm text-foreground-alt hover:text-foreground font-medium"
                >
                    + Ajouter un Horaire
                </button>
            </div>

            <input type="hidden" name="timings" value={JSON.stringify(timings.filter(t => t.label.trim() && t.time.trim()))} />
        </div>

        <!-- Event Details -->
        <div class="space-y-4">
            <h3 class="text-sm font-medium text-foreground-alt">Détails Supplémentaires (Optionnel)</h3>
            <div>
                <label for="curatorFr" class="block text-sm font-medium text-foreground-alt mb-2">Commissaire</label>
                <input id="curatorFr" name="curatorFr" type="text" bind:value={curatorFr} placeholder="ex: Jeanne Martin" class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm" />
            </div>

            <div>
                <label for="admissionInfoFr" class="block text-sm font-medium text-foreground-alt mb-2">Informations d'admission</label>
                <input id="admissionInfoFr" name="admissionInfoFr" type="text" bind:value={admissionInfoFr} placeholder="ex: Gratuit, 25 €, membres seulement" class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm" />
            </div>

            <EnglishVersion>
                <div>
                    <label for="curatorEn" class="block text-sm font-medium text-foreground-alt mb-2">Commissaire (Anglais)</label>
                    <input id="curatorEn" name="curatorEn" type="text" bind:value={curatorEn} placeholder="ex: Jeanne Martin" class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm" />
                </div>

                <div>
                    <label for="admissionInfoEn" class="block text-sm font-medium text-foreground-alt mb-2">Informations d'admission (Anglais)</label>
                    <input id="admissionInfoEn" name="admissionInfoEn" type="text" bind:value={admissionInfoEn} placeholder="ex: Free, €25, members only" class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm" />
                </div>
            </EnglishVersion>
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
