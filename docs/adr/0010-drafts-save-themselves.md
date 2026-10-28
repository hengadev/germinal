# ADR 0010 — Drafts save themselves; a published Event saves once, on confirmation

**Status**: Accepted
**Date**: 2026-10-27
**Amends**: ADR 0008 (its "One editor" and "Autosave" points)

## Context

An Event is not created in one sitting: an Admin comes back to it many times before publishing. The editor of ADR 0008 has a save button per tab, and on a new Event the first save of any tab creates the Draft and redirects to its page, which discards whatever was typed but not saved in the other tabs, without warning (the leave guard is cleared for that redirect). Even on a saved Event, each edited tab must be saved on its own. How the editor saves had to be explained, which is the problem: it should be obvious.

## Decision

- **The Draft exists from the start.** "Nouvel événement" creates an empty Draft at once and opens its page. The editor has a single mode, always on a saved Event; the first-save redirect and the joint save of « Dates & séances » with « Menus & tarifs » go away. An empty Draft left untouched is deleted.
- **A Draft saves itself.** Each tab saves its whole content shortly after the Admin stops typing, as one unit, so the Seatings and pricing editors still validate as a whole. A tab whose content is not valid is not saved; its errors are shown on the fields and the tab. There are no save buttons on a Draft.
- **A published Event saves once, on confirmation.** On a Private or Public Event, edits across all tabs are held and a single bar offers to save or discard them. Saving asks for confirmation in a dialog, then saves every edited tab. Nothing a visitor or a Ticket holder sees changes before that. The leave guard stays.
- **Publishing stays explicit.** Leaving Draft keeps its own confirmation; autosave never changes Visibility.
- **Changes are visible.** The editor shows one save status (saving, saved and when, failed with a retry). Each tab marks unsaved changes and what is still missing, and « À vérifier » follows what is typed, not only what is saved.
- **Coming back is easy.** The Events list shows how complete each Draft is, and the open tab is kept in the URL.

## Considered Options

- **One save button for all tabs, everywhere** — rejected: on a Draft it still loses work when the Admin forgets to save, and nothing visible depends on a Draft being saved deliberately.
- **Autosave published Events too** — rejected: a half-typed edit, or a change to a capacity, a price or a date, would reach visitors and Ticket holders at once.
- **Autosave field by field** — rejected for the reason ADR 0008 gave: the Seatings and pricing editors validate as a whole. Saving per tab keeps that.

## Consequences

- Empty Drafts need cleaning up (when the Admin leaves an untouched one, and a periodic sweep for the rest).
- The new-Event code paths (the `/admin/events/new` actions, the first-save redirect, `mergeFormFields`) are removed.
- Two Admins editing the same Draft at once may overwrite each other; accepted while there are few Admins.
