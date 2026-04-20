<script lang="ts">
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	interface Props {
		isOpen?: boolean;
		children?: import('svelte').Snippet;
	}

	let { children, isOpen = $bindable(false) }: Props = $props();

	let drawerEl: HTMLElement | null = null;
	let renderChildren = $state(false);
	let closeTimer: ReturnType<typeof setTimeout> | undefined;
	let scrollLocked = false;

	// Must match .side-drawer / .overlay transition duration in <style>
	const TRANSITION_MS = 300;

	function handleKeydown(event: KeyboardEvent) {
		event.stopPropagation();
		if (event.key === 'Escape') {
			isOpen = false;
		}
	}

	function preventBodyTouchMove(e: TouchEvent) {
		// Allow scrolling inside the drawer itself
		if (drawerEl && drawerEl.contains(e.target as Node)) return;
		e.preventDefault();
	}

	function lockScroll() {
		// Use touchmove prevention instead of body position:fixed.
		// Setting position:fixed on body changes the compositing layer structure
		// on iOS Safari and permanently corrupts its touch hit-test cache,
		// causing all subsequent taps to be swallowed even after the style is removed.
		document.body.style.overflow = 'hidden'; // desktop fallback
		document.addEventListener('touchmove', preventBodyTouchMove, { passive: false });
		scrollLocked = true;
	}

	function unlockScroll() {
		document.body.style.overflow = '';
		document.removeEventListener('touchmove', preventBodyTouchMove);
		scrollLocked = false;
	}

	$effect(() => {
		if (!browser) return;
		if (isOpen) {
			clearTimeout(closeTimer);
			renderChildren = true;
			lockScroll();
		} else if (scrollLocked) {
			// Delay unlock and DOM removal until after the CSS transition.
			// Removing DOM nodes or changing body styles synchronously on the
			// same tick as the closing tap corrupts iOS Safari's touch dispatch.
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
	bind:this={drawerEl}
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
