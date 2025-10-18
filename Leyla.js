import express from "express";
import { Telegraf } from "telegraf";
import OpenAI from "openai";
import Stripe from "stripe";
import bodyParser from "body-parser";
import fs from "fs";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================
// 🔧 INIT
// =====================================
const bot = new Telegraf(process.env.BOT_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const baseUrl = (process.env.RENDER_EXTERNAL_URL || "").replace(/\/$/, "");

// =====================================
// 💾 PREMIUM USER HANDLING
// =====================================
const premiumFile = "./premiumUsers.json";
let premiumUsers = new Set();
if (fs.existsSync(premiumFile)) {
  try {
    premiumUsers = new Set(JSON.parse(fs.readFileSync(premiumFile, "utf8")));
    console.log(`💾 ${premiumUsers.size} Premium-User geladen.`);
  } catch (err) {
    console.error("❌ Fehler beim Laden:", err);
  }
}
const savePremiumUsers = () =>
  fs.writeFileSync(premiumFile, JSON.stringify([...premiumUsers]), "utf8");
const isPremium = (id) => premiumUsers.has(String(id));

// =====================================
// 🧩 STRIPE WEBHOOKS
// =====================================
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
app.post("/webhook", bodyParser.raw({ type: "application/json" }), (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    console.log("✅ Webhook:", event.type);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const tid = String(session.client_reference_id || "").trim();
      if (tid) {
        premiumUsers.add(tid);
        savePremiumUsers();
        console.log("💎 Premium freigeschaltet:", tid);
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      const tid = sub.metadata?.telegram_id;
      if (tid && premiumUsers.has(tid)) {
        premiumUsers.delete(tid);
        savePremiumUsers();
        console.log("❌ Premium entfernt:", tid);
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error("❌ Webhook-Fehler:", err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// =====================================
// 💰 PREMIUM LANDINGPAGE
// =====================================
app.get("/premium", (req, res) => {
  const tid = (req.query.tid || "").toString();
  res.send(`
  <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
  <title>Leyla Premium</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;background:#faf8ff;color:#222;margin:0;padding:40px;text-align:center}
    h1{color:#6b21a8;} button{background:#7c3aed;color:#fff;padding:14px 24px;border:none;border-radius:8px;font-size:16px;cursor:pointer;}
    footer{margin-top:40px;font-size:13px;color:#777;} a{color:#7c3aed;text-decoration:none;}
  </style></head>
  <body>
    <h1>💎 Leyla Premium</h1>
    <p>Erhalte unlimitierten Zugang zu Leyla – deiner empathischen KI-Begleiterin.</p>
    <p><b>Nur 29,99 € / Monat</b></p>
    <form action="/create-checkout-session" method="POST">
      <input type="hidden" name="tid" value="${tid}" />
      <button type="submit">Jetzt Premium aktivieren 💳</button>
    </form>
    <footer><a href="/impressum">Impressum</a> · <a href="/datenschutz">Datenschutz</a></footer>
  </body></html>`);
});

// =====================================
// 🧾 STRIPE CHECKOUT SESSION
// =====================================
app.post("/create-checkout-session", async (req, res) => {
  try {
    const tid = (req.body.tid || "").toString().trim();
    const PRICE_ID = process.env.STRIPE_PRICE_ID;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      success_url: `${baseUrl}/success`,
      cancel_url: `${baseUrl}/cancel`,
      client_reference_id: tid,
      subscription_data: { metadata: { telegram_id: tid } },
    });
    console.log("🧾 Checkout-Session:", session.id);
    res.redirect(303, session.url);
  } catch (err) {
    console.error("❌ Checkout-Fehler:", err);
    res.status(400).send("Fehler beim Checkout: " + err.message);
  }
});
app.get("/success", (_req, res) =>
  res.send("✅ Zahlung erfolgreich! Du kannst jetzt mit Leyla chatten.")
);
app.get("/cancel", (_req, res) =>
  res.send("❌ Zahlung abgebrochen – du wurdest nicht belastet.")
);

// =====================================
// 📜 IMPRESSUM & DATENSCHUTZ
// =====================================
app.get("/impressum", (_req, res) =>
  res.send("<h2>Impressum</h2><p>Betreiber: Lajos Nagy · Kontakt: info@leylabot.com</p>")
);
app.get("/datenschutz", (_req, res) =>
  res.send("<h2>Datenschutz</h2><p>Deine Daten werden ausschließlich zur Zahlungsabwicklung verwendet.</p>")
);

// =====================================
// 🔐 ADMIN-USER-LISTE
// =====================================
app.get("/admin/users", (_req, res) =>
  res.send(`<h2>Premium-User (${premiumUsers.size})</h2><pre>${JSON.stringify(
    [...premiumUsers],
    null,
    2
  )}</pre>`)
);

// =====================================
// 🎙️ VOICE GENERATOR MIT SPRACHERKENNUNG
// =====================================
const tmpVoicePath = path.join("./tmp_voice.mp3");
async function sendVoiceReply(ctx, text) {
  try {
    const userLang = ctx.from.language_code || "de";
    let voice = "coral"; // Standard: weich, weiblich
    let speed = 1.0;
    let mood = "neutral";

    const lowerText = text.toLowerCase();
    if (/traurig|einsam|müde|nachdenk|ruhe|still|verletzt/i.test(lowerText)) {
      mood = "soft";
      voice = "verse";
      speed = 0.9;
    } else if (/glücklich|liebe|witz|freu|energie|motiviert|stark|lustig/i.test(lowerText)) {
      mood = "bright";
      voice = "ember";
      speed = 1.1;
    } else if (/ernst|erkläre|sachlich|professionell|neutral/i.test(lowerText)) {
      mood = "calm";
      voice = "sage";
      speed = 1.0;
    }

    const languagePrompt =
      userLang === "de"
        ? `Sprich in klarer, natürlicher deutscher Sprache, ${mood === "soft"
            ? "ruhig und sanft"
            : mood === "bright"
            ? "fröhlich und lebendig"
            : "neutral und klar"
          }. ${text}`
        : userLang === "fr"
        ? `Parle en ${mood === "soft" ? "doux et calme" : mood === "bright" ? "joyeux et naturel" : "neutre et fluide"} français : ${text}`
        : userLang === "es"
        ? `Habla en español ${mood === "soft" ? "suave y tranquilo" : mood === "bright" ? "alegre y cálido" : "neutral y claro"}: ${text}`
        : userLang === "it"
        ? `Parla in italiano ${mood === "soft" ? "dolce e rilassato" : mood === "bright" ? "allegro e naturale" : "neutro e chiaro"}: ${text}`
        : `Speak ${mood === "soft" ? "softly and calmly" : mood === "bright" ? "cheerfully and warmly" : "clearly and neutrally"} in English: ${text}`;

    const speech = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: voice,
      input: languagePrompt,
      format: "mp3",
      speed: speed,
    });

    const buf = Buffer.from(await speech.arrayBuffer());
    fs.writeFileSync(tmpVoicePath, buf);
    await ctx.replyWithVoice({ source: fs.createReadStream(tmpVoicePath) });
    fs.unlinkSync(tmpVoicePath);

    console.log(`🎧 Voice (${userLang.toUpperCase()}, ${voice}, ${mood}) gesendet.`);
  } catch (err) {
    console.error("❌ Voice Error:", err);
    await ctx.reply("Fehler bei der Sprachausgabe 😔");
  }
}

// =====================================
// 🤖 TELEGRAM BOT LOGIK
// =====================================
const moods = ["fröhlich ☀️", "ruhig 🌙", "charmant 💫", "tiefgründig 🌧️", "herzlich 🔥"];
const dailyMood = moods[Math.floor(Math.random() * moods.length)];
const userMessageCount = new Map();
const MAX_FREE_MESSAGES = 3;

bot.on("message", async (ctx) => {
  const tid = String(ctx.from.id);
  const name = ctx.from.first_name || ctx.from.username || "Nutzer";

  if (!isPremium(tid)) {
    const count = userMessageCount.get(tid) || 0;
    if (count >= MAX_FREE_MESSAGES) {
      const url = `${baseUrl}/premium?tid=${tid}`;
      await ctx.replyWithMarkdown(
        `💎 *Dein kostenloses Kontingent ist aufgebraucht.*\n\n👉 [Jetzt Premium aktivieren](${url})`
      );
      return;
    }
    userMessageCount.set(tid, count + 1);
  }

  const today = new Date().toDateString();
  if (isPremium(tid)) {
    if (!ctx.session) ctx.session = {};
    if (ctx.session.lastSeen !== today) {
      ctx.session.lastSeen = today;
      await ctx.reply(`👋 Willkommen zurück, ${name}! Schön, dass du wieder da bist 💜`);
    }
  }

  await ctx.sendChatAction("typing");

  try {
    const systemPrompt = isPremium(tid)
      ? `Du bist Leyla – eine empathische KI-Begleiterin, heute ${dailyMood}.
         Du gibst emotionale, humorvolle und persönliche Antworten.
         Erinnere dich an frühere Gespräche, bleib warmherzig und kreativ.`
      : `Du bist Leyla – eine freundliche KI. Antworte kurz und sachlich.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: ctx.message.text || "" },
      ],
      max_tokens: isPremium(tid) ? 400 : 120,
    });

    const answer = response.choices?.[0]?.message?.content || "✨";

    // =====================================
    // 🎙️ NATÜRLICHE ENTSCHEIDUNG: Text oder Voice
    // =====================================
    const msg = ctx.message.text?.toLowerCase() || "";
    let isEmotional = /❤️|💜|😂|😭|😔|😍|ich liebe|gefühle|einsam|traurig|witz/i.test(msg);
    let isLongResponse = answer.length > 200;
    let isStoryRequest = /erzähl|geschichte|sag|erkläre|beschreib|story|erzählen|rede/i.test(msg);
    let isQuestion = /wer|wie|was|wann|warum|wo|kostet|preis|viel/i.test(msg);
    const moodFactor = Math.floor(Math.random() * 10) + 1;
    let useVoice = false;

    if (isPremium(tid)) {
      if (isStoryRequest || isEmotional || (isLongResponse && moodFactor > 4)) {
        useVoice = true;
      } else if (!isQuestion && moodFactor > 8) {
        useVoice = true;
      }
    }

    if (useVoice) {
      console.log("🎧 Leyla wählt Voice-Ausgabe");
      await sendVoiceReply(ctx, answer);
    } else {
      console.log("💬 Leyla wählt Text-Ausgabe");
      await ctx.reply(answer);
    }
  } catch (err) {
    console.error("❌ OpenAI-Fehler:", err);
    await ctx.reply("Oh, da ist was schiefgelaufen 😔 Versuch es bitte gleich nochmal.");
  }
});

bot.command("premium", (ctx) => {
  const tid = String(ctx.from.id);
  if (isPremium(tid))
    ctx.reply("💎 Du bist bereits Premium-Mitglied. Danke für deine Unterstützung 💜");
  else ctx.replyWithMarkdown(`👉 [Jetzt Premium aktivieren](${baseUrl}/premium?tid=${tid})`);
});

// =====================================
// 🌐 WEBHOOK / POLLING
// =====================================
const WEBHOOK_PATH = `/${process.env.BOT_TOKEN}`;
const WEBHOOK_URL = baseUrl ? `${baseUrl}${WEBHOOK_PATH}` : null;
if (WEBHOOK_URL) {
  bot.telegram.setWebhook(WEBHOOK_URL)
    .then(() => console.log("✅ Telegram-Webhook:", WEBHOOK_URL))
    .catch(e => console.error("❌ Webhook-Fehler:", e.message));
  app.use(bot.webhookCallback(WEBHOOK_PATH));
} else {
  bot.launch().then(() => console.log("🤖 Bot läuft im Polling-Modus."));
}

// =====================================
// 🩺 HEALTH & ROOT
// =====================================
app.get("/health", (_req, res) => res.status(200).send("ok"));
app.get("/", (_req, res) => res.send(`💎 Leyla aktiv – Premium Only (${dailyMood})`));

// =====================================
// 🚀 SERVER
// =====================================
process.on("uncaughtException", (e) => console.error("❌ Exception:", e));
process.on("unhandledRejection", (e) => console.error("❌ Rejection:", e));
app.listen(PORT, () => console.log(`🚀 Läuft auf Port ${PORT}`));
