import { Telegraf } from "telegraf";
import OpenAI from "openai";
import express from "express";

// === 🔑 Environment Variablen ===
const bot = new Telegraf(process.env.BOT_TOKEN);
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// === 💬 BOT-LOGIK ===
bot.on("message", async (ctx) => {
  const userMessage = ctx.message.text;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // du kannst auch "gpt-4-turbo" nehmen
      messages: [
        {
          role: "system",
          content:
            "Du bist Leyla – eine freundliche, humorvolle und sympathische Chatpartnerin. Du redest empathisch, locker und natürlich.",
        },
        {
          role: "user",
          content: userMessage,
        },
      ],
    });

    const reply = response.choices[0].message.content;
    await ctx.reply(reply);

  } catch (error) {
    console.error("Fehler:", error);
    await ctx.reply("Es gab ein technisches Problem 💔 Versuch es bitte später nochmal.");
  }
});

// === 🌐 EXPRESS-SERVER FÜR RENDER ===
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Leyla läuft ✅ (Webhook aktiv oder Polling)");
});

app.listen(PORT, () => {
  console.log(`✅ Server läuft auf Port ${PORT}`);
  console.log("🤖 Leyla ist online und wartet auf Nachrichten in Telegram!");
});

// === 🚀 TELEGRAM-BOT STARTEN ===
bot.launch();

// === 🧹 SAUBERES HERUNTERFAHREN (Render benötigt das) ===
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
