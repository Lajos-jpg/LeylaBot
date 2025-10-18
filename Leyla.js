import express from "express";
import { Telegraf } from "telegraf";
import OpenAI from "openai";
import Stripe from "stripe";
import bodyParser from "body-parser";
import fs from "fs";

// =====================================
// 🔧 APP BASICS
// =====================================
const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.BOT_TOKEN) console.warn("⚠️ BOT_TOKEN fehlt!");
if (!process.env.OPENAI_API_KEY) console.warn("⚠️ OPENAI_API_KEY fehlt!");
if (!process.env.STRIPE_SECRET_KEY) console.warn("⚠️ STRIPE_SECRET_KEY fehlt!");
if (!process.env.RENDER_EXTERNAL_URL) console.warn("⚠️ RENDER_EXTERNAL_URL fehlt!");
if (!process.env.STRIPE_PRICE_ID) console.warn("⚠️ STRIPE_PRICE_ID fehlt (Stripe > Products > Price).");

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
// 1) Webhook braucht RAW (vor JSON!)
// 2) Danach normale Parser für alles andere
// =====================================
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
app.post("/webhook", bodyParser.raw({ type: "application/json" }), (req, res) => {
  console.log("📨 Stripe-Webhook eingegangen …");
  if (!endpointSecret) {
    console.error("❌ STRIPE_WEBHOOK_SECRET fehlt – Webhook kann nicht verifiziert werden.");
    return res.status(500).send("Webhook secret not configured.");
  }

  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    console.log("✅ Webhook erkannt:", event.type);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const telegramId = String(session.client_reference_id || "").trim();
      console.log("🧾 SESSION-ID:", session.id, "→ client_reference_id (tid):", telegramId || "(leer)");
      if (telegramId) {
        premiumUsers.add(telegramId);
        savePremiumUsers();
        console.log("💎 Premium freigeschaltet für:", telegramId);
      } else {
        console.log("⚠️ Keine Telegram-ID in session.client_reference_id gefunden.");
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error("❌ Fehler im Webhook:", err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

// Nach dem Webhook erst JSON-Parser aktivieren
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// =====================================
// 💡 KLEINE HILFSFUNKTIONEN
// =====================================
const moods = ["fröhlich ☀️", "ruhig 🌙", "charmant 💫", "tiefgründig 🌧️", "herzlich 🔥"];
const dailyMood = moods[Math.floor(Math.random() * moods.length)];
const isPremium = (id) => premiumUsers.has(String(id));
const baseUrl = (process.env.RENDER_EXTERNAL_URL || "").replace(/\/$/, "");

// =====================================
// 💰 PREMIUM-SEITE (GET)
// =====================================
app.get("/premium", (req, res) => {
  const tid = (req.query.tid || "").toString();
  res.send(`
    <html>
      <head>
        <meta charset="utf-8">
        <title>Leyla Premium</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style="font-family:Arial,Helvetica,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;line-height:1.55">
        <h1>💎 Zugang zu Leyla Premium</h1>
        <p>Für <b>29,99 € / Monat</b> erhältst du unlimitierten Zugang zu Leyla – deiner empathischen KI-Begleiterin.</p>
        <form action="/create-checkout-session" method="POST">
          <input type="hidden" name="tid" value="${tid}" />
          <button type="submit" style="background:#7c3aed;color:#fff;padding:12px 18px;border:0;border-radius:10px;cursor:pointer">
            Jetzt Premium aktivieren 💳
          </button>
        </form>
        <p style="margin-top:24px;color:#555">Deine Telegram-ID wird nur genutzt, um deinen Premium-Status freizuschalten.</p>
      </body>
    </html>
  `);
});

// =====================================
// 🧾 STRIPE CHECKOUT-SESSION (POST)
// =========================
