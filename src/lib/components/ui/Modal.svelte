<script lang="ts">
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { fade, fly } from 'svelte/transition';

	interface Props {
		isOpen?: boolean;
		title?: string;
		description?: string;
		children?: import('svelte').Snippet;
	}

	let { children, isOpen = $bindable(false), title, description }: Props = $props();

	let scrollPosition = 0;
	let dialogEl: HTMLElement | null = $state(null);

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			isOpen = false;
		}
	}

	function toggleBodyScroll(isOpen: boolean) {
		if (!browser) return;
		if (isOpen) {
			scrollPosition = window.scrollY;
			document.body.style.position = 'fixed';
			document.body.style.top = `-${scrollPosition}px`;
			document.body.style.width = '100%';
		} else {
			document.body.style.position = '';
			document.body.style.top = '';
			document.body.style.width = '';
			window.scrollTo(0, scrollPosition);
		}
	}

	$effect(() => {
		toggleBodyScroll(isOpen);
	});

	$effect(() => {
		if (isOpen && dialogEl) {
			dialogEl.focus();
		}
	});

	onDestroy(() => {
		if (!browser) return;
		document.body.style.position = '';
		document.body.style.top = '';
		window.scrollTo(0, scrollPosition);
	});
</script>

{#if isOpen}
	<div
		transition:fade={{ duration: 200 }}
		class="overlay"
		onclick={() => (isOpen = false)}
	>
		<div
			bind:this={dialogEl}
			transition:fly={{ y: 30, duration: 250 }}
			class="modal"
			role="dialog"
			aria-modal="true"
			aria-labelledby={title ? 'modal-title' : undefined}
			aria-describedby={description ? 'modal-description' : undefined}
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={handleKeydown}
		>
			{#if title || description}
				<div class="modal-header">
					{#if title}
						<h2 id="modal-title" class="modal-title">{title}</h2>
					{/if}
					{#if description}
						<p id="modal-description" class="modal-description">{description}</p>
					{/if}
				</div>
			{/if}
			{@render children?.()}
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 9998;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}

	.modal {
		position: relative;
		width: 90vw;
		max-width: 540px;
		max-height: 90vh;
		overflow-y: auto;
		background: white;
		border-radius: 0.75rem;
		box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
		z-index: 9999;
		padding: 1.5rem;
		outline: none;
	}

	.modal-header {
		margin-bottom: 1rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.modal-title {
		font-size: 1.25rem;
		font-weight: 600;
		line-height: 1.75rem;
		color: #111827;
		margin: 0 0 0.25rem 0;
	}

	.modal-description {
		font-size: 0.875rem;
		line-height: 1.25rem;
		color: #6b7280;
		margin: 0;
	}
</style>
