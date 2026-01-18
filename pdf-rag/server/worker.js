import "dotenv/config";
import { Worker } from "bullmq";
import { OpenAIEmbeddings } from "@langchain/openai";
import { FakeEmbeddings } from "@langchain/core/utils/testing";
import { QdrantVectorStore } from "@langchain/qdrant";
import { Document } from "@langchain/core/documents";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { CharacterTextSplitter } from "@langchain/textsplitters";

const worker = new Worker(
  "file-upload-queue",
  async (job) => {
    try{

    
    console.log(`Job:`, job.data);
    const data = JSON.parse(job.data);
    /*
    Path: data.path
    read the pdf from path,
    chunk the pdf,
    call the openai embedding model for every chunk,
    store the chunk in qdrant db
    */

    //Load the PDF
    const loader = new PDFLoader(data.path);
    const docs = await loader.load();
    console.log(`PDF loaded. Pages: ${docs.length}`);

    // LOG EACH PAGE
      docs.forEach((doc, i) => {
        console.log(`--- Page ${i + 1} ---`);
        console.log(doc.pageContent.slice(0, 200)); // first 200 chars
      });

      // CHUNKING (REQUIRED)
      const splitter = new CharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });

      const splitDocs = await splitter.splitDocuments(docs);
      // TEMP safety limit
      const limitedDocs = splitDocs.slice(0, 50);
      console.log(`Chunks created: ${splitDocs.length}`);


      // FOR TEMP PURPOSE
      const embeddings = new FakeEmbeddings();

    // embedding model
    // const embeddings = new OpenAIEmbeddings({
    //     model: 'text-embedding-3-small',
    //     apiKey: process.env.OPENAI_API_KEY
    // });

    // vector store
    const vectorStore = await QdrantVectorStore.fromExistingCollection(
      embeddings,
      {
        url: 'http://localhost:6333',
        collectionName: 'langchainjs-testing',
      }
    );

    //
    // await vectorStore.addDocuments(docs);
    await vectorStore.addDocuments(limitedDocs);

    console.log('all docs are added to vector store');
  }catch(err){
    console.error("Worker failed:", err);
      throw err;
  }
  },
  {
    concurrency: 1,
    connection: {
      host: "localhost",
      port: "6379",
    },
  }
);
