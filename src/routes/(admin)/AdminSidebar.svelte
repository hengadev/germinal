<script lang="ts">
    import { page } from "$app/state";

    import { ExternalLink, KeyRound, LogOut, EllipsisVertical } from "lucide-svelte";
    import { ADMIN_NAV_GROUPS, isAdminNavActive } from "./admin-nav";
    import ThemeToggle from "$lib/components/admin/ThemeToggle.svelte";

    interface SidebarProps {
        data: {
            user: {
                id: string;
                email: string;
                role: string;
                createdAt: Date;
            };
            staffPortalUrl: string;
            moneyAlertsTotal: number;
            newDemandesCount: number;
        };
    }

    let { data }: SidebarProps = $props();

    // Sidebar collapse state
    let isCollapsed = $state(false);

    function toggleSidebar() {
        isCollapsed = !isCollapsed;
    }

    // User menu state
    let userMenuOpen = $state(false);

    function toggleUserMenu() {
        userMenuOpen = !userMenuOpen;
    }

    function closeUserMenu() {
        userMenuOpen = false;
    }

    const badgeOf = (key: "moneyAlertsTotal" | "newDemandesCount" | undefined): number =>
        key ? data[key] : 0;
</script>

<!-- Desktop Sidebar Navigation -->
<aside
    class="hidden lg:flex lg:flex-col lg:border-r lg:border-border-card bg-background sticky top-0 h-screen transition-all duration-300 {isCollapsed
 ? 'lg:w-20'
 : 'lg:w-64'}"
 aria-label="Sidebar navigation"
