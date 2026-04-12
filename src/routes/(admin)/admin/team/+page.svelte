<script lang="ts">
    import { enhance } from "$app/forms";
    import type { ActionData, PageData } from "./$types";
    import Tabs from "$lib/components/ui/bits-components/Tabs.svelte";
    import TabsList from "$lib/components/ui/bits-components/TabsList.svelte";
    import TabsTrigger from "$lib/components/ui/bits-components/TabsTrigger.svelte";
    import TabsContent from "$lib/components/ui/bits-components/TabsContent.svelte";
    import { getToastContext } from "$lib/components/toast/state.svelte";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const toast = getToastContext();

    // Show toast on form changes
    $effect(() => {
        if (form?.success) {
            toast.success("Succès", form.success || "Modifications enregistrées");
        }
    });

    $effect(() => {
        if (form?.error) {
            toast.error("Erreur", form.error);
        }
    });

    import TalentsTab from "./TalentsTab.svelte";
    import StaffTab from "./StaffTab.svelte";

    interface Trigger {
        value: string;
        name: string;
    }

    let triggers: Trigger[] = [
        { value: "talents", name: "Talents" },
        { value: "staff", name: "Staff" },
    ];
</script>

<svelte:head>
    <title>Équipe | Admin</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 lg:py-12">
    <div class="mb-8">
        <h1 class="text-3xl lg:text-4xl font-bold mb-2">Équipe</h1>
        <p class="text-muted-foreground">Gérer les talents et les membres du staff</p>
    </div>

    {#if form?.error}
        <div
            class="mb-6 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg"
        >
            <p class="text-sm font-medium">{form.error}</p>
        </div>
    {/if}

    {#if form?.success}
        <div
            class="mb-6 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg"
        >
            <p class="text-sm font-medium">{form.success}</p>
        </div>
    {/if}

    <Tabs value="talents" class="space-y-4">
        <TabsList
            class="inline-flex items-center w-fit bg-transparent gap-2 md:gap-1 text-sm font-semibold border-b-1 border-border-card md:p-1 md:leading-[0.01em]"
        >
            {#each triggers as trigger}
                <TabsTrigger
                    value={trigger.value}
                    class="px-2 py-1.75 md:px-4 md:py-2 md:h-8 rounded-none bg-transparent border-b-3 data-[state=active]:shadow-none mb-[-2px] data-[state=active]:border-b-dark-900 data-[state=active]:text-foreground data-[state=inactive]:border-transparent data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-transparent data-[state=inactive]:hover:text-foreground-alt transition-colors cursor-pointer"
                >
                    {trigger.name}
                </TabsTrigger>
            {/each}
        </TabsList>

        <TabsContent value="talents" class="p-6">
            <TalentsTab talents={data.talents} categories={data.categories} {form} />
        </TabsContent>
        <TabsContent value="staff" class="p-6">
            <StaffTab {form} />
        </TabsContent>
    </Tabs>
</div>
