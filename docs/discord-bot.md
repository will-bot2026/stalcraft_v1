# UltimateBuild Discord bot

UltimateBuild includes a local Discord bot that guides a user through the same practical choices as the site dropdowns, runs the existing optimizer with those choices, and posts the resulting artifact build/stat data back into Discord.

## What the bot asks

1. Objective/stat #1 from the site objective dropdown
2. Optional objective/stat #2
3. Optional objective/stat #3
4. Container/backpack from the site container dropdown
5. Budget ceiling (`5m`, `2500000`, or `none`)
6. Quality assumption (`100`, `145`, `175`, or `default`)
7. Upgrade level (`0`, `5`, `10`, `15`, or `default`)
8. Optional rarity filter (`rare`, `legendary or higher`, `exclusive or lower`, or `none`)

After the final answer it calls the same SvelteKit optimizer path used by the web app, then replies with:

- status/safety
- cost and budget
- container
- artifacts with level/quality/rarity
- final stat lines
- a local URL with the selected site controls encoded in the query string

## Local run

From the repo root:

```bash
# 1) Start the web UI
pnpm --filter @ultimatebuild/web dev

# 2) In another terminal, start the Discord bot
pnpm discord:bot
```

Expected bot startup log:

```text
UltimateBuild Discord bot logged in as <bot tag>
```

## Private env file

The bot token is intentionally not committed.

Set `ULTIMATEBUILD_DISCORD_ENV` to a private env file path, or use the default path:

```text
~/.config/ultimatebuild/discord-bot.env
```

Example private env file:

```bash
ULTIMATEBUILD_DISCORD_TOKEN=replace_with_discord_bot_token
ULTIMATEBUILD_ROOT="/absolute/path/to/stalcraft_v1"
ULTIMATEBUILD_LOCAL_URL="http://127.0.0.1:5173"
```

Recommended permissions:

```bash
chmod 600 ~/.config/ultimatebuild/discord-bot.env
```

`ULTIMATEBUILD_ROOT` is recommended because package scripts may run from inside `apps/discord-bot`; the bot needs the repo root to find `data/normalized/containers.json`, `data/normalized/artifacts.json`, and the web optimizer module.

## Discord usage

- DM the bot: `build`
- Mention it in a server: `@UltimateBuild build`
- Use prefix commands where the bot can read messages: `!build`, `!ultimatebuild`, or `!stalcraft`
- After the flow starts, reply normally in the same channel with option numbers or text answers.
- Reply `cancel`/`reset`/`stop` to clear the current guided setup.

Example:

```text
!build
1
skip
skip
Hive
5m
145
15
none
```

## Discord application settings needed

In the Discord Developer Portal for the bot:

- Enable **Message Content Intent**.
- Enable **Server Members Intent** only if later needed; it is not required for this guided bot.
- Invite permissions/scopes:
  - scopes: `bot`
  - permissions: `View Channels`, `Send Messages`, `Read Message History`
  - `applications.commands` is only needed if slash commands are added later

## Verification commands

```bash
pnpm typecheck
node --import tsx -e "import('./apps/discord-bot/src/build-flow.ts').then(async m => { const { containers } = await m.loadCatalogs(process.cwd()); const q = m.questions(containers); const result = m.applyAnswer(m.initialState(), q[0], '1'); console.log(result.error ?? `next step ${result.state.step}`); })"
```

Expected answer-flow simulation output:

```text
next step 1
```

## More detail

- Full model handoff: `docs/discord-feature-qwen-readme.md`
- Implementation/process notes: `docs/discord-bot-implementation-process.md`
