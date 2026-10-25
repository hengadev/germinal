-- The production app's database role (issue 018, PRD M3): a LOGIN role that
-- is not a superuser and can't create databases or roles, owns the
-- production database and every object in it, and can connect to that
-- database only. Startup migrations and pg-boss setup run as this owner;
-- the bootstrap superuser stays for Postgres init, this setup and backups.
--
-- Run by psql as the bootstrap superuser, connected to the production
-- database, with the psql variables role, password and db set beforehand
-- (roles/shared_services; the compose harness runs the same file).
-- Idempotent: safe to re-run; the password is re-applied every time.

-- Prints CREATED when this run creates the role (the task's changed_when).
SELECT 'CREATED' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'role');

SELECT format('CREATE ROLE %I', :'role')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'role') \gexec

ALTER ROLE :"role" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'password';

-- Owner of the production database: it may create schemas (drizzle, pgboss).
ALTER DATABASE :"db" OWNER TO :"role";

-- Owner of every user schema and object already there (created by earlier
-- runs as the superuser, or by the image's init). Extension members and
-- sequences owned by a table column follow their owner and are skipped;
-- partitioned tables and their partitions are not (see below).
SELECT format('ALTER SCHEMA %I OWNER TO %I', n.nspname, :'role')
FROM pg_namespace n
WHERE n.nspname NOT LIKE 'pg\_%' AND n.nspname <> 'information_schema'
  AND n.nspowner <> (SELECT oid FROM pg_roles WHERE rolname = :'role')
  AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.classid = 'pg_namespace'::regclass AND d.objid = n.oid AND d.deptype = 'e')
\gexec

SELECT format(
         CASE c.relkind
           WHEN 'v' THEN 'ALTER VIEW %s OWNER TO %I'
           WHEN 'm' THEN 'ALTER MATERIALIZED VIEW %s OWNER TO %I'
           WHEN 'S' THEN 'ALTER SEQUENCE %s OWNER TO %I'
           WHEN 'f' THEN 'ALTER FOREIGN TABLE %s OWNER TO %I'
           ELSE 'ALTER TABLE %s OWNER TO %I'
         END, c.oid::regclass, :'role')
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
  AND n.nspname NOT LIKE 'pg\_%' AND n.nspname <> 'information_schema'
  AND c.relowner <> (SELECT oid FROM pg_roles WHERE rolname = :'role')
  -- Skipped: extension members, and sequences owned by a column (serial:
  -- 'a', identity: 'i'), which follow their table. Only for sequences: a
  -- partitioned table has an 'i' dependency on itself and a partition an
  -- 'a' one on its parent, and both must change owner (pg-boss's job table).
  AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid
                  AND (d.deptype = 'e' OR (c.relkind = 'S' AND d.deptype IN ('a', 'i'))))
\gexec

SELECT format('ALTER TYPE %s OWNER TO %I', t.oid::regtype, :'role')
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE t.typtype IN ('e', 'd', 'r', 'm', 'c') AND t.typrelid = 0
  AND n.nspname NOT LIKE 'pg\_%' AND n.nspname <> 'information_schema'
  AND t.typowner <> (SELECT oid FROM pg_roles WHERE rolname = :'role')
  AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid AND d.deptype IN ('e', 'i'))
\gexec

SELECT format('ALTER ROUTINE %s OWNER TO %I', p.oid::regprocedure, :'role')
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname NOT LIKE 'pg\_%' AND n.nspname <> 'information_schema'
  AND p.proowner <> (SELECT oid FROM pg_roles WHERE rolname = :'role')
  AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
\gexec

-- CONNECT on the production database only.
REVOKE CONNECT ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO :"role";
