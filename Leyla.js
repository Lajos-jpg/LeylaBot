import express from "express";
import { Telegraf } from "telegraf";
import OpenAI from "openai";

// === 🧠 Konfiguration ===
const app = express();
const PORT = process.env.PORT || 10000;

const bot = new Telegraf(process.env.BOT_TOKEN);
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// === 💬 /help – Hilfe ===
bot.command("help", (ctx) => {
  ctx.reply(
    "👋 *Befehle, die du verwenden kannst:*\n\n" +
      "📖 /about – Vorstellung von Leyla\n" +
      "🔄 /reset – Neues Gespräch starten\n" +
      "💬 Einfach schreiben – Leyla antwortet automatisch!",
    { parse_mode: "Markdown" }
  );
});

// === 💫 /about – Vorstellung ===
bot.command("about", (ctx) => {
  ctx.reply(
    "💖 *Hey, ich bin Leyla!*\n\n" +
      "Ich bin eine freundliche, humorvolle und empathische Gesprächspartnerin. " +
      "Ich höre dir zu, motiviere dich und helfe dir mit Rat, Spaß oder einfach einem offenen Ohr. 🤗\n\n" +
      "Ich bin KI-basiert, aber mein Ziel ist es, mich wie eine echte Person anzufühlen – warm, menschlich und echt.",
    { parse_mode: "Markdown" }
  );
});

// === 🔄 /reset – Gespräch zurücksetzen ===
bot.command("reset", (ctx) => {
  ctx.session = null;
  ctx.reply("🧹 Neues Gespräch gestartet. Womit möchtest du beginnen?");
});

// === 💬 Nachrichtenverarbeitung ===
bot.on("message", async (ctx) => {
  const userMessage = ctx.message.text;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Du bist Leyla, eine warmherzige, charmante und mehrsprachige Gesprächspartnerin. " +
            "Erkenne automatisch die Sprache des Benutzers und antworte in dieser Sprache. " +
            "Sprich locker, freundlich und mit etwas Emotion – so, als wärst du eine echte Person.",
        },
        { role: "user", content: userMessage },
      ],
    });

    const reply = response.choices[0].message.content;
    await ctx.reply(reply);
  } catch (error) {
    console.error("Fehler:", error);
    await ctx.reply("⚠️ Es gab ein technisches Problem. Versuch es bitte später nochmal.");
  }
});

// === 🌐 Webhook-Konfiguration ===
const WEBHOOK_PATH = `/${process.env.BOT_TOKEN}`;
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
const WEBHOOK_URL = ${RENDER_URL}${WEBHOOK_PATH};

await bot.telegram.setWebhook(WEBHOOK_URL);
app.use(bot.webhookCallback(WEBHOOK_PATH));

// === Test-Route für Render ===
app.get("/", (req, res) => {
  res.send("✅ Leyla läuft (Webhook aktiv, mehrsprachig)");
});

// === 🚀 Server starten ===
app.listen(PORT, () => {
  console.log(`✅ Server läuft auf Port ${PORT}`);
  console.log(`🌍 Webhook aktiv unter: ${WEBHOOK_URL}`);
});

// === 🧹 Sauberes Beenden ===
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

