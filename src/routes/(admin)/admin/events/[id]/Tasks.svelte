<script lang="ts">
    import { onMount } from 'svelte';
    import { enhance } from "$app/forms";
    import { browser } from "$app/environment";
    import {
        Plus,
        Trash2,
        Loader2,
        CheckCircle2,
        X,
        Circle,
        Clock,
        AlertCircle,
        Edit,
    } from "lucide-svelte";
    import type { PageData, ActionData } from "../+page.server";
    import { getToastContext } from "$lib/components/toast/state.svelte";
    import Modal from "$lib/components/ui/Modal.svelte";
    import Drawer from "$lib/components/ui/Drawer.svelte";

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
    let deleteDialogOpen = $state(false);
    let editDialogOpen = $state(false);
    let selectedTask: Task | null = $state(null);

    // Mobile detection
    let isMobile = $state(false);
    if (browser) {
        isMobile = window.innerWidth < 768;
        window.addEventListener("resize", () => {
            isMobile = window.innerWidth < 768;
        });
    }

    // Create form state
    let taskTitle = $state('');
    let taskDescription = $state('');
    let taskAssignedTo = $state('');
    let taskDueDate = $state('');
    let taskPriority = $state<'low' | 'medium' | 'high'>('medium');

    // Edit form state
    let editTitle = $state('');
    let editDescription = $state('');
    let editAssignedTo = $state('');
    let editDueDate = $state('');
    let editPriority = $state<'low' | 'medium' | 'high'>('medium');
    let editStatus = $state<'pending' | 'in_progress' | 'done'>('pending');

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
            toast.error('Erreur', 'Échec du chargement des tâches');
        } finally {
            loading = false;
        }
    }

    onMount(() => {
        loadData();
    });

    async function createTask() {
        if (!taskTitle.trim()) {
            toast.error('Erreur', 'Le titre de la tâche est requis');
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
                throw new Error(result.error || 'Échec de la création de la tâche');
            }

            toast.success('Succès', 'Tâche créée avec succès');
            taskTitle = '';
            taskDescription = '';
            taskAssignedTo = '';
            taskDueDate = '';
            taskPriority = 'medium';
            showCreateForm = false;
            await loadData();
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Échec de la création de la tâche';
            toast.error('Erreur', errorMsg);
        } finally {
            processing = false;
        }
    }

    async function deleteTask(taskId: string, taskTitle: string) {
        processing = true;

        try {
            const response = await fetch(`/api/admin/tasks/${taskId}`, {
                method: 'DELETE',
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Échec de la suppression de la tâche');
            }

            toast.success('Succès', 'Tâche supprimée avec succès');
            deleteDialogOpen = false;
            selectedTask = null;
            await loadData();
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Échec de la suppression de la tâche';
            toast.error('Erreur', errorMsg);
        } finally {
            processing = false;
        }
    }

    function openDeleteDialog(task: Task) {
        selectedTask = task;
        deleteDialogOpen = true;
    }

    function openEditDialog(task: Task) {
        selectedTask = task;
        editTitle = task.title;
        editDescription = task.description || '';
        editAssignedTo = task.assignedTo || '';
        editDueDate = task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 16) : '';
        editPriority = task.priority;
        editStatus = task.status;
        editDialogOpen = true;
    }

    async function updateTask() {
        if (!selectedTask || !editTitle.trim()) {
            toast.error('Erreur', 'Le titre de la tâche est requis');
            return;
        }

        processing = true;

        try {
            const response = await fetch(`/api/admin/tasks/${selectedTask.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    assignedTo: editAssignedTo || null,
                    title: editTitle.trim(),
                    description: editDescription.trim() || null,
                    dueDate: editDueDate ? new Date(editDueDate) : null,
                    priority: editPriority,
                    status: editStatus,
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Échec de la mise à jour de la tâche');
            }

            toast.success('Succès', 'Tâche mise à jour avec succès');
            editDialogOpen = false;
            selectedTask = null;
            await loadData();
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Échec de la mise à jour de la tâche';
            toast.error('Erreur', errorMsg);
        } finally {
            processing = false;
        }
    }

    function getStatusBadge(status: string) {
        switch (status) {
            case 'done':
                return { class: 'bg-green-100 text-green-800', icon: CheckCircle2, label: 'Terminé' };
            case 'in_progress':
                return { class: 'bg-blue-100 text-blue-800', icon: Clock, label: 'En cours' };
            case 'pending':
                return { class: 'bg-gray-100 text-gray-800', icon: Circle, label: 'En attente' };
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
        if (!date) return 'Aucune date d\'échéance';
        return new Date(date).toLocaleDateString("fr-FR", {
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
            <p class="text-sm text-muted-foreground">Total des tâches</p>
        </div>
        <div class="bg-background border border-border-card rounded-lg p-4">
            <p class="text-2xl font-bold text-gray-600">{taskSummary.pending}</p>
            <p class="text-sm text-muted-foreground">En attente</p>
        </div>
        <div class="bg-background border border-border-card rounded-lg p-4">
            <p class="text-2xl font-bold text-blue-600">{taskSummary.inProgress}</p>
            <p class="text-sm text-muted-foreground">En cours</p>
        </div>
        <div class="bg-background border border-border-card rounded-lg p-4">
            <p class="text-2xl font-bold text-green-600">{taskSummary.done}</p>
            <p class="text-sm text-muted-foreground">Terminées</p>
        </div>
    </div>

    <!-- Header -->
    <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold text-foreground">Tâches de l'événement</h3>
        <button
            onclick={() => showCreateForm = !showCreateForm}
            class="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg hover:opacity-90 transition-colors"
            disabled={processing}
        >
            <Plus size={18} />
            <span>Ajouter une tâche</span>
        </button>
    </div>

    <!-- Create Task Form -->
    {#if showCreateForm}
        <div class="bg-background border border-border-card rounded-lg p-6">
            <h4 class="text-md font-semibold mb-4">Créer une nouvelle tâche</h4>

            <div class="space-y-4">
                <div>
                    <label for="task-title" class="block text-sm font-medium text-foreground mb-2">
                        Titre *
                    </label>
                    <input
                        id="task-title"
                        type="text"
                        bind:value={taskTitle}
                        placeholder="Entrez le titre de la tâche..."
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
                        placeholder="Entrez la description de la tâche..."
                        rows="3"
                        class="w-full px-3 py-2 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        disabled={processing}
                    ></textarea>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label for="task-assignee" class="block text-sm font-medium text-foreground mb-2">
                            Assigner à
                        </label>
                        <select
                            id="task-assignee"
                            bind:value={taskAssignedTo}
                            class="w-full px-3 py-2 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                            disabled={processing}
                        >
                            <option value="">Non assigné</option>
                            {#each eventStaff as staff}
                                <option value={staff.userId}>{staff.user.email}</option>
                            {/each}
                        </select>
                    </div>

                    <div>
                        <label for="task-priority" class="block text-sm font-medium text-foreground mb-2">
                            Priorité
                        </label>
                        <select
                            id="task-priority"
                            bind:value={taskPriority}
                            class="w-full px-3 py-2 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                            disabled={processing}
                        >
                            <option value="low">Faible</option>
                            <option value="medium">Moyenne</option>
                            <option value="high">Élevée</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label for="task-due-date" class="block text-sm font-medium text-foreground mb-2">
                        Date d'échéance
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
                            <span>Création...</span>
                        </button>
                    {:else}
                        <button
                            onclick={createTask}
                            class="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg hover:opacity-90 transition-colors"
                        >
                            <CheckCircle2 size={16} />
                            <span>Créer la tâche</span>
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
                        <span>Annuler</span>
                    </button>
                </div>
            </div>
        </div>
    {/if}

    <!-- Tasks List -->
    {#if loading}
        <div class="bg-background border border-border-card rounded-lg p-8 text-center">
            <Loader2 size={32} class="animate-spin mx-auto text-muted-foreground" />
            <p class="text-muted-foreground mt-4">Chargement des tâches...</p>
        </div>
    {:else if tasks.length === 0}
        <div class="bg-background border border-border-card rounded-lg p-8 text-center">
            <p class="text-muted-foreground">
                Aucune tâche créée pour cet événement pour le moment.
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
                                    <span>• Non assigné</span>
                                {/if}
                                <span>• {formatDate(task.dueDate)}</span>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <button
                                onclick={() => openEditDialog(task)}
                                class="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                                title="Modifier la tâche"
                                disabled={processing}
                            >
                                <Edit size={16} />
                            </button>
                            <button
                                onclick={() => openDeleteDialog(task)}
                                class="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition-colors"
                                title="Supprimer la tâche"
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

<!-- Delete Task Dialog/Drawer -->
{#if isMobile}
    <Drawer bind:isOpen={deleteDialogOpen}>
        <div class="sticky top-0 bg-background pb-4 border-b border-border-card -mx-4 px-4 -mt-4 pt-4 z-10">
            <div class="flex items-center justify-between mb-2">
                <h2 class="text-xl font-semibold tracking-tight">Supprimer la tâche</h2>
                <button type="button" onclick={() => (deleteDialogOpen = false)} class="p-2 hover:bg-muted rounded-md transition-colors">
                    <X class="text-foreground size-5" />
                </button>
            </div>
            <p class="text-muted-foreground text-sm">
                Êtes-vous sûr de vouloir supprimer la tâche "{selectedTask?.title}" ? Cette action ne peut pas être annulée.
            </p>
        </div>
        <div class="pt-4">
            <div class="flex w-full justify-end gap-3">
                <button type="button" onclick={() => (deleteDialogOpen = false)}
                    class="px-4 py-2 border border-border-input text-foreground-alt rounded-lg hover:bg-muted transition-colors font-medium text-sm">
                    Annuler
                </button>
                {#if processing}
                    <button disabled
                        class="px-4 py-2 bg-red-600 text-white rounded-lg opacity-50 font-medium text-sm inline-flex items-center gap-2">
                        <Loader2 size={16} class="animate-spin" />
                        Suppression...
                    </button>
                {:else}
                    <button type="button" onclick={() => selectedTask && deleteTask(selectedTask.id, selectedTask.title)}
                        class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm">
                        Supprimer
                    </button>
                {/if}
            </div>
        </div>
    </Drawer>
{:else}
    <Modal
        bind:isOpen={deleteDialogOpen}
        title="Supprimer la tâche"
        description="Êtes-vous sûr de vouloir supprimer la tâche '{selectedTask?.title}' ? Cette action ne peut pas être annulée."
    >
        <div class="flex w-full justify-end gap-3 mt-6">
            <button type="button" onclick={() => (deleteDialogOpen = false)}
                class="px-6 py-2.5 border border-border-input text-foreground-alt rounded-lg hover:bg-muted transition-colors font-medium">
                Annuler
            </button>
            {#if processing}
                <button disabled
                    class="px-6 py-2.5 bg-red-600 text-white rounded-lg opacity-50 font-medium inline-flex items-center gap-2">
                    <Loader2 size={16} class="animate-spin" />
                    Suppression...
                </button>
            {:else}
                <button type="button" onclick={() => selectedTask && deleteTask(selectedTask.id, selectedTask.title)}
                    class="px-6 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium">
                    Supprimer
                </button>
            {/if}
        </div>
    </Modal>
{/if}

<!-- Edit Task Dialog/Drawer -->
{#if isMobile}
    <Drawer bind:isOpen={editDialogOpen}>
        <div class="sticky top-0 bg-background pb-4 border-b border-border-card -mx-4 px-4 -mt-4 pt-4 z-10">
            <div class="flex items-center justify-between mb-2">
                <h2 class="text-xl font-semibold tracking-tight">Modifier la tâche</h2>
                <button type="button" onclick={() => (editDialogOpen = false)} class="p-2 hover:bg-muted rounded-md transition-colors">
                    <X class="text-foreground size-5" />
                </button>
            </div>
            <p class="text-muted-foreground text-sm">Mettre à jour les détails de la tâche</p>
        </div>
        <div class="pt-4 space-y-4">
            <div>
                <label for="edit-task-title" class="block text-sm font-medium text-foreground mb-2">
                    Titre *
                </label>
                <input
                    id="edit-task-title"
                    type="text"
                    bind:value={editTitle}
                    placeholder="Entrez le titre de la tâche..."
                    class="w-full px-3 py-2 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    disabled={processing}
                />
            </div>

            <div>
                <label for="edit-task-description" class="block text-sm font-medium text-foreground mb-2">
                    Description
                </label>
                <textarea
                    id="edit-task-description"
                    bind:value={editDescription}
                    placeholder="Entrez la description de la tâche..."
                    rows="3"
                    class="w-full px-3 py-2 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    disabled={processing}
                ></textarea>
            </div>

            <div>
                <label for="edit-task-assignee" class="block text-sm font-medium text-foreground mb-2">
                    Assigner à
                </label>
                <select
                    id="edit-task-assignee"
                    bind:value={editAssignedTo}
                    class="w-full px-3 py-2 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    disabled={processing}
                >
                    <option value="">Non assigné</option>
                    {#each eventStaff as staff}
                        <option value={staff.userId}>{staff.user.email}</option>
                    {/each}
                </select>
            </div>

            <div>
                <label for="edit-task-status" class="block text-sm font-medium text-foreground mb-2">
                    Statut
                </label>
                <select
                    id="edit-task-status"
                    bind:value={editStatus}
                    class="w-full px-3 py-2 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    disabled={processing}
                >
                    <option value="pending">En attente</option>
                    <option value="in_progress">En cours</option>
                    <option value="done">Terminé</option>
                </select>
            </div>

            <div>
                <label for="edit-task-priority" class="block text-sm font-medium text-foreground mb-2">
                    Priorité
                </label>
                <select
                    id="edit-task-priority"
                    bind:value={editPriority}
                    class="w-full px-3 py-2 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    disabled={processing}
                >
                    <option value="low">Faible</option>
                    <option value="medium">Moyenne</option>
                    <option value="high">Élevée</option>
                </select>
            </div>

            <div>
                <label for="edit-task-due-date" class="block text-sm font-medium text-foreground mb-2">
                    Date d'échéance
                </label>
                <input
                    id="edit-task-due-date"
                    type="datetime-local"
                    bind:value={editDueDate}
                    class="w-full px-3 py-2 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    disabled={processing}
                />
            </div>

            <div class="flex w-full justify-end gap-3 pt-2">
                <button type="button" onclick={() => (editDialogOpen = false)}
                    class="px-4 py-2 border border-border-input text-foreground-alt rounded-lg hover:bg-muted transition-colors font-medium text-sm">
                    Annuler
                </button>
                {#if processing}
                    <button disabled
                        class="px-4 py-2 bg-foreground text-background rounded-lg opacity-50 font-medium text-sm inline-flex items-center gap-2">
                        <Loader2 size={16} class="animate-spin" />
                        Mise à jour...
                    </button>
                {:else}
                    <button type="button" onclick={updateTask}
                        class="px-4 py-2 bg-foreground text-background rounded-lg hover:opacity-90 transition-colors font-medium text-sm">
                        Enregistrer
                    </button>
                {/if}
            </div>
        </div>
    </Drawer>
{:else}
    <Modal
        bind:isOpen={editDialogOpen}
        title="Modifier la tâche"
        description="Mettre à jour les détails de la tâche"
    >
        <div class="grid grid-cols-2 gap-4 pt-6">
            <div class="col-span-2">
                <label for="edit-task-title-d" class="block text-sm font-medium text-foreground mb-2">
                    Titre *
                </label>
                <input
                    id="edit-task-title-d"
                    type="text"
                    bind:value={editTitle}
                    placeholder="Entrez le titre de la tâche..."
                    class="w-full px-3 py-2 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    disabled={processing}
                />
            </div>

            <div class="col-span-2">
                <label for="edit-task-description-d" class="block text-sm font-medium text-foreground mb-2">
                    Description
                </label>
                <textarea
                    id="edit-task-description-d"
                    bind:value={editDescription}
                    placeholder="Entrez la description de la tâche..."
                    rows="3"
                    class="w-full px-3 py-2 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    disabled={processing}
                ></textarea>
            </div>

            <div>
                <label for="edit-task-assignee-d" class="block text-sm font-medium text-foreground mb-2">
                    Assigner à
                </label>
                <select
                    id="edit-task-assignee-d"
                    bind:value={editAssignedTo}
                    class="w-full px-3 py-2 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    disabled={processing}
                >
                    <option value="">Non assigné</option>
                    {#each eventStaff as staff}
                        <option value={staff.userId}>{staff.user.email}</option>
                    {/each}
                </select>
            </div>

            <div>
                <label for="edit-task-status-d" class="block text-sm font-medium text-foreground mb-2">
                    Statut
                </label>
                <select
                    id="edit-task-status-d"
                    bind:value={editStatus}
                    class="w-full px-3 py-2 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    disabled={processing}
                >
                    <option value="pending">En attente</option>
                    <option value="in_progress">En cours</option>
                    <option value="done">Terminé</option>
                </select>
            </div>

            <div>
                <label for="edit-task-priority-d" class="block text-sm font-medium text-foreground mb-2">
                    Priorité
                </label>
                <select
                    id="edit-task-priority-d"
                    bind:value={editPriority}
                    class="w-full px-3 py-2 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    disabled={processing}
                >
                    <option value="low">Faible</option>
                    <option value="medium">Moyenne</option>
                    <option value="high">Élevée</option>
                </select>
            </div>

            <div>
                <label for="edit-task-due-date-d" class="block text-sm font-medium text-foreground mb-2">
                    Date d'échéance
                </label>
                <input
                    id="edit-task-due-date-d"
                    type="datetime-local"
                    bind:value={editDueDate}
                    class="w-full px-3 py-2 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    disabled={processing}
                />
            </div>
        </div>

        <div class="flex w-full justify-end gap-3 pt-6">
            <button type="button" onclick={() => (editDialogOpen = false)}
                class="px-6 py-2.5 border border-border-input text-foreground-alt rounded-lg hover:bg-muted transition-colors font-medium">
                Annuler
            </button>
            {#if processing}
                <button disabled
                    class="px-6 py-2.5 bg-foreground text-background rounded-lg opacity-50 font-medium inline-flex items-center gap-2">
                    <Loader2 size={16} class="animate-spin" />
                    Mise à jour...
                </button>
            {:else}
                <button type="button" onclick={updateTask}
                    class="px-6 py-2.5 bg-foreground text-background rounded-lg hover:opacity-90 transition-colors font-medium">
                    Enregistrer
                </button>
            {/if}
        </div>
    </Modal>
{/if}
