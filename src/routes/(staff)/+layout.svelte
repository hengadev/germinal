<script lang="ts">
    import { page } from "$app/state";
    import { browser } from "$app/environment";
    import Toaster from "$lib/components/toast/Toaster.svelte";
    import { setToastContext } from "$lib/components/toast/state.svelte";
    import ThemeToggle from "$lib/components/admin/ThemeToggle.svelte";
    import { adminDarkMode } from "$lib/stores/adminDarkMode.svelte";
    import { CalendarDays, KeyRound, LogOut } from "lucide-svelte";
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

    function tabClass(active: boolean): string {
        return active
            ? "flex-1 flex flex-col items-center justify-center gap-1 pt-3 pb-6 text-foreground"
            : "flex-1 flex flex-col items-center justify-center gap-1 pt-3 pb-6 text-muted-foreground hover:text-foreground-alt";
    }
</script>

<div class="back-office contents">
    <!-- Mise en page mobile -->
    <div class="lg:hidden h-screen h-[100dvh] flex flex-col overflow-hidden bg-muted/25">
        <!-- En-tête mobile -->
        <header class="flex-shrink-0 bg-background border-b border-border-card z-40">
            <div class="flex items-center justify-between px-4 py-3">
                <h1 class="text-lg font-semibold text-foreground">Portail Staff</h1>
                <ThemeToggle />
            </div>
        </header>

        <!-- Contenu, défilable -->
        <main class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
            {@render children()}
        </main>

        <!-- Barre d'onglets en bas -->
        <nav
            class="flex-shrink-0 bg-background border-t border-border-card z-50 pb-[env(safe-area-inset-bottom)]"
            aria-label="Navigation mobile"
        >
            <div class="flex items-stretch">
                <a href="/staff" class={tabClass(page.url.pathname === '/staff' || page.url.pathname.startsWith('/staff/events'))}>
                    <CalendarDays size={20} />
                    <span class="text-[10px] font-medium">Événements</span>
                </a>
                <a href="/staff/change-password" class={tabClass(page.url.pathname === '/staff/change-password')}>
                    <KeyRound size={20} />
                    <span class="text-[10px] font-medium">Compte</span>
                </a>
            </div>
        </nav>

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
                    href="/staff"
                    class="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors {page.url.pathname === '/staff' || page.url.pathname.startsWith('/staff/events')
                        ? 'bg-foreground text-background hover:bg-foreground/85'
                        : 'text-foreground-alt hover:bg-surface-hover hover:text-foreground'}"
                >
                    <CalendarDays size={20} />
                    <span class="font-medium">Événements</span>
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
