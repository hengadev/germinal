<script lang="ts">
    import { onMount } from 'svelte';
    import { enhance } from "$app/forms";
    import {
        Plus,
        Trash2,
        Loader2,
        CheckCircle2,
        X,
        Circle,
        Clock,
        AlertCircle,
    } from "lucide-svelte";
    import type { PageData, ActionData } from "../+page.server";
    import { getToastContext } from "$lib/components/toast/state.svelte";

    interface Props {
        data: PageData;
        form?: ActionData;
    }

    let { data, form }: Props = $props();

    const toast = getToastContext();

    interface Task {
        id: string;
        eventId: string;
        assignedTo: string | null;
        createdBy: string;
        title: string;
        description: string | null;
        dueDate: Date | null;
        status: 'pending' | 'in_progress' | 'done';
        priority: 'low' | 'medium' | 'high';
        createdAt: Date;
        updatedAt: Date;
        assignedToUser: {
            id: string;
            email: string;
            role: string;
        } | null;
    }

    interface TaskSummary {
        total: number;
        pending: number;
        inProgress: number;
        done: number;
    }

    let tasks = $state<Task[]>([]);
    let taskSummary = $state<TaskSummary>({ total: 0, pending: 0, inProgress: 0, done: 0 });
    let eventStaff = $state<EventStaff[]>([]);
    let loading = $state(true);
    let showCreateForm = $state(false);
    let processing = $state(false);

    // Create form state
    let taskTitle = $state('');
    let taskDescription = $state('');
    let taskAssignedTo = $state('');
    let taskDueDate = $state('');
    let taskPriority = $state<'low' | 'medium' | 'high'>('medium');

    interface EventStaff {
        id: string;
        userId: string;
        roleLabel: string | null;
        createdAt: Date;
        user: {
            id: string;
            email: string;
            role: string;
        };
    }

    async function loadData() {
        loading = true;
        try {
            // Load tasks for this event
            const tasksResponse = await fetch(`/api/admin/events/${data.event.id}/tasks`);
            if (tasksResponse.ok) {
                const tasksData = await tasksResponse.json();
                tasks = tasksData.tasks || [];
                taskSummary = tasksData.summary || { total: 0, pending: 0, inProgress: 0, done: 0 };
            }

            // Load staff for assignment dropdown
            const staffResponse = await fetch(`/api/admin/events/${data.event.id}/staff`);
            if (staffResponse.ok) {
                eventStaff = await staffResponse.json();
            }
        } catch (error) {
            console.error('Failed to load tasks:', error);
            toast.error('Error', 'Failed to load tasks');
        } finally {
            loading = false;
        }
    }

    onMount(() => {
        loadData();
    });

    async function createTask() {
        if (!taskTitle.trim()) {
            toast.error('Error', 'Task title is required');
            return;
        }

        processing = true;

        try {
            const response = await fetch('/api/admin/tasks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    eventId: data.event.id,
                    assignedTo: taskAssignedTo || null,
                    title: taskTitle.trim(),
                    description: taskDescription.trim() || null,
                    dueDate: taskDueDate ? new Date(taskDueDate) : null,
                    priority: taskPriority,
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to create task');
            }

            toast.success('Success', 'Task created successfully');
            taskTitle = '';
            taskDescription = '';
            taskAssignedTo = '';
            taskDueDate = '';
            taskPriority = 'medium';
            showCreateForm = false;
            await loadData();
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Failed to create task';
            toast.error('Error', errorMsg);
        } finally {
            processing = false;
        }
    }

    async function deleteTask(taskId: string, taskTitle: string) {
        if (!confirm(`Delete task "${taskTitle}"?`)) {
            return;
        }

        processing = true;

        try {
            const response = await fetch(`/api/admin/tasks/${taskId}`, {
                method: 'DELETE',
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to delete task');
            }

            toast.success('Success', 'Task deleted successfully');
            await loadData();
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Failed to delete task';
            toast.error('Error', errorMsg);
        } finally {
            processing = false;
        }
    }

    async function updateTaskStatus(taskId: string, status: 'pending' | 'in_progress' | 'done') {
        processing = true;

        try {
            const response = await fetch(`/api/admin/tasks/${taskId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ status }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to update task');
            }

            await loadData();
        } catch (error) {
            console.error('Failed to update task:', error);
            toast.error('Error', 'Failed to update task');
        } finally {
            processing = false;
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

    function formatDate(date: Date | string | null): string {
        if (!date) return 'No due date';
        return new Date(date).toLocaleDateString("en-US", {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
</script>

<div class="space-y-6">
    <!-- Summary -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-background border border-border-card rounded-lg p-4">
            <p class="text-2xl font-bold text-foreground">{taskSummary.total}</p>
            <p class="text-sm text-muted-foreground">Total Tasks</p>
        </div>
        <div class="bg-background border border-border-card rounded-lg p-4">
            <p class="text-2xl font-bold text-gray-600">{taskSummary.pending}</p>
            <p class="text-sm text-muted-foreground">Pending</p>
        </div>
        <div class="bg-background border border-border-card rounded-lg p-4">
            <p class="text-2xl font-bold text-blue-600">{taskSummary.inProgress}</p>
            <p class="text-sm text-muted-foreground">In Progress</p>
        </div>
        <div class="bg-background border border-border-card rounded-lg p-4">
            <p class="text-2xl font-bold text-green-600">{taskSummary.done}</p>
            <p class="text-sm text-muted-foreground">Done</p>
        </div>
    </div>

    <!-- Header -->
    <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold text-foreground">Event Tasks</h3>
        <button
            onclick={() => showCreateForm = !showCreateForm}
            class="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg hover:opacity-90 transition-colors"
            disabled={processing}
        >
            <Plus size={18} />
            <span>Add Task</span>
        </button>
    </div>

    <!-- Create Task Form -->
    {#if showCreateForm}
        <div class="bg-background border border-border-card rounded-lg p-6">
            <h4 class="text-md font-semibold mb-4">Create New Task</h4>

            <div class="space-y-4">
                <div>
                    <label for="task-title" class="block text-sm font-medium text-foreground mb-2">
                        Title *
                    </label>
                    <input
                        id="task-title"
                        type="text"
                        bind:value={taskTitle}
                        placeholder="Enter task title..."
                        class="w-full px-3 py-2 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        disabled={processing}
                    />
                </div>

                <div>
                    <label for="task-description" class="block text-sm font-medium text-foreground mb-2">
                        Description
                    </label>
                    <textarea
                        id="task-description"
                        bind:value={taskDescription}
                        placeholder="Enter task description..."
                        rows="3"
                        class="w-full px-3 py-2 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        disabled={processing}
                    ></textarea>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label for="task-assignee" class="block text-sm font-medium text-foreground mb-2">
                            Assign To
                        </label>
                        <select
                            id="task-assignee"
                            bind:value={taskAssignedTo}
                            class="w-full px-3 py-2 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                            disabled={processing}
                        >
                            <option value="">Unassigned</option>
                            {#each eventStaff as staff}
                                <option value={staff.userId}>{staff.user.email}</option>
                            {/each}
                        </select>
                    </div>

                    <div>
                        <label for="task-priority" class="block text-sm font-medium text-foreground mb-2">
                            Priority
                        </label>
                        <select
                            id="task-priority"
                            bind:value={taskPriority}
                            class="w-full px-3 py-2 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                            disabled={processing}
                        >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label for="task-due-date" class="block text-sm font-medium text-foreground mb-2">
                        Due Date
                    </label>
                    <input
                        id="task-due-date"
                        type="datetime-local"
                        bind:value={taskDueDate}
                        class="w-full px-3 py-2 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        disabled={processing}
                    />
                </div>

                <div class="flex items-center gap-3">
                    {#if processing}
                        <button
                            disabled
                            class="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg opacity-50"
                        >
                            <Loader2 size={16} class="animate-spin" />
                            <span>Creating...</span>
                        </button>
                    {:else}
                        <button
                            onclick={createTask}
                            class="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg hover:opacity-90 transition-colors"
                        >
                            <CheckCircle2 size={16} />
                            <span>Create Task</span>
                        </button>
                    {/if}
                    <button
                        onclick={() => {
                            showCreateForm = false;
                            taskTitle = '';
                            taskDescription = '';
                            taskAssignedTo = '';
                            taskDueDate = '';
                            taskPriority = 'medium';
                        }}
                        class="inline-flex items-center gap-2 px-4 py-2 border border-border-dark text-foreground rounded-lg hover:bg-muted transition-colors"
                        disabled={processing}
                    >
                        <X size={16} />
                        <span>Cancel</span>
                    </button>
                </div>
            </div>
        </div>
    {/if}

    <!-- Tasks List -->
    {#if loading}
        <div class="bg-background border border-border-card rounded-lg p-8 text-center">
            <Loader2 size={32} class="animate-spin mx-auto text-muted-foreground" />
            <p class="text-muted-foreground mt-4">Loading tasks...</p>
        </div>
    {:else if tasks.length === 0}
        <div class="bg-background border border-border-card rounded-lg p-8 text-center">
            <p class="text-muted-foreground">
                No tasks created for this event yet.
            </p>
        </div>
    {:else}
        <div class="space-y-3">
            {#each tasks as task (task.id)}
                {@const statusBadge = getStatusBadge(task.status)}
                <div class="bg-background border border-border-card rounded-lg p-4 hover:bg-muted/50 transition-colors">
                    <div class="flex items-start justify-between gap-4">
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 mb-1">
                                <h4 class="text-base font-semibold text-foreground truncate">{task.title}</h4>
                                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium {getPriorityBadge(task.priority)}">
                                    {task.priority}
                                </span>
                            </div>
                            {#if task.description}
                                <p class="text-sm text-muted-foreground mb-2 line-clamp-2">{task.description}</p>
                            {/if}
                            <div class="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                                <span class="flex items-center gap-1">
                                    <svelte:component this={statusBadge.icon} size={14} />
                                    {statusBadge.label}
                                </span>
                                {#if task.assignedToUser}
                                    <span>• {task.assignedToUser.email}</span>
                                {:else}
                                    <span>• Unassigned</span>
                                {/if}
                                <span>• {formatDate(task.dueDate)}</span>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <button
                                onclick={() => {
                                    const nextStatus = task.status === 'pending' ? 'in_progress' : task.status === 'in_progress' ? 'done' : 'pending';
                                    updateTaskStatus(task.id, nextStatus);
                                }}
                                class="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                                title="Change status"
                                disabled={processing}
                            >
                                <svelte:component this={statusBadge.icon} size={16} />
                            </button>
                            <button
                                onclick={() => deleteTask(task.id, task.title)}
                                class="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete task"
                                disabled={processing}
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>
