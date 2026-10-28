-- A Course serves one dish or several to choose from: its dishFr/dishEn
-- become the one dish of a `dishes` list.
UPDATE "event_menus" AS m
SET "courses" = (
	SELECT coalesce(jsonb_agg(jsonb_build_object(
		'labelEn', c->'labelEn',
		'labelFr', c->'labelFr',
		'dishes', jsonb_build_array(jsonb_build_object(
			'en', coalesce(c->>'dishEn', ''),
			'fr', coalesce(c->>'dishFr', '')
		))
	) ORDER BY ord), '[]'::jsonb)
	FROM jsonb_array_elements(m."courses") WITH ORDINALITY AS t(c, ord)
)
WHERE jsonb_array_length(m."courses") > 0
	AND m."courses"->0 ? 'dishFr';
