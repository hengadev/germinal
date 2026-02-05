import { db } from '../db';
import { talentCategories, talents } from '../db/schema';
import { eq } from 'drizzle-orm';
import type { talentCategories as TalentCategory } from '$lib/server/db/schema';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

export type TalentCategory = InferSelectModel<typeof TalentCategory>;
export type CreateTalentCategoryInput = Omit<InferInsertModel<typeof TalentCategory>, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateTalentCategoryInput = Partial<CreateTalentCategoryInput>;

export async function getAllTalentCategories(options: { publishedOnly?: boolean } = {}) {
	const { publishedOnly = false } = options;

	const categories = await db.query.talentCategories.findMany({
		where: publishedOnly ? eq(talentCategories.published, true) : undefined,
		orderBy: [talentCategories.sortOrder, talentCategories.name],
		with: {
			talents: {
				columns: {
					id: true,
				},
			},
		},
	});

	// Add talent count to each category
	return categories.map((category: typeof categories[number]) => ({
		...category,
		talentCount: category.talents?.length ?? 0,
	}));
}

export async function getTalentCategoryById(id: string) {
	const category = await db.query.talentCategories.findFirst({
		where: eq(talentCategories.id, id),
	});

	if (!category) {
		throw new Error('Talent category not found');
	}

	return category;
}

export async function getTalentCategoryBySlug(slug: string) {
	const category = await db.query.talentCategories.findFirst({
		where: eq(talentCategories.slug, slug),
	});

	if (!category) {
		throw new Error('Talent category not found');
	}

	return category;
}

export async function createTalentCategory(input: CreateTalentCategoryInput) {
	const [category] = await db.insert(talentCategories).values({
		...input,
		sortOrder: input.sortOrder ?? 0,
	}).returning();

	return category;
}

export async function updateTalentCategory(id: string, input: UpdateTalentCategoryInput) {
	const [updated] = await db.update(talentCategories)
		.set({ ...input, updatedAt: new Date() })
		.where(eq(talentCategories.id, id))
		.returning();

	if (!updated) {
		throw new Error('Talent category not found');
	}

	return updated;
}

export async function deleteTalentCategory(id: string) {
	// Check if category has talents
	const categoryWithTalents = await db.query.talentCategories.findFirst({
		where: eq(talentCategories.id, id),
		with: {
			talents: true,
		},
	});

	if (!categoryWithTalents) {
		throw new Error('Talent category not found');
	}

	if (categoryWithTalents.talents && categoryWithTalents.talents.length > 0) {
		throw new Error('Cannot delete category with associated talents');
	}

	await db.delete(talentCategories).where(eq(talentCategories.id, id));
}

export async function reorderTalentCategories(categoryIds: string[]) {
	// Update sort order for each category
	await db.transaction(async (tx: typeof db) => {
		for (let i = 0; i < categoryIds.length; i++) {
			await tx.update(talentCategories)
				.set({ sortOrder: i, updatedAt: new Date() })
				.where(eq(talentCategories.id, categoryIds[i]));
		}
	});
}
