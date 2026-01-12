<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { loadStripe, type Stripe, type StripeElements } from '@stripe/stripe-js';
	import { Lock, Clock, AlertCircle, CheckCircle2, Loader2 } from 'lucide-svelte';
	import { formatCurrency } from '$lib/utils/currency';

	// Stripe publishable key - MUST be set in .env as PUBLIC_STRIPE_PUBLISHABLE_KEY
	const STRIPE_KEY = import.meta.env.PUBLIC_STRIPE_PUBLISHABLE_KEY;

	let stripe: Stripe | null = null;
	let elements: StripeElements | null = null;
	let reservationData: any = null;
	let isProcessing = $state(false);
	let error = $state<string | null>(null);
	let success = $state(false);
	let timeRemaining = $state('');
	let stripeLoaded = $state(false);
	let timerInterval: ReturnType<typeof setInterval> | null = null;

	// Calculate time remaining
	function updateTimeRemaining() {
		if (!reservationData?.expiresAt) return;

		const now = new Date().getTime();
		const expiry = new Date(reservationData.expiresAt).getTime();
		const diff = expiry - now;

		if (diff <= 0) {
			timeRemaining = 'Expired';
			return;
		}

		const minutes = Math.floor(diff / 60000);
		const seconds = Math.floor((diff % 60000) / 1000);
		timeRemaining = `${minutes}:${seconds.toString().padStart(2, '0')}`;
	}

	onMount(async () => {
		if (!browser) return;

		// Validate Stripe configuration
		if (!STRIPE_KEY) {
			error = 'Payment system is not configured. Please contact support.';
			console.error('Missing PUBLIC_STRIPE_PUBLISHABLE_KEY environment variable');
			return;
		}

		// Load reservation from sessionStorage
		const stored = sessionStorage.getItem('pendingReservation');
		if (!stored) {
			await goto('/events');
			return;
		}

		try {
			reservationData = JSON.parse(stored);
		} catch (err) {
			console.error('Invalid reservation data');
			await goto('/events');
			return;
		}

		// Update timer every second
		timerInterval = setInterval(updateTimeRemaining, 1000);
		updateTimeRemaining();

		// Initialize Stripe
		try {
			stripe = await loadStripe(STRIPE_KEY);
			if (!stripe) throw new Error('Stripe failed to load');

			// Create Stripe Elements
			const appearance = {
				theme: 'stripe' as const,
				variables: {
					colorPrimary: '#1a1a1a',
					colorBackground: '#ffffff',
					colorText: '#1a1a1a',
					colorDanger: '#dc2626',
					fontFamily: 'system-ui, sans-serif',
					spacingUnit: '4px',
					borderRadius: '8px'
				}
			};

			elements = stripe.elements({
				clientSecret: reservationData.clientSecret,
				appearance
			});

			// Create and mount payment element
			const paymentElement = elements.create('payment');
			paymentElement.mount('#payment-element');

			stripeLoaded = true;

		} catch (err) {
			console.error('Stripe initialization error:', err);
			error = 'Failed to load payment form. Please try again.';
		}

		// Cleanup moved to onDestroy
	});

	onDestroy(() => {
		// Clean up timer interval
		if (timerInterval) {
			clearInterval(timerInterval);
			timerInterval = null;
		}
	});

	async function handleSubmit(event: Event) {
		event.preventDefault();

		if (!stripe || !elements) {
			error = 'Payment system not ready';
			return;
		}

		isProcessing = true;
		error = null;

		// Confirm payment
		const { error: submitError } = await stripe.confirmPayment({
			elements,
			confirmParams: {
				return_url: `${window.location.origin}/tickets/${reservationData.accessToken}?success=true`,
			},
		});

		if (submitError) {
			error = submitError.message || 'Payment failed';
			isProcessing = false;
		}
	}
</script>

<svelte:head>
	<title>Checkout - {reservationData?.eventTitle || 'Event'}</title>
</svelte:head>

