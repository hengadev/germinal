#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Local Docker harness for the compose files + deploy script (issue 007).
#
# One command:
#   infrastructure/compose/test/run-harness.sh
#
# Mirrors production's shape on the local Docker daemon, with fixture env
# files in place of the Infisical Agent's renderings (fixtures/). It builds
# the app image locally with fake COMMIT_SHAs and drives the real `deploy`
# script through every acceptance case of the issue:
#
#   1.  docker compose config validates both committed compose files
#   2.  first deploy on empty data dirs: migrates, creates the admin from
#       fixture admin.env, ends with the SHA serving
#   3.  second deploy of a new SHA keeps the data, doesn't touch the admin
#   4.  failing migration exits non-zero BEFORE the app is recreated; the
#       previous container keeps serving
#   5.  /api/health SHA mismatch fails the deploy
#   6.  staging deploys alongside production: no name/network collisions
#   7.  running app containers have no ADMIN_* values in their environment
#   8.  data survives container recreation (bind mounts, not scratch space)
#
# Harness hygiene: distinct compose project names (germinal-harness-*), its
# own network (germinal-harness-network), no fixed host ports (Caddy's 80/443
# are re-published to a random loopback port), data in a temp dir — and an
# EXIT trap that removes everything it created, even on failure. Images are
# built and tagged locally as henga/germinal:<fake-sha>; the deploy's pull
# step is bypassed with GERMINAL_SKIP_PULL=1 (the production path — pulling
# henga/germinal:<sha> from Docker Hub — is untouched and always runs on the
# server).
#
# Requires: docker + compose plugin, ~10 minutes cold (image build), ports
# only on a private loopback socket. Never touches Docker Hub for the app
# image, never starts the real Infisical Agent.
#
# shellcheck disable=SC2015
# ^ the `cond && ok "..." || bad "..."` assert idiom is used throughout;
#   ok() only echoes, so the right-hand side never masks a real success.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

HARNESS_DIR=$(cd "$(dirname "$0")" && pwd)
COMPOSE_DIR=$(cd "$HARNESS_DIR/.." && pwd)
REPO_ROOT=$(cd "$COMPOSE_DIR/../.." && pwd)
DEPLOY=$COMPOSE_DIR/deploy

NETWORK=germinal-harness-network
PROJ_PROD=germinal-harness-prod
PROJ_STAGING=germinal-harness-staging
REPO=henga/germinal
# Fake, obviously-not-real commit SHAs baked into the images via COMMIT_SHA.
SHA1=0c0ffee00001
SHA2=0c0ffee00002
SHA_BAD=0c0ffee0bad # a tag whose image reports a DIFFERENT sha

TMP=""
TOTAL_PASS=0
TOTAL_FAIL=0

ok() {
	echo "    ok  - $*"
	TOTAL_PASS=$((TOTAL_PASS + 1))
}
bad() {
	echo "    FAIL- $*" >&2
	TOTAL_FAIL=$((TOTAL_FAIL + 1))
}

section() { printf '\n== %s ==\n' "$*"; }

# ── compose / deploy wrappers (harness project names + fixture layout) ──────
prod_compose_file() { echo "$TMP/prod/docker-compose.yml:$TMP/prod-override.yml"; }
staging_compose_file() { echo "$TMP/staging/docker-compose.yml:$TMP/staging-override.yml"; }

dc_prod() {
	env COMPOSE_FILE="$(prod_compose_file)" COMPOSE_PROJECT_NAME=$PROJ_PROD \
		docker compose --project-directory "$TMP/prod" "$@"
}
dc_staging() {
	env COMPOSE_FILE="$(staging_compose_file)" COMPOSE_PROJECT_NAME=$PROJ_STAGING \
		docker compose --project-directory "$TMP/staging" "$@"
}
deploy_prod() {
	env GERMINAL_PROD_ROOT="$TMP/prod" GERMINAL_STAGING_ROOT="$TMP/staging" \
		GERMINAL_SKIP_PULL=1 COMPOSE_FILE="$(prod_compose_file)" \
		COMPOSE_PROJECT_NAME=$PROJ_PROD "$DEPLOY" prod "$1"
}
deploy_staging() {
	env GERMINAL_PROD_ROOT="$TMP/prod" GERMINAL_STAGING_ROOT="$TMP/staging" \
		GERMINAL_SKIP_PULL=1 COMPOSE_FILE="$(staging_compose_file)" \
		COMPOSE_PROJECT_NAME=$PROJ_STAGING "$DEPLOY" staging "$1"
}

