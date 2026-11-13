# Running one Spring Boot service locally (start-local.bat / STS run configuration / Feign URLs)

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
