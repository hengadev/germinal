<script lang="ts">
    import "../app.css";
    import { setupI18n } from '$lib/i18n';
    import { isLoading, locale } from 'svelte-i18n';
    import { browser } from '$app/environment';
    import { onMount } from 'svelte';

    let { children } = $props();

    setupI18n();

    // Update HTML lang attribute when locale changes
    $effect(() => {
        if (browser && $locale) {
            document.documentElement.lang = $locale;
        }
    });
</script>

{#if $isLoading}
    <div class="flex items-center justify-center min-h-screen">
        <div class="text-lg">Loading...</div>
    </div>
{:else}
    {@render children()}
{/if}
