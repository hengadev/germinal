-- Menus' dishes grow a shape of their own (issue 085): a name and an
-- optional description in both languages, and an « alternative » mark
-- with a short note for a dish served instead of the previous one.
-- Existing dishes keep their meaning: the old text becomes the name,
-- descriptions and notes stay empty, and every dish after the first of
-- its Course becomes an alternative (they were saved as choices).
-- Dishes already carrying `nameFr` are passed through, so the migration
-- is idempotent.
UPDATE event_menus
SET courses = COALESCE((
	SELECT jsonb_agg(
		course || jsonb_build_object('dishes', COALESCE(new_dishes.dishes, '[]'::jsonb))
		ORDER BY course_ordinality
	)
	FROM jsonb_array_elements(courses) WITH ORDINALITY AS c(course, course_ordinality)
	CROSS JOIN LATERAL (
		SELECT COALESCE(jsonb_agg(
			CASE WHEN dish ? 'nameFr' THEN dish
			ELSE jsonb_build_object(
				'nameFr', dish->>'fr',
				'nameEn', dish->>'en',
				'descriptionFr', NULL,
				'descriptionEn', NULL,
				'alternative', dish_ordinality > 1,
				'noteFr', NULL,
				'noteEn', NULL
			) END
			ORDER BY dish_ordinality
		), '[]'::jsonb) AS dishes
		FROM jsonb_array_elements(COALESCE(c.course->'dishes', '[]'::jsonb)) WITH ORDINALITY AS d(dish, dish_ordinality)
	) AS new_dishes
), '[]'::jsonb);
