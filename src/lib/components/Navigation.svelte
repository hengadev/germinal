<script lang="ts">
    import { page } from "$app/state";
    import { onMount, onDestroy } from "svelte";
    import { browser } from "$app/environment";
    import { t } from 'svelte-i18n';
    import LanguageSwitcher from './LanguageSwitcher.svelte';

    type Props = {
        user?: { role: string } | null;
        isAdminDomain?: boolean;
    };

    let { user = null, isAdminDomain = false }: Props = $props();

    let scrolled = $state(false);

    const isRoot = $derived(page.url.pathname === "/");
    const showScrolledState = $derived(!isRoot || scrolled);

    function handleScroll() {
        if (!isRoot) {
            scrolled = false;
            return;
        }
        scrolled = window.scrollY > window.innerHeight;
    }

    const navItems = $derived([
        { href: "/upcoming", label: $t('nav.upcomingEvent') },
        { href: "/events", label: $t('nav.events') },
        { href: "/talents", label: $t('nav.talents') },
        { href: "/contact", label: $t('nav.contact') },
    ]);

    const showAdminIndicator = $derived(
        user && user.role === "admin" && !isAdminDomain,
    );

    function isActive(href: string): boolean {
        if (href === "/") {
            return page.url.pathname === "/";
        }
        return page.url.pathname.startsWith(href);
    }

    onMount(() => {
        if (!browser) return;
        window.addEventListener("scroll", handleScroll, { passive: true });
        handleScroll(); // Initial check
    });

    onDestroy(() => {
        if (!browser) return;
        window.removeEventListener("scroll", handleScroll);
    });
</script>

<nav class="">
    <div class="container mx-auto px-4">
        <div
            class="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-4 xl:grid xl:grid-cols-[1fr_auto_1fr] xl:py-4 xl:px-12 border {showScrolledState
                ? `bg-white/80 backdrop-blur-md border-border-card`
                : `bg-transparent border-transparent`}"
        >
            <a
                href="/"
                class="text-xl font-medium font-serif uppercase {showScrolledState
                    ? `text-dark-900`
                    : `text-white`}"
            >
                Germinal
            </a>

            <ul class="flex gap-12">
                {#each navItems as item}
                    <li>
                        <a
                            href={item.href}
                            class="font-medium transition-colors {showScrolledState
                                ? `text-dark-500 hover:text-dark-900`
                                : `text-white/80 hover:text-white`} {isActive(
                                item.href,
                            )
                                ? showScrolledState
                                    ? `text-dark-900`
                                    : `text-white`
                                : ``} {isActive(item.href) ? `font-bold` : ``}"
                        >
                            {item.label}
                        </a>
                    </li>
                {/each}
            </ul>

            <div class="flex justify-end gap-4 items-center">
                <LanguageSwitcher />
                {#if showAdminIndicator}
                    <a
                        href="https://admin.germinalstudio.co/admin"
                        class="text-sm px-4 py-2 border rounded-md transition-colors {showScrolledState
                            ? `border-dark-300 text-dark-600 hover:text-dark-900 hover:border-dark-600`
                            : `border-white/30 text-white/80 hover:text-white hover:border-white`}"
                    >
                        {$t('nav.adminPanel')}
                    </a>
                {/if}
                    <!-- NOTE: that will be implemented later when we have the payment part set -->
                    <!-- <div class="flex justify-end"> -->
                    <!--     <a -->
                    <!--         href="/upcoming" -->
                    <!--         class="text-sm px-4 py-2 border rounded-md transition-colors {showScrolledState -->
                    <!--             ? `border-dark-300 text-dark-600 hover:text-dark-900 hover:border-dark-600` -->
                    <!--             : `border-white/30 text-white/80 hover:text-white hover:border-white`}" -->
                    <!--     > -->
                    <!--         Reserve ta place -->
                    <!--     </a> -->
                    <!-- </div> -->
            </div>
        </div>
    </div>
</nav>
