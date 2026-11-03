<script module lang="ts">
	// Extras section of the « Menus & tarifs » tab (issue 067): what the
	// Event offers alongside its meals. Fields only: the host page owns the
	// drafts list and the <form>; this editor posts its payload as `extras`
	// and exposes `firstBlockingField()` for the host to call before
	// submitting.
	import type { EditorEventExtra } from '$lib/types/pricing-editor';

	/** An extra as edited; `key` keeps its row while extras are reordered. */
	export interface DraftExtra {
		key: string;
		id: string | null;
		nameEn: string;
		nameFr: string;
		descriptionEn: string;
		descriptionFr: string;
		/** Price in major units as typed. */
		price: number | null;
		unit: 'per_person' | 'per_unit';
		/** Stock as typed; null for an unlimited extra. */
		stock: number | null;
		active: boolean;
		/** True once booked: the row cannot be deleted, only deactivated. */
		booked: boolean;
	}

	let nextKey = 0;

	export function toDraftExtras(pricing: { extras?: EditorEventExtra[] } | undefined): DraftExtra[] {
		return (pricing?.extras ?? []).map((extra) => ({
			key: extra.id,
			id: extra.id,
			nameEn: extra.nameEn,
			nameFr: extra.nameFr,
			descriptionEn: extra.descriptionEn ?? '',
			descriptionFr: extra.descriptionFr ?? '',
			price: extra.priceAmount / 100,
			unit: extra.unit,
			stock: extra.stock,
			active: extra.active,
			booked: extra.booked,
		}));
	}

	export function newExtraKey(): string {
		return `new-${nextKey++}`;
	}
</script>

