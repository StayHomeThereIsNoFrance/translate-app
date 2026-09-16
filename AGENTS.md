При реализации фич создавай отдельную ветку и коммить в нее на каждом шаге. Если тебя просят обновить только документацию, то создавать ветку не надо.

При проверке ui не поднимай его локально, а переключай приложение в coolify на эту ветку, делай коммит и пуш, и проверяй в coolify.

После одобрения пользователем делай мердж в `main`. Если в Coolify уже развернут
одобренный feature-коммит, сначала проверь, что его дерево и дерево нового `main`
совпадают: `scripts/classify-deployment-change.sh <deployed-feature-sha> main`
должен вернуть `deployment=none apk=none`. В этом случае после push только
переключи `git_branch` приложения в Coolify на `main` через Coolify MCP. Не
запускай deploy, redeploy или restart: уже работающий контейнер содержит то же
дерево. Если деревья различаются, классифицируй и разверни изменения обычным
путем.

Не запускай Coolify deployment для документации, ExecPlan, тестов, локальных
инструментов и прочих изменений, не входящих в production image. Автоматический
деплой ограничен watch paths из `config/deployment/coolify-watch-paths.txt`.

# ExecPlans

When writing complex features or significant refactors, use an ExecPlan (as described in docs/PLANS.md) from design to implementation.
