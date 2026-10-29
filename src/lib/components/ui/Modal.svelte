<script lang="ts" module>
	// Modals open at once (a confirmation over a modal): each opens above
	// the last, and the page scrolls again once the last one closes.
	let openModals = 0;
</script>

<script lang="ts">
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	interface Props {
		isOpen?: boolean;
		title?: string;
		description?: string;
		/** Room for forms with rows of fields. */
		wide?: boolean;
		children?: import('svelte').Snippet;
	}

	let { children, isOpen = $bindable(false), title, description, wide = false }: Props = $props();

	const uid = $props.id();
	let dialogEl: HTMLElement | null = $state(null);
	/** How many modals were open below this one when it opened. */
	let layer = $state(0);
	/** Focused before opening, and the modal holding it: focused again on
	 * close, the modal if that element is gone, so Escape still reaches it. */
	let returnFocus: HTMLElement | null = null;
	let returnDialog: HTMLElement | null = null;
	let renderChildren = $state(false);
	let closeTimer: ReturnType<typeof setTimeout> | undefined;
	let scrollLocked = false;

	const TRANSITION_MS = 200;

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.stopPropagation();
			isOpen = false;
		}
	}

	function preventBodyTouchMove(e: TouchEvent) {
		if (dialogEl && dialogEl.contains(e.target as Node)) return;
		e.preventDefault();
	}

	function lockScroll() {
		layer = openModals++;
		document.body.style.overflow = 'hidden';
		document.addEventListener('touchmove', preventBodyTouchMove, { passive: false });
		scrollLocked = true;
	}

	function unlockScroll() {
		document.removeEventListener('touchmove', preventBodyTouchMove);
		if (--openModals === 0) {
			document.body.style.overflow = '';
			void document.body.getBoundingClientRect();
		}
		scrollLocked = false;
	}

	$effect(() => {
		if (!browser) return;
		if (isOpen) {
			clearTimeout(closeTimer);
			renderChildren = true;
			if (!scrollLocked) {
				returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
				returnDialog = returnFocus?.closest<HTMLElement>('[role="dialog"]') ?? null;
				lockScroll();
			}
			if (dialogEl) dialogEl.focus();
		} else if (scrollLocked || renderChildren) {
			(returnFocus?.isConnected ? returnFocus : returnDialog)?.focus();
			returnFocus = returnDialog = null;
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

<div
	class="overlay"
	class:visible={isOpen}
	style:z-index={9998 + layer * 2}
	onclick={() => (isOpen = false)}
	aria-hidden="true"
></div>
<div
	bind:this={dialogEl}
	class="modal"
	class:visible={isOpen}
	class:wide
	style:z-index={9999 + layer * 2}
	role="dialog"
	aria-modal={isOpen}
	aria-hidden={!isOpen}
	aria-labelledby={title ? `${uid}-title` : undefined}
	aria-describedby={description ? `${uid}-description` : undefined}
	tabindex="-1"
	onclick={(e) => e.stopPropagation()}
	onkeydown={handleKeydown}
>
	{#if renderChildren}
		{#if title || description}
			<div class="modal-header">
				{#if title}
					<h2 id="{uid}-title" class="modal-title">{title}</h2>
				{/if}
				{#if description}
					<p id="{uid}-description" class="modal-description">{description}</p>
				{/if}
			</div>
		{/if}
		{@render children?.()}
	{/if}
</div>

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
		opacity: 0;
		pointer-events: none;
		transition: opacity 200ms;
	}
	.overlay.visible {
		opacity: 1;
		pointer-events: auto;
	}

	.modal {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%) translateY(30px);
		width: 90vw;
		max-width: 540px;
		max-height: 90vh;
		overflow-y: auto;
		background: var(--background-alt);
		border-radius: 0.75rem;
		box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
		z-index: 9999;
		padding: 1.5rem;
		outline: none;
		opacity: 0;
		pointer-events: none;
		transition: opacity 200ms, transform 250ms;
	}
	.modal.wide {
		max-width: 720px;
	}
	.modal.visible {
		opacity: 1;
		pointer-events: auto;
		transform: translate(-50%, -50%) translateY(0);
	}

	.modal-header {
		margin-bottom: 1rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--border-card);
	}

	.modal-title {
		font-size: 1.25rem;
		font-weight: 600;
		line-height: 1.75rem;
		color: var(--foreground);
		margin: 0 0 0.25rem 0;
	}

	.modal-description {
		font-size: 0.875rem;
		line-height: 1.25rem;
		color: var(--foreground-alt);
		margin: 0;
	}
</style>