<div class="min-h-screen bg-dark-50/30 py-12">
	<div class="container mx-auto px-4 max-w-2xl">
		{#if !reservationData}
			<div class="bg-white rounded-lg border border-border-card p-12 text-center">
				<Loader2 size={48} class="mx-auto mb-4 text-dark-300 animate-spin" />
				<h3 class="text-xl font-semibold text-dark-900">Loading...</h3>
			</div>
		{:else}
			<!-- Header -->
			<div class="mb-8">
				<h1 class="text-3xl font-bold text-dark-900 mb-2">Complete Your Booking</h1>
				<p class="text-dark-500">Secure payment powered by Stripe</p>
			</div>

			<!-- Timer Warning -->
			<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 flex items-start gap-3">
				<Clock size={20} class="text-yellow-600 flex-shrink-0 mt-0.5" />
				<div>
					<div class="font-medium text-yellow-900 text-sm">Reservation Expires In</div>
					<div class="text-yellow-700 text-2xl font-bold font-mono mt-1">
						{timeRemaining}
					</div>
					<div class="text-yellow-600 text-xs mt-1">
						Complete payment before time runs out
					</div>
				</div>
			</div>

			<!-- Order Summary -->
			<div class="bg-white rounded-lg border border-border-card p-6 mb-6">
				<h2 class="text-lg font-semibold text-dark-900 mb-4">Order Summary</h2>

				<div class="space-y-3">
					<div>
						<div class="text-sm text-dark-500">Event</div>
						<div class="font-medium text-dark-900">{reservationData.eventTitle}</div>
					</div>

					<div>
						<div class="text-sm text-dark-500">Session</div>
						<div class="font-medium text-dark-900">{reservationData.sessionTitle}</div>
					</div>

					<div class="border-t border-border-card pt-3 mt-3">
						<div class="flex items-center justify-between mb-2">
							<span class="text-dark-600">Tickets ({reservationData.quantity}x)</span>
							<span class="text-dark-900">
								{formatCurrency(reservationData.totalAmount, reservationData.currency)}
							</span>
						</div>

						<div class="flex items-center justify-between font-semibold text-lg pt-2 border-t border-border-card">
							<span class="text-dark-900">Total</span>
							<span class="text-dark-900">
								{formatCurrency(reservationData.totalAmount, reservationData.currency)}
							</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Payment Form -->
			<div class="bg-white rounded-lg border border-border-card p-6">
				<h2 class="text-lg font-semibold text-dark-900 mb-4">Payment Details</h2>

				{#if error}
					<div class="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3 mb-6">
						<AlertCircle size={20} class="text-red-600 flex-shrink-0 mt-0.5" />
						<div>
							<div class="font-medium text-red-900 text-sm">Payment Error</div>
							<div class="text-red-700 text-sm mt-1">{error}</div>
						</div>
					</div>
				{/if}

				<form onsubmit={handleSubmit} class="space-y-6">
					<!-- Stripe Payment Element Container -->
					<div id="payment-element" class="min-h-[200px]">
						{#if !stripeLoaded}
							<div class="flex items-center justify-center py-12">
								<Loader2 size={32} class="text-dark-300 animate-spin" />
							</div>
						{/if}
					</div>

					<!-- Security Notice -->
					<div class="flex items-center gap-2 text-sm text-dark-500 bg-dark-50 rounded-lg p-3">
						<Lock size={16} class="text-dark-400" />
						<span>Your payment information is secure and encrypted</span>
					</div>

					<!-- Submit Button -->
					<button
						type="submit"
						disabled={!stripeLoaded || isProcessing || timeRemaining === 'Expired'}
						class="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors font-medium disabled:bg-dark-300 disabled:cursor-not-allowed"
					>
						{#if isProcessing}
							<Loader2 size={20} class="animate-spin" />
							Processing Payment...
						{:else if timeRemaining === 'Expired'}
							Reservation Expired
						{:else}
							Pay {formatCurrency(reservationData.totalAmount, reservationData.currency)}
						{/if}
					</button>
				</form>
			</div>
		{/if}
	</div>
</div>
