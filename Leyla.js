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
// 🧾 STRIPE CHECKOUT
