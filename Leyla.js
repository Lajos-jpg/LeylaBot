import { Telegraf } from "telegraf";
import OpenAI from "openai";
import express from "express";

// === 🌍 ENV-Konfiguration ===
const bot = new Telegraf(process.env.BOT_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const app = express();
const PORT = process.env.PORT || 3000;

// === 🧠 Temporäres Gedächtnis (pro Chat) ===
const userMemory = new Map();

// === 💬 /about – Vorstellung ===
bot.command("about", (ctx) => {
  ctx.replyWithMarkdown(
    "*Hey, ich bin Leyla!* 🌸\n\n" +
      "Ich bin eine freundliche, humorvolle und empathische Gesprächspartnerin. 💬\n" +
      "Ich höre dir zu, motiviere dich und helfe dir mit Rat, Spaß oder einfach einem ehrlichen Gespräch.\n\n" +
      "_Mein Ziel ist, dass sich unser Chat natürlich, warm und echt anfühlt._ 💫"
  );
});

// === 🆘 /help – Hilfe ===
bot.command("help", (ctx) => {
  ctx.reply(
    "🧭 *Ich kann Folgendes für dich tun:*\n\n" +
      "• /about – erzähle dir, wer ich bin 💁‍♀️\n" +
      "• /reset – starte das Gespräch neu 🔄\n" +
      "• /help – zeige diese Übersicht 📘\n\n" +
      "Oder schreib mir einfach frei – ich erkenne automatisch deine Sprache 🌍."
  );
});

// === 🔄 /reset – Gespräch löschen ===
bot.command("reset", (ctx) => {
  userMemory.delete(ctx.chat.id);
  ctx.reply("🆕 Neues Gespräch gestartet. Womit möchtest du beginnen?");
});

// === 💡 Nachrichtenerkennung & natürliche Antworten ===
bot.on("message", async (ctx) => {
  const userMessage = ctx.message.text;
  const chatId = ctx.chat.id;

  // vorherige Gespräche merken
  const history = userMemory.get(chatId) || [];
  history.push({ role: "user", content: userMessage });
  userMemory.set(chatId, history.slice(-10)); // nur letzte 10 Nachrichten speichern

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Du bist Leyla – eine warmherzige, emotionale, natürliche Gesprächspartnerin. " +
            "Du erkennst automatisch die Sprache des Benutzers und antwortest in derselben Sprache. " +
            "Du redest locker, empathisch, manchmal mit einem kleinen Hauch Humor. " +
            "Wenn der Nutzer traurig klingt, tröste ihn sanft. " +
            "Wenn er motiviert ist, feuere ihn liebevoll an. " +
            "Wenn er flirtet, bleib charmant, aber respektvoll. 💕",
        },
        ...history,
      ],
    });

    const reply = response.choices[0].message.content;
    await ctx.reply(reply);
  } catch (err) {
    console.error("⚠️ Fehler bei Antwort:", err);
    await ctx.reply("Oh nein 😢 Es gab gerade ein technisches Problem. Versuch’s gleich nochmal!");
  }
});

// === 🌐 Webhook-Konfiguration für Render ===
const WEBHOOK_PATH = /${process.env.BOT_TOKEN};
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
const WEBHOOK_URL = ${RENDER_URL}${WEBHOOK_PATH};

await bot.telegram.setWebhook(WEBHOOK_URL);
app.use(bot.webhookCallback(WEBHOOK_PATH));

// Test-Route
app.get("/", (req, res) => {
  res.send("✅ Leyla ist aktiv – mit Persönlichkeit & Mehrsprachigkeit 💬");
});

// Server starten
app.listen(PORT, () => {
  console.log(`🚀 Server läuft auf Port ${PORT}`);
  console.log(`🌐 Webhook aktiv unter: ${WEBHOOK_URL}`);
});

// Sauberes Beenden
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
