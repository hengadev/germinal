export type ToastLevel = "info" | "success" | "error" | "warning";

export interface Toast {
	id: string;
	level: ToastLevel;
	title: string;
	message: string;
}

export const TOAST_LEVELS = {
	Info: "info",
	Success: "success",
	Error: "error",
	Warning: "warning"
} as const satisfies Record<string, ToastLevel>;
