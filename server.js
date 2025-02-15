const express = require("express");
const bodyParser = require("body-parser");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const fs = require("fs");
const apiKey = process.env.GEN_AI_KEY;
// const knex = require("knex")({
//   client: "pg",
//   connection: {
//     host: "127.0.0.1",
//     port: 5432,
//     user: "postgres",
//     password: "@Driptoohard",
//     database: "cooking",
//   },
// });
// require("dotenv").config();
// const { Client } = require("pg");

const knex = require("knex")({
  client: "pg",
  connection: process.env.DATABASE_URL,
});

// client
//   .connect()
//   .then(() => console.log("Connected to PostgreSQL on Render!"))
//   .catch((err) => console.error("Connection error", err));

const multer = require("multer");

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

const upload = multer({ dest: "uploads/" });

app.post("/register", (req, res) => {
  const { name, email, password } = req.body;
  console.log(req.body);
  const hash = bcrypt.hashSync(password);

  knex
    .transaction((trx) => {
      trx
        .insert({
          hash: hash,
          email: email,
        })
        .into("login")
        .returning("email")
        .then(async (loginEmail) => {
          const user = await trx("users").returning("*").insert({
            name: name,
            email: loginEmail[0].email,
            joined: new Date(),
          });
          res.json(user[0]);
        })
        .then(trx.commit)
        .catch(trx.rollback);
    })

    .catch((err) => res.status(400).json("unable to register "));
});

app.get("/profile/:id", (req, res) => {
  const { id } = req.params;

  knex
    .select("*")
    .from("users")
    .where({ id: id })
    .then((user) => {
      if (user.length) {
        res.json(user[0]);
      } else {
        res.status(400).json("unable to register ");
      }
    })
    .catch((err) => res.status(400).json("unable to find"));
});

app.post("/signin", (req, res) => {
  knex
    .select("email", "hash")
    .from("login")
    .where("email", "=", req.body.email)
    .then((data) => {
      const isValid = bcrypt.compareSync(req.body.password, data[0].hash);
      if (isValid) {
        return knex
          .select("*")
          .from("users")
          .where("email", "=", req.body.email)
          .then((user) => {
            res.json(user[0]);
          })
          .catch((err) => res.status(400).json("unable to get user"));
      } else {
        res.status(400).json("wrong credentials");
      }
    })
    .catch((err) => res.status(400).json("unable to get user"));
});

app.post("/genai", upload.single("file"), async (req, res) => {
  // const file = req.file;

  const filePath = req.file.path;
  const fileData = fs.readFileSync(filePath);
  const fileBase64 = fileData.toString("base64");

  const filePart = {
    inlineData: {
      data: fileBase64,
      mimeType: req.file.mimetype,
    },
  };

  const { GoogleGenerativeAI } = require("@google/generative-ai");

  const genAI = new GoogleGenerativeAI(apiKey);

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const result = await model.generateContent({
    contents: [
      { role: "user", parts: [filePart] },
      { role: "user", parts: [{ text: "summarize this document" }] },
    ],
  });
  res.json({ result: result.response.text() });
});

app.listen(4000, () => {
  console.log("im doing it");
});