>
 <!-- Collapse Toggle Button -->
 <button
 onclick={toggleSidebar}
 class="absolute -right-4 bottom-24 z-10 w-8 h-8 rounded-full bg-background flex items-center justify-center text-foreground-alt hover:text-foreground hover:bg-muted transition-all duration-200 border border-border-card shadow-mini"
 aria-label={isCollapsed ? "Agrandir la barre latérale" : "Réduire la barre latérale"}
 title={isCollapsed ? "Agrandir la barre latérale" : "Réduire la barre latérale"}
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
 class="text-sm font-semibold tracking-tight text-foreground uppercase"
 >
 Germinal
 </h1>
 <p class="text-xs text-muted-foreground">Panneau d'Administration</p>
            </div>
            <ThemeToggle />
        {:else}
            <div class="mx-auto flex flex-col items-center gap-2">
                <span class="text-lg font-bold text-foreground">G</span>
                <ThemeToggle />
            </div>
        {/if}
    </div>

    <!-- Navigation Items -->
    <nav class="flex-1 overflow-y-auto py-6 {isCollapsed ? 'px-3' : 'px-4'}">
        {#each ADMIN_NAV_GROUPS as group, groupIndex (group.label)}
            {#if isCollapsed}
                {#if groupIndex > 0}
                    <div class="my-3 mx-3 border-t border-border-card" role="separator"></div>
                {/if}
            {:else}
                <p class="px-3 {groupIndex > 0 ? 'pt-4' : ''} pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</p>
            {/if}
            <ul class="space-y-0.5" aria-label={group.label}>
                {#each group.items as item (item.href)}
                    {@const active = isAdminNavActive(item.href, page.url.pathname)}
                    {@const badge = badgeOf(item.badge)}
                    <li>
                        <a
                            href={item.href}
                            class="relative flex items-center text-sm font-medium transition-all duration-200 rounded-lg {isCollapsed
                                ? 'justify-center px-3 py-3'
                                : 'gap-3 px-3 py-2'} {active
                                ? 'bg-foreground text-background hover:bg-foreground/85'
                                : 'text-foreground-alt hover:text-foreground hover:bg-surface-hover'}"
                            aria-current={active ? "page" : undefined}
                            title={isCollapsed ? item.label : undefined}
                        >
                            <item.icon size={20} strokeWidth={active ? 2 : 1.5} />
                            {#if !isCollapsed}
                                <span class="tracking-tight">{item.label}</span>
                                {#if badge > 0}
                                    <span
                                        class="ml-auto rounded-full bg-red-600 text-white text-xs font-semibold px-2 py-0.5 min-w-5 text-center"
                                    >{badge}</span>
                                {/if}
                            {:else if badge > 0}
                                <span
                                    class="absolute top-1.5 right-1.5 rounded-full bg-red-600 text-white text-[10px] font-semibold px-1 min-w-4 text-center leading-4"
                                    aria-label="{badge} à voir"
                                >{badge}</span>
                            {/if}
                        </a>
                    </li>
                {/each}
            </ul>
        {/each}
    </nav>

    <!-- Sidebar Footer: the same account menu, expanded or collapsed -->
    {#snippet accountMenu(placement: string)}
        <!-- Backdrop -->
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div class="fixed inset-0 z-10" onclick={closeUserMenu}></div>
        <div
            class="absolute z-20 bg-background border border-border-card rounded-lg shadow-popover py-1 overflow-hidden {placement}"
            role="menu"
        >
            {#if isCollapsed}
                <div class="px-3 py-2 border-b border-border-card mb-1">
                    <p class="text-sm font-medium text-foreground truncate tracking-tight">{data.user.email}</p>
                    <p class="text-xs text-muted-foreground capitalize">{data.user.role}</p>
                </div>
            {/if}
            <a
                href="https://germinalstudio.co"
                target="_blank"
                rel="noopener noreferrer"
                onclick={closeUserMenu}
                role="menuitem"
                class="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground-alt hover:text-foreground hover:bg-muted transition-colors"
            >
                <ExternalLink size={15} />
                <span>Voir le site</span>
            </a>
            <a
                href={data.staffPortalUrl}
                target="_blank"
                rel="noopener noreferrer"
                onclick={closeUserMenu}
                role="menuitem"
                class="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground-alt hover:text-foreground hover:bg-muted transition-colors"
            >
                <ExternalLink size={15} />
                <span>Portail Staff</span>
            </a>
            <a
                href="/admin/change-password"
                onclick={closeUserMenu}
                role="menuitem"
                class="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground-alt hover:text-foreground hover:bg-muted transition-colors"
            >
                <KeyRound size={15} />
                <span>Changer le mot de passe</span>
            </a>
            <div class="my-1 border-t border-border-card"></div>
            <form method="POST" action="/logout">
                <button
                    type="submit"
                    role="menuitem"
                    class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                >
                    <LogOut size={15} />
                    <span>Déconnexion</span>
                </button>
            </form>
        </div>
    {/snippet}

    <div
        class="py-5 border-t border-border-card {isCollapsed ? 'px-3' : 'px-6'}"
    >
        <div class="relative">
            {#if userMenuOpen}
                {@render accountMenu(isCollapsed
                    ? 'left-full bottom-0 ml-3 w-60'
                    : 'bottom-full left-0 right-0 mb-2')}
            {/if}
            {#if !isCollapsed}
                <div class="flex items-center gap-3">
                    <div
                        class="w-9 h-9 flex-shrink-0 rounded-full flex items-center justify-center bg-muted border border-border-card"
                    >
                        <span class="text-xs font-semibold text-foreground-alt uppercase">
                            {data.user.email[0].toUpperCase()}
                        </span>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-foreground truncate tracking-tight">
                            {data.user.email}
                        </p>
                        <p class="text-xs text-muted-foreground capitalize">
                            {data.user.role}
                        </p>
                    </div>
                    <button
                        onclick={toggleUserMenu}
                        class="flex-shrink-0 p-1.5 rounded-md text-foreground-alt hover:text-foreground hover:bg-muted transition-colors"
                        aria-label="Options utilisateur"
                        aria-haspopup="menu"
                        aria-expanded={userMenuOpen}
                        title="Options"
                    >
                        <EllipsisVertical size={16} />
                    </button>
                </div>
            {:else}
                <!-- Collapsed: the avatar opens the same menu, beside the sidebar. -->
                <button
                    onclick={toggleUserMenu}
                    class="mx-auto flex w-9 h-9 rounded-full items-center justify-center bg-muted border border-border-card hover:border-foreground-alt transition-colors"
                    aria-label="Options utilisateur"
                    aria-haspopup="menu"
                    aria-expanded={userMenuOpen}
                    title={data.user.email}
                >
                    <span class="text-xs font-semibold text-foreground-alt uppercase">
                        {data.user.email[0].toUpperCase()}
                    </span>
                </button>
            {/if}
        </div>
    </div>
</aside>
