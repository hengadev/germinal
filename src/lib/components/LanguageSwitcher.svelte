<script lang="ts">
    import { locale } from "svelte-i18n";
    import { Globe } from "lucide-svelte";

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
    class="flex items-center gap-2 px-3 py-2 rounded-lg border border-dark-200 hover:border-dark-400 transition-colors text-dark-700 hover:text-dark-900"
    title="Switch language / Changer de langue"
>
    <Globe size={16} />
    <span class="uppercase text-sm font-medium">{currentLocale}</span>
</button>
