<script lang="ts">
    import { page } from "$app/state";
    import { browser } from "$app/environment";
    import Toaster from "$lib/components/toast/Toaster.svelte";
    import { setToastContext } from "$lib/components/toast/state.svelte";
    import ThemeToggle from "$lib/components/admin/ThemeToggle.svelte";
    import { adminDarkMode } from "$lib/stores/adminDarkMode.svelte";
    import type { LayoutData } from "./$types";

    let {
        data,
        children,
    }: { data: LayoutData; children: import("svelte").Snippet } = $props();

    // Set up toast context for all staff pages
    setToastContext();

    // Mobile menu drawer state
    let mobileMenuOpen = $state(false);

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

<!-- Mobile Layout -->
<div class="lg:hidden h-screen h-[100dvh] flex flex-col overflow-hidden bg-muted/25">
    <!-- Mobile Header - fixed at top -->
    <header class="flex-shrink-0 bg-background border-b border-border-card z-40">
        <div class="flex items-center justify-between px-4 py-3">
            <div class="flex items-center gap-3">
                <h1 class="text-lg font-semibold text-foreground">Staff</h1>
            </div>
            <div class="flex items-center gap-2">
                <ThemeToggle />
                <button
                    onclick={() => (mobileMenuOpen = true)}
                    class="p-2 text-foreground-alt hover:text-foreground rounded-lg hover:bg-muted transition-colors"
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
        class="flex-shrink-0 bg-background border-t border-border-card z-50 pb-[env(safe-area-inset-bottom)]"
        aria-label="Mobile navigation"
    >
        <div class="flex items-stretch">
            {#if page.url.pathname === "/staff"}
                <a
                    href="/staff"
                    class="flex-1 flex flex-col items-center justify-center gap-1 py-2 text-foreground"
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
                    <span class="text-[10px] font-medium">Dashboard</span>
                </a>
            {:else}
                <a
                    href="/staff"
                    class="flex-1 flex flex-col items-center justify-center gap-1 py-2 text-muted-foreground hover:text-foreground-alt"
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
                    <span class="text-[10px] font-medium">Dashboard</span>
                </a>
            {/if}

            {#if page.url.pathname.startsWith("/staff/events")}
                <a
                    href="/staff/events"
                    class="flex-1 flex flex-col items-center justify-center gap-1 py-2 text-foreground"
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
                    <span class="text-[10px] font-medium">Events</span>
                </a>
            {:else}
                <a
                    href="/staff/events"
                    class="flex-1 flex flex-col items-center justify-center gap-1 py-2 text-muted-foreground hover:text-foreground-alt"
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
                    <span class="text-[10px] font-medium">Events</span>
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
<div class="hidden lg:flex min-h-screen bg-muted/25">
    <!-- Desktop Sidebar -->
    <aside class="w-64 bg-background border-r border-border-card flex flex-col">
        <!-- Logo/Header -->
        <div class="p-6 border-b border-border-card">
            <h1 class="text-xl font-bold text-foreground">Staff Portal</h1>
            <p class="text-sm text-muted-foreground mt-1">Germinal Events</p>
        </div>

        <!-- Navigation -->
        <nav class="flex-1 p-4 space-y-1">
            <a
                href="/staff"
                class="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors {page.url.pathname === '/staff'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
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
                <span class="font-medium">Dashboard</span>
            </a>

            <a
                href="/staff/events"
                class="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors {page.url.pathname.startsWith('/staff/events')
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
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
                <span class="font-medium">My Events</span>
            </a>
        </nav>

        <!-- User Section -->
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
                    <p class="text-xs text-muted-foreground capitalize">
                        {data.user.role}
                    </p>
                </div>
            </div>

            <div class="space-y-1">
                <a
                    href="/staff/change-password"
                    class="flex items-center gap-3 px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
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
                    <span>Change Password</span>
                </a>

                <form method="POST" action="/logout">
                    <button
                        type="submit"
                        class="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition-colors"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="18"
                            height="18"
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
                        <span>Logout</span>
                    </button>
                </form>
            </div>
        </div>
    </aside>

    <!-- Main Content Area -->
    <main class="flex-1 bg-background">
        {@render children()}
    </main>

    <!-- Toast notifications -->
    <Toaster />
</div>

<style>
    :global(.safe-area-inset-bottom) {
        padding-bottom: env(safe-area-inset-bottom);
    }
</style>
