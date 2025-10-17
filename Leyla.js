import express from "express";
import { Telegraf } from "telegraf";
import OpenAI from "openai";
import Stripe from "stripe";
import bodyParser from "body-parser";
import fs from "fs";

const app = express();
const PORT = process.env.PORT || 3000;

const bot = new Telegraf(process.env.BOT_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// =====================================
// 💾 PREMIUM USER - DATEI HANDLING
// =====================================
const premiumFile = "./premiumUsers.json";

let premiumUsers = new Set();
if (fs.existsSync(premiumFile)) {
  try {
    const data = JSON.parse(fs.readFileSync(premiumFile, "utf8"));
    premiumUsers = new Set(data);
    console.log(`💾 ${premiumUsers.size} Premium-User geladen.`);
  } catch (err) {
    console.error("❌ Fehler beim Laden von premiumUsers.json:", err);
  }
}

function savePremiumUsers() {
  try {
    fs.writeFileSync(premiumFile, JSON.stringify([...premiumUsers]), "utf8");
    console.log("✅ Premium-User gespeichert.");
  } catch (err) {
    console.error("❌ Fehler beim Speichern von Premium-Usern:", err);
  }
}

// =====================================
// 🧩 MIDDLEWARES
// =====================================
// ⚠️ Wichtig: JSON-Parser erst NACH dem Stripe-Webhook aktivieren,
// sonst wird der Request-Body verändert und Stripe kann die Signatur nicht prüfen.
app.use(express.urlencoded({ extended: true }));

// =====================================
// 💎 PREMIUM CHECK FUNKTION
// =====================================
const moods = ["fröhlich ☀️", "ruhig 🌙", "charmant 💫", "tiefgründig 🌧️", "herzlich 🔥"];
const dailyMood = moods[Math.floor(Math.random() * moods.length)];

function isPremium(id) {
  return premiumUsers.has(String(id));
}

// =====================================
// 💳 STRIPE WEBHOOK – Sandbox/Live Fix + Diagnose
// =====================================
app.post(
  "/webhook",
  bodyParser.raw({ type: "*/*" }),
  (req, res) => {
    console.log("📨 Anfrage von Stripe empfangen...");
    const sig = req.headers["stripe-signature"];
    console.log("Header stripe-signature:", sig);

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );

      console.log("✅ Webhook-Ereignis erkannt:", event.type);

      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        console.log("🧾 SESSION-DATEN:", session);

        const telegramId = String(session.client_reference_id || "").trim();
        if (telegramId) {
          premiumUsers.add(telegramId);
          savePremiumUsers();
          console.log("💎 Premium freigeschaltet:", telegramId);
        } else {
          console.log("⚠️ Keine Telegram-ID in session.client_reference_id gefunden");
        }
      }

      res.json({ received: true });
    } catch (err) {
      console.error("❌ Webhook-Fehler:", err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }
);

// =====================================
// ✅ Jetzt JSON aktivieren (nach dem Webhook!)
// =====================================
app.use(bodyParser.json());
app.use(express.json());

// =====================================
// 💰 BEZAHLSEITE
// =====================================
app.get("/premium", (req, res) => {
  const tid = (req.query.tid || "").toString();
  res.send(`
    <html>
      <head><meta charset="utf-8"><title>Leyla Premium</title></head>
      <body style="font-family:Arial;max-width:700px;margin:40px auto;line-height:1.5">
        <h1>💎 Zugang zu Leyla Premium</h1>
        <p>Dieser Chat ist exklusiv für Mitglieder mit Premiumzugang.</p>
        <p>Für nur <b>29,99 €/Monat</b> erhältst du unlimitierten Zugang zu Leyla – deiner empathischen KI-Begleiterin.</p>
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

// =====================================
// 🧾 CHECKOUT-SESSION ERSTELLEN
// =====================================
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

app.get("/success", (_req, res) =>
  res.send("✅ Zahlung erfolgreich! Du kannst jetzt mit Leyla chatten.")
);
app.get("/cancel", (_req, res) =>
  res.send("❌ Zahlung abgebrochen.")
);

// =====================================
// 🤖 TELEGRAM BOT LOGIK
// =====================================
bot.on("message", async (ctx) => {
  const tid = String(ctx.from.id);

  if (!isPremium(tid)) {
    const url = `${process.env.RENDER_EXTERNAL_URL}/premium?tid=${tid}`;
    const premiumMessage = `💎 *Dieser Chat ist exklusiv für Premium-Mitglieder.*

Bitte aktiviere deinen Zugang hier:
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

// =====================================
// 🌐 RENDER WEBHOOK
// =====================================
const WEBHOOK_PATH = `/${process.env.BOT_TOKEN}`;
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
const WEBHOOK_URL = `${RENDER_URL}${WEBHOOK_PATH}`;

bot.telegram.setWebhook(WEBHOOK_URL);
app.use(bot.webhookCallback(WEBHOOK_PATH));

app.get("/", (_req, res) =>
  res.send(`💎 Leyla ist aktiv – Premium Only (${dailyMood})`)
);

app.listen(PORT, () => console.log(`🚀 Läuft auf Port ${PORT}`));
