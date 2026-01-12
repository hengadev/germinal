<script lang="ts">
	import { X, User, Mail, Phone, Ticket, AlertCircle, CheckCircle2, Loader2 } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Drawer from '$lib/components/ui/Drawer.svelte';
	import { browser } from '$app/environment';

	interface Session {
		id: string;
		title: string;
		startTime: string;
	}

	let {
		isOpen = $bindable(),
		session,
		eventTitle
	}: {
		isOpen: boolean;
		session: Session;
		eventTitle: string;
	} = $props();

	// Form state
	let name = $state('');
	let email = $state('');
	let phone = $state('');
	let quantity = $state(1);
	let isSubmitting = $state(false);
	let error = $state<string | null>(null);
	let success = $state(false);

	// Detect mobile
	let isMobile = $state(false);

	// Setup resize listener with proper cleanup
	$effect(() => {
		if (!browser) return;

		// Set initial value
		isMobile = window.innerWidth < 768;

		const handleResize = () => {
			isMobile = window.innerWidth < 768;
		};

		window.addEventListener('resize', handleResize);

		// Cleanup function - automatically called when effect is destroyed
		return () => {
			window.removeEventListener('resize', handleResize);
		};
	});

	// Validate form
	let isFormValid = $derived(
		name.trim().length > 0 &&
		email.trim().length > 0 &&
		email.includes('@') &&
		quantity >= 1 &&
		quantity <= 10
	);

	async function handleSubmit() {
		if (!isFormValid) return;

		isSubmitting = true;
		error = null;

		try {
			const response = await fetch('/api/waitlist/join', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					sessionId: session.id,
					email: email.trim(),
					name: name.trim(),
					phone: phone.trim() || undefined,
					quantity
				})
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to join waitlist');
			}

			success = true;

		} catch (err) {
			console.error('Waitlist error:', err);
			error = err instanceof Error ? err.message : 'Failed to join waitlist';
		} finally {
			isSubmitting = false;
		}
	}

	function close() {
		if (!isSubmitting) {
			isOpen = false;
			// Reset form on close
			setTimeout(() => {
				name = '';
				email = '';
				phone = '';
				quantity = 1;
				error = null;
				success = false;
			}, 300);
		}
	}
</script>

