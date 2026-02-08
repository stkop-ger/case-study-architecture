Use this layering strictly: controllers → services → repositories → entities.

No TypeORM access outside repositories/.

No Express req/res outside controllers/.

Put shared errors/types/logger/env/DI symbols in lib/.

Return DTOs from controllers; never return entities.

Validate all incoming request inputs; parse params/query explicitly.

Use typed errors from lib/errors and centralized error middleware.

Use Inversify with Symbol identifiers; constructor injection only; no container injection.

Transactions belong in services/; repositories may accept an optional EntityManager.

If using events/, services emit events via an EventBus interface in lib/; handlers live in events/.

Keep changes minimal; don’t refactor unrelated code; add/update tests with behavior changes.