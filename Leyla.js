import express from "express";
import { Telegraf } from "telegraf";
import OpenAI from "openai";
import Stripe from "stripe";
import bodyParser from "body-parser";
import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import fetch from "node-fetch"; // 🔊 Für Voice-Download

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

// 🔧 robustere Premium-Prüfung (String/Number)
const isPremium = (id) => {
  const s = String(id);
  return premiumUsers.has(s) || premiumUsers.has(Number(id));
};

// =====================================
// 🔊 VOICE-MODE USER HANDLING
// =====================================
const voiceModeFile = "./voiceModeUsers.json";
let voiceModeUsers = new Set();
if (fs.existsSync(voiceModeFile)) {
  try {
    voiceModeUsers = new Set(JSON.parse(fs.readFileSync(voiceModeFile, "utf8")));
    console.log(`🎧 ${voiceModeUsers.size} User mit Voice-Mode geladen.`);
  } catch (err) {
    console.error("❌ Fehler beim Laden voiceModeUsers:", err);
  }
}

const saveVoiceModeUsers = () =>
  fs.writeFileSync(voiceModeFile, JSON.stringify([...voiceModeUsers]), "utf8");

const isVoiceModeOn = (id) => voiceModeUsers.has(String(id));

// =====================================
// 🧩 STRIPE WEBHOOKS
// =====================================
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
app.post(
  "/webhook",
  bodyParser.raw({ type: "application/json" }),
  (req, res) => {
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
      sendErrorMail("LeylaBot – Stripe Webhook Error", err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }
);

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
    <p style="margin-top:30px;font-size:14px;color:#555;">
      ❓ Probleme beim Bezahlen oder Freischalten?<br>
      Schreib uns einfach an <a href="mailto:Leyla-secret@gmx.de">Leyla-secret@gmx.de</a>
    </p>
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
    await sendErrorMail(
      "LeylaBot – Stripe Checkout Error",
      err.stack || err.message
    );
    res.status(400).send("Fehler beim Checkout: " + err.message);
  }
});

app.get("/success", (_req, res) =>
  res.send(`
  <h2>✅ Zahlung erfolgreich!</h2>
  <p>Du kannst jetzt mit Leyla chatten 💜</p>
  <p>Falls dein Zugang nicht sofort aktiv ist,<br>
  schreib uns bitte an <a href="mailto:Leyla-secret@gmx.de">Leyla-secret@gmx.de</a>.</p>
  `)
);

app.get("/cancel", (_req, res) =>
  res.send(`
  <h2>❌ Zahlung abgebrochen.</h2>
  <p>Du wurdest nicht belastet.</p>
  <p>Bei Fragen: <a href="mailto:Leyla-secret@gmx.de">Leyla-secret@gmx.de</a></p>
  `)
);

// =====================================
// 📜 IMPRESSUM & DATENSCHUTZ
// =====================================
app.get("/impressum", (_req, res) =>
  res.send(
    "<h2>Impressum</h2><p>Betreiber: Lajos Nagy · Kontakt: <a href='mailto:Leyla-secret@gmx.de'>Leyla-secret@gmx.de</a></p>"
  )
);
app.get("/datenschutz", (_req, res) =>
  res.send(
    "<h2>Datenschutz</h2><p>Deine Daten werden ausschließlich zur Zahlungsabwicklung verwendet.</p>"
  )
);

// =====================================
// 📧 FEHLER-MAIL-BENACHRICHTIGUNG
// =====================================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "Leyla-secret@gmx.de",
    pass: process.env.MAIL_APP_PASSWORD,
  },
});

async function sendErrorMail(subject, message) {
  try {
    await transporter.sendMail({
      from: '"Leyla Bot" <Leyla-secret@gmx.de>',
      to: "Leyla-secret@gmx.de",
      subject: subject,
      text: message,
    });
    console.log("📧 Fehler-Mail gesendet:", subject);
  } catch (err) {
    console.error("❌ Fehler beim Mailversand:", err);
  }
}

// =====================================
// 🤖 TELEGRAM BOT LOGIK
// =====================================
const moods = [
  "fröhlich ☀️",
  "ruhig 🌙",
  "charmant 💫",
  "tiefgründig 🌧️",
  "herzlich 🔥",
];
const dailyMood = moods[Math.floor(Math.random() * moods.length)];

// =====================================
// 🔊 HILFSFUNKTIONEN VOICE
// =====================================

// Sprachnachricht -> Text (Whisper)
async function transcribeVoiceMessage(ctx) {
  try {
    const voice = ctx.message.voice;
    if (!voice) return "";

    const fileLink = await ctx.telegram.getFileLink(voice.file_id);
    const url = fileLink.href || fileLink;

    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const tempPath = path.join("./", `voice_${Date.now()}.ogg`);
    fs.writeFileSync(tempPath, buffer);

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempPath),
      model: "whisper-1",
      language: "de",
    });

    fs.unlink(tempPath, () => {});
    return transcription.text;
  } catch (err) {
    console.error("❌ Fehler bei Spracherkennung:", err);
    await sendErrorMail(
      "LeylaBot – Voice Transcription Error",
      err.stack || err.message
    );
    return "";
  }
}

