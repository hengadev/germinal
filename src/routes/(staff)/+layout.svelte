<script lang="ts">
    import { page } from "$app/state";
    import { browser } from "$app/environment";
    import Toaster from "$lib/components/toast/Toaster.svelte";
    import { setToastContext } from "$lib/components/toast/state.svelte";
    import { adminDarkMode } from "$lib/stores/adminDarkMode.svelte";
    import { CalendarDays, KeyRound, ListChecks, LogOut, ScanLine } from "lucide-svelte";
    import BottomBar from "$lib/components/staff/nav/BottomBar.svelte";
    import HeaderActions from "$lib/components/staff/nav/HeaderActions.svelte";
    import EventPicker from "$lib/components/staff/nav/EventPicker.svelte";
    import ScanOverlay from "$lib/components/staff/scanner/ScanOverlay.svelte";
    import StaffInstallBanner from "$lib/components/staff/install/StaffInstallBanner.svelte";
    import IOSInstallSheet from "$lib/components/staff/install/IOSInstallSheet.svelte";
    import { openScanOverlay } from "$lib/components/staff/scanner/scan-overlay.svelte";
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
</script>

<div class="back-office contents">
    <!-- Mise en page mobile -->
    <div class="lg:hidden h-screen h-[100dvh] flex flex-col overflow-hidden bg-muted/25">
        <!-- En-tête mobile -->
        <header class="flex-shrink-0 bg-background border-b border-border-card z-40">
            <div class="flex items-center justify-between gap-3 px-4 py-1.5">
                <h1 class="text-lg font-semibold text-foreground">Portail Staff</h1>
                <HeaderActions targets={data.headerActions} />
            </div>
        </header>

        <!-- L'offre d'installation (issue 062), sous l'en-tête. -->
        {#if data.user}<StaffInstallBanner />{/if}

        <!-- Contenu, défilable -->
        <main class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
            {@render children()}
        </main>

        <!-- Barre d'onglets en bas, avec le bouton Scanner flottant -->
        <BottomBar scanTargets={data.scanTargets} />

        <Toaster />
    </div>

    <!-- Mise en page bureau -->
    <div class="hidden lg:flex min-h-screen bg-muted/25">
        <!-- Barre latérale -->
        <aside class="w-64 bg-background border-r border-border-card flex flex-col">
            <div class="flex items-start justify-between gap-2 p-6 pr-4 border-b border-border-card">
                <div class="min-w-0">
                    <h1 class="text-xl font-bold text-foreground">Portail Staff</h1>
                    <p class="text-sm text-muted-foreground mt-1">Germinal Events</p>
                </div>
                <HeaderActions targets={data.headerActions} />
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

                {#if data.scanTargets.length > 0}
                    <button
                        type="button"
                        onclick={() => openScanOverlay(data.scanTargets)}
                        class="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-foreground-alt hover:bg-surface-hover hover:text-foreground"
                    >
                        <ScanLine size={20} />
                        <span class="font-medium">Scanner</span>
                    </button>
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
            {#if data.user}<StaffInstallBanner />{/if}
            {@render children()}
        </main>

        <Toaster />
    </div>
</div>

<!-- Le scanner en plein écran (issue 034), rendu une seule fois, au-dessus
     des deux mises en page mobile et bureau. -->
<ScanOverlay targets={data.scanTargets} />

<!-- « Pour quel événement ? », des raccourcis de l'en-tête, rendu une seule fois. -->
<EventPicker />

<!-- La feuille iOS de l'offre d'installation (issue 062), rendue une seule fois. -->
{#if data.user}
    <IOSInstallSheet />
{/if}
