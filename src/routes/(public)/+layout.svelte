<script lang="ts">
    import Navigation from "$lib/components/Navigation.svelte";
    import type { LayoutData } from "./$types";

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
                &copy; {new Date().getFullYear()} Germinal. All rights reserved.
            </p>
            <div class="flex gap-8">
                <a
                    class="hover:text-white"
                    href="https://www.instagram.com/Germinal.studio/"
                    >Instagram</a
                >
                <!-- <a -->
                <!--     class="hover:text-white" -->
                <!--     href="https://www.instagram.com/Germinal.studio/">Terms</a -->
                <!-- > -->
            </div>
        </div>
    </footer>
</div>
