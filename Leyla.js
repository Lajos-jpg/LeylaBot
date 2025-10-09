import { Telegraf } from "telegraf";
import OpenAI from "openai";

// Ersetze diese beiden Strings mit deinen echten Schlüsseln:
const bot = new Telegraf("8368171133:AAG7rnNQ2OLKDUpGBmI59hkaiqVvaAch6jw");
const openai = new OpenAI({ apiKey: "8368171133:AAG7rnNQ2OLKDUpGBmI59hkaiqVvaAch6jw" });

// Wenn eine Nachricht kommt:
bot.on("message", async (ctx) => {
  const userMessage = ctx.message.text;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // oder "gpt-4-turbo" falls verfügbar
      messages: [
        {
          role: "system",
          content:
            "Du bist Leyla – eine freundliche, humorvolle und sympathische Chatpartnerin. Du redest natürlich und einfühlsam.",
        },
        { role: "user", content: userMessage },
      ],
    });

    ctx.reply(response.choices[0].message.content);
  } catch (error) {
    console.error("Fehler bei der Antwort:", error);
    ctx.reply("Entschuldige, Leyla hatte gerade ein technisches Problem 🤖");
  }
});

bot.launch();

console.log("🤖 Leyla ist online und wartet auf Nachrichten in Telegram!");