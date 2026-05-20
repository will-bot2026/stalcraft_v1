import { Client, GatewayIntentBits, Partials, Events, Message } from 'discord.js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { applyAnswer, initialState, loadCatalogs, questions, renderQuestion, runBuild, type BuildAnswerState } from './build-flow.js';

type Env = Record<string, string>;

function parseEnvFile(path: string): Env {
  if (!existsSync(path)) return {};
  const env: Env = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    let value = rest.join('=').trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (value) env[key!.trim()] = value;
  }
  return env;
}

const privateEnvPath = process.env.ULTIMATEBUILD_DISCORD_ENV ?? join(homedir(), '.config/ultimatebuild/discord-bot.env');
const privateEnv = parseEnvFile(privateEnvPath);
const root = process.env.ULTIMATEBUILD_ROOT ?? privateEnv.ULTIMATEBUILD_ROOT ?? process.cwd();
const env = {
  ...parseEnvFile(join(root, '.env.local')),
  ...privateEnv,
  ...process.env,
};
const localBaseUrl = env.ULTIMATEBUILD_LOCAL_URL ?? 'http://127.0.0.1:5173';
const token = env.ULTIMATEBUILD_DISCORD_TOKEN ?? env.DISCORD_BOT_TOKEN;

if (!token) {
  console.error(`Missing ULTIMATEBUILD_DISCORD_TOKEN. Put it in ${privateEnvPath} or export DISCORD_BOT_TOKEN.`);
  process.exit(1);
}

const sessions = new Map<string, BuildAnswerState>();
const { containers } = await loadCatalogs(root);
const questionList = questions(containers);

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

function cleanContent(message: Message): string {
  return message.content
    .replace(new RegExp(`<@!?${message.client.user!.id}>`, 'g'), '')
    .replace(/^!(build|ultimatebuild|stalcraft)\b/i, '')
    .trim();
}

async function sendNextQuestion(message: Message, state: BuildAnswerState): Promise<void> {
  const question = questionList[state.step];
  if (!question) {
    await message.reply('Calculating your build now…');
    const summary = await runBuild(state, root, localBaseUrl);
    sessions.delete(sessionKey(message));
    await message.reply(summary.content);
    return;
  }
  await message.reply(renderQuestion(question));
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`UltimateBuild Discord bot logged in as ${readyClient.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
  if (!shouldHandle(message)) return;
  try {
    const content = cleanContent(message);
    if (/^(cancel|stop|reset)$/i.test(content)) {
      sessions.delete(sessionKey(message));
      await message.reply('Canceled the current UltimateBuild setup. Send `!build` or DM me to start again.');
      return;
    }

    const key = sessionKey(message);
    let state = sessions.get(key);
    if (!state || /^$/i.test(content) || /^(start|new|build)$/i.test(content)) {
      state = initialState();
      sessions.set(key, state);
      await message.reply('Starting a guided UltimateBuild setup. Reply `cancel` anytime to stop.');
      await sendNextQuestion(message, state);
      return;
    }

    const question = questionList[state.step];
    if (!question) {
      await sendNextQuestion(message, state);
      return;
    }
    const updated = applyAnswer(state, question, content);
    if (updated.error) {
      await message.reply(`${updated.error}\n\n${renderQuestion(question)}`);
      return;
    }
    sessions.set(key, updated.state);
    await sendNextQuestion(message, updated.state);
  } catch (error) {
    console.error(error);
    await message.reply(`UltimateBuild bot error: ${error instanceof Error ? error.message : String(error)}`);
  }
});

await client.login(token);
