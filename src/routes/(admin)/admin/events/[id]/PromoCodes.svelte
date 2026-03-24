<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { Plus, Tag, XCircle, CheckCircle2, Clock, Percent, DollarSign } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import { getToastContext } from '$lib/components/toast/state.svelte';
	import type { PromoCodeForAdmin } from '$lib/server/services/promo-codes';

	interface Props {
		data: {
			event: any;
			promoCodes: PromoCodeForAdmin[];
		};
		form?: any;
	}

	let { data }: Props = $props();

	const toast = getToastContext();

	let createDialogOpen = $state(false);

	// Form state
	let createName = $state('');
	let createCode = $state('');
	let createDiscountType = $state<'percent' | 'amount'>('percent');
	let createDiscountValue = $state('');
	let createCurrency = $state('EUR');
	let createMaxRedemptions = $state('');
	let createExpiresAt = $state('');

	function resetCreateForm() {
		createName = '';
		createCode = '';
		createDiscountType = 'percent';
		createDiscountValue = '';
		createCurrency = 'EUR';
		createMaxRedemptions = '';
		createExpiresAt = '';
	}

	function createPromoCodeEnhance() {
		return () => async ({ result }: { result: import('@sveltejs/kit').ActionResult }) => {
			if (result.type === 'success') {
				createDialogOpen = false;
				resetCreateForm();
				toast.success('Succès', (result.data as { success?: string })?.success ?? 'Code promo créé');
				await invalidateAll();
			} else if (result.type === 'failure') {
				toast.error('Erreur', (result.data as { error?: string })?.error ?? 'Une erreur est survenue');
			}
		};
	}

	function deactivatePromoCodeEnhance() {
		return () => async ({ result }: { result: import('@sveltejs/kit').ActionResult }) => {
			if (result.type === 'success') {
				toast.success('Succès', (result.data as { success?: string })?.success ?? 'Code désactivé');
				await invalidateAll();
			} else if (result.type === 'failure') {
				toast.error('Erreur', (result.data as { error?: string })?.error ?? 'Une erreur est survenue');
			}
		};
	}

	function formatDiscount(promoCode: PromoCodeForAdmin): string {
		const { discountType, discountValue, currency } = promoCode.coupon;
		if (discountType === 'percent') {
			return `${discountValue}% off`;
		}
		const amount = (discountValue / 100).toFixed(2);
		return `-${amount} ${(currency ?? 'EUR').toUpperCase()}`;
	}

	function formatDate(iso: string | null): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
		});
	}

	function isExpired(iso: string | null): boolean {
		if (!iso) return false;
		return new Date(iso) < new Date();
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-xl font-semibold text-foreground">Codes promotionnels</h2>
			<p class="text-sm text-muted-foreground mt-1">
				Gérez les réductions pour cet événement
			</p>
		</div>
		<button
			onclick={() => { resetCreateForm(); createDialogOpen = true; }}
			class="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg hover:opacity-90 transition-colors text-sm font-medium"
		>
			<Plus size={16} />
			Nouveau code
		</button>
	</div>

	<!-- Promo codes list -->
	{#if data.promoCodes.length === 0}
		<div class="bg-muted rounded-lg border border-border-card p-12 text-center">
			<Tag size={40} class="mx-auto mb-3 text-muted-foreground" />
			<p class="text-muted-foreground font-medium">Aucun code promotionnel</p>
			<p class="text-muted-foreground text-sm mt-1">Créez un code pour offrir des réductions à vos participants</p>
		</div>
	{:else}
		<div class="rounded-lg border border-border-card overflow-hidden">
			<table class="w-full text-sm">
				<thead class="bg-muted border-b border-border-card">
					<tr>
						<th class="px-4 py-3 text-left font-medium text-foreground-alt">Code</th>
						<th class="px-4 py-3 text-left font-medium text-foreground-alt">Réduction</th>
						<th class="px-4 py-3 text-left font-medium text-foreground-alt">Utilisations</th>
						<th class="px-4 py-3 text-left font-medium text-foreground-alt">Expiration</th>
						<th class="px-4 py-3 text-left font-medium text-foreground-alt">Statut</th>
						<th class="px-4 py-3 text-right font-medium text-foreground-alt">Action</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border-card">
					{#each data.promoCodes as promoCode (promoCode.id)}
						<tr class="bg-background hover:bg-muted/50 transition-colors">
							<!-- Code + name -->
							<td class="px-4 py-3">
								<div class="font-mono font-semibold text-foreground text-sm">{promoCode.code}</div>
								<div class="text-xs text-muted-foreground mt-0.5">{promoCode.coupon.name}</div>
							</td>

							<!-- Discount -->
							<td class="px-4 py-3">
								<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
									{#if promoCode.coupon.discountType === 'percent'}
										<Percent size={11} />
									{:else}
										<DollarSign size={11} />
									{/if}
									{formatDiscount(promoCode)}
								</span>
							</td>

							<!-- Redemptions -->
							<td class="px-4 py-3 text-foreground-alt">
								{promoCode.redemptionCount}
								{#if promoCode.maxRedemptions !== null}
									<span class="text-muted-foreground">/ {promoCode.maxRedemptions}</span>
								{:else}
									<span class="text-muted-foreground">/ ∞</span>
								{/if}
							</td>

							<!-- Expiry -->
							<td class="px-4 py-3">
								{#if promoCode.expiresAt}
									<span class="inline-flex items-center gap-1 {isExpired(promoCode.expiresAt) ? 'text-red-500' : 'text-foreground-alt'}">
										<Clock size={13} />
										{formatDate(promoCode.expiresAt)}
									</span>
								{:else}
									<span class="text-muted-foreground">—</span>
								{/if}
							</td>

							<!-- Status -->
							<td class="px-4 py-3">
								{#if !promoCode.active || isExpired(promoCode.expiresAt)}
									<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
										<XCircle size={11} />
										Inactif
									</span>
								{:else}
									<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
										<CheckCircle2 size={11} />
										Actif
									</span>
								{/if}
							</td>

							<!-- Actions -->
							<td class="px-4 py-3 text-right">
								{#if promoCode.active && !isExpired(promoCode.expiresAt)}
									<form
										method="POST"
										action="?/deactivatePromoCode"
										use:enhance={deactivatePromoCodeEnhance()}
									>
										<input type="hidden" name="promoCodeId" value={promoCode.id} />
										<button
											type="submit"
											class="text-xs text-muted-foreground hover:text-red-600 transition-colors font-medium"
										>
											Désactiver
										</button>
									</form>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<!-- Create promo code modal -->
<Modal bind:isOpen={createDialogOpen} title="Créer un code promotionnel">
	<form
		method="POST"
		action="?/createPromoCode"
		use:enhance={createPromoCodeEnhance()}
		class="space-y-4"
	>
		<!-- Internal name -->
		<div>
			<label for="promo-name" class="block text-sm font-medium text-foreground-alt mb-1">
				Nom interne <span class="text-red-500">*</span>
			</label>
			<input
				id="promo-name"
				name="name"
				type="text"
				bind:value={createName}
				required
				placeholder="Ex: Lancement ouverture"
				class="w-full px-3 py-2 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground text-sm"
			/>
			<p class="text-xs text-muted-foreground mt-1">Visible uniquement dans l'administration</p>
		</div>

		<!-- Code -->
		<div>
			<label for="promo-code" class="block text-sm font-medium text-foreground-alt mb-1">
				Code <span class="text-red-500">*</span>
			</label>
			<input
				id="promo-code"
				name="code"
				type="text"
				bind:value={createCode}
				required
				placeholder="Ex: SUMMER20"
				class="w-full px-3 py-2 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground text-sm font-mono uppercase"
				oninput={(e) => createCode = (e.target as HTMLInputElement).value.toUpperCase()}
			/>
			<p class="text-xs text-muted-foreground mt-1">Lettres, chiffres, tirets et underscores uniquement</p>
		</div>

		<!-- Discount type -->
		<div>
			<label class="block text-sm font-medium text-foreground-alt mb-1">
				Type de réduction <span class="text-red-500">*</span>
			</label>
			<div class="grid grid-cols-2 gap-2">
				<button
					type="button"
					onclick={() => createDiscountType = 'percent'}
					class="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors {createDiscountType === 'percent' ? 'bg-foreground text-background border-foreground' : 'border-border-input text-foreground-alt hover:opacity-90'}"
				>
					<Percent size={14} />
					Pourcentage
				</button>
				<button
					type="button"
					onclick={() => createDiscountType = 'amount'}
					class="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors {createDiscountType === 'amount' ? 'bg-foreground text-background border-foreground' : 'border-border-input text-foreground-alt hover:opacity-90'}"
				>
					<DollarSign size={14} />
					Montant fixe
				</button>
			</div>
			<input type="hidden" name="discountType" value={createDiscountType} />
		</div>

		<!-- Discount value -->
		<div class="grid grid-cols-2 gap-3">
			<div>
				<label for="promo-value" class="block text-sm font-medium text-foreground-alt mb-1">
					{createDiscountType === 'percent' ? 'Pourcentage (%)' : 'Montant (€)'} <span class="text-red-500">*</span>
				</label>
				<input
					id="promo-value"
					name="discountValue"
					type="number"
					bind:value={createDiscountValue}
					required
					min="1"
					max={createDiscountType === 'percent' ? 100 : undefined}
					step={createDiscountType === 'percent' ? 1 : 0.01}
					placeholder={createDiscountType === 'percent' ? '20' : '10.00'}
					class="w-full px-3 py-2 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground text-sm"
				/>
			</div>
			{#if createDiscountType === 'amount'}
				<div>
					<label for="promo-currency" class="block text-sm font-medium text-foreground-alt mb-1">Devise</label>
					<select
						id="promo-currency"
						name="currency"
						bind:value={createCurrency}
						class="w-full px-3 py-2 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground text-sm bg-background"
					>
						<option value="EUR">EUR</option>
						<option value="USD">USD</option>
						<option value="GBP">GBP</option>
					</select>
				</div>
			{/if}
		</div>

		<!-- Max redemptions -->
		<div>
			<label for="promo-max" class="block text-sm font-medium text-foreground-alt mb-1">
				Utilisations max <span class="text-muted-foreground font-normal">(optionnel)</span>
			</label>
			<input
				id="promo-max"
				name="maxRedemptions"
				type="number"
				bind:value={createMaxRedemptions}
				min="1"
				placeholder="Illimité"
				class="w-full px-3 py-2 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground text-sm"
			/>
		</div>

		<!-- Expiry date -->
		<div>
			<label for="promo-expires" class="block text-sm font-medium text-foreground-alt mb-1">
				Date d'expiration <span class="text-muted-foreground font-normal">(optionnel)</span>
			</label>
			<input
				id="promo-expires"
				name="expiresAt"
				type="datetime-local"
				bind:value={createExpiresAt}
				class="w-full px-3 py-2 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground text-sm"
			/>
		</div>

		<!-- Actions -->
		<div class="flex justify-end gap-3 pt-2">
			<button
				type="button"
				onclick={() => createDialogOpen = false}
				class="px-4 py-2 border border-border-input text-foreground-alt rounded-lg hover:bg-muted transition-colors text-sm font-medium"
			>
				Annuler
			</button>
			<button
				type="submit"
				class="px-4 py-2 bg-foreground text-background rounded-lg hover:opacity-90 transition-colors text-sm font-medium"
			>
				Créer le code
			</button>
		</div>
	</form>
</Modal>
