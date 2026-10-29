-- A Menu's Courses, in order (label and dish, EN/FR). The description
-- was shown to guests one course per line: each line becomes a Course
-- with no label (the English paired by line), and the description, now
-- the note under the Courses, is cleared.
ALTER TABLE "event_menus" ADD COLUMN "courses" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "event_menus" AS m
SET "courses" = (
		SELECT coalesce(jsonb_agg(jsonb_build_object(
			'labelEn', '',
			'labelFr', '',
			'dishEn', coalesce(trim(en.line), ''),
			'dishFr', trim(fr.line)
		) ORDER BY fr.n), '[]'::jsonb)
		FROM (
			SELECT line, row_number() OVER (ORDER BY ord) AS n
			FROM unnest(string_to_array(m."description_fr", E'\n')) WITH ORDINALITY AS t(line, ord)
			WHERE trim(line) <> ''
		) AS fr
		LEFT JOIN (
			SELECT line, row_number() OVER (ORDER BY ord) AS n
			FROM unnest(string_to_array(coalesce(m."description_en", ''), E'\n')) WITH ORDINALITY AS t(line, ord)
			WHERE trim(line) <> ''
		) AS en ON en.n = fr.n
	),
	"description_en" = NULL,
	"description_fr" = NULL
WHERE trim(coalesce(m."description_fr", '')) <> '';
