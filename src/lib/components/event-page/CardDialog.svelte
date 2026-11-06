<script lang="ts">
	// The printed cards (Menus, Drinks cards) opened over the page: a sheet
	// of paper, flat, full screen on phones and centred on desktop, that
	// scrolls on its own. Escape, the close button or a click beside it
	// closes it.
	import type { Snippet } from 'svelte';
	import { t } from 'svelte-i18n';

	let {
		open,
		onclose,
		label,
		children,
	}: {
		open: boolean;
		onclose: () => void;
		/** Names the dialog for screen readers. */
		label: string;
		children: Snippet;
	} = $props();

	let dialog: HTMLDialogElement | undefined = $state();

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	});
</script>

<dialog
	bind:this={dialog}
	aria-label={label}
	{onclose}
	onclick={(event) => event.target === dialog && dialog?.close()}
	class="overscroll-contain bg-background p-0 text-foreground backdrop:bg-foreground/40 max-sm:m-0 max-sm:h-svh max-sm:max-h-none max-sm:w-screen max-sm:max-w-none sm:m-auto sm:max-h-[90svh] sm:w-[min(36rem,calc(100vw-4rem))]"
>
	<div class="sticky top-0 flex justify-end bg-background px-4 py-4">
		<button type="button" onclick={() => dialog?.close()} class="text-sm underline-offset-4 hover:underline">
			{$t('events.page.viewer.close')} ✕
		</button>
	</div>
	<div class="flex flex-col gap-16 px-6 pt-2 pb-16 sm:px-12">
		{@render children()}
	</div>
</dialog>
