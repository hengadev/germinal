<script lang="ts">
	import {
		ArrowLeft,
		User,
		Mail,
		Phone,
		Ticket,
		AlertCircle,
		Loader2,
		CheckCircle2
	} from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { formatCurrency } from '$lib/utils/currency';
	import { t, locale } from 'svelte-i18n';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let eventTitle = $derived(
		$locale === 'en' ? data.event.titleEn || '' : data.event.titleFr || ''
	);

	type NotificationPreference = 'email' | 'sms' | 'both';

	let name = $state('');
	let email = $state('');
	let phone = $state('');
	let quantity = $state(1);
	let notificationPreference = $state<NotificationPreference>('both');
	let isSubmitting = $state(false);
	let error = $state<string | null>(null);
	let success = $state(false);

	let totalAmount = $derived(data.session.priceAmount * quantity);

	let isFormValid = $derived(
		name.trim().length > 0 &&
			email.trim().length > 0 &&
			email.includes('@') &&
			quantity >= 1 &&
			quantity <= Math.min(data.session.availableCapacity, 10)
	);

	async function handleSubmit() {
		if (!isFormValid) return;

		isSubmitting = true;
		error = null;

		if (data.isMockMode) {
			await new Promise((r) => setTimeout(r, 800));
			success = true;
			isSubmitting = false;
			return;
		}

		try {
			const response = await fetch('/api/reservations/create', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-CSRF-Token': $page.data.csrfToken
				},
				body: JSON.stringify({
					sessionId: data.session.id,
					email: email.trim(),
					name: name.trim(),
					phone: phone.trim() || undefined,
					quantity,
					notificationPreference,
					honeypot: ''
				})
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to create reservation');
			}

			sessionStorage.setItem(
				'pendingReservation',
				JSON.stringify({
					reservationId: result.reservationId,
					clientSecret: result.clientSecret,
					expiresAt: result.expiresAt,
					accessToken: result.accessToken,
					sessionTitle: data.session.title,
					eventTitle,
					quantity,
					totalAmount,
					currency: data.session.currency
				})
			);

			await goto(`/checkout?reservation=${result.reservationId}`);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create reservation';
			isSubmitting = false;
		}
	}

	function formatDateTime(dateString: string): string {
		return new Date(dateString).toLocaleString($locale ?? undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<svelte:head>
	<title>{$t('booking.title')} — {eventTitle} | Germinal</title>
</svelte:head>

<div class="container mx-auto px-4 py-32 max-w-2xl">
	<a
		href="/events/{data.event.slug}"
		class="flex items-center gap-2 mb-8 text-dark-500 hover:text-dark-900 transition-colors"
	>
		<ArrowLeft size={18} />
		<span>{eventTitle}</span>
	</a>

	{#if success}
		<div class="text-center py-16 grid gap-6">
			<div class="flex justify-center">
				<CheckCircle2 size={64} class="text-green-500" />
			</div>
			<h1 class="text-3xl font-bold">{$t('booking.title')}</h1>
			<p class="text-dark-500">
				{data.isMockMode
					? 'Demo mode: your booking would be confirmed here. A confirmation email would be sent to ' +
						email
					: $t('booking.emailHint')}
			</p>
			<a
				href="/events/{data.event.slug}"
				class="inline-flex items-center justify-center gap-2 px-6 py-3 border border-dark-300 text-dark-700 rounded-lg hover:bg-dark-50 transition-colors font-medium"
			>
				<ArrowLeft size={18} />
				Back to event
			</a>
		</div>
	{:else}
		<h1 class="text-3xl font-bold mb-2">{$t('booking.title')}</h1>
		<p class="text-dark-500 mb-8">{$t('booking.description')}</p>

		{#if data.isMockMode}
			<div
				class="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-start gap-3"
			>
				<AlertCircle size={20} class="text-amber-600 flex-shrink-0 mt-0.5" />
				<p class="text-amber-800 text-sm">Demo mode — fill in the form to preview the booking experience. No real reservation will be created.</p>
			</div>
		{/if}

		<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="grid gap-6">
			<!-- Session Info -->
			<div class="bg-dark-50 rounded-lg p-4">
				<div class="text-sm text-dark-600 mb-1">{eventTitle}</div>
				<div class="font-semibold text-dark-900">{data.session.title}</div>
				<div class="text-sm text-dark-500 mt-1">{formatDateTime(data.session.startTime)}</div>
			</div>

			<!-- Error Message -->
			{#if error}
				<div class="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
					<AlertCircle size={20} class="text-red-600 flex-shrink-0 mt-0.5" />
					<div>
						<div class="font-medium text-red-900 text-sm">{$t('booking.errorTitle')}</div>
						<div class="text-red-700 text-sm mt-1">{error}</div>
					</div>
				</div>
			{/if}

			<!-- Name Field -->
			<div>
				<label for="name" class="block text-sm font-medium text-dark-700 mb-2">
					{$t('booking.fullName')} <span class="text-red-500">*</span>
				</label>
				<div class="relative">
					<User size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
					<input
						id="name"
						type="text"
						bind:value={name}
						required
						placeholder="Jean Dupont"
						disabled={isSubmitting}
						class="w-full pl-10 pr-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm disabled:bg-dark-50 disabled:cursor-not-allowed"
					/>
				</div>
			</div>

			<!-- Email Field -->
			<div>
				<label for="email" class="block text-sm font-medium text-dark-700 mb-2">
					{$t('booking.email')} <span class="text-red-500">*</span>
				</label>
				<div class="relative">
					<Mail size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
					<input
						id="email"
						type="email"
						bind:value={email}
						required
						placeholder="jean@exemple.com"
						disabled={isSubmitting}
						class="w-full pl-10 pr-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm disabled:bg-dark-50 disabled:cursor-not-allowed"
					/>
				</div>
				<p class="text-xs text-dark-500 mt-1">{$t('booking.emailHint')}</p>
			</div>

			<!-- Phone Field -->
			<div>
				<label for="phone" class="block text-sm font-medium text-dark-700 mb-2">
					{$t('booking.phone')}
					<span class="text-dark-400 text-xs">{$t('booking.optional')}</span>
				</label>
				<div class="relative">
					<Phone size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
					<input
						id="phone"
						type="tel"
						bind:value={phone}
						placeholder="+33 6 12 34 56 78"
						disabled={isSubmitting}
						class="w-full pl-10 pr-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm disabled:bg-dark-50 disabled:cursor-not-allowed"
					/>
				</div>
			</div>

			<!-- Notification Preference -->
			<div>
				<label class="block text-sm font-medium text-dark-700 mb-2">
					{$t('booking.notificationsLabel')}
				</label>
				<div class="grid grid-cols-3 gap-2">
					{#each [{ value: 'email', label: $t('booking.notifEmail') }, { value: 'sms', label: $t('booking.notifSms') }, { value: 'both', label: $t('booking.notifBoth') }] as option}
						<button
							type="button"
							onclick={() => (notificationPreference = option.value as NotificationPreference)}
							class="px-3 py-2 text-sm border rounded-lg transition-colors {notificationPreference ===
							option.value
								? 'bg-dark-900 text-white border-dark-900'
								: 'border-border-dark text-dark-700 hover:bg-dark-50'}"
							disabled={isSubmitting}
						>
							{option.label}
						</button>
					{/each}
				</div>
				<p class="text-xs text-dark-500 mt-1">{$t('booking.notifHint')}</p>
			</div>

			<!-- Quantity Field -->
			<div>
				<label for="quantity" class="block text-sm font-medium text-dark-700 mb-2">
					{$t('booking.numberOfTickets')} <span class="text-red-500">*</span>
				</label>
				<div class="relative">
					<Ticket size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
					<input
						id="quantity"
						type="number"
						bind:value={quantity}
						min="1"
						max={Math.min(data.session.availableCapacity, 10)}
						required
						disabled={isSubmitting}
						class="w-full pl-10 pr-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm disabled:bg-dark-50 disabled:cursor-not-allowed"
					/>
				</div>
				<p class="text-xs text-dark-500 mt-1">
					{$t('booking.maxTickets', { values: { max: Math.min(data.session.availableCapacity, 10) } })}
				</p>
			</div>

			<!-- Total -->
			<div class="bg-dark-50 rounded-lg p-4">
				<div class="flex items-center justify-between mb-2">
					<span class="text-dark-600"
						>{$t('booking.tickets', { values: { qty: quantity } })}</span
					>
					<span class="text-dark-900">{formatCurrency(totalAmount, data.session.currency)}</span>
				</div>
				<div class="border-t border-border-card pt-2 mt-2 flex items-center justify-between">
					<span class="font-semibold text-dark-900">{$t('booking.total')}</span>
					<span class="font-bold text-xl text-dark-900">
						{formatCurrency(totalAmount, data.session.currency)}
					</span>
				</div>
			</div>

			<!-- Submit -->
			<div class="flex items-center justify-end gap-3 pt-2">
				<a
					href="/events/{data.event.slug}"
					class="px-6 py-2.5 border border-border-dark text-dark-700 rounded-lg hover:bg-dark-50 transition-colors font-medium"
				>
					{$t('booking.cancel')}
				</a>
				<button
					type="submit"
					disabled={!isFormValid || isSubmitting}
					class="inline-flex items-center gap-2 px-6 py-2.5 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors font-medium disabled:bg-dark-300 disabled:cursor-not-allowed"
				>
					{#if isSubmitting}
						<Loader2 size={18} class="animate-spin" />
						{$t('booking.processing')}
					{:else}
						{data.isMockMode ? 'Book (Demo)' : $t('booking.continueToPay')}
					{/if}
				</button>
			</div>
		</form>
	{/if}
</div>
