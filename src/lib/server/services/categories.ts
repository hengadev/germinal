import { db } from '../db';
import { eventCategories, events } from '../db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import type { eventCategories as EventCategory } from '$lib/server/db/schema';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

export type Category = InferSelectModel<typeof EventCategory>;
export type CreateCategoryInput = Omit<InferInsertModel<typeof EventCategory>, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateCategoryInput = Partial<CreateCategoryInput>;

export async function getAllCategories(options: { publishedOnly?: boolean } = {}) {
	const { publishedOnly = false } = options;

	const categories = await db.query.eventCategories.findMany({
		where: publishedOnly ? eq(eventCategories.published, true) : undefined,
		orderBy: [eventCategories.sortOrder, eventCategories.name],
		with: {
			events: {
				columns: {
					id: true,
				},
			},
		},
	});

	// Add event count to each category
	return categories.map((category: typeof categories[number]) => ({
		...category,
		eventCount: category.events?.length ?? 0,
	}));
}

export async function getCategoryById(id: string) {
	const category = await db.query.eventCategories.findFirst({
		where: eq(eventCategories.id, id),
	});

	if (!category) {
		throw new Error('Category not found');
	}

	return category;
}

export async function getCategoryBySlug(slug: string) {
	const category = await db.query.eventCategories.findFirst({
		where: eq(eventCategories.slug, slug),
	});

	if (!category) {
		throw new Error('Category not found');
	}

	return category;
}

export async function createCategory(input: CreateCategoryInput) {
	const [category] = await db.insert(eventCategories).values({
		...input,
		sortOrder: input.sortOrder ?? 0,
	}).returning();

	return category;
}

export async function updateCategory(id: string, input: UpdateCategoryInput) {
	const [updated] = await db.update(eventCategories)
		.set({ ...input, updatedAt: new Date() })
		.where(eq(eventCategories.id, id))
		.returning();

	if (!updated) {
		throw new Error('Category not found');
	}

	return updated;
}

export async function deleteCategory(id: string) {
	// Check if category has events
	const categoryWithEvents = await db.query.eventCategories.findFirst({
		where: eq(eventCategories.id, id),
		with: {
			events: true,
		},
	});

	if (!categoryWithEvents) {
		throw new Error('Category not found');
	}

	if (categoryWithEvents.events && categoryWithEvents.events.length > 0) {
		throw new Error('Cannot delete category with associated events');
	}

	await db.delete(eventCategories).where(eq(eventCategories.id, id));
}

export async function reorderCategories(categoryIds: string[]) {
	// Update sort order for each category
	await db.transaction(async (tx: typeof db) => {
		for (let i = 0; i < categoryIds.length; i++) {
			await tx.update(eventCategories)
				.set({ sortOrder: i, updatedAt: new Date() })
				.where(eq(eventCategories.id, categoryIds[i]));
		}
	});
}
