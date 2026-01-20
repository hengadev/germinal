<script lang="ts">
    import { page } from "$app/state";
    import { onMount, onDestroy } from "svelte";
    import { browser } from "$app/environment";
    import { t } from 'svelte-i18n';
    import { Menu, X } from "lucide-svelte";
    import LanguageSwitcher from './LanguageSwitcher.svelte';
    import SideDrawer from './SideDrawer.svelte';

    type Props = {
        user?: { role: string } | null;
        isAdminDomain?: boolean;
    };

    let { user = null, isAdminDomain = false }: Props = $props();

    let scrolled = $state(false);
    let isMobileMenuOpen = $state(false);

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

    function handleResize() {
        if (window.innerWidth >= 1280 && isMobileMenuOpen) {
            isMobileMenuOpen = false;
        }
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

    $effect(() => {
        if (!browser) return;
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    });
</script>

<svelte:window
    onkeydown={(e) => {
        if (e.key === "Escape") isMobileMenuOpen = false;
    }}
/>


<div
    class="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-4 xl:grid xl:grid-cols-[1fr_auto_1fr] xl:py-4 xl:px-12 border {showScrolledState
        ? `bg-white/80 backdrop-blur-md border-border-card`
        : `bg-transparent border-transparent`}"
>
    <button
        onclick={() => (isMobileMenuOpen = true)}
        aria-label="Open navigation menu"
        aria-expanded={isMobileMenuOpen}
        class="flex items-center justify-center xl:hidden w-11 h-11"
    >
        <Menu
            size={24}
            class={showScrolledState ? "text-dark-900" : "text-white"}
        />
    </button>

    <a
        href="/"
        class="text-xl font-medium font-serif uppercase {showScrolledState
            ? `text-dark-900`
            : `text-white`} xl:justify-start"
    >
        Germinal
    </a>

    <nav class="hidden xl:block">
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
    </nav>

    <div class="flex justify-end gap-4 items-center hidden xl:flex">
        <LanguageSwitcher scrolled={showScrolledState} />
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

<SideDrawer bind:isOpen={isMobileMenuOpen}>
    <div class="flex flex-col h-full">
        <div class="flex justify-end mb-6">
            <button
                onclick={() => (isMobileMenuOpen = false)}
                aria-label="Close navigation menu"
                class="w-11 h-11 flex items-center justify-center"
            >
                <X size={24} />
            </button>
        </div>

        <nav class="flex-1">
            <ul class="flex flex-col gap-1 list-none p-0 m-0">
                {#each navItems as item}
                    <li>
                        <a
                            href={item.href}
                            onclick={() => (isMobileMenuOpen = false)}
                            class="block py-3 px-6 rounded-lg min-h-[44px] transition-colors {isActive(
                                item.href,
                            )
                                ? 'bg-dark-100 text-dark-900 font-semibold'
                                : 'text-dark-500 hover:bg-dark-50 hover:text-dark-900'}"
                        >
                            {item.label}
                        </a>
                    </li>
                {/each}
            </ul>
        </nav>

        <div class="h-px bg-dark-200 my-6"></div>

        <div class="flex flex-col gap-3">
            <LanguageSwitcher scrolled={true} />
            {#if showAdminIndicator}
                <a
                    href="https://admin.germinalstudio.co/admin"
                    onclick={() => (isMobileMenuOpen = false)}
                    class="w-full inline-flex justify-center items-center px-8 py-3.5 bg-dark-900 hover:bg-dark-800 text-white text-sm sm:text-base font-medium transition-all duration-200 shadow-sm hover:shadow-md"
                >
                    {$t('nav.adminPanel')}
                </a>
            {/if}
        </div>
    </div>
</SideDrawer>
