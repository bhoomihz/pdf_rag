import express from "express";
import cors from "cors";
import multer from "multer";
import { Queue } from "bullmq";
import { OpenAIEmbeddings } from '@langchain/openai';
import { QdrantVectorStore } from '@langchain/qdrant';
import { FakeEmbeddings } from "@langchain/core/utils/testing";
import 'dotenv/config';
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const queue = new Queue("file-upload-queue", {
    connection: {
      host: "localhost",
      port: "6379",
    },
});

//multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

//upload instance
const upload = multer({ storage: storage });

const app = express();
app.use(cors());

//get
app.get("/", (req, res) => {
  return res.json({ status: "ALL GOOD!" });
});

//post
app.post("/upload/pdf", upload.single("pdf"), async (req, res) => {
  await queue.add(
    "file-ready",
    JSON.stringify({
      filename: req.file.originalname,
      destination: req.file.destination,
      path: req.file.path,
    })
  );
  return res.json({ message: "UPLOADED" });
});

// Retriever
app.get('/chat', async(req, res) => {
  const userQuery = req.query.message;

  // const embeddings = new FakeEmbeddings({
  //   model: 'text-embedding-3-small',
  //   apiKey: process.env.OPENAI_API_KEY
  // });

  // for temp purpose
  const embeddings = new FakeEmbeddings();


  const vectorStore = await QdrantVectorStore.fromExistingCollection(embeddings, {
    url: 'http://localhost:6333',
    collectionName: 'langchainjs-testing',
  });

  const ret = vectorStore.asRetriever({
    k:2,
  });

  const result = await ret.invoke(userQuery);

  // user query with context OPEN AI (chat) 
  const SYSTEM_PROMPT = `You are helpfull AI Assistant who answers the user query based on the available context from PDF File.
  Context: 
  ${JSON.stringify(result)}
  `;

  const chatResult = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system', content: SYSTEM_PROMPT
      },
      {
        role: 'user', content: userQuery
      },
    ],
  });

  return res.json({
    message: chatResult.choices[0].message.content,
    docs: result
  });

});

app.listen(8000, () => console.log(`Server started on PORT: ${8000}`));