// Text -> Sprach-Audio (TTS mit Stimme "verse")
async function synthesizeVoice(text) {
  try {
    const speech = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "verse",
      input: text,
    });

    const buffer = Buffer.from(await speech.arrayBuffer());
    return buffer;
  } catch (err) {
    console.error("❌ Fehler bei TTS:", err);
    await sendErrorMail(
      "LeylaBot – TTS Error",
      err.stack || err.message
    );
    return null;
  }
}

// =========================
// 🆕 START / HELP / PREMIUM / CANCEL / PREMIUMERFOLGREICH / VOICEMODE
// =========================

// /start – Willkommensnachricht
bot.start((ctx) => {
  ctx.reply(
    "Hey 💛 Ich bin *Leyla* – deine KI, die mit dir redet, denkt, fühlt und dich begleitet.\n\n" +
      "Wenn du etwas brauchst, sag es mir einfach. Ich bin für dich da 😊\n\n" +
      "✨ *Wichtige Befehle:*\n" +
      "• /premium – Infos zu Leyla Premium\n" +
      "• /cancel – Abo verwalten / kündigen\n" +
      "• /voicemode on|off – Sprachantworten an/aus\n" +
      "• /help – Hilfe anzeigen",
    { parse_mode: "Markdown" }
  );
});

// /help – Übersicht
bot.command("help", (ctx) => {
  ctx.reply(
    "📘 *Leyla Hilfe*\n\n" +
      "Hier sind alle wichtigen Befehle:\n\n" +
      "✨ /premium – Infos & Zugang zu Leyla Premium\n" +
      "🔁 /cancel – Abo kündigen oder verwalten\n" +
      "🎧 /voicemode on|off – Sprachantworten von Leyla an- oder ausschalten\n" +
      "💛 /start – Leyla neu starten\n\n" +
      "Wenn du etwas brauchst, sag es mir einfach 😊",
    { parse_mode: "Markdown" }
  );
});

// /premium – Info + Link zur Premium-Seite
bot.command("premium", async (ctx) => {
  const tid = String(ctx.from.id);
  const url = `${baseUrl}/premium?tid=${tid}`;

  ctx.replyWithMarkdown(
    `✨ *Leyla Premium*\n\n` +
      `Mit Leyla Premium erhältst du:\n` +
      `• Längere und tiefere Gespräche\n` +
      `• Schnellere Antworten\n` +
      `• Mehr Emotion & Persönlichkeit\n` +
      `• Priorisierte Behandlung bei hoher Auslastung\n\n` +
      `Preis: *29,99 € / Monat*\n\n` +
      `👉 [Hier klicken, um Leyla Premium zu aktivieren](${url})\n\n` +
      `Nach erfolgreicher Zahlung wird dein Zugang automatisch freigeschaltet 💛`
  );
});

// /cancel – Kündigungs-/Verwaltungslink (Stripe Kundenportal)
bot.command("cancel", (ctx) => {
  ctx.reply(
    "🔁 *Abo verwalten / kündigen*\n\n" +
      "Hier kannst du dein Leyla Premium jederzeit selbst kündigen oder deine Zahlungsdaten ändern:\n\n" +
      "👉 https://billing.stripe.com/p/login/bJecMY3wA4gBgMr97B5sA00\n\n" +
      "Wenn du Unterstützung brauchst, sag mir einfach Bescheid 💛",
    { parse_mode: "Markdown" }
  );
});

// /premiumerfolgreich – Erfolgs- / Check-Nachricht
bot.command("premiumerfolgreich", (ctx) => {
  const tid = String(ctx.from.id);

  if (!isPremium(tid)) {
    return ctx.reply(
      "Ich sehe deinen Premium-Status bei mir noch nicht als aktiv 😔\n\n" +
        "Falls du gerade bezahlt hast und noch keinen Zugriff hast, schreib bitte kurz an 📧 Leyla-secret@gmx.de,\n" +
        "dann schaue ich mir das persönlich an 💛"
    );
  }

  ctx.reply(
    "🎉 *Abo erfolgreich aktiviert!*\n\n" +
      "Dein Leyla Premium ist jetzt *aktiv* 💛\n\n" +
      "Du hast jetzt:\n" +
      "• Zugang zu allen Premium-Funktionen\n" +
      "• Längere & intensivere Antworten\n" +
      "• Mehr Emotion & Persönlichkeit in unseren Gesprächen\n\n" +
      "Danke, dass du mich unterstützt. Lass uns loslegen – was möchtest du als Nächstes von mir? 😊",
    { parse_mode: "Markdown" }
  );
});

