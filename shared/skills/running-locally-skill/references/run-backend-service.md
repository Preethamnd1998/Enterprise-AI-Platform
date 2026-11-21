# Running one Spring Boot service locally (start-local.bat / STS run configuration / Feign URLs)

## Which environment the code targets: development vs other branches

- **`development` branch (Canary dev)** runs in **Docker** with Consul + Config Server: `bootstrap.yml` has
  `consul.host: ${CONSUL_HOST:canary-dev.lifetrenz.com}`, `PROFILE:development`, and the pom has no
  Kubernetes dependency. Everything in this skill (start-local, STS config, hybrid) is written for that.
- **V2-QA and every other environment (stable, Medvista, Aster, ...)** run in **Kubernetes**. Their
  `bootstrap.yml` uses `${SPRING_APPLICATION_NAME}`, `${SPRING_PROFILE_ACTIVE}`,
  `${SPRING_CLOUD_CONIFG_ENABLED}` (sic) and a `kubernetes:` block, and the pom carries
  `spring.cloud.kubernetes`. These do not start locally as-is: no Consul/Config Server, and the env vars
  are unset.
- **Running a non-development branch locally (temporary, never committed):**
  1. Copy `pom.xml` and `src/main/resources/bootstrap.yml` from the `development` branch of that service
     over the working copies (e.g. `git show development:pom.xml > pom.xml`, same for bootstrap.yml; the
     `dev/BE/<service>` worktree has them).
  2. Run it as usual (`start-local`, STS or `mvn spring-boot:run`).
  3. **Do not commit those two files.** Before committing anything: `git restore pom.xml
     src/main/resources/bootstrap.yml` (or `git update-index --assume-unchanged` while working, undone
     afterwards), and check `git status` / `git diff --stat` shows neither file. If the real change
     needs a pom/bootstrap edit, stash the dev copies first, make the edit on the branch's own files,
     then reapply the dev copies.
  Also remember the dev copies pull in dev-only dependency/profile differences, so a successful local run
  proves the code, not the Kubernetes config.

Run a backend service locally, from a terminal, using `UI-BE/start-local.bat`:

```
.\start-local.bat core-service          # builds (mvn package -DskipTests) then runs
.\start-local.bat core-service run-only # skips the build, just runs the existing jar
```

Supported service directory names (from the script): `ipd-service`,
`core-service`, `auth-service`, `appointment-service`,
`user-management-service`, `gateway-service`, `rcm-service`,
`provider-postbox`, `clinical-service`, `inventory-service`, `audit-service`,
`blood-bank-service`, `clinical-common-service`, `clinical-workflow-service`,
`ipd-clinical-service`, `report-service`, `roster-mgmt-service`, `file-store`,
`supplementary-service`, `relay`, `notification-service`. The script resolves
the service name to a config file `{app-name}-development.properties` under
`C:\config-repo-local` (e.g. `core-service` → `core-development.properties`) —
this must exist (copy/point it at `UI-BE/config-repo-local` if running from a
fresh checkout; the script's `CONFIG_REPO` variable defaults to
`C:\config-repo-local` but has a commented-out alternative pointing at the
repo's own `config-repo-local` folder).

**Or run it from STS/Eclipse** as a Java Application run configuration:

Environment variables:
```
CONFIG_APP_NAME=config-service
CONSUL_HOST=canary-dev.lifetrenz.com
PROFILE=development
```

Program/VM arguments:
```
-Dspring.cloud.config.enabled=false
-Dspring.cloud.config.fail-fast=false
-Dspring.cloud.consul.discovery.enabled=false
-Dspring.cloud.consul.discovery.register=false
-Dspring.cloud.consul.config.enabled=false
-Dspring.cloud.config.discovery.enabled=false
-Dspring.cloud.bus.enabled=false
-Dspring.cloud.stream.enabled=false
-Dspring.config.import=optional:file:C:/config-repo-local/core-development.properties
-Dkafka-bootstrap-servers=canary-dev.lifetrenz.com:9092
```

(Substitute the service's own config filename in `spring.config.import`.) This
is the same strategy `start-local.bat` automates: Consul/Config-Server/Bus/Stream
disabled, config loaded from the local properties file directly, Kafka pointed
at the shared dev broker.

**Feign calls need an explicit URL.** With Consul discovery disabled locally,
Feign falls back to `SimpleDiscoveryClient`, which needs each target service's
address given explicitly — either a JVM arg per service:
`-Dspring.cloud.discovery.client.simple.instances.<name>[0].uri=http://127.0.0.1:<port>`
(see `start-local.bat` for the full set, keyed by the short names in the port
table above), or `http://<gateway-host>/api-gateway/<service>` if routing
through a gateway instead. Forgetting this is the most common cause of a
locally-run service failing to call another one.
