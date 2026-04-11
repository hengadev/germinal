<script lang="ts">
    import { onMount } from 'svelte';
    import {
        Calendar,
        CheckCircle2,
        Clock,
        Circle,
        Loader2,
        AlertCircle,
    } from "lucide-svelte";
    import type { PageData } from "./$types";
    import { getToastContext } from "$lib/components/toast/state.svelte";

    let { data }: { data: PageData } = $props();

    const toast = getToastContext();

    // Expand event details to get full event information
    let eventsWithDetails = $state<any[]>([]);
    let loading = $state(false);

    async function loadEventDetails() {
        loading = true;
        try {
            // Fetch full event details for each assigned event
            const eventPromises = data.events.map(async (assignment: any) => {
                const response = await fetch(`/api/admin/events/${assignment.eventId}`);
                if (response.ok) {
                    const eventData = await response.json();
                    return {
						...assignment,
						event: eventData.event || eventData,
					};
                }
                return assignment;
            });

            eventsWithDetails = await Promise.all(eventPromises);
        } catch (error) {
            console.error('Failed to load event details:', error);
        } finally {
            loading = false;
        }
    }

    onMount(() => {
        loadEventDetails();
    });

    async function updateTaskStatus(taskId: string, newStatus: 'pending' | 'in_progress' | 'done') {
        try {
            const response = await fetch(`/api/staff/tasks/${taskId}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ status: newStatus }),
            });

            if (!response.ok) {
                throw new Error('Failed to update task');
            }

            // Reload page to get updated data
            window.location.reload();
        } catch (error) {
            console.error('Failed to update task:', error);
            toast.error('Error', 'Failed to update task status');
        }
    }

    function getStatusBadge(status: string) {
        switch (status) {
            case 'done':
                return { class: 'bg-green-100 text-green-800', icon: CheckCircle2, label: 'Done' };
            case 'in_progress':
                return { class: 'bg-blue-100 text-blue-800', icon: Clock, label: 'In Progress' };
            case 'pending':
                return { class: 'bg-gray-100 text-gray-800', icon: Circle, label: 'Pending' };
            default:
                return { class: 'bg-gray-100 text-gray-800', icon: AlertCircle, label: status };
        }
    }

    function getPriorityBadge(priority: string) {
        switch (priority) {
            case 'high':
                return 'bg-red-100 text-red-800';
            case 'medium':
                return 'bg-yellow-100 text-yellow-800';
            case 'low':
                return 'bg-green-100 text-green-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    }

    function formatDate(date: Date | string): string {
        return new Date(date).toLocaleDateString("en-US", {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    }

    function formatDateTime(date: Date | string): string {
        return new Date(date).toLocaleString("en-US", {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
</script>

<svelte:head>
    <title>Staff Dashboard</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 lg:py-12">
    <!-- Header -->
    <div class="mb-8">
        <h1 class="text-3xl lg:text-4xl font-bold mb-2">Welcome back, {data.user.email.split('@')[0]}!</h1>
        <p class="text-muted-foreground">Here's what's happening with your events and tasks.</p>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div class="bg-background border border-border-card rounded-lg p-6">
            <div class="flex items-center justify-between">
                <div>
                    <p class="text-sm text-muted-foreground mb-1">Assigned Events</p>
                    <p class="text-2xl font-bold text-foreground">{data.summary.totalEvents}</p>
                </div>
                <Calendar class="text-muted-foreground" size={24} />
            </div>
        </div>

        <div class="bg-background border border-border-card rounded-lg p-6">
            <div class="flex items-center justify-between">
                <div>
                    <p class="text-sm text-muted-foreground mb-1">Open Tasks</p>
                    <p class="text-2xl font-bold text-orange-600">{data.summary.openTasks}</p>
                </div>
                <Clock class="text-orange-600" size={24} />
            </div>
        </div>

        <div class="bg-background border border-border-card rounded-lg p-6">
            <div class="flex items-center justify-between">
                <div>
                    <p class="text-sm text-muted-foreground mb-1">Completed</p>
                    <p class="text-2xl font-bold text-green-600">{data.summary.completedTasks}</p>
                </div>
                <CheckCircle2 class="text-green-600" size={24} />
            </div>
        </div>

        <div class="bg-background border border-border-card rounded-lg p-6">
            <div class="flex items-center justify-between">
                <div>
                    <p class="text-sm text-muted-foreground mb-1">This Month</p>
                    <p class="text-2xl font-bold text-blue-600">{data.summary.upcomingEvents}</p>
                </div>
                <Calendar class="text-blue-600" size={24} />
            </div>
        </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <!-- My Events -->
        <div class="bg-background border border-border-card rounded-lg">
            <div class="p-6 border-b border-border-card">
                <h2 class="text-lg font-semibold text-foreground">My Events</h2>
                <p class="text-sm text-muted-foreground">Events you're assigned to</p>
            </div>

            {#if loading}
                <div class="p-8 text-center">
                    <Loader2 size={32} class="animate-spin mx-auto text-muted-foreground" />
                    <p class="text-muted-foreground mt-4">Loading events...</p>
                </div>
            {:else if eventsWithDetails.length === 0}
                <div class="p-8 text-center">
                    <p class="text-muted-foreground">
                        You're not assigned to any events yet.
                    </p>
                </div>
            {:else}
                <div class="divide-y divide-border-card">
                    {#each eventsWithDetails as assignment (assignment.id)}
                        {@const statusBadge = getStatusBadge(assignment.event.status || 'published')}
                        <div class="p-6 hover:bg-muted/50 transition-colors">
                            <div class="flex items-start justify-between gap-4">
                                <div class="flex-1 min-w-0">
                                    <div class="flex items-center gap-2 mb-2">
                                        <h3 class="text-base font-semibold text-foreground truncate">
                                            {assignment.event.titleEn || assignment.event.title}
                                        </h3>
                                        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium {statusBadge.class}">
                                            {assignment.event.published ? 'Published' : 'Draft'}
                                        </span>
                                    </div>
                                    <p class="text-sm text-muted-foreground mb-2">
                                        {assignment.event.locationEn || assignment.event.location}
                                    </p>
                                    {#if assignment.roleLabel}
                                        <p class="text-sm text-muted-foreground">
                                            <span class="font-medium">Role:</span> {assignment.roleLabel}
                                        </p>
                                    {/if}
                                </div>
                                <div class="text-right">
                                    <a
                                        href="/admin/events/{assignment.eventId}"
                                            target="_blank"
                                        class="text-sm text-primary hover:underline"
                                    >
                                        View Details
                                    </a>
                                </div>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>

        <!-- My Tasks -->
        <div class="bg-background border border-border-card rounded-lg">
            <div class="p-6 border-b border-border-card">
                <h2 class="text-lg font-semibold text-foreground">My Tasks</h2>
                <p class="text-sm text-muted-foreground">
                    {data.tasksByStatus.pending.length + data.tasksByStatus.inProgress.length} open,
                    {data.tasksByStatus.done.length} completed
                </p>
            </div>

            {#if data.tasks.length === 0}
                <div class="p-8 text-center">
                    <p class="text-muted-foreground">
                        You don't have any assigned tasks yet.
                    </p>
                </div>
            {:else}
                <div class="divide-y divide-border-card max-h-[600px] overflow-y-auto">
                    {#each data.tasks as task (task.id)}
                        {@const statusBadge = getStatusBadge(task.status)}
                        <div class="p-6 hover:bg-muted/50 transition-colors">
                            <div class="flex items-start justify-between gap-4">
                                <div class="flex-1 min-w-0">
                                    <div class="flex items-center gap-2 mb-1">
                                        <h4 class="text-base font-semibold text-foreground">{task.title}</h4>
                                        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium {getPriorityBadge(task.priority)}">
                                            {task.priority}
                                        </span>
                                    </div>
                                    <p class="text-sm text-muted-foreground mb-2">
                                        {task.event?.titleEn || 'Event'}
                                    </p>
                                    {#if task.description}
                                        <p class="text-sm text-muted-foreground mb-2 line-clamp-2">{task.description}</p>
                                    {/if}
                                    <div class="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                                        <span class="flex items-center gap-1">
                                            <svelte:component this={statusBadge.icon} size={14} />
                                            {statusBadge.label}
                                        </span>
                                        {#if task.dueDate}
                                            <span>• {formatDateTime(task.dueDate)}</span>
                                        {/if}
                                    </div>
                                </div>
                                <div class="flex items-center gap-2">
                                    <select
                                        value={task.status}
                                        onchange={(e) => updateTaskStatus(task.id, e.target.value)}
                                        class="px-2 py-1 text-sm border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                                    >
                                        <option value="pending">Pending</option>
                                        <option value="in_progress">In Progress</option>
                                        <option value="done">Done</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    </div>

    <!-- Tasks Grouped by Event -->
    {#if Object.keys(data.tasksByEvent).length > 0}
        <div class="mt-8">
            <h2 class="text-lg font-semibold text-foreground mb-4">Tasks by Event</h2>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {#each Object.entries(data.tasksByEvent) as [eventId, tasks] (eventId)}
                    <div class="bg-background border border-border-card rounded-lg">
                        <div class="p-4 border-b border-border-card">
                            <h3 class="font-semibold text-foreground">{tasks[0]?.event?.titleEn || 'Event'}</h3>
                            <p class="text-sm text-muted-foreground">
                                {tasks.filter(t => t.status === 'pending').length} pending,
                                {tasks.filter(t => t.status === 'in_progress').length} in progress,
                                {tasks.filter(t => t.status === 'done').length} done
                            </p>
                        </div>
                        <div class="p-4 space-y-2 max-h-[300px] overflow-y-auto">
                            {#each tasks as task (task.id)}
                                {@const statusBadge = getStatusBadge(task.status)}
                                <div class="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                                    <div class="flex-1 min-w-0">
                                        <p class="text-sm font-medium text-foreground truncate">{task.title}</p>
                                        <p class="text-xs text-muted-foreground">
                                            <span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium {getPriorityBadge(task.priority)} mr-2">
                                                {task.priority}
                                            </span>
                                            <span class="flex items-center gap-1">
                                                <svelte:component this={statusBadge.icon} size={12} />
                                                {statusBadge.label}
                                            </span>
                                        </p>
                                    </div>
                                    <select
                                        value={task.status}
                                        onchange={(e) => updateTaskStatus(task.id, e.target.value)}
                                        class="px-2 py-1 text-xs border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                                    >
                                        <option value="pending">Pending</option>
                                        <option value="in_progress">In Progress</option>
                                        <option value="done">Done</option>
                                    </select>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/each}
            </div>
        </div>
    {/if}
</div>
