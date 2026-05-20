# UltimateBuild Discord Feature README for Qwen 3.6

This file is written as a complete handoff for a smaller/local model such as Qwen 3.6. It explains what changed, why it changed, which files are involved, how the bot works, how to run it locally, and what was verified.

## Feature summary

UltimateBuild now includes a local Discord bot package. The bot lets a Discord user answer the same build-selection questions represented by the web app's dropdowns, then uses the existing optimizer code from the SvelteKit site to compute and return a STALCRAFT artifact build directly in Discord.

The bot is intentionally local-first:

- It runs from this monorepo with `pnpm discord:bot`.
- It reads normalized STALCRAFT data from `data/normalized/`.
- It imports the same server-side optimizer helper used by the web app.
- It requires a Discord bot token supplied from local environment/private env files, never committed to the repo.
- It posts a Discord summary containing selected artifacts, stat output, budget/status data, and a local URL with equivalent site controls encoded as query params.

## User-facing Discord behavior

Supported ways to start:

- In a Discord server channel where the bot is present: `!build`
- Alternate prefixes: `!ultimatebuild` or `!stalcraft`
- Mention the bot and ask for a build.
- DM the bot.

The guided flow asks:

1. Primary build objective/stat
2. Optional second objective/stat
3. Optional third objective/stat
4. Container/backpack
5. Budget ceiling
6. Artifact quality assumption
7. Artifact upgrade level
8. Optional rarity filter

Users can reply with option numbers, text names, or natural short values like:

- `1`
- `movement speed`
- `skip`
- `Hive`
- `5m`
- `145`
- `15`
- `legendary or higher`

Users can cancel with:

- `cancel`
- `stop`
- `reset`

## Important bug fixed during testing

The first version responded to `!build` and asked the first question, but in a normal server channel it ignored plain follow-up replies such as `1`.

Root cause:

- The original `shouldHandle()` logic only accepted DMs, bot mentions, or prefix commands.
- After the bot asked a question, the user's normal answer did not mention the bot and did not start with `!build`, so Discord delivered the message but the bot ignored it.

Fix:

- Add a channel+user session key.
- If a session exists for that channel+user, handle plain messages before checking DM/mention/command requirements.
- Store, update, cancel, and complete sessions using the same channel+user key.

The key code is in `apps/discord-bot/src/index.ts`:

```ts
function sessionKey(message: Message): string {
  return `${message.channel.id}:${message.author.id}`;
}

function shouldHandle(message: Message): boolean {
  if (message.author.bot) return false;
  if (sessions.has(sessionKey(message))) return true;
  if (message.channel.isDMBased()) return true;
  const mentioned = message.mentions.users.has(message.client.user!.id);
  return mentioned || /^!(build|ultimatebuild|stalcraft)\b/i.test(message.content.trim());
}
```

Why channel+user instead of user-only:

- A Discord user may start separate bot flows in multiple channels or DMs.
- `${channel.id}:${author.id}` prevents one user's sessions from colliding across channels.

## Files changed or added

### `package.json`

Added the root script:

```json
"discord:bot": "pnpm --filter @ultimatebuild/discord-bot start"
```

Purpose:

- Gives the repo one command for running the Discord bot from the root.
- Keeps the bot packaged under `apps/discord-bot`.

### `pnpm-lock.yaml`

Updated by pnpm to include the Discord bot workspace dependency graph.

Important dependency added:

- `discord.js@14.23.2`

### `apps/discord-bot/package.json`

New private workspace package:

```json
{
  "name": "@ultimatebuild/discord-bot",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx src/index.ts",
    "start": "node --import tsx src/index.ts"
  },
  "dependencies": {
    "discord.js": "14.23.2"
  }
}
```

Purpose:

- Isolates Discord runtime code from the web app.
- Uses TypeScript directly through `tsx`/Node import support, matching the monorepo's existing tooling.

### `apps/discord-bot/src/index.ts`

Main Discord process.

Responsibilities:

- Load a private env file from `ULTIMATEBUILD_DISCORD_ENV` or the default user config path.
- Merge env sources in this order:
  1. repo `.env.local`
  2. private Discord env file
  3. process environment
- Resolve the repo root before loading catalogs.
- Read `ULTIMATEBUILD_DISCORD_TOKEN` or `DISCORD_BOT_TOKEN`.
- Create a Discord.js client with message-content capability.
- Track guided questionnaire state per channel+user.
- Start, cancel, advance, and complete build sessions.
- Call `runBuild()` and send the resulting build summary back to Discord.