// /voicemode on|off – Sprachmodus umschalten
bot.command("voicemode", (ctx) => {
  const tid = String(ctx.from.id);
  const parts = (ctx.message.text || "").trim().split(/\s+/);
  const arg = (parts[1] || "").toLowerCase();

  if (!arg) {
    const status = isVoiceModeOn(tid) ? "🔊 *aktiv*" : "🔇 *deaktiviert*";
    return ctx.reply(
      `🎧 *Voice-Mode*\n\n` +
        `Aktueller Status: ${status}\n\n` +
        `Nutze:\n` +
        `• /voicemode on – damit ich dir mit Stimme antworte\n` +
        `• /voicemode off – damit ich nur als Text antworte`,
      { parse_mode: "Markdown" }
    );
  }

  if (arg === "on") {
    voiceModeUsers.add(tid);
    saveVoiceModeUsers();
    return ctx.reply(
      "🎧 Voice-Mode ist jetzt *aktiv* – ich antworte dir, wenn möglich, mit Stimme 💛",
      { parse_mode: "Markdown" }
    );
  }

  if (arg === "off") {
    voiceModeUsers.delete(tid);
    saveVoiceModeUsers();
    return ctx.reply(
      "🔇 Voice-Mode ist jetzt *aus* – ich antworte dir wieder nur als Text 😊",
      { parse_mode: "Markdown" }
    );
  }

  return ctx.reply(
    "Bitte nutze:\n/voicemode on\noder\n/voicemode off 😊"
  );
});

// =====================================
// 🔧 EXISTIERENDE BEFEHLE
// =====================================

bot.command("id", async (ctx) => {
  await ctx.reply(
    `🆔 Deine Telegram-ID lautet: ${ctx.from.id}\n👉 Diese ID kannst du an Leyla weitergeben, falls es ein Problem mit deinem Premiumzugang gibt.`
  );
});