{#snippet formContent()}
	{#if success}
		<div class="text-center py-8">
			<CheckCircle2 size={64} class="mx-auto mb-4 text-green-600" />
			<h3 class="text-2xl font-bold text-dark-900 mb-2">You're on the Waitlist!</h3>
			<p class="text-dark-600 mb-6">
				We'll notify you at <strong>{email}</strong> when tickets become available.
			</p>
			<button
				onclick={close}
				class="px-6 py-2.5 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors font-medium"
			>
				Done
			</button>
		</div>
	{:else}
		<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="grid gap-6">
			<!-- Session Info -->
			<div class="bg-dark-50 rounded-lg p-4">
				<div class="text-sm text-dark-600 mb-1">{eventTitle}</div>
				<div class="font-semibold text-dark-900">{session.title}</div>
				<div class="text-sm text-red-600 mt-1 font-medium">Currently Sold Out</div>
			</div>

			<!-- Info Message -->
			<div class="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
				<AlertCircle size={20} class="text-blue-600 flex-shrink-0 mt-0.5" />
				<div class="text-sm text-blue-900">
					<p class="font-medium mb-1">Join the Waitlist</p>
					<p class="text-blue-700">
						We'll email you if tickets become available. You'll have 24 hours to complete your purchase.
					</p>
				</div>
			</div>

			<!-- Error Message -->
			{#if error}
				<div class="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
					<AlertCircle size={20} class="text-red-600 flex-shrink-0 mt-0.5" />
					<div>
						<div class="font-medium text-red-900 text-sm">Failed to Join Waitlist</div>
						<div class="text-red-700 text-sm mt-1">{error}</div>
					</div>
				</div>
			{/if}

			<!-- Name Field -->
			<div>
				<label for="name" class="block text-sm font-medium text-dark-700 mb-2">
					Full Name <span class="text-red-500">*</span>
				</label>
				<div class="relative">
					<User size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
					<input
						id="name"
						type="text"
						bind:value={name}
						required
						placeholder="John Doe"
						disabled={isSubmitting}
						class="w-full pl-10 pr-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm disabled:bg-dark-50 disabled:cursor-not-allowed"
					/>
				</div>
			</div>

			<!-- Email Field -->
			<div>
				<label for="email" class="block text-sm font-medium text-dark-700 mb-2">
					Email <span class="text-red-500">*</span>
				</label>
				<div class="relative">
					<Mail size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
					<input
						id="email"
						type="email"
						bind:value={email}
						required
						placeholder="john@example.com"
						disabled={isSubmitting}
						class="w-full pl-10 pr-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm disabled:bg-dark-50 disabled:cursor-not-allowed"
					/>
				</div>
				<p class="text-xs text-dark-500 mt-1">We'll notify you here when tickets are available</p>
			</div>

			<!-- Phone Field (Optional) -->
			<div>
				<label for="phone" class="block text-sm font-medium text-dark-700 mb-2">
					Phone Number <span class="text-dark-400 text-xs">(optional)</span>
				</label>
				<div class="relative">
					<Phone size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
					<input
						id="phone"
						type="tel"
						bind:value={phone}
						placeholder="+1 234 567 8900"
						disabled={isSubmitting}
						class="w-full pl-10 pr-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm disabled:bg-dark-50 disabled:cursor-not-allowed"
					/>
				</div>
			</div>

			<!-- Quantity Field -->
			<div>
				<label for="quantity" class="block text-sm font-medium text-dark-700 mb-2">
					Number of Tickets <span class="text-red-500">*</span>
				</label>
				<div class="relative">
					<Ticket size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
					<input
						id="quantity"
						type="number"
						bind:value={quantity}
						min="1"
						max="10"
						required
						disabled={isSubmitting}
						class="w-full pl-10 pr-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm disabled:bg-dark-50 disabled:cursor-not-allowed"
					/>
				</div>
			</div>

			<!-- Submit Buttons -->
			<div class="flex items-center justify-end gap-3 pt-4">
				<button
					type="button"
					onclick={close}
					disabled={isSubmitting}
					class="px-6 py-2.5 border border-border-dark text-dark-700 rounded-lg hover:bg-dark-50 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
				>
					Cancel
				</button>
				<button
					type="submit"
					disabled={!isFormValid || isSubmitting}
					class="inline-flex items-center gap-2 px-6 py-2.5 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors font-medium disabled:bg-dark-300 disabled:cursor-not-allowed"
				>
					{#if isSubmitting}
						<Loader2 size={18} class="animate-spin" />
						Joining...
					{:else}
						Join Waitlist
					{/if}
				</button>
			</div>
		</form>
	{/if}
{/snippet}

{#if isMobile}
	<Drawer bind:isOpen>
		<div class="sticky top-0 bg-white pb-4 border-b border-border-card -mx-4 px-4 -mt-4 pt-4 z-10">
			<div class="flex items-center justify-between mb-2">
				<h2 class="text-xl font-semibold">Join Waitlist</h2>
				<button
					type="button"
					onclick={close}
					disabled={isSubmitting}
					class="p-2 hover:bg-dark-100 rounded-md transition-colors disabled:opacity-50"
				>
					<X size={20} />
				</button>
			</div>
			<p class="text-dark-400 text-sm">Get notified when tickets become available</p>
		</div>
		<div class="pt-4">
			{@render formContent()}
		</div>
	</Drawer>
{:else}
	<Modal
		bind:isOpen
		title="Join Waitlist"
		description="Get notified when tickets become available"
	>
		{@render formContent()}
	</Modal>
{/if}
