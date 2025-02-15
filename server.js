require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const fs = require("fs");
const multer = require("multer");

const apiKey = process.env.GEN_AI_KEY;

const db = require("knex")({
  client: "pg",
  connection: {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  },
});

const app = express();

// Enable CORS for all origins (adjust if needed)
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.options("*", cors());

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const upload = multer({ dest: "uploads/" });

// ------------------------
// Revised /register endpoint
// ------------------------
app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  console.log("Register request body:", req.body);

  if (!name || !email || !password) {
    return res.status(400).json("Missing required fields");
  }

  // Convert password to string (in case it's sent as a number) and hash it
  const hash = bcrypt.hashSync(String(password));

  try {
    await db.transaction(async (trx) => {
      // First insert into users table
      const user = await trx("users")
        .insert({
          name: name,
          email: email,
          joined: new Date(),
        })
        .returning("*");

      // Then insert into login table (the foreign key constraint is now satisfied)
      await trx("login").insert({
        email: email,
        hash: hash,
      });

      res.json(user[0]);
    });
  } catch (error) {
    console.error("Register transaction error:", error);
    res.status(400).json("unable to register");
  }
});

// ------------------------
// Other endpoints (profile, signin, genai) remain unchanged
// ------------------------
app.get("/profile/:id", (req, res) => {
  const { id } = req.params;
  db.select("*")
    .from("users")
    .where({ id: id })
    .then((user) => {
      if (user.length) {
        res.json(user[0]);
      } else {
        res.status(400).json("User not found");
      }
    })
    .catch((err) => {
      console.error("Profile fetch error:", err);
      res.status(400).json("unable to fetch user");
    });
});

app.post("/signin", (req, res) => {
  db.select("email", "hash")
    .from("login")
    .where("email", "=", req.body.email)
    .then((data) => {
      if (data.length) {
        const isValid = bcrypt.compareSync(req.body.password, data[0].hash);
        if (isValid) {
          return db
            .select("*")
            .from("users")
            .where("email", "=", req.body.email)
            .then((user) => {
              res.json(user[0]);
            })
            .catch((err) => {
              console.error("Signin user error:", err);
              res.status(400).json("unable to get user");
            });
        } else {
          res.status(400).json("wrong credentials");
        }
      } else {
        res.status(400).json("user not found");
      }
    })
    .catch((err) => {
      console.error("Signin error:", err);
      res.status(400).json("unable to get user");
    });
});

app.post("/genai", upload.single("file"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const fileData = fs.readFileSync(filePath);
    const fileBase64 = fileData.toString("base64");

    const filePart = {
      inlineData: {
        data: fileBase64,
        mimeType: req.file.mimetype,
      },
    };
    console.log(filePart);
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
    console.log(result.response.text());
  } catch (err) {
    console.error("GenAI error:", err);
    res.status(400).json("error processing file");
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