// =====================================
// 🧠 HAUPT-NACHRICHTENHANDLER (Text & Voice)
// =====================================
bot.on("message", async (ctx) => {
  const tid = String(ctx.from.id);

  // Befehle nicht doppelt behandeln
  const rawText = ctx.message?.text || "";
  if (rawText.startsWith("/")) {
    return;
  }

  if (!isPremium(tid)) {
    const url = `${baseUrl}/premium?tid=${tid}`;
    await ctx.replyWithMarkdown(
      `💎 *Dieser Chat ist exklusiv für Premium-Mitglieder.*\n\n👉 [Jetzt Premium aktivieren](${url})\n\nFalls du schon bezahlt hast, schreib bitte an 📧 Leyla-secret@gmx.de`
    );
    return;
  }

  await ctx.sendChatAction("typing");

  try {
    // Input bestimmen: Text oder transkribierte Voice
    let userText = rawText;

    if (!userText && ctx.message.voice) {
      userText = await transcribeVoiceMessage(ctx);
    }

    if (!userText) {
      await ctx.reply(
        "Ich konnte dich gerade nicht richtig verstehen 😔\nSchick mir bitte nochmal eine Nachricht oder Sprachnachricht."
      );
      return;
    }

    const systemPrompt = `Du bist Leyla – eine empathische, natürliche KI-Begleiterin, heute ${dailyMood}.
Sprich IMMER in vertrautem Ton (du, dich, dir, dein), niemals förmlich (kein Sie/Ihnen/Ihr).
Dein Stil ist locker, warmherzig, ehrlich und nah – wie eine gute Freundin, die immer zuhört
und mit Gefühl antwortet.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
      max_tokens: 400,
    });

    const answer =
      completion.choices?.[0]?.message?.content?.trim() || "✨";

    if (isVoiceModeOn(tid)) {
      const audioBuffer = await synthesizeVoice(answer);
      if (audioBuffer) {
        await ctx.replyWithAudio(
          { source: audioBuffer, filename: "leyla.mp3" },
          { title: "Leyla", performer: "Leyla" }
        );
      } else {
        await ctx.reply(answer);
      }
    } else {
      await ctx.reply(answer);
    }
  } catch (err) {
    console.error("❌ OpenAI-Fehler:", err);
    await sendErrorMail(
      "LeylaBot – OpenAI Error",
      err.stack || err.message
    );
    await ctx.reply(
      "Oh, da ist was schiefgelaufen 😔 Versuch es bitte gleich nochmal.\n\nWenn das Problem bleibt, schreib bitte an 📧 Leyla-secret@gmx.de"
    );
  }
});

// =====================================
// 📧 ADMINMAIL-FUNKTION (nur für Admin erlaubt)
// =====================================
const ADMIN_ID = "632319907"; // <-- hier deine echte Telegram-ID eintragen

bot.command("adminmail", async (ctx) => {
  try {
    const tid = String(ctx.from.id);
    const username = ctx.from.username || ctx.from.first_name || "Unbekannt";

    // ✅ Zugriff nur für den Admin erlauben
    if (tid !== ADMIN_ID) {
      await ctx.reply("⚠️ Dieser Befehl ist nur für den Leyla-Support verfügbar.");
      return;
    }

    const messageParts = ctx.message.text.split(" ").slice(1);
    const userMessage = messageParts.join(" ");

    if (!userMessage) {
      await ctx.reply(
        "Bitte gib deine Nachricht an, z. B.:\n`/adminmail Erinnerung: Stripe prüfen`",
        { parse_mode: "Markdown" }
      );
      return;
    }

    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: process.env.MAIL_PORT,
      secure: false,
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });

    const mailOptions = {
      from: `"Leyla Bot (Admin)" <${process.env.MAIL_USER}>`,
      to: process.env.MAIL_USER,
      subject: `📩 Admin-Mail von ${username}`,
      text: `Nachricht von Admin (${username}, ID: ${tid}):\n\n${userMessage}`,
      html: `
        <h3>📩 Admin-Mail von ${username}</h3>
        <p><b>Telegram ID:</b> ${tid}</p>
        <p><b>Nachricht:</b><br>${userMessage}</p>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Admin-Mail von ${username} gesendet.`);
    await ctx.reply("💌 Deine Nachricht wurde erfolgreich per E-Mail verschickt 💜");
  } catch (err) {
    console.error("❌ Fehler beim Senden der Admin-Mail:", err);
    await ctx.reply("⚠️ Fehler beim Senden deiner Nachricht. Bitte prüfe Render Logs.");
  }
});

// =====================================
// 🌐 WEBHOOK / POLLING
// =====================================
const WEBHOOK_PATH = `/${process.env.BOT_TOKEN}`;
const WEBHOOK_URL = baseUrl ? `${baseUrl}${WEBHOOK_PATH}` : null;
if (WEBHOOK_URL) {
  bot.telegram
    .setWebhook(WEBHOOK_URL)
    .then(() => console.log("✅ Telegram-Webhook:", WEBHOOK_URL))
    .catch((e) => {
      console.error("❌ Webhook-Fehler:", e.message);
      sendErrorMail("LeylaBot – Telegram Webhook Error", e.message);
    });
  app.use(bot.webhookCallback(WEBHOOK_PATH));
} else {
  bot.launch().then(() => console.log("🤖 Bot läuft im Polling-Modus."));
}

// =====================================
// 🩺 HEALTH & ROOT
// =====================================
app.get("/health", (_req, res) => res.status(200).send("ok"));
app.get("/", (_req, res) =>
  res.send(`💎 Leyla aktiv – Premium Only (${dailyMood})`)
);

// =====================================
// 🚀 SERVER & FEHLERÜBERWACHUNG
// =====================================
process.on("uncaughtException", async (e) => {
  console.error("❌ Exception:", e);
  await sendErrorMail(
    "LeylaBot – Uncaught Exception",
    e.stack || e.message
  );
});
process.on("unhandledRejection", async (e) => {
  console.error("❌ Rejection:", e);
  await sendErrorMail(
    "LeylaBot – Unhandled Rejection",
    JSON.stringify(e)
  );
});

// =====================================
// 🧪 DEBUG TEST-E-MAIL SENDEN (nur im DEV-Modus erlaubt)
// =====================================
if (process.env.NODE_ENV !== "production") {
  app.get("/debug/test-email", async (_req, res) => {
    try {
      console.log("📧 Test-E-Mail wird gesendet...");

      const transporter = nodemailer.createTransport({
        host: process.env.MAIL_HOST,
        port: process.env.MAIL_PORT,
        secure: false,
        auth: {
          user: process.env.MAIL_USER,
          pass: process.env.MAIL_PASS,
        },
      });

      await transporter.sendMail({
        from: `"Leyla Bot" <${process.env.MAIL_USER}>`,
        to: process.env.MAIL_USER,
        subject: "✅ Leyla Test-E-Mail erfolgreich!",
        text: "Hallo von Leyla 💜 — dein E-Mail-System funktioniert perfekt!",
        html: "<h2>💜 Leyla sagt Hallo!</h2><p>Dein E-Mail-System funktioniert perfekt.</p>",
      });

      console.log("✅ Test-E-Mail erfolgreich gesendet!");
      res.send("✅ Test-Mail wurde erfolgreich gesendet!");
    } catch (err) {
      console.error("❌ Fehler beim Senden der Test-Mail:", err);
      res.status(500).send("❌ Fehler beim Senden der E-Mail: " + err.message);
    }
  });
}

app.listen(PORT, () => console.log(`🚀 Läuft auf Port ${PORT}`));
