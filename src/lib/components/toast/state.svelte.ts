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
