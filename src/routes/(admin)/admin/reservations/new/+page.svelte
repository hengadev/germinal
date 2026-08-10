<script lang="ts">
	import { ArrowLeft, Gift, User, Mail, Phone, Ticket } from 'lucide-svelte';
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { formatCurrency } from '$lib/utils/currency';
	import { getToastContext } from '$lib/components/toast/state.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const toast = getToastContext();

	let isSubmitting = $state(false);
	let selectedSessionId = $state('');

	let selectedSession = $derived(
		data.sessions.find((s: (typeof data.sessions)[number]) => s.id === selectedSessionId)
	);

	function formatSessionLabel(session: (typeof data.sessions)[number]): string {
		const date = new Date(session.startTime).toLocaleString('fr-FR', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
		return `${session.eventTitle} — ${session.titleEn} (${date}) · ${session.availableCapacity} place(s) restante(s)`;
	}
</script>

<svelte:head>
	<title>Nouvelle Réservation Comp | Tableau de bord Admin</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 lg:py-12 max-w-2xl">
	<a
		href="/admin/reservations"
		class="inline-flex items-center gap-2 text-foreground-alt hover:text-foreground mb-6"
	>
		<ArrowLeft size={18} />
		<span>Retour aux Réservations</span>
	</a>

	<div class="mb-8">
		<h1 class="text-3xl lg:text-4xl font-bold mb-2 flex items-center gap-3">
			<Gift size={32} />
			Réservation Comp
		</h1>
		<p class="text-muted-foreground">
			Créez une réservation confirmée pour un invité sans passer par le paiement. La capacité de la
			session est verrouillée et décrémentée exactement comme pour une réservation payante, et
			l'invité reçoit son billet de la même façon.
		</p>
	</div>

	<form
		method="POST"
		action="?/create"
		use:enhance={() => {
			isSubmitting = true;
			return async ({ result, update }) => {
				isSubmitting = false;
				if (result.type === 'success' && result.data?.success) {
					toast.success('Succès', (result.data as { message: string }).message);
					const reservationId = (result.data as { reservationId?: string | null }).reservationId;
					if (reservationId) {
						await goto(`/admin/reservations/${reservationId}`);
						return;
					}
				} else if (result.type === 'failure' && result.data) {
					toast.error('Erreur', (result.data as { error?: string }).error || 'Action échouée');
				}
				await update();
			};
		}}
		class="bg-background rounded-lg border border-border-card p-6 space-y-6"
	>
		{#if form?.error}
			<div class="px-4 py-3 rounded-lg bg-red-50 text-red-700 text-sm">{form.error}</div>
		{/if}

		<div>
			<label for="sessionId" class="block text-sm font-medium text-foreground-alt mb-1">
				Session <span class="text-red-600">*</span>
			</label>
			<select
				id="sessionId"
				name="sessionId"
				required
				bind:value={selectedSessionId}
				class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
			>
				<option value="" disabled selected>Sélectionner une session…</option>
				{#each data.sessions as session}
					<option value={session.id}>{formatSessionLabel(session)}</option>
				{/each}
			</select>
			{#if data.sessions.length === 0}
				<p class="text-sm text-muted-foreground mt-2">
					Aucune session publiée à venir avec de la capacité disponible.
				</p>
			{/if}
			{#if selectedSession}
				<p class="text-sm text-muted-foreground mt-2">
					Prix normal : {formatCurrency(selectedSession.priceAmount, selectedSession.currency)} — sera
					offert (0 {selectedSession.currency}) pour cette réservation comp.
				</p>
			{/if}
		</div>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			<div>
				<label for="name" class="block text-sm font-medium text-foreground-alt mb-1">
					<User size={14} class="inline mr-1" />
					Nom de l'invité <span class="text-red-600">*</span>
				</label>
				<input
					id="name"
					name="name"
					type="text"
					required
					class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
				/>
			</div>
			<div>
				<label for="email" class="block text-sm font-medium text-foreground-alt mb-1">
					<Mail size={14} class="inline mr-1" />
					Email de l'invité <span class="text-red-600">*</span>
				</label>
				<input
					id="email"
					name="email"
					type="email"
					required
					class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
				/>
			</div>
		</div>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			<div>
				<label for="phone" class="block text-sm font-medium text-foreground-alt mb-1">
					<Phone size={14} class="inline mr-1" />
					Téléphone (optionnel)
				</label>
				<input
					id="phone"
					name="phone"
					type="tel"
					class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
				/>
			</div>
			<div>
				<label for="quantity" class="block text-sm font-medium text-foreground-alt mb-1">
					<Ticket size={14} class="inline mr-1" />
					Quantité <span class="text-red-600">*</span>
				</label>
				<input
					id="quantity"
					name="quantity"
					type="number"
					min="1"
					value="1"
					required
					class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
				/>
			</div>
		</div>

		<div>
			<label for="notificationPreference" class="block text-sm font-medium text-foreground-alt mb-1">
				Préférence de notification
			</label>
			<select
				id="notificationPreference"
				name="notificationPreference"
				class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
			>
				<option value="both" selected>Email et SMS</option>
				<option value="email">Email uniquement</option>
				<option value="sms">SMS uniquement</option>
			</select>
		</div>

		<div class="pt-2">
			<button
				type="submit"
				disabled={isSubmitting || data.sessions.length === 0}
				class="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-foreground text-background rounded-lg hover:opacity-90 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
			>
				<Gift size={18} />
				{isSubmitting ? 'Création…' : 'Créer la Réservation Comp'}
			</button>
		</div>
	</form>
</div>
