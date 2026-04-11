<script lang="ts">
    import { goto } from "$app/navigation";
    import {
        Plus,
        Edit,
        Trash2,
    } from "lucide-svelte";

    interface Props {
        form?: any;
    }

    let { form }: Props = $props();

    function openNewTalent() {
        goto('/admin/talents/new');
    }

    function openTalent(id: string) {
        goto(`/admin/talents/${id}`);
    }

    // This is a simplified version - in production, you would load the actual data
    // For now, it just provides a link to the existing talents page
</script>

<div class="flex items-center justify-between mb-6">
    <h2 class="text-2xl font-semibold">Talent Roster</h2>
    <button
        onclick={openNewTalent}
        class="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg hover:opacity-90 transition-colors"
    >
        <Plus size={18} />
        <span>New Talent</span>
    </button>
</div>

<div class="bg-background border border-border-card rounded-lg overflow-hidden">
    <div class="p-8 text-center">
        <p class="text-muted-foreground mb-4">
            Manage your talent roster here. This tab provides quick access to the full talent management system.
        </p>
        <div class="flex items-center justify-center gap-4">
            <button
                onclick={openNewTalent}
                class="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg hover:opacity-90 transition-colors"
            >
                <Plus size={18} />
                <span>Add New Talent</span>
            </button>
            <a
                href="/admin/talents"
                class="inline-flex items-center gap-2 px-4 py-2 border border-border-dark text-foreground rounded-lg hover:bg-muted transition-colors"
            >
                <Edit size={18} />
                <span>Manage All Talents</span>
            </a>
        </div>
    </div>
</div>
