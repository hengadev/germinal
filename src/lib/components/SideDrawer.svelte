<script lang="ts">
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	interface Props {
		isOpen?: boolean;
		children?: import('svelte').Snippet;
	}

	let { children, isOpen = $bindable(false) }: Props = $props();

	let scrollPosition = 0;
	let scrollLocked = false;
	let renderChildren = $state(false);
	let closeTimer: ReturnType<typeof setTimeout> | undefined;

	// CSS transition duration must match the .side-drawer / .overlay transition in <style>
	const TRANSITION_MS = 300;

	function handleKeydown(event: KeyboardEvent) {
		event.stopPropagation();
		if (event.key === 'Escape') {
			isOpen = false;
		}
	}

	function lockScroll() {
		scrollPosition = window.scrollY;
		document.body.style.position = 'fixed';
		document.body.style.top = `-${scrollPosition}px`;
		document.body.style.width = '100%';
		scrollLocked = true;
	}

	function unlockScroll() {
		document.body.style.position = '';
		document.body.style.top = '';
		document.body.style.width = '';
		window.scrollTo(0, scrollPosition);
		// iOS Safari caches touch hit-test regions. After removing position:fixed
		// from body we must force a synchronous relayout so those cached regions
		// are invalidated before the next tap event is processed.
		void document.body.getBoundingClientRect();
		scrollLocked = false;
	}

	$effect(() => {
		if (!browser) return;
		if (isOpen) {
			clearTimeout(closeTimer);
			renderChildren = true;
			lockScroll();
		} else if (scrollLocked) {
			// Delay both the body-scroll unlock and the children DOM removal until
			// after the CSS transition (TRANSITION_MS). Mutating the DOM or clearing
			// position:fixed synchronously on the same tick as the tap that closed
			// the drawer corrupts iOS Safari's touch hit-test cache, causing every
			// subsequent tap to be swallowed until the page is reloaded.
			closeTimer = setTimeout(() => {
				unlockScroll();
				renderChildren = false;
			}, TRANSITION_MS);
		}
	});

	onDestroy(() => {
		clearTimeout(closeTimer);
		if (!browser) return;
		if (scrollLocked) unlockScroll();
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
	{#if renderChildren}
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
