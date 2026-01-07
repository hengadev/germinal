<script lang="ts">
    import { page } from "$app/state";

    type Props = {
        user?: { role: string } | null;
        isAdminDomain?: boolean;
    };

    let { user = null, isAdminDomain = false }: Props = $props();

    const navItems = [
        { href: "/upcoming", label: "Prochain événement" },
        { href: "/events", label: "Événements" },
        { href: "/talents", label: "Talents" },
        { href: "/contact", label: "Contact" },
    ];

    const showAdminIndicator = $derived(
        user && user.role === 'admin' && !isAdminDomain
    );

    function isActive(href: string): boolean {
        if (href === "/") {
            return page.url.pathname === "/";
        }
        return page.url.pathname.startsWith(href);
    }
</script>

<nav class="">
    <div class="container mx-auto px-4">
        <div
            class="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md flex items-center justify-between px-4 py-4 xl:grid xl:grid-cols-[1fr_auto_1fr] xl:py-4 xl:px-12 border border-border-card"
        >
            <a
                href="/"
                class="text-xl font-medium font-serif text-dark-900 uppercase"
            >
                Germinal
            </a>

            <ul class="flex gap-12">
                {#each navItems as item}
                    <li>
                        <a
                            href={item.href}
                            class="text-dark-500 hover:text-dark-900 font-medium transition-colors"
                            class:text-dark-900={isActive(item.href)}
                            class:font-bold={isActive(item.href)}
                        >
                            {item.label}
                        </a>
                    </li>
                {/each}
            </ul>

            {#if showAdminIndicator}
                <div class="flex justify-end">
                    <a
                        href="https://admin.germinalstudio.co/admin"
                        class="text-sm px-3 py-1 border border-dark-300 rounded-md text-dark-600 hover:text-dark-900 hover:border-dark-600 transition-colors"
                    >
                        Admin Panel
                    </a>
                </div>
            {:else}
                <div></div>
            {/if}
        </div>
    </div>
</nav>
