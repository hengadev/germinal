<script lang="ts">
    import { page } from "$app/state";

    import { LayoutDashboard, Calendar, User, Ticket } from "lucide-svelte";

    interface SidebarProps {
        data: {
            user: {
                id: string;
                email: string;
                role: string;
                createdAt: Date;
            };
        };
    }

    let { data }: SidebarProps = $props();

    // Sidebar collapse state
    let isCollapsed = $state(false);

    function toggleSidebar() {
        isCollapsed = !isCollapsed;
    }

    interface NavItem {
        href: string;
        label: string;
        icon: typeof import("lucide-svelte").Icon;
    }

    const desktopNavigation: NavItem[] = [
        {
            href: "/admin",
            label: "Dashboard",
            icon: LayoutDashboard,
        },
        {
            href: "/admin/events",
            label: "Events",
            icon: Calendar,
        },
        {
            href: "/admin/reservations",
            label: "Reservations",
            icon: Ticket,
        },
        {
            href: "/admin/talents",
            label: "Talents",
            icon: User,
        },
    ];

    function isActive(href: string, currentPath: string): boolean {
        if (href === "/admin") {
            return currentPath === "/admin" || currentPath === "/admin/";
        }
        return currentPath.startsWith(href);
    }
</script>

<!-- Desktop Sidebar Navigation -->
<aside
    class="hidden lg:flex lg:flex-col lg:border-r lg:border-border-card bg-white sticky top-0 h-screen transition-all duration-300 {isCollapsed
        ? 'lg:w-20'
        : 'lg:w-64'}"
    aria-label="Sidebar navigation"
>
    <!-- Collapse Toggle Button -->
    <button
        onclick={toggleSidebar}
        class="absolute -right-4 bottom-24 z-10 w-8 h-8 rounded-full bg-white flex items-center justify-center text-dark-700 hover:text-dark-900 hover:bg-dark-50 transition-all duration-200 border border-border-card shadow-sm"
        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
    >
        {#if isCollapsed}
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
            >
                <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
        {:else}
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
            >
                <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
        {/if}
    </button>

    <!-- Sidebar Header -->
    <div
        class="flex items-center justify-between border-b border-border-card py-6 {isCollapsed
            ? 'px-3'
            : 'px-6'}"
    >
        {#if !isCollapsed}
            <div>
                <h1
                    class="text-sm font-semibold tracking-tight text-dark-900 uppercase"
                >
                    Germinal
                </h1>
                <p class="text-xs text-dark-400">Admin Panel</p>
            </div>
        {:else}
            <div class="mx-auto">
                <span class="text-lg font-bold text-dark-900">G</span>
            </div>
        {/if}
    </div>

    <!-- Navigation Items -->
    <nav class="flex-1 py-6 {isCollapsed ? 'px-3' : 'px-4'}">
        <ul class="space-y-1">
            {#each desktopNavigation as item (item.href)}
                {@const active = isActive(item.href, page.url.pathname)}
                <li>
                    <a
                        href={item.href}
                        class="flex items-center text-sm font-medium transition-all duration-200 rounded-lg {isCollapsed
                            ? 'justify-center px-3 py-3'
                            : 'gap-3 px-3 py-2.5'} {active
                            ? 'text-dark-900 bg-dark-50'
                            : 'text-dark-600 hover:text-dark-900 hover:bg-dark-50'}"
                        aria-current={active ? "page" : undefined}
                        title={isCollapsed ? item.label : undefined}
                    >
                        <item.icon size={20} strokeWidth={active ? 2 : 1.5} />
                        {#if !isCollapsed}
                            <span class="tracking-tight">{item.label}</span>
                        {/if}
                    </a>
                </li>
            {/each}
        </ul>
    </nav>

    <!-- Sidebar Footer -->
    <div
        class="py-5 border-t border-border-card {isCollapsed ? 'px-3' : 'px-6'}"
    >
        {#if !isCollapsed}
            <div class="flex items-center gap-3">
                <div
                    class="w-9 h-9 rounded-full flex items-center justify-center bg-dark-100 border border-border-card"
                >
                    <span class="text-xs font-semibold text-dark-700 uppercase">
                        {data.user.email[0].toUpperCase()}
                    </span>
                </div>
                <div class="flex-1 min-w-0">
                    <p
                        class="text-sm font-medium text-dark-900 truncate tracking-tight"
                    >
                        {data.user.email}
                    </p>
                    <p class="text-xs text-dark-400 capitalize">
                        {data.user.role}
                    </p>
                </div>
            </div>
            <div class="mt-3 flex gap-2">
                <a
                    href="/admin/change-password"
                    class="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-dark-600 hover:text-dark-900 hover:bg-dark-50 rounded-lg transition-colors"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
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
                    <span>Password</span>
                </a>
                <form method="POST" action="/logout" class="flex-1">
                    <button
                        type="submit"
                        class="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-dark-600 hover:text-dark-900 hover:bg-dark-50 rounded-lg transition-colors"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
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
        {:else}
            <div
                class="w-9 h-9 mx-auto rounded-full flex items-center justify-center bg-dark-100 border border-border-card"
                title={data.user.email}
            >
                <span class="text-xs font-semibold text-dark-700 uppercase">
                    {data.user.email[0].toUpperCase()}
                </span>
            </div>
        {/if}
    </div>
</aside>
