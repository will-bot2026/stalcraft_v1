# Discord Bot Implementation Process

This document records the process used to incorporate the UltimateBuild Discord bot, including Discord Developer Portal setup, local integration, secret handling, verification, and the response-flow bug found during live testing.

## Objective

Add a Discord bot that can chat with a user, ask the same build questions exposed by the UltimateBuild site controls, run the existing optimizer, and post the build result plus stat data back into Discord.

The goal was not to build a second optimizer. The Discord bot is a chat interface over the existing local web/app optimizer logic.

## Implementation overview

1. Add a new monorepo workspace package under `apps/discord-bot`.
2. Use `discord.js` for Discord Gateway/message handling.
3. Load the same normalized STALCRAFT data used by the web app.
4. Reuse existing objective option catalog logic from `packages/stalcraft-nlp`.
5. Import the existing SvelteKit server optimizer from `apps/web/src/routes/+page.server.ts`.
6. Build a guided questionnaire that maps Discord replies into optimizer state.
7. Return a Discord message with the selected artifacts, stats, cost/budget/status, and a local URL matching the selected controls.
8. Keep all Discord secrets outside the repository.

## Discord Developer Portal setup

The Discord application was created through the Discord Developer Portal.

Required portal steps:

1. Create a Discord application for UltimateBuild.
2. Add or create a bot user.
3. Reset/copy the bot token once.
4. Store the token in a private local env file, not in the repo.
5. Enable **Message Content Intent**.
6. Invite the bot to the target Discord server with permissions to view channels, send messages, and read message history.

Why Message Content Intent is required:

- The current bot implementation reads normal text replies such as `1`, `skip`, and `Hive`.
- Without Message Content Intent, Discord will not provide normal message content for many guild/server messages.

## Secret handling

No Discord token, password, API key, or credential should be committed.

The bot reads its private environment from:

```text
$ULTIMATEBUILD_DISCORD_ENV
```

or, if unset:

```text
~/.config/ultimatebuild/discord-bot.env
```

Example private env file shape:

```bash
ULTIMATEBUILD_DISCORD_TOKEN=replace_with_token
ULTIMATEBUILD_ROOT="/absolute/path/to/stalcraft_v1"
ULTIMATEBUILD_LOCAL_URL="http://127.0.0.1:5173"
```

Recommended file permissions:

```bash
chmod 600 ~/.config/ultimatebuild/discord-bot.env
```

The repository `.gitignore` already excludes `.env`, `.env.*`, logs, and local temp/cache directories.

## Files added or changed

### `apps/discord-bot/package.json`

Defines the private Discord bot workspace package and the `discord.js` dependency.

### `apps/discord-bot/src/index.ts`

Main bot process:

- Parses env files.
- Resolves repo root.
- Loads the bot token.
- Starts a Discord.js client.
- Handles DMs, mentions, and `!build`/`!ultimatebuild`/`!stalcraft` messages.
- Tracks questionnaire sessions by channel+user.
- Sends questions and final build results.

### `apps/discord-bot/src/build-flow.ts`

Build questionnaire and optimizer bridge:

- Generates build questions from site/catalog data.
- Parses user replies.
- Converts answers into optimizer prompt/search params.
- Calls the existing web optimizer module.
- Formats the build result for Discord.

### `package.json`

Adds:

```json
"discord:bot": "pnpm --filter @ultimatebuild/discord-bot start"
```

### `pnpm-lock.yaml`

Updated to include `discord.js` and its dependency tree.

### `docs/discord-bot.md`

Operational README for setup and local usage.

### `docs/discord-feature-qwen-readme.md`

Full implementation handoff intended for Qwen 3.6 or another compact model.

### `docs/discord-bot-implementation-process.md`

This file.

## Issue encountered: bot did not respond after first answer

Observed behavior:

1. User typed `!build` in Discord.
2. Bot responded and asked the first build question.
3. User replied `1`.
4. Bot did not visibly respond.

Root cause:

The original message gate only handled messages if they were:

- DMs,
- bot mentions, or
- prefix commands like `!build`.

A plain answer like `1` in a server channel matched none of those conditions. The bot had an in-memory session for the user, but `shouldHandle()` returned false before the answer could be applied.

Fix:

- Introduce `sessionKey(message)` using `${channel.id}:${author.id}`.
- Check `sessions.has(sessionKey(message))` before requiring a DM, bot mention, or prefix command.
- Change all session map get/set/delete operations to use the same session key.

Result:

- After a user starts with `!build`, normal replies in that same channel now continue the questionnaire.
- Session scope is still safe because it is limited to one channel+user pair.

## Important implementation detail: env/root ordering

A startup bug was found before the bot was considered working.

Problem:

- The bot needed to load data from the repo root, such as `data/normalized/containers.json`.
- Package scripts can run with the current working directory effectively inside `apps/discord-bot`.
- If `root` is resolved before reading the private env file, the bot may search for data at `apps/discord-bot/data/normalized/...`, which does not exist.

Fix:

- Load the private env file first.
- Resolve root from `process.env.ULTIMATEBUILD_ROOT`, then private env `ULTIMATEBUILD_ROOT`, then `process.cwd()`.
- Load catalogs using the resolved root.

## Verification checklist

Commands and checks used:

```bash
pnpm typecheck
```

Local web check:

```bash
curl -I http://127.0.0.1:5173/
```

Bot startup check:

```bash
pnpm discord:bot
```

Expected startup log:

```text
UltimateBuild Discord bot logged in as <bot tag>
```

Discord live check:

1. Send `!build` in a channel where the bot is present.
2. Confirm it asks the first question.
3. Reply `1`.
4. Confirm it advances to the second question.
5. Continue through the flow and confirm it returns a result.

## Safe public-repo notes

Before making the repository public:

- Do not commit `.env`, `.env.local`, token files, temp captures, screenshots containing credentials, or logs.
- Do not hardcode Discord tokens, API keys, passwords, or user-specific token values.
- Keep setup docs generic and use placeholders like `replace_with_token`.
- It is acceptable to document that a Discord app/bot must be created, but do not include private token values.

## Future work

Recommended next steps:

- Add true `/build` slash command support.
- Add an end-to-end integration test for the questionnaire.
- Add embed-based Discord formatting.
- Add optional persistent session storage.
- Add production deployment docs if the bot moves off local machine.
