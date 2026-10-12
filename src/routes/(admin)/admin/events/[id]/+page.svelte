<script lang="ts">
    import { enhance } from "$app/forms";
    import { ArrowLeft, Calendar, MapPin, Type, FileText } from "lucide-svelte";
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

    import Overview from "./Overview.svelte";
    import Seatings from "./Seatings.svelte";
    import Reservations from "./Reservations.svelte";
    import Photos from "./Photos.svelte";
    import PromoCodes from "./PromoCodes.svelte";
    import Team from "./Team.svelte";
    import Tasks from "./Tasks.svelte";

    interface Trigger {
        value: string;
        name: string;
    }

    let triggers: Trigger[] = [
        { value: "overview", name: "Vue d'ensemble" },
        { value: "photos", name: "Photos" },
        { value: "sessions", name: "Séances" },
        { value: "team", name: "Team" },
        { value: "tasks", name: "Tasks" },
        { value: "reservations", name: "Réservations" },
        { value: "promotions", name: "Promotions" },
    ];
</script>

<svelte:head>
    <title>{data.event.titleEn} | Admin</title>
</svelte:head>

<Tabs value="overview" class="container mx-auto px-4 py-8 lg:py-12">
    <div class="flex items-start gap-3 mb-8">
        <a
            href="/admin/events"
            aria-label="Retour aux événements"
            title="Retour aux événements"
            class="shrink-0 inline-flex items-center justify-center size-9 lg:size-10 -ml-2 rounded-md text-foreground-alt hover:text-foreground hover:bg-muted transition-colors"
        >
            <ArrowLeft size={20} />
        </a>
        <div>
            <h1 class="text-3xl lg:text-4xl font-bold mb-2">{data.event.titleEn}</h1>
            <p class="text-muted-foreground">Gérer cet événement</p>
        </div>
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

    <div class="overflow-x-auto w-full">
    <TabsList
        class="inline-flex items-center w-fit bg-transparent gap-2 md:gap-1 text-sm font-semibold border-b-1 border-border-card md:p-1 md:leading-[0.01em]"
    >
        {#each triggers as trigger}
            <TabsTrigger
                value={trigger.value}
                class="px-2 py-1.75 md:px-4 md:py-2 md:h-8 rounded-none bg-transparent border-b-3 data-[state=active]:shadow-none mb-[-2px] data-[state=active]:border-b-foreground data-[state=active]:text-foreground data-[state=inactive]:border-transparent data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-transparent data-[state=inactive]:hover:text-foreground-alt transition-colors cursor-pointer whitespace-nowrap"
            >
                {trigger.name}
            </TabsTrigger>
        {/each}
    </TabsList>
    </div>

    <!-- Tab content area -->
    <div class="flex-1 overflow-y-auto">
        <TabsContent value="overview" class="h-full p-6">
            <Overview {data} {form} />
        </TabsContent>
        <TabsContent value="photos" class="h-full p-6">
            <Photos {data} {form} />
        </TabsContent>
        <TabsContent value="sessions" class="h-full p-6">
            <Seatings {data} />
        </TabsContent>
        <TabsContent value="team" class="h-full p-6">
            <Team {data} {form} />
        </TabsContent>
        <TabsContent value="tasks" class="h-full p-6">
            <Tasks {data} {form} />
        </TabsContent>
        <TabsContent value="reservations" class="h-full p-6">
            <Reservations {data} />
        </TabsContent>
        <TabsContent value="promotions" class="h-full p-6">
            <PromoCodes {data} {form} />
        </TabsContent>
    </div>
</Tabs>