<script lang="ts">
	import { AlertTriangle, ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-svelte';
	import EnglishVersion from '$lib/components/admin/EnglishVersion.svelte';

	let {
		extras = $bindable(),
		currency,
	}: {
		extras: DraftExtra[];
		/** The Event's currency (issue 042): every extra's price is in it. */
		currency: string;
	} = $props();

	const INPUT_CLASS =
		'w-full px-3 py-2 border border-border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm';
	const LABEL_CLASS = 'block text-xs font-medium text-foreground-alt mb-1';

	function isBlank(value: number | null | undefined | ''): boolean {
		return value === null || value === undefined || value === '';
	}

	function isValidPrice(price: number | null): boolean {
		return price !== null && Number.isFinite(price) && price >= 0 && Math.abs(Math.round(price * 100) - price * 100) < 1e-6;
	}

	/** A typed stock is a whole number, zero or more. */
	function isValidStock(stock: number | null): boolean {
		return stock !== null && Number.isInteger(stock) && stock >= 0;
	}

	function addExtra() {
		extras.push({
			key: newExtraKey(),
			id: null,
			nameEn: '',
			nameFr: '',
			descriptionEn: '',
			descriptionFr: '',
			price: null,
			unit: 'per_person',
			stock: null,
			active: true,
			booked: false,
		});
	}

	function removeExtra(index: number) {
		extras.splice(index, 1);
	}

	function moveExtra(index: number, delta: number) {
		const next = index + delta;
		if (next < 0 || next >= extras.length) return;
		const [extra] = extras.splice(index, 1);
		extras.splice(next, 0, extra);
	}


	const payload = $derived(
		JSON.stringify({
			extras: extras.map((extra) => ({
				key: extra.key,
				id: extra.id,
				nameEn: extra.nameEn.trim(),
				nameFr: extra.nameFr.trim(),
				descriptionEn: extra.descriptionEn.trim() || null,
				descriptionFr: extra.descriptionFr.trim() || null,
				// An invalid price or stock is caught before posting.
				priceAmount: isBlank(extra.price) || !isValidPrice(extra.price) ? -1 : Math.round((extra.price as number) * 100),
				unit: extra.unit,
				stock: !isBlank(extra.stock) && !isValidStock(extra.stock) ? -1 : extra.stock,
				active: extra.active,
			})),
		})
	);

	/** First extra field that blocks the save, with the message to show. */
	export function firstBlockingField(): { id: string; message: string } | null {
		for (const [index, extra] of extras.entries()) {
			const label = extra.nameFr.trim() || `l’extra ${index + 1}`;
			if (!extra.nameFr.trim() || !extra.nameEn.trim()) {
				return { id: `extra-${extra.key}-${!extra.nameFr.trim() ? 'nameFr' : 'nameEn'}`, message: `« ${label} » doit avoir un nom en français et en anglais.` };
			}
			if (!isValidPrice(extra.price)) {
				return { id: `extra-${extra.key}-price`, message: `Prix invalide pour « ${label} » : saisissez un montant positif ou nul, au centime près.` };
			}
			if (!isBlank(extra.stock) && !isValidStock(extra.stock)) {
				return { id: `extra-${extra.key}-stock`, message: `Stock invalide pour « ${label} » : un nombre entier positif ou nul, ou vide pour un stock illimité.` };
			}
		}
		return null;
	}
</script>

<section class="bg-background rounded-lg border border-border-card" aria-labelledby="event-extras-title">
	<header class="p-4 lg:p-6 border-b border-border-card">
		<h3 id="event-extras-title" class="text-lg font-semibold text-foreground">Extras</h3>
		<p class="text-sm text-muted-foreground">
			Ce que l’événement propose en plus des repas — accords mets-vins, ateliers… Le prix est dans la
			devise de l’événement ({currency}), par convive ou à l’unité. Un extra déjà réservé ne peut plus
			être supprimé : désactivez-le pour le retirer de la vente.
		</p>
	</header>

	<input type="hidden" name="extras" value={payload} />

	{#if extras.length === 0}
		<div class="px-4 lg:px-6 py-8 text-center">
			<p class="text-sm text-muted-foreground">Aucun extra pour le moment.</p>
			<button
				type="button"
				onclick={addExtra}
				class="mt-3 inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-border-input text-foreground-alt hover:bg-muted cursor-pointer"
			>
				<Plus size={16} /> Ajouter un extra
			</button>
		</div>
	{:else}
		<div class="divide-y divide-border-card">
			{#each extras as extra, index (extra.key)}
				<div class="px-4 lg:px-6 py-4 space-y-3 {!extra.active ? 'opacity-70' : ''}">
					<div class="flex items-center gap-2">
						<p class="text-sm font-medium text-foreground">Extra {index + 1}{extra.booked ? ' · déjà réservé' : ''}</p>
						<div class="ml-auto flex items-center gap-1">
							<button
								type="button"
								onclick={() => moveExtra(index, -1)}
								disabled={index === 0}
								aria-label="Monter cet extra"
								title={index === 0 ? undefined : 'Monter'}
								class="inline-flex items-center justify-center size-8 rounded-md text-foreground-alt hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
							>
								<ArrowUp size={16} />
							</button>
							<button
								type="button"
								onclick={() => moveExtra(index, 1)}
								disabled={index === extras.length - 1}
								aria-label="Descendre cet extra"
								title={index === extras.length - 1 ? undefined : 'Descendre'}
								class="inline-flex items-center justify-center size-8 rounded-md text-foreground-alt hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
							>
								<ArrowDown size={16} />
							</button>
							<button
								type="button"
								onclick={() => removeExtra(index)}
								disabled={extra.booked}
								aria-label="Supprimer cet extra"
								title={extra.booked ? 'Déjà réservé : désactivez-le plutôt.' : 'Supprimer'}
								class="inline-flex items-center justify-center size-8 rounded-md text-red-600 hover:bg-red-50 disabled:text-muted-foreground disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer"
							>
								<Trash2 size={16} />
							</button>
						</div>
					</div>

					<div class="grid gap-3 sm:grid-cols-2">
						<div>
							<label for="extra-{extra.key}-nameFr" class={LABEL_CLASS}>Nom (français)</label>
							<input id="extra-{extra.key}-nameFr" type="text" maxlength="255" bind:value={extra.nameFr} class={INPUT_CLASS} />
						</div>
						<EnglishVersion>
							<div>
								<label for="extra-{extra.key}-nameEn" class={LABEL_CLASS}>Nom (anglais)</label>
								<input id="extra-{extra.key}-nameEn" type="text" maxlength="255" bind:value={extra.nameEn} class={INPUT_CLASS} />
							</div>
						</EnglishVersion>
					</div>

					<div class="grid gap-3 sm:grid-cols-2">
						<div>
							<label for="extra-{extra.key}-descriptionFr" class={LABEL_CLASS}>Description (français, facultative)</label>
							<textarea id="extra-{extra.key}-descriptionFr" rows="2" bind:value={extra.descriptionFr} class="{INPUT_CLASS} resize-y"></textarea>
						</div>
						<EnglishVersion>
							<div>
								<label for="extra-{extra.key}-descriptionEn" class={LABEL_CLASS}>Description (anglais, facultative)</label>
								<textarea id="extra-{extra.key}-descriptionEn" rows="2" bind:value={extra.descriptionEn} class="{INPUT_CLASS} resize-y"></textarea>
							</div>
						</EnglishVersion>
					</div>

					<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
						<div>
							<label for="extra-{extra.key}-price" class={LABEL_CLASS}>Prix, {currency}</label>
							<input
								id="extra-{extra.key}-price"
								type="number"
								inputmode="decimal"
								min="0"
								step="0.01"
								bind:value={extra.price}
								aria-invalid={!isValidPrice(extra.price) ? 'true' : undefined}
								class={INPUT_CLASS}
							/>
						</div>
						<div>
							<label for="extra-{extra.key}-unit" class={LABEL_CLASS}>Unité</label>
							<select id="extra-{extra.key}-unit" bind:value={extra.unit} class={INPUT_CLASS}>
								<option value="per_person">Par convive</option>
								<option value="per_unit">À l’unité</option>
							</select>
						</div>
						<div>
							<label for="extra-{extra.key}-stock" class={LABEL_CLASS}>Stock total (facultatif)</label>
							<input
								id="extra-{extra.key}-stock"
								type="number"
								inputmode="numeric"
								min="0"
								step="1"
								bind:value={extra.stock}
								aria-invalid={!isBlank(extra.stock) && !isValidStock(extra.stock) ? 'true' : undefined}
								placeholder="illimité"
								class={INPUT_CLASS}
							/>
						</div>
						<label class="flex items-center gap-2 text-sm text-foreground lg:pb-2 cursor-pointer">
							<input type="checkbox" bind:checked={extra.active} class="size-4" />
							En vente
						</label>
					</div>

					{#if extra.booked && !extra.active}
						<p class="flex items-center gap-1.5 text-xs text-amber-700">
							<AlertTriangle size={14} class="shrink-0" />
							Cet extra a déjà été réservé : il reste sur les réservations passées, mais n’est plus proposé.
						</p>
					{/if}
				</div>
			{/each}
		</div>
		<div class="p-4 lg:p-6 border-t border-border-card">
			<button
				type="button"
				onclick={addExtra}
				class="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-border-input text-foreground-alt hover:bg-muted cursor-pointer"
			>
				<Plus size={16} /> Ajouter un extra
			</button>
		</div>
	{/if}
</section>
