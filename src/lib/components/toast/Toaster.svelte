<script lang="ts">
	import Toast from "./Toast.svelte";
	import { getToastContext } from "./state.svelte";

	let toastState = getToastContext();
</script>

<div class="fixed bottom-4 right-4 z-[9999] flex flex-col-reverse gap-2 pointer-events-none">
	{#each toastState.toasts as toast (toast.id)}
		<div class="pointer-events-auto">
			<Toast {toast} />
		</div>
	{/each}
</div>
