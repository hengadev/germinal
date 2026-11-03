<script lang="ts">
    import { page } from "$app/state";
    import { slide } from "svelte/transition";
    import { browser } from "$app/environment";
    import { setContext } from "svelte";
    import { afterNavigate } from "$app/navigation";
    import AdminSidebar from "./AdminSidebar.svelte";
    import Toaster from "$lib/components/toast/Toaster.svelte";
    import { setToastContext } from "$lib/components/toast/state.svelte";
    import Drawer from "$lib/components/ui/Drawer.svelte";
    import { adminDarkMode } from "$lib/stores/adminDarkMode.svelte";
    import ThemeToggle from "$lib/components/admin/ThemeToggle.svelte";
    import type { LayoutData } from "./$types";
    import { ExternalLink, KeyRound, LogOut } from "lucide-svelte";
    import { ADMIN_MOBILE_BAR, ADMIN_NAV_GROUPS, isAdminNavActive, type AdminNavItem } from "./admin-nav";

    let {
        data,
        children,
    }: { data: LayoutData; children: import("svelte").Snippet } = $props();

    // Set up toast context for all admin pages
    setToastContext();

    // Tell Drawer components in this layout tree not to apply body position:fixed.
    // Admin uses a scroll-jail (<main> scrolls, not body), so body locking corrupts
    // iOS Safari's touch hit-test regions for elements inside the scroll container.
    setContext('drawer-lock-body-scroll', false);

    // Mobile menu drawer state
    let mobileMenuOpen = $state(false);

    // The bottom bar's pages, and the ☰ menu's groups without them.
    const allNavItems = ADMIN_NAV_GROUPS.flatMap((group) => group.items);
    const mobileBar = ADMIN_MOBILE_BAR.map((href) => allNavItems.find((item) => item.href === href)!);
    const menuGroups = ADMIN_NAV_GROUPS
        .map((group) => ({ ...group, items: group.items.filter((item) => !ADMIN_MOBILE_BAR.includes(item.href)) }))
        .filter((group) => group.items.length > 0);
    const badgeOf = (item: AdminNavItem): number => (item.badge ? data[item.badge] : 0);

    // Reference to the scrollable main content area
    let mainEl: HTMLElement;

    // After each client-side navigation, scroll main to top and force iOS Safari
    // to repaint the scroll-jail container. Without this, iOS can freeze the
    // compositing layer and show stale content until a hard refresh.
    afterNavigate(() => {
        if (browser && mainEl) {
            mainEl.scrollTop = 0;
            void mainEl.getBoundingClientRect();
        }
    });

    // Apply dark mode class to html element only when in admin routes
    $effect(() => {
        if (browser) {
            if (adminDarkMode.get()) {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        }
    });

    // Clean up: remove dark class when leaving admin routes
    $effect(() => {
        return () => {
            if (browser) {
                document.documentElement.classList.remove('dark');
            }
        };
    });
</script>

<div class="back-office contents">
<!-- Mobile Layout -->
<div class="lg:hidden h-screen h-[100dvh] flex flex-col overflow-hidden bg-muted/25">
    <!-- Mobile Header - fixed at top -->
    <header class="flex-shrink-0 bg-background border-b border-border-card z-40">
        <div class="flex items-center justify-between px-4 py-3">
            <div class="flex items-center gap-3">
                <h1 class="text-lg font-semibold text-foreground">Admin</h1>
            </div>
            <div class="flex items-center gap-2">
                <ThemeToggle />
                <button
                    onclick={() => (mobileMenuOpen = true)}
                    class="p-3 text-foreground-alt hover:text-foreground rounded-lg hover:bg-muted transition-colors"
                    aria-label="Menu"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <line x1="3" x2="21" y1="6" y2="6"></line>
                        <line x1="3" x2="21" y1="12" y2="12"></line>
                        <line x1="3" x2="21" y1="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        </div>
    </header>

    <!-- Main Content Area - scrollable -->
    <main bind:this={mainEl} class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        {@render children()}
    </main>

    <!-- Mobile Bottom Navigation - fixed at bottom -->
    <nav
        class="flex-shrink-0 bg-background border-t border-border-card z-50 pb-[env(safe-area-inset-bottom)]"
        aria-label="Mobile navigation"
    >
        <div class="flex items-stretch">
            {#each mobileBar as item (item.href)}
                {@const active = isAdminNavActive(item.href, page.url.pathname)}
                {@const badge = badgeOf(item)}
                <a
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    class="relative flex-1 flex flex-col items-center justify-center gap-1 pt-3 pb-6 {active
                        ? 'text-foreground'
                        : 'text-muted-foreground hover:text-foreground-alt'}"
                >
                    <item.icon size={20} strokeWidth={2} />
                    <span class="text-[10px] font-medium">{item.shortLabel ?? item.label}</span>
                    {#if badge > 0}
                        <span
                            class="absolute top-1.5 left-1/2 ml-2 rounded-full bg-red-600 text-white text-[10px] font-semibold px-1 min-w-4 text-center leading-4"
                            aria-label="{badge} à voir"
                        >{badge}</span>
                    {/if}
                </a>
            {/each}
        </div>
    </nav>

    <!-- Toast notifications -->
    <Toaster />
</div>

<!-- Toast notifications for desktop (outside flex container) -->
<div class="hidden lg:block">
    <Toaster />
</div>

<!-- Desktop Layout -->
<div class="hidden lg:flex min-h-screen bg-muted/25">
    <!-- Desktop Sidebar -->
    <AdminSidebar {data} />

    <!-- Main Content Area -->
    <main class="flex-1 min-w-0 bg-background">
        {@render children()}
    </main>

    <!-- Toast notifications -->
    <Toaster />
</div>

<!-- Mobile Menu Drawer (outside container for proper z-index) -->
<Drawer bind:isOpen={mobileMenuOpen}>
    <div class="flex flex-col gap-4 pt-2">
        <!-- User Info -->
        <div class="flex items-center gap-3 pb-4 border-b border-border-card">
            <div
                class="w-12 h-12 rounded-full flex items-center justify-center bg-muted border border-border-card"
            >
                <span class="text-sm font-semibold text-foreground-alt uppercase">
                    {data.user.email[0].toUpperCase()}
                </span>
            </div>
            <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-foreground truncate">
                    {data.user.email}
                </p>
                <p class="text-xs text-muted-foreground capitalize">
                    {data.user.role}
                </p>
            </div>
        </div>

        <!-- Menu Items: the rest of the navigation, under the sidebar's headings -->
        {#each menuGroups as group (group.label)}
            <div>
                <p class="px-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</p>
                {#each group.items as item (item.href)}
                    {@const active = isAdminNavActive(item.href, page.url.pathname)}
                    {@const badge = badgeOf(item)}
                    <a
                        href={item.href}
                        onclick={() => (mobileMenuOpen = false)}
                        aria-current={active ? "page" : undefined}
                        class="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors {active
                            ? 'bg-foreground text-background'
                            : 'text-foreground-alt hover:text-foreground hover:bg-muted'}"
                    >
                        <item.icon size={20} strokeWidth={1.5} />
                        <span class="text-sm font-medium">{item.label}</span>
                        {#if badge > 0}
                            <span class="ml-auto rounded-full bg-red-600 text-white text-xs font-semibold px-2 py-0.5 min-w-5 text-center">{badge}</span>
                        {/if}
                    </a>
                {/each}
            </div>
        {/each}

        <!-- Account: the same actions as the sidebar's account menu -->
        <div class="border-t border-border-card pt-4">
            <a
                href="https://germinalstudio.co"
                target="_blank"
                rel="noopener noreferrer"
                onclick={() => (mobileMenuOpen = false)}
                class="flex items-center gap-3 px-4 py-3 text-foreground-alt hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            >
                <ExternalLink size={20} strokeWidth={1.5} />
                <span class="text-sm font-medium">Voir le site</span>
            </a>
            <a
                href={data.staffPortalUrl}
                target="_blank"
                rel="noopener noreferrer"
                onclick={() => (mobileMenuOpen = false)}
                class="flex items-center gap-3 px-4 py-3 text-foreground-alt hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            >
                <ExternalLink size={20} strokeWidth={1.5} />
                <span class="text-sm font-medium">Portail Staff</span>
            </a>
            <a
                href="/admin/change-password"
                onclick={() => (mobileMenuOpen = false)}
                class="flex items-center gap-3 px-4 py-3 text-foreground-alt hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            >
                <KeyRound size={20} strokeWidth={1.5} />
                <span class="text-sm font-medium">Changer le mot de passe</span>
            </a>
            <form method="POST" action="/logout">
                <button
                    type="submit"
                    class="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition-colors"
                >
                    <LogOut size={20} strokeWidth={1.5} />
                    <span class="text-sm font-medium">Déconnexion</span>
                </button>
            </form>
        </div>
    </div>
</Drawer>
</div>

<style>
    :global(.safe-area-inset-bottom) {
        padding-bottom: env(safe-area-inset-bottom);
    }
</style>