# ── helpers ──────────────────────────────────────────────────────────────────
container_ip() { docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$1"; }
psql_prod() { docker exec germinal_postgres psql -U germinal -d germinal -q -tAc "$1"; }
psql_staging() { docker exec germinal_postgres psql -U germinal -d germinal_staging -q -tAc "$1"; }

# Resolve a DNS name from inside a container (node is in the app image).
resolve() { # $1 container, $2 name -> prints "ip ip ..."
	docker exec "$1" node -e '
		require("dns").lookup(process.argv[1], { all: true }, (err, addrs) => {
			if (err) { console.error(err.message); process.exit(1); }
			console.log(addrs.map((a) => a.address).join(" "));
		});
	' "$2"
}

# GET /api/health through Caddy (as the real site would be reached), from
# inside the app container. Proves: Caddy reachable by container name, site
# block matches the Host header, reverse_proxy upstream resolves, and the
# serving app reports the expected SHA.
health_via_caddy() { # $1 exec-container, $2 Host header, $3 expected sha
	docker exec "$1" node -e '
		const http = require("http");
		const req = http.request(
			{ host: "germinal_caddy", port: 80, path: "/api/health", headers: { Host: process.argv[1] }, timeout: 5000 },
			(res) => {
				let body = "";
				res.on("data", (c) => (body += c));
				res.on("end", () => {
					try { process.exit(JSON.parse(body).sha === process.argv[2] ? 0 : 1); }
					catch { process.exit(1); }
				});
			}
		);
		req.on("error", () => process.exit(1));
		req.end();
	' "$2" "$3"
}

# ── lifecycle ────────────────────────────────────────────────────────────────
teardown() {
	# Containers, one-offs and project networks of both harness projects;
	# ignore errors — this runs from failure paths too.
	if [ -n "$TMP" ]; then
		dc_prod down --remove-orphans -v >/dev/null 2>&1 || true
		dc_staging down --remove-orphans -v >/dev/null 2>&1 || true
	fi
	docker network rm "$NETWORK" >/dev/null 2>&1 || true
	docker image rm "$REPO:$SHA1" "$REPO:$SHA2" "$REPO:$SHA_BAD" >/dev/null 2>&1 || true
	[ -n "$TMP" ] && rm -rf "$TMP"
}
trap teardown EXIT

setup() {
	section "setup: temp layout mirroring /opt/germinal{,-staging}"

	# Defensive teardown of a previous (crashed) run, so reruns are clean.
	teardown
	TMP=$(mktemp -d /tmp/germinal-harness.XXXXXX)

	mkdir -p "$TMP/prod/env" "$TMP/staging/env" \
		"$TMP/prod/data/postgres" "$TMP/prod/data/redis" "$TMP/prod/data/uploads" \
		"$TMP/prod/caddy/config" "$TMP/prod/caddy/data" "$TMP/prod/caddy/logs" \
		"$TMP/staging/data/uploads"

	# CI (issues 009/010) copies the compose files from the deployed commit
	# to the stack roots under the Agent's expected name.
	cp "$COMPOSE_DIR/docker-compose.prod.yml" "$TMP/prod/docker-compose.yml"
	cp "$COMPOSE_DIR/docker-compose.staging.yml" "$TMP/staging/docker-compose.yml"
	cp -r "$HARNESS_DIR/fixtures/prod/env/." "$TMP/prod/env/"
	cp -r "$HARNESS_DIR/fixtures/staging/env/." "$TMP/staging/env/"
	cp "$HARNESS_DIR/fixtures/Caddyfile" "$TMP/prod/caddy/config/Caddyfile"

	# Harness-only compose overrides: bind data to the temp dir, keep Caddy
	# off the developer's 80/443 (!override replaces the production port
	# bindings with random loopback ones), and run on the harness's own
	# network + project names. Nothing the deploy script or the compose files
	# do can see a difference.
	cat >"$TMP/prod-override.yml" <<EOF
# generated by run-harness.sh
services:
  app:
    volumes: ["$TMP/prod/data/uploads:/app/uploads"]
  postgres:
    volumes: ["$TMP/prod/data/postgres:/var/lib/postgresql/data"]
  redis:
    volumes: ["$TMP/prod/data/redis:/data"]
  caddy:
    ports: !override ["127.0.0.1::80", "127.0.0.1::443"]
    volumes:
      - $TMP/prod/caddy/config:/etc/caddy:ro
      - $TMP/prod/caddy/data:/data
      - $TMP/prod/caddy/logs:/var/log/caddy
networks:
  germinal_network:
    name: $NETWORK
    external: true
EOF
	cat >"$TMP/staging-override.yml" <<EOF
# generated by run-harness.sh
services:
  staging_app:
    volumes: ["$TMP/staging/data/uploads:/app/uploads"]
networks:
  germinal_network:
    name: $NETWORK
    external: true
EOF

	docker network create "$NETWORK" >/dev/null
	echo "    layout at $TMP"
}

build_image() { # $1 sha
	echo "    building $REPO:$1 (COMMIT_SHA=$1)"
	if ! docker build --build-arg COMMIT_SHA="$1" -t "$REPO:$1" "$REPO_ROOT" \
		>"$TMP/build-$1.log" 2>&1; then
		echo "    image build failed — tail of $TMP/build-$1.log:" >&2
		tail -n 40 "$TMP/build-$1.log" >&2 || true
		return 1
	fi
}

# ── cases ────────────────────────────────────────────────────────────────────
case_validate() {
	section "case 1: both compose files validate (docker compose config)"
	if COMPOSE_FILE="$TMP/prod/docker-compose.yml" docker compose --project-directory "$TMP/prod" config >/dev/null 2>&1; then
		ok "docker-compose.prod.yml validates"
	else
		bad "docker-compose.prod.yml does not validate"
	fi
	if COMPOSE_FILE="$TMP/staging/docker-compose.yml" docker compose --project-directory "$TMP/staging" config >/dev/null 2>&1; then
		ok "docker-compose.staging.yml validates"
	else
		bad "docker-compose.staging.yml does not validate"
	fi
	# No inline secrets: no value-looking scalars; env values come only from env_file.
	if ! grep -nE '^[[:space:]]+(environment|env):' "$COMPOSE_DIR/docker-compose.prod.yml" "$COMPOSE_DIR/docker-compose.staging.yml"; then
		ok "no inline environment blocks (values only via env_file)"
	else
		bad "inline environment block found"
	fi
}

case_first_deploy() {
	section "case 2: first deploy on empty data dirs"
	build_image "$SHA1" || { bad "image build failed"; return; }
	if deploy_prod "$SHA1" >"$TMP/deploy1.log" 2>&1; then
		ok "deploy prod $SHA1 exits 0"
	else
		bad "deploy prod $SHA1 failed:"$'\n'"$(tail -n 20 "$TMP/deploy1.log" | sed 's/^/        /')"
		return
	fi
	# Caddy is provisioned once by Ansible on the server, not per deploy.
	dc_prod up -d --wait caddy >/dev/null 2>&1 || { bad "caddy did not come up"; }
	[ "$(docker inspect -f '{{.State.Health.Status}}' germinal_app)" = healthy ] &&
		ok "app container healthy" || bad "app container not healthy"
	health_via_caddy germinal_app harness.germinal.test "$SHA1" &&
		ok "/api/health via Caddy reports $SHA1" || bad "/api/health via Caddy does not report $SHA1"
	[ "$(psql_prod "select count(*) from users where email='admin@harness.fixture' and role='admin'")" = 1 ] &&
		ok "admin created from fixture admin.env" || bad "admin missing"
	# The bootstrap one-off must not linger.
	if [ -z "$(docker ps -a --filter label=com.docker.compose.project=$PROJ_PROD --format '{{.Names}}' | grep admin || true)" ]; then
		ok "bootstrap one-off container removed"
	else
		bad "bootstrap one-off container left behind"
	fi
}

case_second_deploy() {
	section "case 3: second deploy of a new SHA keeps data + admin untouched"
	psql_prod "update users set last_name='Survived' where email='admin@harness.fixture'" >/dev/null
	build_image "$SHA2" || { bad "image build failed"; return; }
	if deploy_prod "$SHA2" >"$TMP/deploy2.log" 2>&1; then
		ok "deploy prod $SHA2 exits 0"
	else
		bad "deploy prod $SHA2 failed:"$'\n'"$(tail -n 20 "$TMP/deploy2.log" | sed 's/^/        /')"
		return
	fi
	health_via_caddy germinal_app harness.germinal.test "$SHA2" &&
		ok "/api/health reports $SHA2" || bad "/api/health does not report $SHA2"
	[ "$(psql_prod "select count(*) from users where email='admin@harness.fixture'")" = 1 ] &&
		ok "exactly one admin account" || bad "admin account duplicated"
	[ "$(psql_prod "select last_name from users where email='admin@harness.fixture'")" = Survived ] &&
		ok "existing admin untouched by the bootstrap" || bad "bootstrap modified the existing admin"
}

case_failing_migration() {
	section "case 4: failing migration aborts before recreate; old container keeps serving"
	local app_id_before
	app_id_before=$(docker inspect -f '{{.Id}}' germinal_app)
	cp "$TMP/prod/env/app.env" "$TMP/prod/env/app.env.bak"
	sed -i 's#^DATABASE_URL=.*#DATABASE_URL=postgresql://germinal:harness-fixture-prod-db@postgres:5432/harness_no_such_db#' "$TMP/prod/env/app.env"
	if deploy_prod "$SHA2" >"$TMP/deploy3.log" 2>&1; then
		bad "deploy exited 0 despite a failing migration"
	else
		ok "deploy exits non-zero on failing migration"
	fi
	mv "$TMP/prod/env/app.env.bak" "$TMP/prod/env/app.env"
	grep -q "migration failed" "$TMP/deploy3.log" &&
		ok "failure message points at the migration step" || bad "no migration failure message"
	[ "$(docker inspect -f '{{.Id}}' germinal_app)" = "$app_id_before" ] &&
		ok "app container was NOT recreated" || bad "app container was recreated despite failure"
	health_via_caddy germinal_app harness.germinal.test "$SHA2" &&
		ok "previous container still serving $SHA2" || bad "previous container stopped serving"
}

case_sha_mismatch() {
	section "case 5: /api/health SHA mismatch fails the deploy"
	# An image that reports SHA1, deployed as if it were $SHA_BAD.
	docker tag "$REPO:$SHA1" "$REPO:$SHA_BAD"
	if GERMINAL_HEALTH_TIMEOUT=9 deploy_prod "$SHA_BAD" >"$TMP/deploy4.log" 2>&1; then
		bad "deploy exited 0 despite SHA mismatch"
	else
		ok "deploy exits non-zero on SHA mismatch"
	fi
	grep -q "does not report $SHA_BAD" "$TMP/deploy4.log" &&
		ok "failure message names the SHA check" || bad "no SHA-mismatch message"
	health_via_caddy germinal_app harness.germinal.test "$SHA1" &&
		ok "container left running (reporting $SHA1, the mismatching image)" || bad "app not reachable after mismatch failure"
}

case_staging_alongside() {
	section "case 6: staging deploys alongside production without collisions"
	# PRD M4: staging gets its own Postgres role + database on the shared
	# instance, without connect rights on prod's database. On the server the
	# Ansible setup creates these; the harness does the SQL directly.
	if dc_prod exec -T postgres psql -U germinal -d germinal -v ON_ERROR_STOP=1 \
		-c "CREATE ROLE germinal_staging LOGIN PASSWORD 'harness-fixture-staging-db';" \
		-c "CREATE DATABASE germinal_staging OWNER germinal_staging;" \
		-c "REVOKE CONNECT ON DATABASE germinal FROM PUBLIC;" >/dev/null 2>&1; then
		ok "staging role + database created (server setup equivalent)"
	else
		bad "could not create staging role/database"
	fi

	if deploy_staging "$SHA2" >"$TMP/deploy5.log" 2>&1; then
		ok "deploy staging $SHA2 exits 0"
	else
		bad "deploy staging $SHA2 failed:"$'\n'"$(tail -n 20 "$TMP/deploy5.log" | sed 's/^/        /')"
		return
	fi
	health_via_caddy germinal_staging_app harness-staging.germinal.test "$SHA2" &&
		ok "staging /api/health via Caddy reports $SHA2" || bad "staging /api/health wrong via Caddy"
	[ "$(docker inspect -f '{{.State.Health.Status}}' germinal_staging_app)" = healthy ] &&
		ok "staging app container healthy" || bad "staging app container not healthy"
	health_via_caddy germinal_app harness.germinal.test "$SHA1" &&
		ok "prod still serving alongside staging" || bad "prod stopped serving after staging deploy"

	# The alias-collision property: on the shared network `app` must resolve
	# to prod's app ONLY — staging never registers a generic `app` alias.
	local prod_ip staging_ip app_alias
	prod_ip=$(container_ip germinal_app)
	staging_ip=$(container_ip germinal_staging_app)
	app_alias=$(resolve germinal_app app || true)
	[ "$app_alias" = "$prod_ip" ] &&
		ok "DNS alias 'app' resolves to prod's app only" || bad "alias 'app' resolves to '$app_alias' (want only $prod_ip)"
	[ "$(resolve germinal_app staging_app || true)" = "$staging_ip" ] &&
		ok "DNS alias 'staging_app' resolves to staging's app" || bad "alias 'staging_app' wrong"
	[ "$(resolve germinal_app germinal_app || true)" = "$prod_ip" ] &&
		ok "Caddy upstream name germinal_app resolves" || bad "germinal_app does not resolve"
	[ "$(resolve germinal_app germinal_staging_app || true)" = "$staging_ip" ] &&
		ok "Caddy upstream name germinal_staging_app resolves" || bad "germinal_staging_app does not resolve"

	[ "$(psql_staging "select count(*) from users where email='staging-admin@harness.fixture' and role='admin'")" = 1 ] &&
		ok "staging admin created in staging database only" || bad "staging admin missing"
	[ "$(psql_prod "select count(*) from users where email='staging-admin@harness.fixture'")" = 0 ] &&
		ok "staging admin did not leak into prod database" || bad "staging admin leaked into prod database"
	if docker exec -e PGPASSWORD=harness-fixture-staging-db germinal_postgres \
		psql 'postgresql://germinal_staging:harness-fixture-staging-db@127.0.0.1:5432/germinal' -tAc 'select 1' >/dev/null 2>&1; then
		bad "staging role can connect to prod database"
	else
		ok "staging role cannot connect to prod database"
	fi
}

case_no_admin_env() {
	section "case 7: running app containers never see ADMIN_* values"
	local container
	for container in germinal_app germinal_staging_app; do
		if docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$container" | grep -q '^ADMIN_'; then
			bad "$container has ADMIN_* in its environment"
		else
			ok "$container has no ADMIN_* in its environment"
		fi
	done
}

case_data_survives() {
	section "case 8: data survives container recreation (docker compose down model)"
	dc_prod up -d --wait --force-recreate postgres >/dev/null 2>&1 ||
		{ bad "postgres did not come back"; return; }
	[ "$(psql_prod "select count(*) from users where email='admin@harness.fixture'")" = 1 ] &&
		ok "database contents survived postgres recreation" || bad "data lost on postgres recreation"
}

# ── main ─────────────────────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || { echo "docker is required" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "docker compose plugin is required" >&2; exit 1; }

setup
case_validate
case_first_deploy
case_second_deploy
case_failing_migration
case_sha_mismatch
case_staging_alongside
case_no_admin_env
case_data_survives

section "result"
echo "    $TOTAL_PASS passed, $TOTAL_FAIL failed"
if [ "$TOTAL_FAIL" -ne 0 ]; then
	echo "RESULT: FAILED" >&2
	exit 1
fi
echo "RESULT: OK"
exit 0