Important details:

- The token is never hardcoded.
- The private env file path is configurable.
- Message Content Intent must be enabled in the Discord Developer Portal.
- `GatewayIntentBits.MessageContent` is required because this bot reads normal chat replies.
- DMs require `Partials.Channel`.

### `apps/discord-bot/src/build-flow.ts`

Questionnaire and optimizer bridge.

Responsibilities:

- Load STALCRAFT containers and artifacts from normalized data files.
- Build the question list from existing site/catalog options.
- Render Discord-friendly question text.
- Match numeric or text answers to objective/container options.
- Convert answers into optimizer prompt/search params.
- Import the SvelteKit server optimizer module from `apps/web/src/routes/+page.server.ts`.
- Provide a local file-backed fetch for `/market/latest-NA.json` so the optimizer can run outside the web server request lifecycle.
- Format the result into a Discord-safe message under Discord's message length limit.

Key exported functions:

- `initialState()`
- `loadCatalogs(root)`
- `questions(containers)`
- `renderQuestion(question)`
- `applyAnswer(state, question, input)`
- `stateToSearchParams(state)`
- `stateToPrompt(state, containers)`
- `runBuild(state, root, localBaseUrl)`

### `docs/discord-bot.md`

Operator README for running and using the Discord bot locally.

### `docs/discord-feature-qwen-readme.md`

This complete implementation handoff for Qwen 3.6 or another local model.

### `docs/discord-bot-implementation-process.md`

Process narrative explaining how the Discord app/bot was created, how secrets were handled, what broke, and how the response bug was fixed.

## Environment and secret handling

Do not commit bot tokens, Discord passwords, API keys, `.env.local`, or generated secret files.

The bot reads secrets from:

```text
$ULTIMATEBUILD_DISCORD_ENV
```

If that variable is not set, it falls back to:

```text
~/.config/ultimatebuild/discord-bot.env
```

Expected private env values:

```bash
ULTIMATEBUILD_DISCORD_TOKEN=replace_with_discord_bot_token
ULTIMATEBUILD_ROOT="/absolute/path/to/stalcraft_v1"
ULTIMATEBUILD_LOCAL_URL="http://127.0.0.1:5173"
```

Notes:

- `ULTIMATEBUILD_DISCORD_TOKEN` is required unless `DISCORD_BOT_TOKEN` is exported.
- `ULTIMATEBUILD_ROOT` is recommended when launching from package scripts, because `process.cwd()` can otherwise point at `apps/discord-bot` instead of the repo root.
- `ULTIMATEBUILD_LOCAL_URL` controls the URL included in Discord result messages.

## Discord Developer Portal settings

Required:

- Create a Discord application.
- Add/create a bot user.
- Reset/copy the bot token once and store it in the private env file.
- Enable **Message Content Intent**.
- Invite the bot to the server with permissions to view channels, send messages, and read message history.

Recommended OAuth scopes:

- `bot`
- `applications.commands` only if slash commands are added later

The current implementation is message-prefix based, not slash-command based.

## Local runbook

From repo root:

```bash
pnpm install
pnpm --filter @ultimatebuild/web dev
```

In another terminal:

```bash
pnpm discord:bot
```

Expected bot startup log:

```text
UltimateBuild Discord bot logged in as <bot tag>
```

Then in Discord:

```text
!build
```

Reply to the first question:

```text
1
```

Expected behavior:

- The bot should ask the second optional objective question.
- Plain replies should continue the active session.

## Verification performed

Verification commands used after the implementation/fix:

```bash
pnpm typecheck
```

A local answer-flow simulation verified that answering the first question with `1` advances to step 1 and renders the second objective question.

The web app was checked locally at:

```text
http://127.0.0.1:5173/
```

The bot process was restarted after the session-handling fix so the running bot used the patched code.

## Known limitations and future improvements

Current limitations:

- No slash command registration yet; invite may include `applications.commands`, but the code currently uses text messages.
- Sessions are in memory. Restarting the bot clears active questionnaires.
- Discord results are trimmed to fit message size constraints.
- The bot is designed for local/private operation, not hosted production deployment yet.

Good next improvements:

- Add `/build` slash command support.
- Add persistent session storage if bot restarts become common.
- Add a compact embed output instead of plain text.
- Add logging that redacts IDs/content while still showing flow progress.
- Add an integration test that simulates the whole questionnaire and asserts result formatting.
