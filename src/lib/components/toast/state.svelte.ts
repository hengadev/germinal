import { getContext, onDestroy, setContext } from "svelte";
import type { Toast, ToastLevel } from "./types";

export class ToastState {
	toasts = $state<Toast[]>([]);
	toastToTimeoutMap = new Map<string, number>();

	constructor() {
		onDestroy(() => {
			for (const timeout of this.toastToTimeoutMap.values()) {
				clearTimeout(timeout);
			}
			this.toastToTimeoutMap.clear();
		});
	}

	add(level: ToastLevel, title: string, message: string, durationMs: number = 4000) {
		const id = crypto.randomUUID();
		this.toasts.push({
			id,
			level,
			title,
			message
		});
		this.toastToTimeoutMap.set(
			id,
			window.setTimeout(() => {
				this.remove(id);
			}, durationMs)
		);
	}

	success(title: string, message: string, durationMs?: number) {
		this.add("success", title, message, durationMs);
	}

	error(title: string, message: string, durationMs?: number) {
		this.add("error", title, message, durationMs);
	}

	warning(title: string, message: string, durationMs?: number) {
		this.add("warning", title, message, durationMs);
	}

	info(title: string, message: string, durationMs?: number) {
		this.add("info", title, message, durationMs);
	}

	remove(id: string) {
		const timeout = this.toastToTimeoutMap.get(id);
		if (timeout) {
			clearTimeout(timeout);
			this.toastToTimeoutMap.delete(id);
		}
		this.toasts = this.toasts.filter((toast) => toast.id !== id);
	}
}

const TOAST_KEY = Symbol("toast");

export function setToastContext() {
	return setContext(TOAST_KEY, new ToastState());
}

export function getToastContext() {
	return getContext<ReturnType<typeof setToastContext>>(TOAST_KEY);
}

/**
 * Give the components below a toast that can be quieted for a while:
 * while `quiet()` holds, their success and error toasts are dropped. The
 * Event editor quiets its tabs while it saves them all, and reports the
 * whole save in one toast of its own (issue 020). Call it after reading
 * the toast this component itself uses.
 */
export function setQuietableToastContext(quiet: () => boolean): ToastState {
	const parent = getToastContext();
	const add = (level: ToastLevel, title: string, message: string, durationMs?: number) => {
		if (quiet() && (level === "success" || level === "error")) return;
		parent.add(level, title, message, durationMs);
	};
	const child: ToastState = {
		get toasts() {
			return parent.toasts;
		},
		set toasts(value) {
			parent.toasts = value;
		},
		toastToTimeoutMap: parent.toastToTimeoutMap,
		add,
		success: (title, message, durationMs) => add("success", title, message, durationMs),
		error: (title, message, durationMs) => add("error", title, message, durationMs),
		warning: (title, message, durationMs) => add("warning", title, message, durationMs),
		info: (title, message, durationMs) => add("info", title, message, durationMs),
		remove: (id) => parent.remove(id),
	};
	return setContext(TOAST_KEY, child);
}
