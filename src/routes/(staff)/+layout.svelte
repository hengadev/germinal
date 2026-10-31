<script lang="ts">
    import { page } from "$app/state";
    import { browser } from "$app/environment";
    import Toaster from "$lib/components/toast/Toaster.svelte";
    import { setToastContext } from "$lib/components/toast/state.svelte";
    import ThemeToggle from "$lib/components/admin/ThemeToggle.svelte";
    import { adminDarkMode } from "$lib/stores/adminDarkMode.svelte";
    import { CalendarDays, KeyRound, ListChecks, LogOut, ScanLine } from "lucide-svelte";
    import VariantA from "$lib/components/staff/nav/VariantA.svelte";
    import VariantB from "$lib/components/staff/nav/VariantB.svelte";
    import VariantC from "$lib/components/staff/nav/VariantC.svelte";
    import NavSwitcher from "$lib/components/staff/nav/NavSwitcher.svelte";
    import type { LayoutData } from "./$types";

    let {
        data,
        children,
    }: { data: LayoutData; children: import("svelte").Snippet } = $props();

    // Set up toast context for all staff pages
    setToastContext();

    // Apply dark mode class to html element only when in staff routes
    $effect(() => {
        if (browser) {
            if (adminDarkMode.get()) {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        }
    });

    // Clean up: remove dark class when leaving staff routes
    $effect(() => {
        return () => {
            if (browser) {
                document.documentElement.classList.remove('dark');
            }
        };
    });

    // Issue 031 — three toggleable bottom-bar variants; A by default.
    // `?nav=a|b|c` picks one (and stores it); the switcher only appears
    // when a variant was chosen explicitly. Removed once the user decides.
    type NavVariant = "a" | "b" | "c";
    let navVariant = $state<NavVariant>("a");
    let showSwitcher = $state(false);

    function isNavVariant(v: string | null | undefined): v is NavVariant {
        return v === "a" || v === "b" || v === "c";
    }

    $effect(() => {
        const nav = page.url.searchParams.get("nav");
        const stored = browser ? localStorage.getItem("staff-nav-variant") : null;
        navVariant = isNavVariant(nav) ? nav : isNavVariant(stored) ? stored : "a";
        showSwitcher = nav !== null || stored !== null;
        if (browser && isNavVariant(nav)) localStorage.setItem("staff-nav-variant", nav);
    });

    function selectNavVariant(v: NavVariant) {
        navVariant = v;
        showSwitcher = true;
        if (browser) localStorage.setItem("staff-nav-variant", v);
    }
</script>

<div class="back-office contents">
    <!-- Mise en page mobile -->
    <div class="lg:hidden h-screen h-[100dvh] flex flex-col overflow-hidden bg-muted/25">
        <!-- En-tête mobile -->
        <header class="flex-shrink-0 bg-background border-b border-border-card z-40">
            <div class="flex items-center justify-between px-4 py-3">
                <h1 class="text-lg font-semibold text-foreground">Portail Staff</h1>
                <div class="flex items-center gap-1">
                    {#if navVariant === "a"}
                        <a
                            href="/staff/change-password"
                            class="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg {page.url.pathname === '/staff/change-password'
                                ? 'bg-foreground text-background'
                                : 'text-foreground-alt hover:bg-surface-hover hover:text-foreground'}"
                            aria-label="Compte"
                        >
                            <KeyRound size={20} />
                        </a>
                    {/if}
                    <ThemeToggle />
                </div>
            </div>
        </header>

        <!-- Contenu, défilable -->
        <main class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
            {@render children()}
        </main>

        <!-- Barre d'onglets en bas, dans la variante choisie -->
        {#if showSwitcher}
            <NavSwitcher variant={navVariant} select={selectNavVariant} />
        {/if}
        {#if navVariant === "a"}
            <VariantA scanHref={data.scanHref} />
        {:else if navVariant === "b"}
            <VariantB scanHref={data.scanHref} />
        {:else}
            <VariantC scanHref={data.scanHref} />
        {/if}

        <Toaster />
    </div>

    <!-- Mise en page bureau -->
    <div class="hidden lg:flex min-h-screen bg-muted/25">
        <!-- Barre latérale -->
        <aside class="w-64 bg-background border-r border-border-card flex flex-col">
            <div class="p-6 border-b border-border-card">
                <h1 class="text-xl font-bold text-foreground">Portail Staff</h1>
                <p class="text-sm text-muted-foreground mt-1">Germinal Events</p>
            </div>

            <nav class="flex-1 p-4 space-y-1">
                <a
                    href="/staff?liste"
                    class="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors {page.url.pathname === '/staff' || page.url.pathname.startsWith('/staff/events')
                        ? 'bg-foreground text-background hover:bg-foreground/85'
                        : 'text-foreground-alt hover:bg-surface-hover hover:text-foreground'}"
                >
                    <CalendarDays size={20} />
                    <span class="font-medium">Événements</span>
                </a>

                {#if data.scanHref}
                    <a
                        href={data.scanHref}
                        class="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors {page.url.searchParams.get('onglet') === 'scanner' && page.url.pathname.startsWith('/staff/events')
                            ? 'bg-foreground text-background hover:bg-foreground/85'
                            : 'text-foreground-alt hover:bg-surface-hover hover:text-foreground'}"
                    >
                        <ScanLine size={20} />
                        <span class="font-medium">Scanner</span>
                    </a>
                {/if}

                <a
                    href="/staff/taches"
                    class="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors {page.url.pathname === '/staff/taches'
                        ? 'bg-foreground text-background hover:bg-foreground/85'
                        : 'text-foreground-alt hover:bg-surface-hover hover:text-foreground'}"
                >
                    <ListChecks size={20} />
                    <span class="font-medium">Tâches</span>
                </a>

                <a
                    href="/staff/change-password"
                    class="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors {page.url.pathname === '/staff/change-password'
                        ? 'bg-foreground text-background hover:bg-foreground/85'
                        : 'text-foreground-alt hover:bg-surface-hover hover:text-foreground'}"
                >
                    <KeyRound size={20} />
                    <span class="font-medium">Mot de passe</span>
                </a>
            </nav>

            <!-- Utilisateur -->
            <div class="p-4 border-t border-border-card">
                <div class="flex items-center gap-3 mb-4">
                    <div
                        class="w-10 h-10 rounded-full flex items-center justify-center bg-muted border border-border-card"
                    >
                        <span class="text-sm font-semibold text-foreground-alt uppercase">
                            {data.user.email[0].toUpperCase()}
                        </span>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-foreground truncate">
                            {data.user.email}
                        </p>
                        <p class="text-xs text-muted-foreground">
                            {data.user.role === 'admin' ? 'Administration' : 'Staff'}
                        </p>
                    </div>
                </div>

                <form method="POST" action="/logout">
                    <button
                        type="submit"
                        class="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors"
                    >
                        <LogOut size={18} />
                        <span>Déconnexion</span>
                    </button>
                </form>
            </div>
        </aside>

        <!-- Contenu -->
        <main class="flex-1 bg-background min-w-0">
            {@render children()}
        </main>

        <Toaster />
    </div>
</div>
