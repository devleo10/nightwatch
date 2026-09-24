# @devleo10/nightwatch-core

Classifier interface, safety policy, and decision log for Nightwatch.

```bash
npm install @devleo10/nightwatch-core
```

Most apps should install `@devleo10/nightwatch` and import `RulesProvider` from `@devleo10/nightwatch/bullmq`. Use this package when you want `RulesProvider`, `HttpProvider`, `applyPolicy`, or `JsonlDecisionStore` without BullMQ.

`JevProvider` sends one Jev Choice for a failed job. Set `authorization` to `Bearer $TYPESAFE_API_KEY`. `CascadeProvider([new RulesProvider(), jev])` asks the rules first and Jev only when they are unsure.

Guide: https://github.com/devleo10/nightwatch/blob/main/AGENTS.md
