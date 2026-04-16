<script lang="ts">
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { fly, fade } from 'svelte/transition';

	interface Props {
		isOpen?: boolean;
		children?: import('svelte').Snippet;
	}

	let { children, isOpen = $bindable(false) }: Props = $props();

	let scrollPosition: number = 0;

	function handleKeydown(event: KeyboardEvent) {
		event.stopPropagation();
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
			// iOS Safari caches touch hit-test regions. After removing position:fixed
			// from body we must force a synchronous relayout so those cached regions
			// are invalidated before the next tap event is processed.
			void document.body.getBoundingClientRect();
		}
	}

	$effect(() => {
		toggleBodyScroll(isOpen);
	});

	onDestroy(() => {
		if (!browser) return;
		document.body.style.position = '';
		document.body.style.top = '';
		document.body.style.width = '';
		window.scrollTo(0, scrollPosition);
	});
</script>

{#if isOpen}
	<div
		transition:fade={{ duration: 300 }}
		class="overlay"
		onclick={() => (isOpen = false)}
		onkeydown={handleKeydown}
		class:visible={isOpen}
		tabindex="0"
		role="button"
		aria-label="Close drawer"
	></div>
	<div
		transition:fly={{ x: 300, duration: 300 }}
		class="side-drawer"
		class:visible={isOpen}
		onkeydown={handleKeydown}
		tabindex="0"
		role="dialog"
		aria-modal="true"
	>
		{@render children?.()}
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		top: 0;
		left: 0;
		height: 100%;
		width: 100vw;
		background: rgba(0, 0, 0, 0.5);
		opacity: 0;
		visibility: hidden;
		z-index: 9998;
	}
	.overlay.visible {
		opacity: 1;
		visibility: visible;
	}

	.side-drawer {
		position: fixed;
		top: 0;
		right: 0;
		height: 100vh;
		width: 280px;
		max-width: 85vw;
		background: white;
		padding: 1.5rem;
		box-shadow: -2px 0 10px rgba(0, 0, 0, 0.2);
		z-index: 9999;
		overflow-y: auto;
	}
	.side-drawer.visible {
		right: 0;
	}
</style>
