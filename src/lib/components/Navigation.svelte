<script lang="ts">
    import { page } from "$app/state";

    const navItems = [
        { href: "/events", label: "Événements" },
        { href: "/talents", label: "Talents" },
        { href: "/contact", label: "Contact" },
    ];

    function isActive(href: string): boolean {
        if (href === "/") {
            return page.url.pathname === "/";
        }
        return page.url.pathname.startsWith(href);
    }
</script>

<nav class="bg-white">
    <div class="container mx-auto px-4">
        <div
            class="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-dark-100/50 flex items-center justify-between px-4 py-4 xl:grid xl:grid-cols-[1fr_auto_1fr] xl:py-4 xl:px-12"
        >
            <a href="/" class="text-3xl font-serif text-dark-900"> Germinal </a>

            <ul class="flex gap-8">
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
        </div>
    </div>
  </div>
</nav>
