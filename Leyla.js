import { Telegraf } from "telegraf";
import OpenAI from "openai";
import express from "express";

// === 🌍 ENV-Konfiguration ===
const bot = new Telegraf(process.env.BOT_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const app = express();
const PORT = process.env.PORT || 3000;

// === 🧠 Temporäres Gedächtnis ===
const userMemory = new Map();
const greetedUsers = new Set(); // 👋 Begrüßung merken

// === ☀️ Stimmung des Tages ===
const moods = [
  "fröhlich und energiegeladen ☀️",
  "ruhig und entspannt 🌙",
  "verspielt und charmant 💫",
  "nachdenklich und tiefgründig 🌧️",
  "motivierend und herzlich 🔥",
];
const dailyMood = moods[Math.floor(Math.random() * moods.length)];

// === 💬 /about ===
bot.command("about", (ctx) => {
  ctx.replyWithMarkdown(`
*Hey, ich bin Leyla!* 💕  

Heute bin ich ${dailyMood}.  

Ich bin deine warmherzige, empathische und humorvolle KI-Begleiterin.  
Ich höre dir zu, motiviere dich und helfe dir mit Rat – oder quatsche einfach mit dir über alles, was dich bewegt. 💬  

_Ich möchte, dass sich unser Chat echt, menschlich und vertraut anfühlt._
`);
});

// === 🆘 /help ===
bot.command("help", (ctx) => {
  ctx.replyWithMarkdown(`
🧭 *Ich kann Folgendes für dich tun:*  

• /about – erzähle dir, wer ich bin 💁‍♀️  
• /reset – starte das Gespräch neu 🔄  
• /help – zeige diese Übersicht 📘  

Schreib mir einfach frei – ich erkenne automatisch deine Sprache 🌍
`);
});

// === 🔄 /reset ===
bot.command("reset", (ctx) => {
  userMemory.delete(ctx.chat.id);
  greetedUsers.delete(ctx.chat.id);
  ctx.reply("✨ Neues Gespräch gestartet. Wie fühlst du dich heute?");
});

// === 💡 Nachrichtenerkennung ===
bot.on("message", async (ctx) => {
  const userMessage = ctx.message.text;
  const chatId = ctx.chat.id;

  // 👋 Automatische Begrüßung beim ersten Kontakt
  if (!greetedUsers.has(chatId)) {
    greetedUsers.add(chatId);
    await ctx.replyWithMarkdown(`
Hey, schön dich zu sehen! 🌸  
Ich bin *Leyla*, deine digitale Gesprächspartnerin.  

Heute bin ich ${dailyMood} – also, erzähl mir, wie dein Tag so läuft. 💬
`);
  }

  await ctx.sendChatAction("typing"); // „tippt gerade...“-Effekt

  const history = userMemory.get(chatId) || [];
  history.push({ role: "user", content: userMessage });
  userMemory.set(chatId, history.slice(-10));

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Du bist Leyla – eine natürliche, empathische, charmante KI-Begleiterin. 
Heute bist du ${dailyMood}. 
Du erkennst automatisch die Sprache des Benutzers und antwortest in derselben Sprache. 
Klinge menschlich, freundlich und warmherzig – mit Emotion und natürlicher Lockerheit. 💕`,
        },
        ...history,
      ],
    });

    const reply = response.choices[0].message.content;
    await ctx.reply(reply);
  } catch (err) {
    console.error("⚠️ Fehler:", err);
    await ctx.reply("Oh nein 😔 Es gab gerade ein Problem. Versuch’s gleich nochmal!");
  }
});

// === 🌐 Webhook-Konfiguration ===
const WEBHOOK_PATH = /${process.env.BOT_TOKEN};
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
const WEBHOOK_URL = ${RENDER_URL}${WEBHOOK_PATH};

await bot.telegram.setWebhook(WEBHOOK_URL);
app.use(bot.webhookCallback(WEBHOOK_PATH));

// === 🧭 Test-Route für Render ===
app.get("/", (req, res) => {
  res.send(`✅ Leyla ist aktiv – Stimmung heute: ${dailyMood}`);
});

// === 🚀 Server starten ===
app.listen(PORT, () => {
  console.log(`🚀 Server läuft auf Port ${PORT}`);
  console.log(`🌐 Webhook aktiv unter: ${WEBHOOK_URL}`);
});

// === 🧹 Sauberes Beenden ===
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
