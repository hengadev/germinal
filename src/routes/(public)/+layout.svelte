<script lang="ts">
    import Navigation from "$lib/components/Navigation.svelte";
    import type { LayoutData } from "./$types";
    import { Instagram } from "lucide-svelte";
    import { t } from 'svelte-i18n';

    let { data, children }: { data: LayoutData; children: any } = $props();
</script>

<div class="min-h-screen flex flex-col">
    <Navigation user={data.user} isAdminDomain={data.isAdminDomain} />

    <main class="flex-1">
        {@render children()}
    </main>

    <footer class="bg-dark-900 text-white/80 py-6 mt-12">
        <div class="container mx-auto px-4 flex items-center justify-between">
            <p>
                &copy; {new Date().getFullYear()} Germinal. {$t('footer.allRightsReserved')}
            </p>
            <div class="flex gap-8">
                <a
                    class="text-white/80 hover:text-white flex items-center gap-2"
                    target="_blank"
                    href="https://www.instagram.com/Germinal.studio/"
                    rel="noopener noreferrer"
                >
                    <Instagram />
                    <p>{$t('footer.instagram')}</p>
                </a>
                <!-- <a -->
                <!--     class="hover:text-white" -->
                <!--     href="https://www.instagram.com/Germinal.studio/">Terms</a -->
                <!-- > -->
            </div>
        </div>
    </footer>
</div>
