<script lang="ts">
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';

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

	function toggleBodyScroll(open: boolean) {
		if (!browser) return;
		if (open) {
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

<!--
	Overlay and side-drawer are always in the DOM (not inside {#if}).
	CSS transitions handle animation. pointer-events:none when closed ensures
	touches are never dispatched to the hidden elements — removing a DOM node
	mid-touch-sequence on iOS Safari corrupts the entire touch-dispatch state
	until the page is reloaded.
-->
<div
	class="overlay"
	class:visible={isOpen}
	onclick={() => (isOpen = false)}
	onkeydown={handleKeydown}
	aria-hidden="true"
></div>
<div
	class="side-drawer"
	class:visible={isOpen}
	onkeydown={handleKeydown}
	tabindex="-1"
	role="dialog"
	aria-modal={isOpen}
	aria-hidden={!isOpen}
>
	{#if isOpen}
		{@render children?.()}
	{/if}
</div>

<style>
	.overlay {
		position: fixed;
		top: 0;
		left: 0;
		height: 100%;
		width: 100vw;
		background: rgba(0, 0, 0, 0.5);
		opacity: 0;
		pointer-events: none;
		z-index: 9998;
		transition: opacity 300ms;
	}
	.overlay.visible {
		opacity: 1;
		pointer-events: auto;
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
		pointer-events: none;
		transform: translateX(100%);
		transition: transform 300ms;
	}
	.side-drawer.visible {
		pointer-events: auto;
		transform: translateX(0);
	}
</style>
