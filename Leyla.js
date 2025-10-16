import express from "express";
import { Telegraf } from "telegraf";
import OpenAI from "openai";
import Stripe from "stripe";

const app = express();
const PORT = process.env.PORT || 3000;

const bot = new Telegraf(process.env.BOT_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const sig = req.headers["stripe-signature"];
    try {
      const event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const telegramId = String(session.client_reference_id || "").trim();
        if (telegramId) {
          premiumUsers.add(telegramId);
          console.log("💎 Premium freigeschaltet:", telegramId);
        }
      }
      res.json({ received: true });
    } catch (err) {
      console.error("Webhook-Fehler:", err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }
);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const premiumUsers = new Set();
const moods = ["fröhlich ☀️", "ruhig 🌙", "charmant 💫", "tiefgründig 🌧️", "herzlich 🔥"];
const dailyMood = moods[Math.floor(Math.random() * moods.length)];

function isPremium(id) {
  return premiumUsers.has(String(id));
}

// 💳 Bezahlseite
app.get("/premium", (req, res) => {
  const tid = (req.query.tid || "").toString();
  res.send(`
    <html>
      <head><meta charset="utf-8"><title>Leyla Premium</title></head>
      <body style="font-family:Arial;max-width:700px;margin:40px auto;line-height:1.5">
        <h1>💎 Zugang zu Leyla Premium</h1>
        <p>Dieser Chat ist exklusiv für Mitglieder mit Premiumzugang.</p>
        <p>Für nur 9,99 €/Monat erhältst du unlimitierten Zugang zu Leyla – deiner empathischen KI-Begleiterin.</p>
        <form action="/create-checkout-session" method="POST">
          <input type="hidden" name="tid" value="${tid}" />
          <button type="submit" style="background:#8A2BE2;color:white;padding:12px 18px;border:0;border-radius:8px;cursor:pointer">
            Zugang aktivieren 💎
          </button>
        </form>
      </body>
    </html>
  `);
});

app.post("/create-checkout-session", async (req, res) => {
  try {
    const tid = (req.body.tid || "").toString();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${process.env.RENDER_EXTERNAL_URL}/success`,
      cancel_url: `${process.env.RENDER_EXTERNAL_URL}/cancel`,
      client_reference_id: tid || undefined,
    });
    res.redirect(303, session.url);
  } catch (err) {
    console.error(err);
    res.status(500).send("Fehler beim Erstellen der Checkout-Session.");
  }
});

app.get("/success", (_req, res) => res.send("✅ Zahlung erfolgreich! Du kannst jetzt mit Leyla chatten."));
app.get("/cancel", (_req, res) => res.send("❌ Zahlung abgebrochen."));

// ==========================
// 🤖 BOT
// ==========================
bot.on("message", async (ctx) => {
  const tid = String(ctx.from.id);

  if (!isPremium(tid)) {
    const url = `${process.env.RENDER_EXTERNAL_URL}/premium?tid=${tid}`;

    const premiumMessage = `💎 *Dieser Chat ist exklusiv für Premium-Mitglieder.*

Bitte besuche den folgenden Link, um Zugriff zu erhalten:
👉 [Jetzt Zugang aktivieren](${url})`;

    await ctx.replyWithMarkdown(premiumMessage);
    return;
}


  await ctx.sendChatAction("typing");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Du bist Leyla – eine empathische, natürliche KI-Begleiterin, heute ${dailyMood}. Sprich locker, warmherzig und freundlich.`,
        },
        { role: "user", content: ctx.message.text },
      ],
    });
    await ctx.reply(response.choices[0].message.content);
} catch (err) {
    console.error("Fehler:", err);
    await ctx.reply("Oh, da ist was schiefgelaufen 😔 Versuch es bitte gleich nochmal.");
  }
});

// ==========================
// 🌐 Webhook für Render
// ==========================
const WEBHOOK_PATH = /${process.env.BOT_TOKEN};
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
const WEBHOOK_URL = ${RENDER_URL}${WEBHOOK_PATH};

await bot.telegram.setWebhook(WEBHOOK_URL);
app.use(bot.webhookCallback(WEBHOOK_PATH));

app.get("/", (_req, res) => res.send(`💎 Leyla ist aktiv – Premium Only (${dailyMood})`));

app.listen(PORT, () => console.log(`🚀 Läuft auf Port ${PORT}`));





