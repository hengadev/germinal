<script lang="ts">
	import { fly } from "svelte/transition";
	import { quintOut } from "svelte/easing";
	import type { Toast } from "./types";
	import { getToastContext } from "./state.svelte";
	import { CircleCheck as Check, CircleX as XCircle, TriangleAlert as AlertTriangle, Info as InfoIcon } from "lucide-svelte";

	type Props = { toast: Toast };

	let { toast }: Props = $props();
	const toastState = getToastContext();

	const iconConfig = {
		success: { icon: Check, color: "text-green-600 dark:text-green-400", bgColor: "bg-green-50 dark:bg-green-950", borderColor: "border-green-200 dark:border-green-800" },
		error: { icon: XCircle, color: "text-red-600 dark:text-red-400", bgColor: "bg-red-50 dark:bg-red-950", borderColor: "border-red-200 dark:border-red-800" },
		warning: { icon: AlertTriangle, color: "text-orange-600 dark:text-orange-400", bgColor: "bg-orange-50 dark:bg-orange-950", borderColor: "border-orange-200 dark:border-orange-800" },
		info: { icon: InfoIcon, color: "text-blue-600 dark:text-blue-400", bgColor: "bg-blue-50 dark:bg-blue-950", borderColor: "border-blue-200 dark:border-blue-800" }
	};

	const config = $derived(iconConfig[toast.level]);
	const Icon = $derived(config.icon);
</script>

<div
	class="flex items-start gap-3 border-2 {config.borderColor} {config.bgColor} rounded-lg p-4 shadow-popover min-w-[320px] max-w-[420px]"
	transition:fly={{ y: 10, duration: 400, easing: quintOut }}
>
	<Icon size={24} class="{config.color} flex-shrink-0 mt-0.5" />
	<div class="flex-1 min-w-0">
		<p class="font-semibold text-sm text-foreground">{toast.title}</p>
		<p class="text-sm text-foreground-alt">{toast.message}</p>
	</div>
	<button
		type="button"
		onclick={() => toastState.remove(toast.id)}
		class="flex-shrink-0 text-muted-foreground hover:text-muted-foreground transition-colors p-1 rounded hover:bg-black/5 dark:hover:bg-white/10"
		aria-label="Close"
	>
		<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<path d="M18 6 6 18"/><path d="m6 6 12 12"/>
		</svg>
	</button>
</div>
