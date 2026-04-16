<script lang="ts">
	import { onDestroy, getContext } from 'svelte';
	import { browser } from '$app/environment';
	import { createVerticalSwipeHandler } from '$lib/utils/swipe';

	interface Props {
		isOpen?: boolean;
		children?: import('svelte').Snippet;
	}

	let { children, isOpen = $bindable(false) }: Props = $props();

	// Layouts that use a scroll-jail (overflow on a container, not body) should set
	// this context to false so we don't apply body position:fixed, which corrupts
	// iOS Safari's touch hit-test regions for elements inside the scroll container.
	const lockBodyScroll = (getContext<boolean>('drawer-lock-body-scroll') ?? true);

	let scrollPosition = 0;

	function handleKeydown(event: KeyboardEvent) {
		event.stopPropagation();
		if (event.key === 'Escape') {
			isOpen = false;
		}
	}

	function toggleBodyScroll(open: boolean) {
		if (!browser) return;
		if (!lockBodyScroll) {
			// No body lock needed (scroll-jail layout). Still flush iOS's touch
			// hit-test cache when the drawer closes so buttons below are responsive.
			if (!open) void document.body.getBoundingClientRect();
			return;
		}
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

	const onSwipe = (direction: 'top' | 'bottom') => {
		if (direction === 'bottom') isOpen = false;
	};

	const closeSwipeAction = createVerticalSwipeHandler(onSwipe);

	$effect(() => {
		toggleBodyScroll(isOpen);
	});

	onDestroy(() => {
		if (!browser || !lockBodyScroll) return;
		document.body.style.position = '';
		document.body.style.top = '';
		window.scrollTo(0, scrollPosition);
	});
</script>

<!--
	Overlay and drawer are always in the DOM (not inside {#if}).
	CSS transitions handle animation. pointer-events:none when closed ensures
	touches are never dispatched to the hidden elements — removing a DOM node
	mid-touch-sequence on iOS Safari corrupts the entire touch-dispatch state
	until the page is reloaded.
-->
<div
	class="overlay"
	class:visible={isOpen}
	onclick={() => (isOpen = false)}
	aria-hidden="true"
></div>
<div
	class="drawer"
	class:visible={isOpen}
	use:closeSwipeAction.action
	role="dialog"
	aria-modal={isOpen}
	aria-hidden={!isOpen}
	tabindex="-1"
	onkeydown={handleKeydown}
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

	.drawer {
		--border-top-radius: 1rem;
		position: fixed;
		bottom: 0;
		left: 0;
		width: 100%;
		max-height: 90vh;
		overflow-y: auto;
		padding: 1rem;
		box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
		border-top-left-radius: var(--border-top-radius);
		border-top-right-radius: var(--border-top-radius);
		z-index: 9999;
		background: var(--color-background);
		outline: none;
		pointer-events: none;
		transform: translateY(100%);
		transition: transform 300ms;
	}
	.drawer.visible {
		pointer-events: auto;
		transform: translateY(0);
	}
</style>
