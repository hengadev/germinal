<script lang="ts">
    import { locale } from "svelte-i18n";
    import { Globe } from "lucide-svelte";

    type Props = {
        scrolled?: boolean;
    };

    let { scrolled = true }: Props = $props();

    let currentLocale = $state<string>("fr");

    locale.subscribe((value) => {
        if (value) currentLocale = value;
    });

    function switchLanguage() {
        const newLocale = currentLocale === "en" ? "fr" : "en";
        locale.set(newLocale);
    }
</script>

<button
    onclick={switchLanguage}
    class="flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors {scrolled
        ? 'border-dark-200 hover:border-dark-400 text-dark-700 hover:text-dark-900'
        : 'border-white/30 text-white/80 hover:text-white hover:border-white'}"
    title="Switch language / Changer de langue"
>
    <Globe size={16} />
    <span class="uppercase text-sm font-medium">{currentLocale}</span>
</button>
