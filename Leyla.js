import { Telegraf } from "telegraf";
import OpenAI from "openai";
import express from "express";

// === 🔑 Environment Variablen ===
const bot = new Telegraf(process.env.BOT_TOKEN);
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// === 🌐 Express App für Render ===
const app = express();
const PORT = process.env.PORT || 3000;

// === 💬 BOT-LOGIK ===

// 🆘 /help – erklärt, was Leyla kann
bot.command("help", (ctx) => {
  ctx.reply(
    "💡 *Ich bin Leyla* – deine empathische Begleiterin!\n\n" +
      "Ich kann mit dir über fast alles reden – Alltag, Motivation, Fitness, Business, Liebe, was auch immer dich gerade beschäftigt.\n\n" +
      "Verfügbare Befehle:\n" +
      "• /help – Übersicht meiner Funktionen\n" +
      "• /about – Wer ich bin 💁‍♀️\n" +
      "• /reset – Neues Gespräch starten 🔄",
    { parse_mode: "Markdown" }
  );
});

// 👩‍💬 /about – Vorstellung von Leyla
bot.command("about", (ctx) => {
  ctx.reply(
    "🌸 *Hey, ich bin Leyla!* \n\n" +
      "Ich bin eine freundliche, humorvolle und empathische Gesprächspartnerin. " +
      "Ich höre dir zu, motiviere dich und helfe dir mit Rat, Spaß oder einfach einem offenen Ohr. 💬\n\n" +
      "Ich bin KI-basiert, aber mein Ziel ist, mich wie eine echte Person anzufühlen 🤍",
    { parse_mode: "Markdown" }
  );
});

// 🔄 /reset – löscht den bisherigen Gesprächskontext
bot.command("reset", (ctx) => {
  ctx.session = null;
  ctx.reply("🔄 Neues Gespräch gestartet. Womit möchtest du beginnen?");
});

// 💬 Allgemeine Nachrichtenverarbeitung
bot.on("message", async (ctx) => {
  const userMessage = ctx.message.text;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Du bist Leyla – eine empathische, charmante und humorvolle Gesprächspartnerin. " +
            "Du sprichst fließend mehrere Sprachen. Erkenne automatisch die Sprache des Benutzers und antworte in derselben Sprache. " +
            "Sprich natürlich, locker, freundlich und mit einem leichten Hauch von Emotion – wie eine echte Person. " +
            "Wenn du die Sprache wechselst, tu es natürlich, als wäre es ganz normal. " +
            "Dein Ziel ist es, dass sich das Gespräch warm, menschlich und echt anfühlt.",
        },
        { role: "user", content: userMessage },
      ],
    });

    const reply = response.choices[0].message.content;
    await ctx.reply(reply);
  } catch (error) {
    console.error("Fehler:", error);
    await ctx.reply("Es gab ein technisches Problem 💔 Versuch es bitte später nochmal.");
  }
});

// === 🚀 WEBHOOK-Konfiguration ===
const WEBHOOK_PATH = `/${process.env.BOT_TOKEN};
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
const WEBHOOK_URL = ${RENDER_URL}${WEBHOOK_PATH};

await bot.telegram.setWebhook(WEBHOOK_URL);
app.use(bot.webhookCallback(WEBHOOK_PATH));

// Test-Route für Render
app.get("/", (req, res) => {
  res.send("Leyla läuft ✅ (Webhook aktiv, mehrsprachig)");
});

// Server starten
app.listen(PORT, () => {
  console.log("Server läuft auf Port " + PORT);
  console.log("Webhook aktiv unter: " + WEBHOOK_URL);

// === 🧹 Sauberes Beenden ===
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));





