<script lang="ts">
    import { adminDarkMode } from "$lib/stores/adminDarkMode.svelte";
    import { Moon, Sun } from "lucide-svelte";

    const isDark = $derived(adminDarkMode.get());
</script>

<button
    onclick={adminDarkMode.toggle}
    class="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors {isDark
        ? 'bg-dark-800 text-dark-200 hover:bg-dark-700'
        : 'bg-dark-100 text-dark-700 hover:bg-dark-200'}"
    aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    type="button"
>
    {#if isDark}
        <Sun size={16} />
    {:else}
        <Moon size={16} />
    {/if}
    <span class="text-sm font-medium">{isDark ? "Clair" : "Sombre"}</span>
</button>
