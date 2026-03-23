<script lang="ts">
    import { page } from "$app/state";
    import { slide } from "svelte/transition";
    import { browser } from "$app/environment";
    import AdminSidebar from "./AdminSidebar.svelte";
    import Toaster from "$lib/components/toast/Toaster.svelte";
    import { setToastContext } from "$lib/components/toast/state.svelte";
    import Drawer from "$lib/components/ui/Drawer.svelte";
    import { adminDarkMode } from "$lib/stores/adminDarkMode.svelte";
    import ThemeToggle from "$lib/components/admin/ThemeToggle.svelte";
    import type { LayoutData } from "./$types";

    let {
        data,
        children,
    }: { data: LayoutData; children: import("svelte").Snippet } = $props();

    // Set up toast context for all admin pages
    setToastContext();

    // Mobile menu drawer state
    let mobileMenuOpen = $state(false);

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

<!-- Mobile Layout -->
<div class="lg:hidden h-screen h-[100dvh] flex flex-col overflow-hidden bg-dark-50/25">
    <!-- Mobile Header - fixed at top -->
    <header class="flex-shrink-0 bg-white dark:bg-dark-900 border-b border-border-card z-40">
        <div class="flex items-center justify-between px-4 py-3">
            <div class="flex items-center gap-3">
                <h1 class="text-lg font-semibold text-dark-900 dark:text-dark-50">Admin</h1>
            </div>
            <div class="flex items-center gap-2">
                <ThemeToggle />
                <button
                    onclick={() => (mobileMenuOpen = true)}
                    class="p-2 text-dark-600 hover:text-dark-900 dark:text-dark-400 dark:hover:text-dark-100 rounded-lg hover:bg-dark-50 dark:hover:bg-dark-800 transition-colors"
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
    <main class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        {@render children()}
    </main>

    <!-- Mobile Bottom Navigation - fixed at bottom -->
    <nav
        class="flex-shrink-0 bg-white dark:bg-dark-900 border-t border-border-card z-50"
        aria-label="Mobile navigation"
    >
        <div class="flex items-stretch">
            {#if ["/", "/admin"].includes(page.url.pathname)}
                <a
                    href="/admin"
                    class="flex-1 flex flex-col items-center justify-center gap-1 py-2 text-dark-900 dark:text-dark-50"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <rect width="7" height="9" x="3" y="3" rx="1" />
                        <rect width="7" height="5" x="14" y="3" rx="1" />
                        <rect width="7" height="9" x="14" y="12" rx="1" />
                        <rect width="7" height="5" x="3" y="16" rx="1" />
                    </svg>
                    <span class="text-[10px] font-medium">Tableau de bord</span>
                </a>
            {:else}
                <a
                    href="/admin"
                    class="flex-1 flex flex-col items-center justify-center gap-1 py-2 text-dark-500 hover:text-dark-700 dark:text-dark-400 dark:hover:text-dark-200"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <rect width="7" height="9" x="3" y="3" rx="1" />
                        <rect width="7" height="5" x="14" y="3" rx="1" />
                        <rect width="7" height="9" x="14" y="12" rx="1" />
                        <rect width="7" height="5" x="3" y="16" rx="1" />
                    </svg>
                    <span class="text-[10px] font-medium">Tableau de bord</span>
                </a>
            {/if}

            {#if page.url.pathname.startsWith("/admin/events")}
                <a
                    href="/admin/events"
                    class="flex-1 flex flex-col items-center justify-center gap-1 py-2 text-dark-900 dark:text-dark-50"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"
                        ></rect>
                        <line x1="16" x2="16" y1="2" y2="6"></line>
                        <line x1="8" x2="8" y1="2" y2="6"></line>
                        <line x1="3" x2="21" y1="10" y2="10"></line>
                    </svg>
                    <span class="text-[10px] font-medium">Événements</span>
                </a>
            {:else}
                <a
                    href="/admin/events"
                    class="flex-1 flex flex-col items-center justify-center gap-1 py-2 text-dark-500 hover:text-dark-700 dark:text-dark-400 dark:hover:text-dark-200"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"
                        ></rect>
                        <line x1="16" x2="16" y1="2" y2="6"></line>
                        <line x1="8" x2="8" y1="2" y2="6"></line>
                        <line x1="3" x2="21" y1="10" y2="10"></line>
                    </svg>
                    <span class="text-[10px] font-medium">Événements</span>
                </a>
            {/if}

            {#if page.url.pathname.startsWith("/admin/talents")}
                <a
                    href="/admin/talents"
                    class="flex-1 flex flex-col items-center justify-center gap-1 py-2 text-dark-900 dark:text-dark-50"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
                        ></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                    <span class="text-[10px] font-medium">Talents</span>
                </a>
            {:else}
                <a
                    href="/admin/talents"
                    class="flex-1 flex flex-col items-center justify-center gap-1 py-2 text-dark-500 hover:text-dark-700 dark:text-dark-400 dark:hover:text-dark-200"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
                        ></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                    <span class="text-[10px] font-medium">Talents</span>
                </a>
            {/if}

            {#if page.url.pathname.startsWith("/admin/reservations")}
                <a
                    href="/admin/reservations"
                    class="flex-1 flex flex-col items-center justify-center gap-1 py-2 text-dark-900 dark:text-dark-50"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <path d="M3 7v2a3 3 0 0 0 3 3 3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3"
                        />
                        <path d="M21 17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5a2.5 2.5 0 0 1 2.8-2.3L21 17Z"
                        />
                        <path d="M21 7v13" />
                    </svg>
                    <span class="text-[10px] font-medium">Réservations</span>
                </a>
            {:else}
                <a
                    href="/admin/reservations"
                    class="flex-1 flex flex-col items-center justify-center gap-1 py-2 text-dark-500 hover:text-dark-700 dark:text-dark-400 dark:hover:text-dark-200"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <path d="M3 7v2a3 3 0 0 0 3 3 3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3"
                        />
                        <path d="M21 17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5a2.5 2.5 0 0 1 2.8-2.3L21 17Z"
                        />
                        <path d="M21 7v13" />
                    </svg>
                    <span class="text-[10px] font-medium">Réservations</span>
                </a>
            {/if}

            {#if page.url.pathname.startsWith("/admin/analytics")}
                <a
                    href="/admin/analytics"
                    class="flex-1 flex flex-col items-center justify-center gap-1 py-2 text-dark-900 dark:text-dark-50"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <path d="M3 3v16a2 2 0 0 0 2 2h16" />
                        <path d="M7 16h8" />
                        <path d="M7 11h12" />
                        <path d="M7 6h3" />
                    </svg>
                    <span class="text-[10px] font-medium">Analytiques</span>
                </a>
            {:else}
                <a
                    href="/admin/analytics"
                    class="flex-1 flex flex-col items-center justify-center gap-1 py-2 text-dark-500 hover:text-dark-700 dark:text-dark-400 dark:hover:text-dark-200"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <path d="M3 3v16a2 2 0 0 0 2 2h16" />
                        <path d="M7 16h8" />
                        <path d="M7 11h12" />
                        <path d="M7 6h3" />
                    </svg>
                    <span class="text-[10px] font-medium">Analytiques</span>
                </a>
            {/if}

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
<div class="hidden lg:flex min-h-screen bg-dark-50/25 dark:bg-dark-900/50">
    <!-- Desktop Sidebar -->
    <AdminSidebar {data} />

    <!-- Main Content Area -->
    <main class="flex-1 bg-white dark:bg-dark-900">
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
                class="w-12 h-12 rounded-full flex items-center justify-center bg-dark-100 border border-border-card"
            >
                <span class="text-sm font-semibold text-dark-700 uppercase">
                    {data.user.email[0].toUpperCase()}
                </span>
            </div>
            <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-dark-900 truncate">
                    {data.user.email}
                </p>
                <p class="text-xs text-dark-400 capitalize">
                    {data.user.role}
                </p>
            </div>
        </div>

        <!-- Menu Items -->
        <!-- Theme Toggle -->
        <div class="px-4">
            <ThemeToggle />
        </div>

        <a
            href="/admin/change-password"
            onclick={() => (mobileMenuOpen = false)}
            class="flex items-center gap-3 px-4 py-3 text-dark-600 hover:text-dark-900 hover:bg-dark-50 rounded-lg transition-colors"
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
            >
                <path
                    d="M2 18a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-2Z"
                ></path>
                <circle cx="12" cy="11" r="3"></circle>
            </svg>
            <span class="text-sm font-medium">Changer le mot de passe</span>
        </a>

        <form method="POST" action="/logout">
            <button
                type="submit"
                class="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition-colors"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
                    ></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" x2="9" y1="12" y2="12"></line>
                </svg>
                <span class="text-sm font-medium">Déconnexion</span>
            </button>
        </form>
    </div>
</Drawer>

<style>
    :global(.safe-area-inset-bottom) {
        padding-bottom: env(safe-area-inset-bottom);
    }
</style>
